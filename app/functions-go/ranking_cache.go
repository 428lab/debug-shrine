// ポイントランキング初期値作成(rankingCache)スケジュール関数のGo実装。
//
// Node版(app/functions/index.js の exports.rankingCache、120分毎)からの移植。
// 既に point_ranking/{id} が存在するユーザーはスキップし、無いユーザーには
// 初期値(rank:0)を作成する。
//
// 挙動をNode版と揃えつつ、以下の1点は構造的に変更している(詳細は
// docs/backend.md「スケジュール関数のGo移植」を参照):
//
//   - Node版は `snapshot.forEach(async (item) => {...})` を使っており、
//     forEachはコールバックのPromiseを待たない(fire-and-forget)。そのため
//     理論上は全ユーザー分の書き込みが完了する前に関数の実行が終了したと
//     みなされ得る(Cloud Functionsがコンテナを凍結した場合、書き込みが
//     欠落するリスクがある)。これは意図された仕様ではなく実装上の不備と
//     判断し、Go版では各ユーザーの処理を順番にawaitして確実に完了させる。
//     結果として書き込まれるデータの内容(既存ユーザーはスキップ、無い
//     ユーザーはrank:0で作成)自体はNode版と同一。
package gofunctions

import (
	"context"
	"log"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	cloudevents "github.com/cloudevents/sdk-go/v2"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	grpcstatus "google.golang.org/grpc/status"
)

func init() {
	functions.CloudEvent("RankingCacheGo", rankingCacheHandler)
}

func rankingCacheHandler(ctx context.Context, _ cloudevents.Event) error {
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("rankingCache: getFirestoreClient error: %v", err)
		return err
	}
	return runRankingCache(ctx, client)
}

type rankingCacheUserDoc struct {
	DisplayName string `firestore:"display_name"`
	ScreenName  string `firestore:"screen_name"`
	Status      *struct {
		Total int64 `firestore:"total"`
	} `firestore:"status"`
}

func runRankingCache(ctx context.Context, client *firestore.Client) error {
	iter := client.Collection("users").Documents(ctx)
	defer iter.Stop()

	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return err
		}

		var u rankingCacheUserDoc
		if err := doc.DataTo(&u); err != nil {
			return err
		}
		if u.Status == nil {
			// Node版は `item.data().status.total` で undefined 参照の例外になり、
			// forEach内の非同期コールバックなので他ユーザーの処理には影響しない
			// (このユーザーの処理だけが失敗して次のユーザーに進む)。Go版も同様に
			// このユーザーをスキップして処理を続ける。
			//
			// 注意: `status` は存在するが `status.total` だけが欠けている
			// (通常運用では起こらないはずの壊れたデータ)場合、Node版は
			// 同様にundefined参照で例外になりスキップされるが、Go版は
			// u.Status.Total がゼロ値の0になり `battle_point:0` として
			// 書き込まれてしまう。user_formatted_performance/UserFormattedPerformance
			// は必ず total を設定するため実運用では発生しない想定だが、
			// 手動編集や移行中データ等で万一 total が欠けた場合の挙動は
			// Node版と厳密には一致しない。
			log.Printf("rankingCache: skip user %q: status not computed yet", doc.Ref.ID)
			continue
		}

		rankingRef := client.Collection("point_ranking").Doc(doc.Ref.ID)
		_, err = rankingRef.Get(ctx)
		if err == nil {
			// 既にpoint_rankingドキュメントが存在する: Node版と同様にスキップ。
			continue
		}
		if grpcstatus.Code(err) != codes.NotFound {
			return err
		}

		if _, err := rankingRef.Set(ctx, map[string]interface{}{
			"display_name": u.DisplayName,
			"screen_name":  u.ScreenName,
			"battle_point": u.Status.Total,
			"rank":         0,
		}, firestore.MergeAll); err != nil {
			return err
		}
	}
	return nil
}
