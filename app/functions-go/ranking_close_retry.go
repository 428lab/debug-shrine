// 取りこぼした締めのやり直し(rankingCloseRetry)。
//
// 締めは期間キーの変化で検出するため、失敗したまま状態のキーが進んでしまうと
// その期間は二度と締められない(この取りこぼしを起こさないよう、rankingUpdateGo
// 側は失敗した期間のキーを据え置いて再試行するようにした)。
//
// 既に状態が進んでしまった期間を後から締め直すための手動実行。ログ方式では
// 期間の値は範囲集計なので、いつ締めても結果は同じ。
//
// 冪等。既にアーカイブがある期間は触らない(称号の二重付与も起きない)。
// 定時実行は無く、Pub/Sub トピック ranking-close-retry-go へ手で publish する
// (.github/workflows/kick-scheduled-function.yml)。
package gofunctions

import (
	"context"
	"log"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	grpcstatus "google.golang.org/grpc/status"

	cloudevents "github.com/cloudevents/sdk-go/v2"
)

func init() {
	functions.CloudEvent("RankingCloseRetryGo", rankingCloseRetryHandler)
}

func rankingCloseRetryHandler(ctx context.Context, _ cloudevents.Event) error {
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("rankingCloseRetry: getFirestoreClient error: %v", err)
		return err
	}
	return runRankingCloseRetry(ctx, client, time.Now())
}

// runRankingCloseRetry は「直前の週」を、まだアーカイブが無ければ締める。
//
// 月を対象にしないのは、獲得ログの無い過去の月まで締めると、ぽいんとだけが
// 入ったアーカイブができて実態と食い違うため。月の取りこぼしが起きた場合は
// 対象期間を見て個別に判断する。
func runRankingCloseRetry(ctx context.Context, client *firestore.Client, now time.Time) error {
	weekStart, _, _, _ := periodBounds(now)
	prevStart := weekStart.AddDate(0, 0, -7)
	prevEnd := weekStart
	periodKey := prevStart.Format("2006-01-02")

	exists, err := archiveExists(ctx, client, "week", periodKey)
	if err != nil {
		return err
	}
	if exists {
		log.Printf("rankingCloseRetry: week %s は既に締め済み。何もしない", periodKey)
		return nil
	}

	profiles, err := loadRankingProfiles(ctx, client)
	if err != nil {
		return err
	}
	if err := closePeriod(ctx, client, "week", periodKey, prevStart, prevEnd, profiles); err != nil {
		return err
	}
	log.Printf("rankingCloseRetry: week %s を締めた(%v 〜 %v)", periodKey, prevStart, prevEnd)
	return nil
}

// archiveExists はその期間のアーカイブが既にあるかを返す。
func archiveExists(ctx context.Context, client *firestore.Client, periodType, periodKey string) (bool, error) {
	_, err := client.Collection("ranking_archive").Doc(archiveDocID(periodType, periodKey)).Get(ctx)
	if err != nil {
		if grpcstatus.Code(err) == codes.NotFound {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// loadRankingProfiles は全ユーザーの表示情報を読む。
//
// rankingUpdateGo は status.total / exp の降順クエリで得たユーザーから作るが、
// ここではそれらのフィールドを持たないユーザーも取りこぼしたくないので全件見る
// (手動実行なので読み取り量は問題にならない)。
func loadRankingProfiles(ctx context.Context, client *firestore.Client) (map[string]rankingProfile, error) {
	iter := client.Collection("users").Documents(ctx)
	defer iter.Stop()

	profiles := map[string]rankingProfile{}
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			return profiles, nil
		}
		if err != nil {
			return nil, err
		}
		var u struct {
			DisplayName string `firestore:"display_name"`
			ScreenName  string `firestore:"screen_name"`
			ImagePath   string `firestore:"image_path"`
		}
		if err := doc.DataTo(&u); err != nil {
			// 想定外の形のユーザーで全体を止めない。
			log.Printf("rankingCloseRetry: skip profile %s: %v", doc.Ref.ID, err)
			continue
		}
		profiles[doc.Ref.ID] = rankingProfile{
			DisplayName: u.DisplayName,
			ScreenName:  u.ScreenName,
			ImagePath:   u.ImagePath,
		}
	}
}
