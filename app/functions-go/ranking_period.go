// 期間ランキング(週間・月間)の集計。
//
// トータルのランキング(ranking_update.go)に加えて、暦週・暦月(JST)で区切った
// ランキングを作る。指標ごとに出し方が違う:
//
//   - ぽいんと: users/{id}/sanpai_logs の add_point を期間で合計する。ログは
//     参拝成功のたびに残っているので、過去に遡って正確な値が出せる。
//   - せんとうりょく: status.total は現在値しか保存しておらず過去を復元できない
//     (GitHub Events APIも90日制限)。そこで期間開始時点のスナップショットを
//     cache_data/battle_baseline に持ち、現在値との差分=「期間中に伸びた分」で
//     ランキングする。基準値が無いユーザー(新規・初回観測)はその場の値で
//     初期化して差分0から始める(現在値まるごとで1位になる事故を防ぐ)。
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

// battleBaselineDocID はせんとうりょくの期間開始時点スナップショットの置き場所。
const battleBaselineDocID = "battle_baseline"

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

// battleBaselineDoc は cache_data/battle_baseline の形状。
// week/month は github_id -> 期間開始時点の status.total。
type battleBaselineDoc struct {
	WeekKey  string           `firestore:"week_key"`
	MonthKey string           `firestore:"month_key"`
	Week     map[string]int64 `firestore:"week"`
	Month    map[string]int64 `firestore:"month"`
	// 基準値を作った時刻。期間の開始よりだいぶ後なら、その期間の集計は
	// 途中から始まったことになる(締めのアーカイブに partial として記録する)。
	WeekBaseAt  time.Time `firestore:"week_base_at"`
	MonthBaseAt time.Time `firestore:"month_base_at"`
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

// shouldAggregateSanpaiPoints は参拝ログの期間集計を行う実行回かを返す。
// この集計だけはコレクショングループの読み取り件数が期間中の参拝数に比例する
// ため、毎時ではなく3時間ごとに間引く(せんとうりょくの期間ランキングは
// 基準値の差分だけで作れるので毎時更新する)。
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

// rollBattleBaseline は基準値を現在の期間に合わせ、期間中の伸び幅を返す(純関数)。
//
//   - 期間キーが変わっていたら、その時点の total で基準値を作り直す(=全員0から)
//   - 基準値に居ないユーザー(新規・初回観測)は現在値で初期化する(差分0)
//   - 現在居ないユーザーの基準値は捨てる(ドキュメントサイズを抑える)
//   - 伸び幅0以下はランキングに載せない
func rollBattleBaseline(baseline *battleBaselineDoc, users []rankingUpdateUserDoc, weekKey, monthKey string, now time.Time) (weekScores, monthScores []periodScore) {
	if baseline.Week == nil || baseline.WeekKey != weekKey {
		baseline.Week = map[string]int64{}
		baseline.WeekKey = weekKey
		baseline.WeekBaseAt = now
	}
	if baseline.Month == nil || baseline.MonthKey != monthKey {
		baseline.Month = map[string]int64{}
		baseline.MonthKey = monthKey
		baseline.MonthBaseAt = now
	}

	nextWeek := make(map[string]int64, len(users))
	nextMonth := make(map[string]int64, len(users))
	for _, u := range users {
		profile := rankingProfile{DisplayName: u.DisplayName, ScreenName: u.ScreenName, ImagePath: u.ImagePath}

		base, ok := baseline.Week[u.ID]
		if !ok {
			base = u.Status.Total
		}
		nextWeek[u.ID] = base
		if d := u.Status.Total - base; d > 0 {
			weekScores = append(weekScores, periodScore{ID: u.ID, Profile: profile, Value: d})
		}

		base, ok = baseline.Month[u.ID]
		if !ok {
			base = u.Status.Total
		}
		nextMonth[u.ID] = base
		if d := u.Status.Total - base; d > 0 {
			monthScores = append(monthScores, periodScore{ID: u.ID, Profile: profile, Value: d})
		}
	}
	baseline.Week = nextWeek
	baseline.Month = nextMonth
	return weekScores, monthScores
}

// loadBattleBaseline は基準値ドキュメントを読む。未作成なら空の基準値を返す
// (初回はこの後の rollBattleBaseline で全ユーザーが現在値で初期化される)。
func loadBattleBaseline(ctx context.Context, client *firestore.Client) (*battleBaselineDoc, error) {
	snap, err := client.Collection("cache_data").Doc(battleBaselineDocID).Get(ctx)
	if err != nil {
		if grpcstatus.Code(err) == codes.NotFound {
			return &battleBaselineDoc{}, nil
		}
		return nil, err
	}
	var doc battleBaselineDoc
	if err := snap.DataTo(&doc); err != nil {
		return nil, err
	}
	return &doc, nil
}

// saveBattleBaseline は基準値ドキュメントを丸ごと書き直す。
// MergeAll を使わないのは、github_id をキーにしたマップがフィールドパスとして
// 解釈されるのを避けるため(ドキュメント専用なので全置換で正しい)。
func saveBattleBaseline(ctx context.Context, client *firestore.Client, baseline *battleBaselineDoc) error {
	_, err := client.Collection("cache_data").Doc(battleBaselineDocID).Set(ctx, baseline)
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
	totals := map[string]int64{}
	err := eachSanpaiLogSince(ctx, client, start, func(id string, point int64, ts time.Time) {
		if ts.Before(end) {
			totals[id] += point
		}
	})
	if err != nil {
		return nil, err
	}
	return totals, nil
}

// eachSanpaiLogSince は since 以降の参拝ログをコレクショングループで横断し、
// 1件ずつコールバックする。上限は呼び出し側でフィルタする(同一フィールドの
// 範囲指定を2つ重ねるより、読み取り件数が同じで扱いが簡単なため)。
func eachSanpaiLogSince(ctx context.Context, client *firestore.Client, since time.Time, fn func(userID string, point int64, ts time.Time)) error {
	iter := client.CollectionGroup("sanpai_logs").Where("timestamp", ">=", since).Documents(ctx)
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
