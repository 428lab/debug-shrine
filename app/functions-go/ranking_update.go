// ランキングキャッシュ更新(rankingUpdate)スケジュール関数のGo実装。
//
// Node版(app/functions/index.js の exports.rankingUpdate、60分毎)からの移植。
// ユーザーが待つHTTPエンドポイントではないためコールドスタート短縮の恩恵は
// 無いが、実行時間短縮による課金削減とコード基盤の統一を目的に移植する
// (詳細は docs/backend.md「スケジュール関数のGo移植」を参照)。
//
// Pub/Sub(Cloud Scheduler経由)トリガーのためHTTPトリガーの他エンドポイントとは
// デプロイ方法が異なる(--trigger-topic。functions-go/README.md参照)。
package gofunctions

import (
	"context"
	"log"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	cloudevents "github.com/cloudevents/sdk-go/v2"
	"google.golang.org/api/iterator"
)

func init() {
	functions.CloudEvent("RankingUpdateGo", rankingUpdateHandler)
}

func rankingUpdateHandler(ctx context.Context, _ cloudevents.Event) error {
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("rankingUpdate: getFirestoreClient error: %v", err)
		return err
	}
	return runRankingUpdate(ctx, client)
}

type rankingUpdateUserDoc struct {
	DisplayName string `firestore:"display_name"`
	ScreenName  string `firestore:"screen_name"`
	ImagePath   string `firestore:"image_path"`
	Status      struct {
		Total int64 `firestore:"total"`
	} `firestore:"status"`
}

func runRankingUpdate(ctx context.Context, client *firestore.Client) error {
	// Node版は `.orderBy("status.total","desc")` の後にもう一度
	// `.sort((a,b) => b.battlePoint - a.battlePoint)` しているが、
	// `battlePoint`(camelCase)は存在しないフィールド名のタイプミスで、
	// 常に `undefined - undefined = NaN` を返す。V8の配列ソートは
	// 比較関数がNaNを返す場合、実質的に要素の順序を変えない(既存の並び=
	// Firestoreクエリのorderby順をそのまま維持する)ため、この再ソートは
	// 事実上のno-opになっている。Go版は最初から不要な再ソートを行わず、
	// Firestoreクエリの結果順(status.total降順)をそのまま使う。
	//
	// また `orderBy("status.total", ...)` は Firestore の仕様上、対象フィールド
	// (`status.total`)を持たないドキュメントを自動的に除外するため、
	// `status` 未計算のユーザーによる例外(Node版で言う `.status.total` の
	// undefined参照)は発生し得ない。
	iter := client.Collection("users").OrderBy("status.total", firestore.Desc).Documents(ctx)
	defer iter.Stop()

	type rankingEntryMutable struct {
		DisplayName string
		ScreenName  string
		ImagePath   string
		BattlePoint int64
		Rank        int64
	}
	var table []rankingEntryMutable
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return err
		}
		var u rankingUpdateUserDoc
		if err := doc.DataTo(&u); err != nil {
			return err
		}
		table = append(table, rankingEntryMutable{
			DisplayName: u.DisplayName,
			ScreenName:  u.ScreenName,
			ImagePath:   u.ImagePath,
			BattlePoint: u.Status.Total,
		})
	}

	tempRank := int64(1)
	tempPoint := int64(-1)
	for i := range table {
		if tempPoint != table[i].BattlePoint {
			tempRank = int64(i) + 1
			tempPoint = table[i].BattlePoint
		}
		table[i].Rank = tempRank
	}

	ranking := make([]rankingEntry, len(table))
	for i, t := range table {
		ranking[i] = rankingEntry{
			DisplayName: t.DisplayName,
			ScreenName:  t.ScreenName,
			ImagePath:   t.ImagePath,
			BattlePoint: t.BattlePoint,
			Rank:        t.Rank,
		}
	}

	_, err := client.Collection("cache_data").Doc("ranking_cache").Set(ctx, map[string]interface{}{
		"ranking":       ranking,
		"latest_update": firestore.ServerTimestamp,
	}, firestore.MergeAll)
	return err
}
