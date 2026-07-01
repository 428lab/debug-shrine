// Package performance は参拝の能力解析(パフォーマンス計算)に関する純粋ロジックを提供する。
// app/functions/performance.js (Node版)と同一の計算結果を返すことを目的としたポートであり、
// 副作用(Firestore/HTTP)を持たずユニットテスト可能な単位として切り出している。
//
// 値を変更する場合は必ず Node版(app/functions/performance.js)と同時に更新し、
// 両実装のテスト(performance_test.go / performance.test.js)で等価性を確認すること。
package performance

import (
	"log"
	"sort"
	"time"
)

// レベルアップに必要な累計ポイントの閾値テーブル。Node版 target_points と同一の値。
var targetPoints = []int{
	0, 5, 11, 19, 30, 45, 65, 91, 124, 166, 218, 281, 357, 447, 553, 676, 818, 981,
	1167, 1378, 1616, 1884, 2184, 2519, 2892, 3306, 3764, 4269, 4825, 5436, 6106,
	6840, 7643, 8520, 9477, 10520, 11656, 12892, 14236, 15696, 17281, 19001, 20867,
	22891, 25086, 27466, 30046, 32842, 35872, 39156,
}

// GetLevel は累計ポイントからレベルを算出する(Node版 get_level と同一)。
func GetLevel(points int) int {
	level := 0
	for i, t := range targetPoints {
		if points <= t {
			level = i + 1
			break
		}
	}
	return level
}

// NextLevelExp は次レベルとその必要経験値。
type NextLevelExp struct {
	NextLevel int
	NextExp   int
}

// GetNextLevelExp は次レベルに必要な経験値を返す(Node版 get_next_leve_exp と同一)。
// 最大レベルを超える場合(target_points の範囲外)は NextExp=0 とする
// (Node版は該当時 undefined になり JSON からフィールドが消えるが、実運用では到達しない
// 極端な境界のため、Goでは panic を避けて 0 を返す)。
func GetNextLevelExp(points int) NextLevelExp {
	level := GetLevel(points)
	nextExp := 0
	if level >= 0 && level < len(targetPoints) {
		nextExp = targetPoints[level]
	}
	return NextLevelExp{NextLevel: level + 1, NextExp: nextExp}
}

// Activity はGitHub Events APIの1イベント(Firestoreにキャッシュされた raw JSON)を表す。
// Payload は文字列/オブジェクト/nullのいずれもあり得るため any として保持し、
// PayloadEquals で型を厳密に比較する(Node版の switch(item.payload){case "opened":...} の
// 厳密等価(===)と同じ挙動: GitHub実データのオブジェクトpayloadは文字列と決して一致しない)。
type Activity struct {
	Type      string `json:"type"`
	CreatedAt string `json:"created_at"`
	Payload   any    `json:"payload"`
}

func payloadEquals(payload any, s string) bool {
	str, ok := payload.(string)
	return ok && str == s
}

func parseCreatedAt(createdAt string) time.Time {
	t, err := time.Parse(time.RFC3339, createdAt)
	if err != nil {
		// created_at はGitHub Events APIが常にRFC3339で返すため通常発生しない。
		// パース不能な入力はゼロ値(0001-01-01)として扱い、以降の差分計算を破綻させない。
		return time.Time{}
	}
	return t
}

// RawUserData は集計途中の生ステータス(Node版 user_performance の戻り値相当)。
type RawUserData struct {
	User         string
	HP           int
	Power        int
	Defence      int
	Dex          int
	Agility      int
	Intelligence int
}

