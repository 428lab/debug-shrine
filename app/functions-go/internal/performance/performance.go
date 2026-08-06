// Package performance は参拝の能力解析(パフォーマンス計算)に関する純粋ロジックを提供する。
// app/functions/performance.js (Node版)と同一の計算結果を返すことを目的としたポートであり、
// 副作用(Firestore/HTTP)を持たずユニットテスト可能な単位として切り出している。
//
// 値を変更する場合は Node版(app/functions/performance.js)も併せて更新し、
// 両実装のテスト(performance_test.go / performance.test.js)で等価性を確認すること。
//
// ただし Node版は既に全面移植済みで一切デプロイされていない(app/functions/index.js は
// 関数を何も export しない)。実装の正はこちらで、Lv50超えの扱い(#215: テーブルの
// Lv100延長・上限超えのクランプ)のように Go だけに入っている修正がある。
// 食い違ったときは Go を正とすること。
package performance

import (
	"log"
	"sort"
	"time"
)

// StatusLogicVersion は能力解析(performance)の計算ロジックのバージョン。
// 計算式(加点テーブルや判定条件など、同一アクティビティに対する算出結果)を変えたら
// 必ずインクリメントすること。users/{id}.status_version に保存され、キャッシュ済み
// status がこのバージョン未満なら再計算対象になる(status/sanpai/statusCacheBackfill)。
//
// 履歴:
//
//	1: IssuesEvent を payload.action で加点するよう修正(それ以前は常に未加点だった)。
//	   未設定(フィールドが存在しない旧キャッシュ)は 0 として扱われ再計算される。
//
// Node版 (app/functions/performance.js) の STATUS_LOGIC_VERSION と必ず一致させること。
const StatusLogicVersion int64 = 1

// レベルアップに必要な閾値テーブル(index i の値は Lv(i+1) の上限)。
// Lv1-50 は移植元(Node版 target_points)の値そのままで、1つも変えていない
// (既存ユーザーのレベルが下がらないことを TestTargetPoints_Lv1To50Unchanged で担保)。
//
// Lv51以降は、実測した増分比(末尾で約1.084倍/Lv)をそのまま延長して Lv100 まで
// 用意した。Lv50 の上限 39156 を超えた利用者が Lv0 に落ちる不具合(#215)の修正時に
// 追加したもので、当時の最高位が 3万台だったため頭打ちまでの余裕を大きく取っている。
var targetPoints = []int{
	0, 5, 11, 19, 30, 45, 65, 91, 124, 166, // Lv1-10
	218, 281, 357, 447, 553, 676, 818, 981, 1167, 1378, // Lv11-20
	1616, 1884, 2184, 2519, 2892, 3306, 3764, 4269, 4825, 5436, // Lv21-30
	6106, 6840, 7643, 8520, 9477, 10520, 11656, 12892, 14236, 15696, // Lv31-40
	17281, 19001, 20867, 22891, 25086, 27466, 30046, 32842, 35872, 39156, // Lv41-50
	42716, 46575, 50758, 55292, 60206, 65532, 71305, 77562, 84344, 91695, // Lv51-60
	99663, 108300, 117662, 127809, 138807, 150728, 163649, 177654, 192834, 209288, // Lv61-70
	227122, 246452, 267404, 290114, 314729, 341409, 370327, 401671, 435645, 472469, // Lv71-80
	512383, 555646, 602539, 653366, 708457, 768170, 832893, 903046, 979085, 1061504, // Lv81-90
	1150838, 1247667, 1352620, 1466379, 1589682, 1723330, 1868191, 2025206, 2195395, 2379863, // Lv91-100
}

// MaxLevel はテーブルで表現できる最高レベル。
const MaxLevel = 100

// GetLevel は戦闘力からレベルを算出する。
//
// 移植元(Node版 get_level)は、どの閾値にも当てはまらない=最高レベルの上限を
// 超えた場合に level=0 を返していた。実際に Lv50 の上限(39156)を超えた利用者が
// 「Lv0」と表示される不具合になったため、上限超えは最高レベル扱いにする(#215)。
// テーブルを延長しても、いつかは超える人が出る前提でここを防波堤にしておく。
func GetLevel(points int) int {
	for i, t := range targetPoints {
		if points <= t {
			return i + 1
		}
	}
	return len(targetPoints)
}

