// せんとうりょく獲得ログの遡り作成(battleLogBackfill)。
//
// battle_logs はログ方式への切り替え(#226)以降の参拝でしか積まれない。しかし
// 切り替え直前の期間(移行時点の当月・当週)は、実際には伸びているのに記録が無い
// ため、期間ランキングから抜け落ちてしまう。
//
// せんとうりょくは github_activities の純関数で、各活動は created_at を持つので、
// 期間内の活動の寄与を計算すれば伸び幅を復元できる。
//
// 二重計上を避けるため、対象は `期間開始 <= created_at <= last_activity_created_at`
// の活動に限る。last_activity_created_at までの活動は既に status.total に取り込み
// 済みで、今後の参拝でライブにログへ積まれることはない。
//
// 冪等。ユーザー1人を積み終えるごとに完了印(battle_log_backfills/{key})を書き、
// 次回以降はそれで飛ばす。Pub/Sub トリガーで、必要なときだけ手で叩く
// (.github/workflows/kick-scheduled-function.yml)。
//
// 本番はユーザー数が多く1回の実行(540秒)では終わらないため、時間切れになる前に
// 自分で切り上げる。途中で強制終了されると、ログだけ書けて完了印が無いユーザーが
// 残り、そのぶんが永久に欠けてしまうため。続きは再度キックすれば進む。
package gofunctions

import (
	"context"
	"log"
	"sort"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	cloudevents "github.com/cloudevents/sdk-go/v2"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	grpcstatus "google.golang.org/grpc/status"

	"github.com/428lab/debug-shrine/functions-go/internal/performance"
)

func init() {
	functions.CloudEvent("BattleLogBackfillGo", battleLogBackfillHandler)
}

// battleBackfillsCollection は「そのキーのバックフィルを完了した」印を置く場所。
// battle_logs 自体に印を兼ねさせると、書き込み途中で落ちたユーザーが「完了済み」に
// 見えてしまい、欠けたまま二度と埋まらない。
const battleBackfillsCollection = "battle_log_backfills"

// battleBackfillMaxRunTime は1回の実行で使う時間の上限。関数のタイムアウト(540秒)に
// 対して余裕を取り、強制終了ではなく自分で切り上げられるようにする。
const battleBackfillMaxRunTime = 6 * time.Minute

func battleLogBackfillHandler(ctx context.Context, _ cloudevents.Event) error {
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("battleLogBackfill: getFirestoreClient error: %v", err)
		return err
	}
	// 進行中の週と月の両方を埋めたいので、早い方を起点にする
	// (週が月をまたぐ場合は週初が月初より前になる)。
	weekStart, monthStart, weekKey, monthKey := periodBounds(time.Now())
	since := weekStart
	if monthStart.Before(since) {
		since = monthStart
	}
	_, err = runBattleLogBackfillRange(ctx, client, since, time.Time{}, weekKey+"_"+monthKey)
	return err
}

// runBattleLogBackfill は since 以降を対象にする(上限なし)。
func runBattleLogBackfill(ctx context.Context, client *firestore.Client, since time.Time, backfillKey string) (bool, error) {
	return runBattleLogBackfillRange(ctx, client, since, time.Time{}, backfillKey)
}

// backfillUserActivityDoc はバックフィルが参照するユーザーのフィールド。
// status キャッシュは含めない(旧フォーマットで型が合わずデコードが落ちるため。
// 詳細は status_cache_backfill.go のコメント参照)。
type backfillUserActivityDoc struct {
	ScreenName            string `firestore:"screen_name"`
	LastActivityCreatedAt string `firestore:"last_activity_created_at"`
}

// runBattleLogBackfillRange は [since, until) の活動から獲得ログを作る。
// until がゼロ値なら上限なし(取り込み済みの範囲すべて)。
//
// 上限を指定できるようにしてあるのは、既にログのある期間と重ねると二重計上に
// なるため。過去の期間を埋め直すときは、既存のログが始まる時刻を until にする。
//
// backfillKey は完了印の名前。同じキーを積み終えたユーザーは飛ばす。
// 戻り値は「全ユーザーを見終えたか」。時間切れで打ち切った場合は false。
func runBattleLogBackfillRange(ctx context.Context, client *firestore.Client, since, until time.Time, backfillKey string) (bool, error) {
	deadline := time.Now().Add(battleBackfillMaxRunTime)

	iter := client.Collection("users").Documents(ctx)
	defer iter.Stop()

	created, skipped, examined := 0, 0, 0
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return false, err
		}

		var u backfillUserActivityDoc
		if err := doc.DataTo(&u); err != nil {
			// 想定外の形のユーザーで全体を止めない。
			log.Printf("battleLogBackfill: skip %s: %v", doc.Ref.ID, err)
			continue
		}
		// 取り込み済みの活動が期間より前で終わっているユーザーは対象外
		// (復元する伸び幅が無い)。github_activities を読む前に落とす。
		// ここを省くと、休眠ユーザーの活動を全件読むだけで時間を使い切る。
		last := parseActivityTime(u.LastActivityCreatedAt)
		if last.IsZero() || last.Before(since) {
			continue
		}

		done, err := hasBackfillMarker(ctx, doc.Ref, backfillKey)
		if err != nil {
			return false, err
		}
		if done {
			skipped++
			continue
		}

		if time.Now().After(deadline) {
			log.Printf("battleLogBackfill: 時間切れで中断 key=%s created=%d skipped=%d (再キックで続きから)",
				backfillKey, created, skipped)
			return false, nil
		}

		total, count, err := backfillUser(ctx, client, doc.Ref, u, since, until, backfillKey)
		if err != nil {
			return false, err
		}
		examined++
		if count > 0 {
			created++
			log.Printf("battleLogBackfill: %s +%d (%d件, %s)", u.ScreenName, total, count, backfillKey)
		}
	}
	log.Printf("battleLogBackfill: done key=%s created=%d skipped=%d examined=%d",
		backfillKey, created, skipped, examined)
	return true, nil
}