// UserPerformance はアクティビティ一覧から生ステータスを集計する(Node版 user_performance と同一)。
func UserPerformance(items []Activity, username string) RawUserData {
	data := RawUserData{User: username}

	sorted := make([]Activity, len(items))
	copy(sorted, items)
	sort.SliceStable(sorted, func(i, j int) bool {
		return parseCreatedAt(sorted[i].CreatedAt).Before(parseCreatedAt(sorted[j].CreatedAt))
	})

	var previous *Activity
	continuousCount := 0

	for i := range sorted {
		item := &sorted[i]
		if previous != nil {
			diff := parseCreatedAt(item.CreatedAt).Sub(parseCreatedAt(previous.CreatedAt)).Seconds()

			switch {
			case diff > 30 && diff <= 120:
				data.Agility += 6
			case diff <= 180:
				data.Agility += 3
			case diff <= 300:
				data.Agility += 2
			case diff <= 1200:
				data.Agility += 1
			}
			if diff <= 7200 {
				continuousCount++
			} else {
				data.HP += continuousCount * 2
				continuousCount = 0
			}
		}

		switch item.Type {
		case "ForkEvent":
			data.Power += 1
		case "PushEvent":
			data.Power += 2
		case "CreateEvent", "DeleteEvent":
			data.Power += 1
		case "PullRequestEvent":
			data.Power += 3
		case "IssuesEvent":
			if payloadEquals(item.Payload, "opened") {
				data.Intelligence += 3
			} else if payloadEquals(item.Payload, "closed") {
				data.Defence += 5
			}
		case "IssueCommentEvent":
			data.Intelligence += 2
		case "PullRequestReviewEvent":
			data.Defence += 3
		case "PullRequestReviewCommentEvent":
			data.Defence += 3
		case "GollumEvent":
			data.Defence += 3
		case "ReleaseEvent":
			data.Defence += 10
		}
		previous = item
	}
	if continuousCount > 0 {
		data.HP += continuousCount * 2
	}
	return data
}

// UserInfo は表示用のユーザー情報(append_data.user 相当)。
type UserInfo struct {
	DisplayName     string `json:"display_name" firestore:"display_name"`
	ScreenName      string `json:"screen_name" firestore:"screen_name"`
	GithubImagePath string `json:"github_image_path" firestore:"github_image_path"`
}

// Chart はレーダーチャート表示用の内訳(Node版 chart と同一)。
type Chart struct {
	HP           int `json:"hp" firestore:"hp"`
	Power        int `json:"power" firestore:"power"`
	Intelligence int `json:"intelligence" firestore:"intelligence"`
	Defence      int `json:"defence" firestore:"defence"`
	Agility      int `json:"agility" firestore:"agility"`
}

// FormattedPerformance は user_formatted_performance の戻り値相当。
//
// Node版は append_data.user / append_data.exp が未指定の場合のフォールバック
// (userのみの文字列表示、pointsを0のまま等)を持つ汎用実装だが、現時点の呼び出し元
// (status エンドポイント)は必ず User/Exp を明示的に与えるため、Goでは単純化して
// User を常に必須の構造体としている(既存の全呼び出し箇所で append_data.user は
// 常に設定されているため、この単純化は挙動を変えない)。
type FormattedPerformance struct {
	User         UserInfo `json:"user"`
	Points       int      `json:"points"`
	HP           int      `json:"hp"`
	Power        int      `json:"power"`
	Intelligence int      `json:"intelligence"`
	Defence      int      `json:"defence"`
	Agility      int      `json:"agility"`
	Total        int      `json:"total"`
	Level        int      `json:"level"`
	Exp          int      `json:"exp"`
	NextExp      int      `json:"next_exp"`
	Chart        Chart    `json:"chart"`
}

// AppendData は user_formatted_performance の第2引数(append_data)相当。
type AppendData struct {
	Exp  int
	User UserInfo
}

// RawUserDataFromStatus は保存済み status から user_performance 相当の生ステータスを
// 復元する(Node版 raw_user_data_from_status と同一)。
func RawUserDataFromStatus(status FormattedPerformance, username string) RawUserData {
	return RawUserData{
		User:         username,
		HP:           status.HP,
		Power:        status.Power,
		Defence:      status.Defence,
		Dex:          0,
		Agility:      status.Agility,
		Intelligence: status.Intelligence,
	}
}

// LatestActivityCreatedAt はアクティビティ群の中で最も新しい created_at を返す
// (無ければ空文字。Node版 latest_activity_created_at は null を返すが、Goでは
// zero valueとして空文字を使う)。
func LatestActivityCreatedAt(items []Activity) string {
	latest := ""
	for _, item := range items {
		if latest == "" || parseCreatedAt(item.CreatedAt).After(parseCreatedAt(latest)) {
			latest = item.CreatedAt
		}
	}
	return latest
}

// IncrementResult は ComputePerformanceIncrement の戻り値。
type IncrementResult struct {
	UserData      RawUserData
	LastCreatedAt string
}

