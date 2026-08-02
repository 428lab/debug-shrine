// 期間ランキング(週間・月間)の集計。
//
// トータルのランキング(ranking_update.go)に加えて、暦週・暦月(JST)で区切った
// ランキングを作る。どちらの指標も「参拝1回で得た量」のログを期間で合計する:
//
//   - ぽいんと: users/{id}/sanpai_logs の add_point
//   - せんとうりょく: users/{id}/battle_logs の add_point(battle_logs.go 参照)
//
// せんとうりょくは以前 status.total のスナップショットとの差分で出していたが、
// status.total は表示用キャッシュでもあり参拝と無関係に書き直されるため、その
// 再計算が「期間中に伸びた分」に混ざっていた。ログ方式にはその問題が無い。
package gofunctions

import (
	"context"
	"sort"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	grpcstatus "google.golang.org/grpc/status"
)

// jst は期間の区切りに使うタイムゾーン。神社の「今週」「今月」は日本時間で数える。
var jst = time.FixedZone("JST", 9*60*60)

// periodTopLimit は期間ランキングでキャッシュドキュメントに表示情報つきで
// 保存する件数。全ユーザー分を表示情報つきで持つとドキュメントの1MiB上限に
// 早く到達するため、上位のみに絞る(圏外の順位は periodRankEntry で引ける)。
const periodTopLimit = 100

// periodStateDocID は期間ランキングの状態(いま集計している週・月)の置き場所。
// 期間の変わり目を検出して締めを走らせるためだけに使う。
const periodStateDocID = "ranking_period_state"

// periodEntry は期間ランキング上位の1件(表示情報つき)。
type periodEntry struct {
	DisplayName string `firestore:"display_name" json:"display_name"`
	ScreenName  string `firestore:"screen_name" json:"screen_name"`
	ImagePath   string `firestore:"image_path" json:"image_path"`
	Value       int64  `firestore:"value" json:"value"`
	Rank        int64  `firestore:"rank" json:"rank"`
}

// periodRankEntry は順位照会用の軽量エントリ(全ユーザー分を保存する)。
// 「あなたの順位」カードは順位と値しか使わないので表示情報は持たない。
type periodRankEntry struct {
	ScreenName string `firestore:"screen_name" json:"screen_name"`
	Value      int64  `firestore:"value" json:"value"`
	Rank       int64  `firestore:"rank" json:"rank"`
}

// periodStateDoc は cache_data/ranking_period_state の形状。
type periodStateDoc struct {
	WeekKey  string `firestore:"week_key"`
	MonthKey string `firestore:"month_key"`
}

// periodWindow は集計対象の期間1つ(キーと開始時刻)。
type periodWindow struct {
	Key   string
	Start time.Time
}

// periodScore は期間ランキングを組む前の中間表現。
type periodScore struct {
	ID      string
	Profile rankingProfile
	Value   int64
}

// rankingProfile は表示に必要なユーザー情報。
type rankingProfile struct {
	DisplayName string
	ScreenName  string
	ImagePath   string
}

// periodBounds は現在時刻から暦週・暦月(JST)の開始時刻とキーを求める(純関数)。
// 週は月曜0:00始まり、月は1日0:00始まり。
func periodBounds(now time.Time) (weekStart, monthStart time.Time, weekKey, monthKey string) {
	t := now.In(jst)
	day := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, jst)
	// time.Weekday は日曜=0。月曜を週初にするため、月曜=0 になるようずらす。
	offset := (int(day.Weekday()) + 6) % 7
	weekStart = day.AddDate(0, 0, -offset)
	monthStart = time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, jst)
	return weekStart, monthStart, weekStart.Format("2006-01-02"), monthStart.Format("2006-01")
}

// shouldAggregateSanpaiPoints はぽいんとの期間集計を行う実行回かを返す。
// コレクショングループの読み取り件数が期間中の参拝数に比例するため、毎時ではなく
// 3時間ごとに間引く(間引いた回は MergeAll によって前回値がそのまま残る)。
//
// せんとうりょくは同じ形のログを読むが、参拝直後にランキングへ反映されないと
// 体験が悪いので毎時のまま維持する。読み取り件数はぽいんとと同じ order。
func shouldAggregateSanpaiPoints(now time.Time) bool {
	return now.In(jst).Hour()%3 == 0
}

