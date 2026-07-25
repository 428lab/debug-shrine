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
	"time"

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
	// ID は users のドキュメントID(github_id)。期間ランキングの基準値や
	// 参拝ログの突き合わせに使うため、読み取り時に手で入れる。
	ID          string `firestore:"-"`
	DisplayName string `firestore:"display_name"`
	ScreenName  string `firestore:"screen_name"`
	ImagePath   string `firestore:"image_path"`
	Exp         int64  `firestore:"exp"`
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
	// また orderBy は Firestore の仕様上、対象フィールドを持たないドキュメントを
	// 自動的に除外するため、`status` 未計算のユーザーによる例外(Node版で言う
	// `.status.total` の undefined参照)は発生し得ない。exp を持たないユーザーも
	// 同様にぽいんとランキングから除外される(参拝経験ゼロのユーザー)。
	battleUsers, err := fetchRankingUsers(ctx, client, "status.total")
	if err != nil {
		return err
	}
	battleRanks := assignCompetitionRanks(battleUsers, func(u rankingUpdateUserDoc) int64 { return u.Status.Total })
	ranking := make([]rankingEntry, len(battleUsers))
	for i, u := range battleUsers {
		ranking[i] = rankingEntry{
			DisplayName: u.DisplayName,
			ScreenName:  u.ScreenName,
			ImagePath:   u.ImagePath,
			BattlePoint: u.Status.Total,
			Rank:        battleRanks[i],
		}
	}

	// ぽいんと(exp)ランキング。戦闘力(status.total)とは別軸の指標なので
	// クエリも別に発行する(exp はあるが status 未計算、の逆パターンも拾える)。
	pointUsers, err := fetchRankingUsers(ctx, client, "exp")
	if err != nil {
		return err
	}
	pointRanks := assignCompetitionRanks(pointUsers, func(u rankingUpdateUserDoc) int64 { return u.Exp })
	pointsRanking := make([]pointsRankingEntry, len(pointUsers))
	for i, u := range pointUsers {
		pointsRanking[i] = pointsRankingEntry{
			DisplayName: u.DisplayName,
			ScreenName:  u.ScreenName,
			ImagePath:   u.ImagePath,
			Point:       u.Exp,
			Rank:        pointRanks[i],
		}
	}

	data := map[string]interface{}{
		"ranking":        ranking,
		"points_ranking": pointsRanking,
		"latest_update":  firestore.ServerTimestamp,
	}

	// 期間ランキング(週間・月間)。失敗してもトータルの更新は止めない
	// (期間分は前回値がMergeAllで残るため、次の実行で追いつく)。
	if err := appendPeriodRankings(ctx, client, data, battleUsers, pointUsers, time.Now()); err != nil {
		log.Printf("rankingUpdate: period rankings skipped: %v", err)
	}

	_, err = client.Collection("cache_data").Doc("ranking_cache").Set(ctx, data, firestore.MergeAll)
	return err
}

// appendPeriodRankings は週間・月間のランキングを data に足す。
//
// せんとうりょくは基準値との差分だけで作れるので毎回更新する。ぽいんとは
// 参拝ログの横断読み取りが要るため3時間ごとに間引く(間引いた回は
// MergeAll によって前回の値がそのまま残る)。
func appendPeriodRankings(ctx context.Context, client *firestore.Client, data map[string]interface{}, battleUsers, pointUsers []rankingUpdateUserDoc, now time.Time) error {
	weekStart, monthStart, weekKey, monthKey := periodBounds(now)

	baseline, err := loadBattleBaseline(ctx, client)
	if err != nil {
		return err
	}
	weekScores, monthScores := rollBattleBaseline(baseline, battleUsers, weekKey, monthKey)
	if err := saveBattleBaseline(ctx, client, baseline); err != nil {
		return err
	}
	putPeriodRanking(data, "battle_week", weekScores)
	putPeriodRanking(data, "battle_month", monthScores)

	if !shouldAggregateSanpaiPoints(now) {
		return nil
	}

	// 表示情報は既に読み込み済みのユーザー一覧から引く(追加の読み取りをしない)。
	profiles := make(map[string]rankingProfile, len(pointUsers)+len(battleUsers))
	for _, list := range [][]rankingUpdateUserDoc{battleUsers, pointUsers} {
		for _, u := range list {
			profiles[u.ID] = rankingProfile{DisplayName: u.DisplayName, ScreenName: u.ScreenName, ImagePath: u.ImagePath}
		}
	}

	weekPoints, monthPoints, err := aggregateSanpaiPoints(ctx, client, weekStart, monthStart)
	if err != nil {
		return err
	}
	putPeriodRanking(data, "points_week", pointScores(weekPoints, profiles))
	putPeriodRanking(data, "points_month", pointScores(monthPoints, profiles))
	return nil
}

// fetchRankingUsers は users コレクションを指定フィールドの降順で全件取得する。
// orderBy の仕様により、対象フィールドを持たないドキュメントは結果に含まれない。
func fetchRankingUsers(ctx context.Context, client *firestore.Client, orderField string) ([]rankingUpdateUserDoc, error) {
	iter := client.Collection("users").OrderBy(orderField, firestore.Desc).Documents(ctx)
	defer iter.Stop()

	var users []rankingUpdateUserDoc
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}
		var u rankingUpdateUserDoc
		if err := doc.DataTo(&u); err != nil {
			return nil, err
		}
		u.ID = doc.Ref.ID
		users = append(users, u)
	}
	return users, nil
}

// assignCompetitionRanks は降順ソート済みのユーザー列に競技ランキング方式の
// 順位を割り当てる(同点は同順位、次の順位は人数分飛ぶ)。
func assignCompetitionRanks(users []rankingUpdateUserDoc, value func(rankingUpdateUserDoc) int64) []int64 {
	ranks := make([]int64, len(users))
	tempRank := int64(1)
	tempPoint := int64(-1)
	for i := range users {
		v := value(users[i])
		if tempPoint != v {
			tempRank = int64(i) + 1
			tempPoint = v
		}
		ranks[i] = tempRank
	}
	return ranks
}