// NextLevelExp は次レベルとその必要経験値。
type NextLevelExp struct {
	NextLevel int
	NextExp   int
}

// GetNextLevelExp は次のレベルと、そこへ上がる戦闘力を返す。
//
// GetLevel は `points <= targetPoints[i]` で判定するため、Lv L の範囲は
// (targetPoints[L-2], targetPoints[L-1]] であり、**targetPoints[L-1] を1でも
// 超えれば Lv L+1 になる**。以前はここで targetPoints[level](= Lv L+1 の上限)を
// 返しており、1レベルぶん先の値を「NEXT」として表示していた。
// 例: 5exp は Lv2 だが 6exp で Lv3 になる。それを「NEXT 11 exp」と出していた。
//
// 最高レベルに到達している場合は次が無いため、そのレベルの上限をそのまま返す
// (0 を返すと「NEXT 0 exp」と表示され、進捗バーも0除算になる)。
func GetNextLevelExp(points int) NextLevelExp {
	level := GetLevel(points)
	if level >= len(targetPoints) {
		return NextLevelExp{NextLevel: len(targetPoints), NextExp: targetPoints[len(targetPoints)-1]}
	}
	return NextLevelExp{NextLevel: level + 1, NextExp: targetPoints[level-1] + 1}
}

// GetLevelStartExp は今のレベルに上がった時点の戦闘力(そのレベルの下限)を返す。
//
// 進捗バーに必要。バーは「今のレベルの中でどこまで進んだか」であって、
// 累計 / 次レベル ではない。累計で割ると、レベルが上がるほど分子と分母が
// 近づくため、レベル帯の先頭にいてもバーがほぼ満タンに見えてしまう
// (Lv54 の下限 50759 でも 50759/55293 = 92%)。
func GetLevelStartExp(points int) int {
	level := GetLevel(points)
	if level <= 1 {
		return 0
	}
	return targetPoints[level-2] + 1
}

// Activity はGitHub Events APIの1イベント(Firestoreにキャッシュされた raw JSON)を表す。
// Payload は IssuesEvent の開閉種別など任意のオブジェクトであり得るため any として保持し、
// payloadAction で payload.action(GitHub Events APIの action フィールド)を取り出す。
type Activity struct {
	Type      string `json:"type"`
	CreatedAt string `json:"created_at"`
	Payload   any    `json:"payload"`
}

// payloadAction は payload オブジェクトから action フィールド("opened"/"closed"等)を取り出す。
// GitHub Events API の IssuesEvent 等の payload は JSON オブジェクトで、開閉種別は
// payload.action に入る。payload がオブジェクトでない/action が無い場合は空文字を返す。
func payloadAction(payload any) string {
	m, ok := payload.(map[string]any)
	if !ok {
		return ""
	}
	action, _ := m["action"].(string)
	return action
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
			switch payloadAction(item.Payload) {
			case "opened":
				data.Intelligence += 3
			case "closed":
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
	// LevelStartExp は今のレベルの下限。進捗バーの起点(バーは累計ではなく
	// 「今のレベルの中でどこまで進んだか」を出すため)。
	LevelStartExp int   `json:"level_start_exp"`
	Chart         Chart `json:"chart"`
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
			switch payloadAction(item.Payload) {
			case "opened":
				data.Intelligence += 3
			case "closed":
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
		User:          append.User,
		Points:        append.Exp,
		HP:            data.HP,
		Power:         data.Power,
		Intelligence:  data.Intelligence,
		Defence:       data.Defence,
		Agility:       data.Agility,
		Total:         total,
		Level:         GetLevel(total),
		Exp:           append.Exp,
		NextExp:       GetNextLevelExp(total).NextExp,
		LevelStartExp: GetLevelStartExp(total),
		Chart: Chart{
			HP:           data.HP,
			Power:        data.Power,
			Intelligence: data.Intelligence,
			Defence:      data.Defence,
			Agility:      data.Agility,
		},
	}
}
