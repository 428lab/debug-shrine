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
	// 対象は「実行時点の月初」。当月をまるごと埋めれば、その中にある当週も埋まる。
	_, monthStart, _, monthKey := periodBounds(time.Now())
	return runBattleLogBackfill(ctx, client, monthStart, "month_"+monthKey)
}

// backfillUserActivityDoc はバックフィルが参照するユーザーのフィールド。
// status キャッシュは含めない(旧フォーマットで型が合わずデコードが落ちるため。
// 詳細は status_cache_backfill.go のコメント参照)。
type backfillUserActivityDoc struct {
	ScreenName            string `firestore:"screen_name"`
	LastActivityCreatedAt string `firestore:"last_activity_created_at"`
}

// runBattleLogBackfill は since 以降・取り込み済みまでの活動から獲得ログを作る。
//
// backfillKey は作った印。同じキーのログが既にあるユーザーは飛ばす。
func runBattleLogBackfill(ctx context.Context, client *firestore.Client, since time.Time, backfillKey string) error {
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
		gain := backfillGain(activities, since, u.LastActivityCreatedAt, u.ScreenName)
		if gain <= 0 {
			continue
		}

		// timestamp は期間開始にする。この伸び幅がいつ稼がれたかは活動ごとに
		// ばらけるが、期間内であることだけが集計に効くので開始に寄せる。
		if _, _, err := doc.Ref.Collection(battleLogsCollection).Add(ctx, map[string]interface{}{
			"add_point":    int64(gain),
			"timestamp":    since,
			"backfill_key": backfillKey,
		}); err != nil {
			return err
		}
		created++
		log.Printf("battleLogBackfill: %s +%d (%s)", u.ScreenName, gain, backfillKey)
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

// backfillGain は [since, lastCreatedAt] の活動の寄与を返す(純関数)。
//
// ゼロ基準に対象の活動だけを渡すことで、その活動自身の寄与を測る。累積分との
// 境界ペアの寄与は基準が無いので拾えないが、伸び幅の桁を誤るよりよい
// (参拝時の全件再計算パスと同じ扱い。battle_logs.go 参照)。
func backfillGain(activities []performance.Activity, since time.Time, lastCreatedAt, screenName string) int {
	last := parseActivityTime(lastCreatedAt)
	if last.IsZero() {
		return 0
	}
	inRange := make([]performance.Activity, 0, len(activities))
	for _, a := range activities {
		t := parseActivityTime(a.CreatedAt)
		if t.IsZero() || t.Before(since) || t.After(last) {
			continue
		}
		inRange = append(inRange, a)
	}
	if len(inRange) == 0 {
		return 0
	}
	return battleTotal(performance.ComputePerformanceIncrement(
		performance.RawUserData{User: screenName}, inRange, "").UserData)
}

// parseActivityTime は GitHub の created_at を読む。読めなければゼロ値。
func parseActivityTime(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Time{}
	}
	return t
}
