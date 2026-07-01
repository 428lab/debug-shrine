// ランキング表示(ranking)エンドポイントのGo実装。
//
// Node版(app/functions/index.js の exports.ranking)からの移植であり、
// コールドスタートを短縮するために Go/Cloud Run functions として個別に
// デプロイする(関数名は rankingGo。既存の ranking(Node) とは別関数として
// 共存させ、フロントエンドの切替タイミングを制御できるようにしている)。
//
// 挙動はNode版と同一にすることを優先し、独自の改善は入れていない
// (詳細は docs/backend.md「ranking エンドポイントのGo移植」を参照)。
package gofunctions

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
)

func init() {
	functions.HTTP("RankingGo", rankingHandler)
}

// rankingEntry は cache_data/ranking_cache ドキュメントの ranking 配列の1要素。
type rankingEntry struct {
	DisplayName string `firestore:"display_name" json:"display_name"`
	ScreenName  string `firestore:"screen_name" json:"screen_name"`
	ImagePath   string `firestore:"image_path" json:"image_path"`
	BattlePoint int64  `firestore:"battle_point" json:"battle_point"`
	Rank        int64  `firestore:"rank" json:"rank"`
}

// rankingCacheDoc は cache_data/ranking_cache ドキュメントの形状。
// latest_update(Firestore Timestamp)はNode版のJSON化形式
// (`_seconds`/`_nanoseconds`)を再現するため DataTo ではなく DataAt で個別に取得する
// (extractTimestampField 参照)。
type rankingCacheDoc struct {
	Ranking []rankingEntry `firestore:"ranking"`
}

// firestoreTimestampRaw は Node版の Firestore Timestamp を JSON.stringify した際の
// 形状 `{"_seconds":..., "_nanoseconds":...}` を再現するための型
// (@google-cloud/firestore の Timestamp クラスは toJSON を持たず、
// プライベートでない `_seconds`/`_nanoseconds` フィールドがそのまま出力される)。
// フロントエンド(web/components/ranking.vue)は現状この値を表示に使っていないが、
// レスポンス形状の等価性のために踏襲する。
type firestoreTimestampRaw struct {
	Seconds     int64 `json:"_seconds"`
	Nanoseconds int64 `json:"_nanoseconds"`
}

type rankingResponse struct {
	Ranking      []rankingEntry         `json:"ranking"`
	LatestUpdate *firestoreTimestampRaw `json:"latest_update,omitempty"`
	MyRank       *rankingEntry          `json:"my_rank,omitempty"`
}

func rankingHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	ctx := r.Context()
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("ranking: getFirestoreClient error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	screenName := r.URL.Query().Get("screen_name")

	resp, err := buildRankingResponse(ctx, client, screenName)
	if err != nil {
		// Node版は cache_data/ranking_cache が未作成の場合に例外化させる処理を
		// 特に catch していない(rankingUpdate スケジュール関数が定期的に作成する
		// 前提)。Go版もこのケースは異常系として internal error を返す。
		log.Printf("ranking: buildRankingResponse error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func buildRankingResponse(ctx context.Context, client *firestore.Client, screenName string) (rankingResponse, error) {
	return buildRankingResponseFromDoc(ctx, client, "ranking_cache", screenName)
}

// buildRankingResponseFromDoc は buildRankingResponse の本体。ドキュメントIDを
// 引数にしているのはテストで独立したドキュメントを使えるようにするため。
func buildRankingResponseFromDoc(ctx context.Context, client *firestore.Client, docID, screenName string) (rankingResponse, error) {
	snap, err := client.Collection("cache_data").Doc(docID).Get(ctx)
	if err != nil {
		return rankingResponse{}, err
	}

	var doc rankingCacheDoc
	rawSeconds, rawNanos, hasLatestUpdate := extractTimestampField(snap, "latest_update")
	if err := snap.DataTo(&doc); err != nil {
		return rankingResponse{}, err
	}
	if doc.Ranking == nil {
		// Node版は rankingData.ranking が undefined だと `.slice()` 呼び出しで
		// 例外化する(未捕捉、呼び出し元で500になる)。Go版が `ranking: null` を
		// 200で返すと「キャッシュ破損を握りつぶして正常応答する」ことになり
		// Node版よりも実害を隠してしまうため、同様にエラーとして扱う。
		return rankingResponse{}, fmt.Errorf("ranking_cache document %q has no ranking field", docID)
	}

	top := doc.Ranking
	if len(top) > 100 {
		top = top[:100]
	}

	resp := rankingResponse{Ranking: top}
	if hasLatestUpdate {
		resp.LatestUpdate = &firestoreTimestampRaw{Seconds: rawSeconds, Nanoseconds: rawNanos}
	}
	if screenName != "" {
		for i := range doc.Ranking {
			if doc.Ranking[i].ScreenName == screenName {
				resp.MyRank = &doc.Ranking[i]
				break
			}
		}
	}
	return resp, nil
}

// extractTimestampField は DocumentSnapshot から生の Firestore Timestamp
// (秒・ナノ秒)を取り出す。Node版がJSON化した際の `_seconds`/`_nanoseconds`
// 形式を再現するために time.Time の内部値をそのまま使う。
func extractTimestampField(snap *firestore.DocumentSnapshot, field string) (seconds, nanoseconds int64, ok bool) {
	v, err := snap.DataAt(field)
	if err != nil {
		return 0, 0, false
	}
	t, ok := v.(time.Time)
	if !ok {
		return 0, 0, false
	}
	return t.Unix(), int64(t.Nanosecond()), true
}
