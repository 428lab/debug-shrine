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
// 冪等。同じ期間で2度走らせても、作った印(battle_logs の backfill_key)で
// 既存分を検出して積み直さない。Pub/Sub トリガーで、必要なときだけ手で叩く
// (.github/workflows/kick-scheduled-function.yml)。
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

	"github.com/428lab/debug-shrine/functions-go/internal/performance"
)

func init() {
	functions.CloudEvent("BattleLogBackfillGo", battleLogBackfillHandler)
}

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
	return runBattleLogBackfillRange(ctx, client, since, time.Time{}, weekKey+"_"+monthKey)
}

// runBattleLogBackfill は since 以降を対象にする(上限なし)。
func runBattleLogBackfill(ctx context.Context, client *firestore.Client, since time.Time, backfillKey string) error {
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
// backfillKey は作った印。同じキーのログが既にあるユーザーは飛ばす。
func runBattleLogBackfillRange(ctx context.Context, client *firestore.Client, since, until time.Time, backfillKey string) error {
	iter := client.Collection("users").Documents(ctx)
	defer iter.Stop()

	created, skipped := 0, 0
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return err
		}

		var u backfillUserActivityDoc
		if err := doc.DataTo(&u); err != nil {
			// 想定外の形のユーザーで全体を止めない。
			log.Printf("battleLogBackfill: skip %s: %v", doc.Ref.ID, err)
			continue
		}
		// 取り込み済みの活動が無いユーザーは対象外(復元する伸び幅が無い)。
		if u.LastActivityCreatedAt == "" {
			continue
		}

		done, err := hasBackfillLog(ctx, doc.Ref, backfillKey)
		if err != nil {
			return err
		}
		if done {
			skipped++
			continue
		}

		activities, err := loadActivities(ctx, doc.Ref)
		if err != nil {
			return err
		}
		entries := backfillEntries(activities, since, until, u.LastActivityCreatedAt, u.ScreenName)
		if len(entries) == 0 {
			continue
		}

		// 活動1件ごとに、その活動が起きた時刻で積む。どの期間で切っても
		// 正しく振り分けられるようにするため。
		total := 0
		for _, e := range entries {
			if _, _, err := doc.Ref.Collection(battleLogsCollection).Add(ctx, map[string]interface{}{
				"add_point":    int64(e.Gain),
				"timestamp":    e.At,
				"backfill_key": backfillKey,
			}); err != nil {
				return err
			}
			total += e.Gain
		}
		created++
		log.Printf("battleLogBackfill: %s +%d (%d件, %s)", u.ScreenName, total, len(entries), backfillKey)
	}
	log.Printf("battleLogBackfill: done key=%s created=%d skipped=%d", backfillKey, created, skipped)
	return nil
}

// hasBackfillLog は同じキーのバックフィル済みログがあるかを返す(冪等性のため)。
func hasBackfillLog(ctx context.Context, userRef *firestore.DocumentRef, backfillKey string) (bool, error) {
	docs, err := userRef.Collection(battleLogsCollection).
		Where("backfill_key", "==", backfillKey).Limit(1).Documents(ctx).GetAll()
	if err != nil {
		return false, err
	}
	return len(docs) > 0, nil
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