// buildPeriodRanking はスコア列から上位リストと全件の順位リストを作る(純関数)。
// 値の降順、同点は同順位(次の順位は人数分飛ぶ)。同点の並びはIDで決定論にする。
func buildPeriodRanking(scores []periodScore) ([]periodEntry, []periodRankEntry) {
	sorted := make([]periodScore, len(scores))
	copy(sorted, scores)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].Value != sorted[j].Value {
			return sorted[i].Value > sorted[j].Value
		}
		return sorted[i].ID < sorted[j].ID
	})

	top := make([]periodEntry, 0, periodTopLimit)
	ranks := make([]periodRankEntry, 0, len(sorted))
	tempRank := int64(1)
	tempValue := int64(-1)
	for i, s := range sorted {
		if i == 0 || tempValue != s.Value {
			tempRank = int64(i) + 1
			tempValue = s.Value
		}
		ranks = append(ranks, periodRankEntry{ScreenName: s.Profile.ScreenName, Value: s.Value, Rank: tempRank})
		if len(top) < periodTopLimit {
			top = append(top, periodEntry{
				DisplayName: s.Profile.DisplayName,
				ScreenName:  s.Profile.ScreenName,
				ImagePath:   s.Profile.ImagePath,
				Value:       s.Value,
				Rank:        tempRank,
			})
		}
	}
	return top, ranks
}

// loadPeriodState は期間状態を読む。未作成なら空を返す(初回は締めを走らせない)。
func loadPeriodState(ctx context.Context, client *firestore.Client) (*periodStateDoc, error) {
	snap, err := client.Collection("cache_data").Doc(periodStateDocID).Get(ctx)
	if err != nil {
		if grpcstatus.Code(err) == codes.NotFound {
			return &periodStateDoc{}, nil
		}
		return nil, err
	}
	var doc periodStateDoc
	if err := snap.DataTo(&doc); err != nil {
		return nil, err
	}
	return &doc, nil
}

// savePeriodState は期間状態を書き直す。
func savePeriodState(ctx context.Context, client *firestore.Client, state *periodStateDoc) error {
	_, err := client.Collection("cache_data").Doc(periodStateDocID).Set(ctx, state)
	return err
}

// aggregateSanpaiPoints は参拝ログをコレクショングループで横断し、
// github_id ごとの週間・月間の獲得ぽいんとを合計する。
//
// 読み取りを1クエリに抑えるため、週初と月初の早い方から取得して振り分ける
// (週が月をまたぐ場合は週初が月初より前になる)。
func aggregateSanpaiPoints(ctx context.Context, client *firestore.Client, weekStart, monthStart time.Time) (week, month map[string]int64, err error) {
	since := weekStart
	if monthStart.Before(since) {
		since = monthStart
	}

	week = map[string]int64{}
	month = map[string]int64{}
	err = eachSanpaiLogSince(ctx, client, since, func(id string, point int64, ts time.Time) {
		if !ts.Before(monthStart) {
			month[id] += point
		}
		if !ts.Before(weekStart) {
			week[id] += point
		}
	})
	if err != nil {
		return nil, nil, err
	}
	return week, month, nil
}

// aggregateSanpaiPointsRange は [start, end) の範囲だけを集計する。
// 締めたばかりの期間の確定値を出すのに使う(週/月ごとに1回だけ走る)。
func aggregateSanpaiPointsRange(ctx context.Context, client *firestore.Client, start, end time.Time) (map[string]int64, error) {
	return aggregatePeriodLogRange(ctx, client, "sanpai_logs", start, end)
}