// backfillUser は1ユーザーぶんのログを作り、最後に完了印を書く。
// 印より先にログを書くので、途中で落ちても「完了印なし+中途半端なログ」になり、
// 次回の実行で作り直される(下の残骸削除)。逆順だと欠けたまま確定してしまう。
func backfillUser(ctx context.Context, client *firestore.Client, userRef *firestore.DocumentRef,
	u backfillUserActivityDoc, since, until time.Time, backfillKey string) (int, int, error) {

	// 前回の実行が途中で落ちて残った同じキーのログを消してから積み直す。
	// 残したまま積むと二重計上になる。
	if err := deleteBackfillLogs(ctx, client, userRef, backfillKey); err != nil {
		return 0, 0, err
	}

	activities, err := loadActivities(ctx, userRef)
	if err != nil {
		return 0, 0, err
	}
	entries := backfillEntries(activities, since, until, u.LastActivityCreatedAt, u.ScreenName)

	// 活動1件ごとに、その活動が起きた時刻で積む。どの期間で切っても
	// 正しく振り分けられるようにするため。1件ずつ Add すると数千件で
	// 分単位かかるので、まとめて書く。
	total := 0
	bw := client.BulkWriter(ctx)
	logs := userRef.Collection(battleLogsCollection)
	for _, e := range entries {
		if _, err := bw.Create(logs.NewDoc(), map[string]interface{}{
			"add_point":    int64(e.Gain),
			"timestamp":    e.At,
			"backfill_key": backfillKey,
		}); err != nil {
			return 0, 0, err
		}
		total += e.Gain
	}
	bw.End()

	// 伸び幅ゼロのユーザーにも印を置く。置かないと、再キックのたびに
	// github_activities を読み直すことになり、いつまでも先へ進めない。
	if _, err := userRef.Collection(battleBackfillsCollection).Doc(backfillKey).Set(ctx, map[string]interface{}{
		"done_at":   firestore.ServerTimestamp,
		"log_count": len(entries),
		"add_point": total,
	}); err != nil {
		return 0, 0, err
	}
	return total, len(entries), nil
}

// hasBackfillMarker は同じキーを積み終えた印があるかを返す(冪等性のため)。
func hasBackfillMarker(ctx context.Context, userRef *firestore.DocumentRef, backfillKey string) (bool, error) {
	snap, err := userRef.Collection(battleBackfillsCollection).Doc(backfillKey).Get(ctx)
	if err != nil {
		if grpcstatus.Code(err) == codes.NotFound {
			return false, nil
		}
		return false, err
	}
	return snap.Exists(), nil
}

// deleteBackfillLogs は同じキーで作られた既存ログを消す(積み直しの前処理)。
func deleteBackfillLogs(ctx context.Context, client *firestore.Client, userRef *firestore.DocumentRef, backfillKey string) error {
	docs, err := userRef.Collection(battleLogsCollection).
		Where("backfill_key", "==", backfillKey).Documents(ctx).GetAll()
	if err != nil {
		return err
	}
	if len(docs) == 0 {
		return nil
	}
	bw := client.BulkWriter(ctx)
	for _, d := range docs {
		if _, err := bw.Delete(d.Ref); err != nil {
			return err
		}
	}
	bw.End()
	log.Printf("battleLogBackfill: %s の書きかけログ %d件を作り直す (%s)", userRef.ID, len(docs), backfillKey)
	return nil
}

// backfillEntry は遡って作る獲得ログ1件(活動1件ぶんの伸び幅とその時刻)。
type backfillEntry struct {
	Gain int
	At   time.Time
}

// backfillEntries は [since, lastCreatedAt] の活動を、1件ずつの伸び幅に分解する
// (純関数)。until がゼロ値でなければ、そこより後の活動は対象外にする。
//
// 能力値の加算は活動ごとの寄与と「直前の活動との間隔」による寄与の和なので、
// 時刻順に1件ずつ「直前の活動」を渡して計算すれば、合計は範囲全体をまとめて
// 計算した場合と一致する。範囲の外にある直前の活動との間隔だけは基準が無いので
// 拾えない(参拝時の全件再計算パスと同じ扱い。battle_logs.go 参照)。
func backfillEntries(activities []performance.Activity, since, until time.Time, lastCreatedAt, screenName string) []backfillEntry {
	last := parseActivityTime(lastCreatedAt)
	if last.IsZero() {
		return nil
	}
	inRange := make([]performance.Activity, 0, len(activities))
	for _, a := range activities {
		t := parseActivityTime(a.CreatedAt)
		if t.IsZero() || t.Before(since) || t.After(last) {
			continue
		}
		if !until.IsZero() && !t.Before(until) {
			continue
		}
		inRange = append(inRange, a)
	}
	sort.SliceStable(inRange, func(i, j int) bool {
		return parseActivityTime(inRange[i].CreatedAt).Before(parseActivityTime(inRange[j].CreatedAt))
	})

	entries := make([]backfillEntry, 0, len(inRange))
	prev := ""
	for _, a := range inRange {
		gain := battleTotal(performance.ComputePerformanceIncrement(
			performance.RawUserData{User: screenName}, []performance.Activity{a}, prev).UserData)
		prev = a.CreatedAt
		if gain <= 0 {
			continue
		}
		entries = append(entries, backfillEntry{Gain: gain, At: parseActivityTime(a.CreatedAt)})
	}
	return entries
}

// parseActivityTime は GitHub の created_at を読む。読めなければゼロ値。
func parseActivityTime(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Time{}
	}
	return t
}