// ComputePerformanceIncrement は累積ステータス(baseUserData)に新着アクティビティ分だけを
// 加算する増分計算(Node版 compute_performance_increment と同一)。
//
// user_performance の per-event / per-pair の寄与は加算的で、バッチ境界
// (previousCreatedAt と新着先頭の時間差)だけがクロスバッチ依存となるため、
// 全件を再集計せずとも全件計算と同一の結果が得られる。
//
// 前提となる不変条件(全件計算と一致するのは以下が成り立つ場合のみ):
//  1. newItems は baseUserData に未集計のイベントだけで構成される(二重計上しない)。
//  2. newItems の全イベントが previousCreatedAt(累積済みイベントの最大時刻)より後である。
//  3. previousCreatedAt は累積済みイベントの最大 created_at である。
//
// 呼び出し側(sanpai)は「created_at > last_sanpai」で newItems を抽出し、
// previousCreatedAt に保存済み最大時刻(last_activity_created_at)を渡すことでこれを満たす。
func ComputePerformanceIncrement(baseUserData RawUserData, newItems []Activity, previousCreatedAt string) IncrementResult {
	data := RawUserData{
		User:         baseUserData.User,
		HP:           baseUserData.HP,
		Power:        baseUserData.Power,
		Defence:      baseUserData.Defence,
		Dex:          baseUserData.Dex,
		Agility:      baseUserData.Agility,
		Intelligence: baseUserData.Intelligence,
	}

	sorted := make([]Activity, len(newItems))
	copy(sorted, newItems)
	sort.SliceStable(sorted, func(i, j int) bool {
		return parseCreatedAt(sorted[i].CreatedAt).Before(parseCreatedAt(sorted[j].CreatedAt))
	})

	// 不変条件2の検知: 新着の最古イベントが境界より前なら前提が崩れている。
	if previousCreatedAt != "" && len(sorted) > 0 &&
		parseCreatedAt(sorted[0].CreatedAt).Before(parseCreatedAt(previousCreatedAt)) {
		log.Printf("[performance] 増分計算の前提違反: 新着の最古イベント(%s)が境界(%s)より前です。全件計算と不一致になり得ます。", sorted[0].CreatedAt, previousCreatedAt)
	}

	prevCreatedAt := previousCreatedAt
	for i := range sorted {
		item := &sorted[i]
		if prevCreatedAt != "" {
			diff := parseCreatedAt(item.CreatedAt).Sub(parseCreatedAt(prevCreatedAt)).Seconds()

			switch {
			case diff > 30 && diff <= 120:
				data.Agility += 6
			case diff <= 180:
				data.Agility += 3
			case diff <= 300:
				data.Agility += 2
			case diff <= 1200:
				data.Agility += 1
			}
			if diff <= 7200 {
				data.HP += 2
			}
		}

		switch item.Type {
		case "ForkEvent":
			data.Power += 1
		case "PushEvent":
			data.Power += 2
		case "CreateEvent", "DeleteEvent":
			data.Power += 1
		case "PullRequestEvent":
			data.Power += 3
		case "IssuesEvent":
			if payloadEquals(item.Payload, "opened") {
				data.Intelligence += 3
			} else if payloadEquals(item.Payload, "closed") {
				data.Defence += 5
			}
		case "IssueCommentEvent":
			data.Intelligence += 2
		case "PullRequestReviewEvent":
			data.Defence += 3
		case "PullRequestReviewCommentEvent":
			data.Defence += 3
		case "GollumEvent":
			data.Defence += 3
		case "ReleaseEvent":
			data.Defence += 10
		}
		prevCreatedAt = item.CreatedAt
	}
	return IncrementResult{UserData: data, LastCreatedAt: prevCreatedAt}
}

// UserFormattedPerformance は生ステータスを表示用に整形する(Node版 user_formatted_performance と同一)。
func UserFormattedPerformance(data RawUserData, append AppendData) FormattedPerformance {
	total := data.HP + data.Power + data.Intelligence + data.Defence + data.Agility
	return FormattedPerformance{
		User:         append.User,
		Points:       append.Exp,
		HP:           data.HP,
		Power:        data.Power,
		Intelligence: data.Intelligence,
		Defence:      data.Defence,
		Agility:      data.Agility,
		Total:        total,
		Level:        GetLevel(total),
		Exp:          append.Exp,
		NextExp:      GetNextLevelExp(total).NextExp,
		Chart: Chart{
			HP:           data.HP,
			Power:        data.Power,
			Intelligence: data.Intelligence,
			Defence:      data.Defence,
			Agility:      data.Agility,
		},
	}
}