// aggregateBattlePoints は獲得ログから期間中に伸びたせんとうりょくを合計する。
// 集計の形は参拝ログ(ぽいんと)と同じ。
func aggregateBattlePoints(ctx context.Context, client *firestore.Client, weekStart, monthStart time.Time) (week, month map[string]int64, err error) {
	since := weekStart
	if monthStart.Before(since) {
		since = monthStart
	}

	week = map[string]int64{}
	month = map[string]int64{}
	err = eachPeriodLogSince(ctx, client, battleLogsCollection, since, func(id string, point int64, ts time.Time) {
		if !ts.Before(monthStart) {
			month[id] += point
		}
		if !ts.Before(weekStart) {
			week[id] += point
		}
	})
	if err != nil {
		return nil, nil, err
	}
	return week, month, nil
}

// aggregateBattlePointsRange は [start, end) の範囲だけを集計する(締めの確定値用)。
func aggregateBattlePointsRange(ctx context.Context, client *firestore.Client, start, end time.Time) (map[string]int64, error) {
	return aggregatePeriodLogRange(ctx, client, battleLogsCollection, start, end)
}

// eachSanpaiLogSince は since 以降の参拝ログを横断する。
func eachSanpaiLogSince(ctx context.Context, client *firestore.Client, since time.Time, fn func(userID string, point int64, ts time.Time)) error {
	return eachPeriodLogSince(ctx, client, "sanpai_logs", since, fn)
}

// aggregatePeriodLogRange は [start, end) の範囲を github_id ごとに合計する。
func aggregatePeriodLogRange(ctx context.Context, client *firestore.Client, collection string, start, end time.Time) (map[string]int64, error) {
	totals := map[string]int64{}
	err := eachPeriodLogSince(ctx, client, collection, start, func(id string, point int64, ts time.Time) {
		if ts.Before(end) {
			totals[id] += point
		}
	})
	if err != nil {
		return nil, err
	}
	return totals, nil
}

// eachPeriodLogSince は since 以降の獲得ログをコレクショングループで横断し、
// 1件ずつコールバックする。上限は呼び出し側でフィルタする(同一フィールドの
// 範囲指定を2つ重ねるより、読み取り件数が同じで扱いが簡単なため)。
//
// collection は sanpai_logs(ぽいんと)か battle_logs(せんとうりょく)。
// どちらも {add_point, timestamp} の形で、親の親がユーザードキュメント。
func eachPeriodLogSince(ctx context.Context, client *firestore.Client, collection string, since time.Time, fn func(userID string, point int64, ts time.Time)) error {
	iter := client.CollectionGroup(collection).Where("timestamp", ">=", since).Documents(ctx)
	defer iter.Stop()
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			return nil
		}
		if err != nil {
			return err
		}
		var log sanpaiLogEntry
		if err := doc.DataTo(&log); err != nil {
			// 想定外の形のログで全体を落とさない(1件飛ばす)。
			continue
		}
		// users/{github_id}/sanpai_logs/{autoID} の親の親がユーザードキュメント。
		if doc.Ref.Parent == nil || doc.Ref.Parent.Parent == nil {
			continue
		}
		fn(doc.Ref.Parent.Parent.ID, log.AddPoint, log.Timestamp.In(jst))
	}
}

// pointScores は集計結果を、表示情報を引き当ててスコア列にする(純関数)。
// プロフィールが見つからないID(退会等)は載せない。
func pointScores(totals map[string]int64, profiles map[string]rankingProfile) []periodScore {
	scores := make([]periodScore, 0, len(totals))
	for id, v := range totals {
		if v <= 0 {
			continue
		}
		p, ok := profiles[id]
		if !ok {
			continue
		}
		scores = append(scores, periodScore{ID: id, Profile: p, Value: v})
	}
	return scores
}

// putPeriodRanking は期間ランキングをキャッシュドキュメント用のマップに詰める。
// prefix は "battle_week" のような指標+期間の組。
func putPeriodRanking(data map[string]interface{}, prefix string, scores []periodScore) {
	top, ranks := buildPeriodRanking(scores)
	data[prefix+"_top"] = top
	data[prefix+"_ranks"] = ranks
}
