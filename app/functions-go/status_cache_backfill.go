// マイページ表示キャッシュの事前計算(statusCacheBackfill)スケジュール関数のGo実装。
//
// Node版(app/functions/index.js の exports.statusCacheBackfill、30分毎)からの
// 移植。直近6ヶ月以内に参拝したユーザーのうち status キャッシュが未計算の
// ユーザーを1回の実行につき最大10件だけ計算してキャッシュする。
//
// status(statusGo)エンドポイントと同じ計算ロジック・Firestore読み込み
// (loadActivities/performance.UserPerformance等)を再利用しているため、
// 挙動はNode版と同一(詳細は docs/backend.md「スケジュール関数のGo移植」を参照)。
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
	functions.CloudEvent("StatusCacheBackfillGo", statusCacheBackfillHandler)
}

const statusCacheBackfillMaxPerRun = 10

func statusCacheBackfillHandler(ctx context.Context, _ cloudevents.Event) error {
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("statusCacheBackfill: getFirestoreClient error: %v", err)
		return err
	}
	return runStatusCacheBackfill(ctx, client, time.Now())
}

type backfillUserDoc struct {
	DisplayName string           `firestore:"display_name"`
	ScreenName  string           `firestore:"screen_name"`
	ImagePath   string           `firestore:"image_path"`
	Exp         int64            `firestore:"exp"`
	Status      *firestoreStatus `firestore:"status"`
}

func runStatusCacheBackfill(ctx context.Context, client *firestore.Client, now time.Time) error {
	// 既知の差異: Node版は moment().subtract(6,"months") を使っており、
	// 月末日(29〜31日)を起点にすると対象月の末日にクランプされる
	// (例: 8/31 の6ヶ月前は 2/28)。Go の time.AddDate は日付をオーバーフロー
	// させて翌月に繰り越す(例: 8/31 の6ヶ月前は 3/3 になり得る)。この差は
	// カットオフ日が最大数日ずれるだけで、「直近6ヶ月アクティブなユーザーを
	// 対象にする」というこのジョブの目的(荒い足切り)には実害が無いため、
	// 追加の補正は行わない。
	activeSince := now.AddDate(0, -6, 0)
	iter := client.Collection("users").Where("last_sanpai", ">=", activeSince).Documents(ctx)
	defer iter.Stop()

	processed := 0
	for {
		if processed >= statusCacheBackfillMaxPerRun {
			break
		}
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return err
		}

		var u backfillUserDoc
		if err := doc.DataTo(&u); err != nil {
			return err
		}
		if u.Status != nil {
			continue
		}

		activities, err := loadActivities(ctx, doc.Ref)
		if err != nil {
			return err
		}
		raw := performance.UserPerformance(activities, u.ScreenName)
		formatted := performance.UserFormattedPerformance(raw, performance.AppendData{
			Exp: int(u.Exp),
			User: performance.UserInfo{
				DisplayName:     u.DisplayName,
				ScreenName:      u.ScreenName,
				GithubImagePath: u.ImagePath,
			},
		})
		lastActivityCreatedAt := performance.LatestActivityCreatedAt(activities)

		// Node版はここで status.last_sanpai を設定しない(フィールド自体が
		// 存在しない状態でキャッシュされる)。Go版は toFirestoreStatus の都合上
		// last_sanpai="" を明示的に書き込むが、status/statusGo の読み出し側は
		// どちらの場合も users/{id}.last_sanpai (トップレベル)の値で必ず
		// 上書きするため、観測できる挙動に差は無い。
		if _, err := doc.Ref.Update(ctx, []firestore.Update{
			{Path: "status", Value: toFirestoreStatus(formatted, "")},
			{Path: "last_activity_created_at", Value: lastActivityCreatedAt},
		}); err != nil {
			return err
		}
		processed++
		log.Printf("statusCacheBackfill: backfilled status for %s", u.ScreenName)
	}
	log.Printf("statusCacheBackfill: done, processed=%d", processed)
	return nil
}
