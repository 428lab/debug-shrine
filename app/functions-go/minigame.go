// ミニゲーム(韋駝天・誤字祓い・神楽ビート)のランキングと実績の決まり(純関数)。
//
// ゲームは端末だけで動くので、送られてくる点数はいじろうと思えばいじれる
// (完全には防げない前提。ユーザー決定)。ここでは「ありえない値」だけ弾く:
// 遊んだ時間に対して多すぎる点数、点数と判定の数の食い違い、など。
//
// 通信と保存は minigame_api.go。
package gofunctions

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"time"
)

const (
	mgGameOstrich = "ostrich" // 韋駝天
	mgGameTypo    = "typo"    // 誤字祓い
	mgGameRhythm  = "rhythm"  // 神楽ビート
)

// 神楽ビートの曲と難易度(web/components/rhythmSongs.js・rhythmChart.js と同じ id)
var mgRhythmSongs = []string{"kagura", "shippu", "matsuri", "ten"}
var mgRhythmLevels = []string{"easy", "normal", "hard"}

// mgRhythmTotals は曲・難易度ごとの判定の数(音符 + 長い音符の終わり)。端末の譜面
// (rhythmChart.js の buildChart)と同じでなければならない。譜面を変えたら
// web/scripts/test-minigame-totals.js が食い違いを教えてくれる(直すのはこの JSON)。
//
//go:embed minigame_rhythm_totals.json
var mgRhythmTotalsJSON []byte

var mgRhythmTotals = func() map[string]map[string]int64 {
	var m map[string]map[string]int64
	if err := json.Unmarshal(mgRhythmTotalsJSON, &m); err != nil {
		panic(err)
	}
	return m
}()

// mgRhythmMaxScore は神楽ビートの満点。
const mgRhythmMaxScore = 1000000

// 期間。週・月の区切りは期間ランキング(ranking_period.go)と同じく日本時間。
const (
	mgPeriodAll   = "all"
	mgPeriodWeek  = "week"
	mgPeriodMonth = "month"
)

var mgPeriods = []string{mgPeriodAll, mgPeriodWeek, mgPeriodMonth}

// mgPeriodKeys は期間ごとの保存先のキー(歴代 = all、週 = w+月曜の日付、月 = m+年月)。
func mgPeriodKeys(now time.Time) map[string]string {
	_, _, weekKey, monthKey := periodBounds(now)
	return map[string]string{
		mgPeriodAll:   "all",
		mgPeriodWeek:  "w" + weekKey,
		mgPeriodMonth: "m" + monthKey,
	}
}

// mgBoards はランキングの一覧(韋駝天・誤字祓い・神楽ビートの曲 × 難易度)。
func mgBoards() []string {
	boards := []string{mgGameOstrich, mgGameTypo}
	for _, s := range mgRhythmSongs {
		for _, l := range mgRhythmLevels {
			boards = append(boards, mgRhythmBoard(s, l))
		}
	}
	return boards
}

func mgRhythmBoard(song, level string) string {
	return mgGameRhythm + "-" + song + "-" + level
}

func mgValidBoard(board string) bool {
	for _, b := range mgBoards() {
		if b == board {
			return true
		}
	}
	return false
}

func mgContains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// mgSubmit は 1 回遊んだ結果(端末から送られてくる)。
type mgSubmit struct {
	GithubID   string `json:"github_id"`
	Game       string `json:"game"`
	Song       string `json:"song"`  // 神楽ビート
	Level      string `json:"level"` // 神楽ビート
	Score      int64  `json:"score"`
	DurationMs int64  `json:"duration_ms"` // 遊んだ時間(ゲームの中の時間)
	MaxCombo   int64  `json:"max_combo"`   // 誤字祓い・神楽ビート
	Fixed      int64  `json:"fixed"`       // 誤字祓い: 直した言葉の数
	// 神楽ビート: 判定ごとの数(kiwami / ryo / ka / fuka)
	Counts map[string]int64 `json:"counts"`
}

// mgRhythmWeight は神楽ビートの判定の重み(rhythmChart.js の WEIGHT と同じ)。
var mgRhythmWeight = map[string]float64{"kiwami": 1, "ryo": 0.7, "ka": 0.3, "fuka": 0}

// mgCheck は送られてきた結果を確かめ、ランキングの id と、この回の値(実績の判定用)を返す。
// おかしな値なら reason に理由を入れて返す。
func mgCheck(s mgSubmit) (board string, run map[string]int64, reason string) {
	if s.Score < 0 || s.DurationMs < 0 || s.MaxCombo < 0 || s.Fixed < 0 {
		return "", nil, "negative value"
	}
	sec := float64(s.DurationMs) / 1000
	switch s.Game {
	case mgGameOstrich:
		// 走った距離で 1 秒に最大 100 点(最高速 1000px/s、10px で 1 点)。
		// 勾玉や壊した障害物の点も足して、かなり余裕を持たせる。
		if float64(s.Score) > sec*200+300 {
			return "", nil, "score too high for duration"
		}
		return mgGameOstrich, map[string]int64{"ostrich.score": s.Score}, ""
	case mgGameTypo:
		// 1 語で最大 (150 + 61) × 2(コンボ倍率)= 422 点(誤字は 1 語に 2 か所まで)。
		// 言葉は 0.9 秒より短い間隔では出てこないので、1 秒に直せる数も限りがある
		if float64(s.Fixed) > sec*4+10 {
			return "", nil, "too many words for duration"
		}
		if s.Score > s.Fixed*600 {
			return "", nil, "score too high for words"
		}
		if s.MaxCombo > s.Fixed {
			return "", nil, "combo exceeds words"
		}
		return mgGameTypo, map[string]int64{"typo.score": s.Score, "typo.max_combo": s.MaxCombo}, ""
	case mgGameRhythm:
		if !mgContains(mgRhythmSongs, s.Song) || !mgContains(mgRhythmLevels, s.Level) {
			return "", nil, "unknown song or level"
		}
		if s.Score > mgRhythmMaxScore {
			return "", nil, "score too high"
		}
		var total int64
		sum := 0.0
		for k, n := range s.Counts {
			w, ok := mgRhythmWeight[k]
			if !ok || n < 0 {
				return "", nil, "bad counts"
			}
			total += n
			sum += float64(n) * w
		}
		// 判定の数は譜面で決まっている(1 音だけ叩いて満点、のようなものを弾く)
		if total != mgRhythmTotals[s.Song][s.Level] {
			return "", nil, "bad counts"
		}
		// 点数は判定の数から決まる(rhythmChart.js の scoreOf)。食い違えば受け付けない
		if math.Abs(math.Round(mgRhythmMaxScore*sum/float64(total))-float64(s.Score)) > 1 {
			return "", nil, "score does not match counts"
		}
		if s.MaxCombo > total {
			return "", nil, "combo exceeds notes"
		}
		fc := s.Counts["fuka"] == 0
		allKiwami := fc && s.Counts["ryo"] == 0 && s.Counts["ka"] == 0
		run = map[string]int64{"rhythm.score": s.Score, "rhythm.full_combo": b2i(fc), "rhythm.all_kiwami": b2i(allKiwami)}
		if s.Level == "hard" {
			run["rhythm.hard_full_combo"] = b2i(fc)
		}
		return mgRhythmBoard(s.Song, s.Level), run, ""
	}
	return "", nil, "unknown game"
}

func b2i(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

// mgState はユーザーごとのミニゲームの記録(users/{id}/minigame/state)。
type mgState struct {
	Plays          map[string]int64     `firestore:"plays"` // ゲームごとの回数
	TotalPlays     int64                `firestore:"total_plays"`
	TypoFixedTotal int64                `firestore:"typo_fixed_total"`
	RhythmSongs    []string             `firestore:"rhythm_songs"`   // 遊んだ曲
	RhythmHardFC   []string             `firestore:"rhythm_hard_fc"` // 修行でフルコンボした曲
	Days           int64                `firestore:"days"`           // 遊んだ日数(日本時間)
	LastDay        string               `firestore:"last_day"`
	LastSubmitAt   time.Time            `firestore:"last_submit_at"`
	Best           map[string]int64     `firestore:"best"` // ランキングごとの歴代ベスト
	Achievements   map[string]time.Time `firestore:"achievements"`
}

// mgMinInterval は送信の間隔の下限(連打よけ)。1 回遊ぶのにこれより短いことはない。
const mgMinInterval = 2 * time.Second

// mgApply は 1 回分の結果を記録に足す(st を書き換える)。
func mgApply(st *mgState, s mgSubmit, board string, run map[string]int64, now time.Time) {
	if st.Plays == nil {
		st.Plays = map[string]int64{}
	}
	if st.Best == nil {
		st.Best = map[string]int64{}
	}
	if st.Achievements == nil {
		st.Achievements = map[string]time.Time{}
	}
	st.Plays[s.Game]++
	st.TotalPlays++
	if s.Game == mgGameTypo {
		st.TypoFixedTotal += s.Fixed
	}
	if s.Game == mgGameRhythm {
		if !mgContains(st.RhythmSongs, s.Song) {
			st.RhythmSongs = append(st.RhythmSongs, s.Song)
		}
		if run["rhythm.hard_full_combo"] == 1 && !mgContains(st.RhythmHardFC, s.Song) {
			st.RhythmHardFC = append(st.RhythmHardFC, s.Song)
		}
	}
	day := now.In(jst).Format("2006-01-02")
	if st.LastDay != day {
		st.Days++
		st.LastDay = day
	}
	if s.Score > st.Best[board] {
		st.Best[board] = s.Score
	}
	st.LastSubmitAt = now
}

// mgFacts は実績の判定に使う値(この回の値 + これまでの累計)。
func mgFacts(st *mgState, run map[string]int64) map[string]int64 {
	f := map[string]int64{}
	for k, v := range run {
		f[k] = v
	}
	games := int64(0)
	for _, g := range []string{mgGameOstrich, mgGameTypo, mgGameRhythm} {
		f[g+".plays"] = st.Plays[g]
		if st.Plays[g] > 0 {
			games++
		}
	}
	f["typo.fixed_total"] = st.TypoFixedTotal
	f["rhythm.songs"] = int64(len(st.RhythmSongs))
	f["rhythm.hard_fc_songs"] = int64(len(st.RhythmHardFC))
	f["all.games"] = games
	f["all.plays"] = st.TotalPlays
	f["all.days"] = st.Days
	return f
}

// mgAchievementDef は実績 1 つ。Metric の値が Min 以上で取れる。
// Live は「ゲーム中に端末で判定できる」(この回の点数・コンボ)。端末はその場で
// 「実績解除!」を出し、サーバーは送られてきた時に記録する。
type mgAchievementDef struct {
	ID     string `json:"id"`
	Game   string `json:"game"` // ostrich / typo / rhythm / all
	Label  string `json:"label"`
	Icon   string `json:"icon"` // FontAwesome 無料版のクラス名(称号と同じ)
	Desc   string `json:"desc"`
	Metric string `json:"metric"`
	Min    int64  `json:"min"`
	Live   bool   `json:"live"`
}

var mgAchievementDefs = []mgAchievementDef{
	// 韋駝天(点はゲーム内の称号に合わせる。ostrichGame.js の TITLES)
	{"ostrich_first", mgGameOstrich, "はじめての疾走", "fa-running", "韋駝天をはじめて遊んだ", "ostrich.plays", 1, false},
	{"ostrich_400", mgGameOstrich, "駆け出しダチョウ", "fa-feather", "韋駝天で 400 点", "ostrich.score", 400, true},
	{"ostrich_1400", mgGameOstrich, "韋駄天", "fa-wind", "韋駝天で 1,400 点", "ostrich.score", 1400, true},
	{"ostrich_3500", mgGameOstrich, "天翔るダチョウ", "fa-cloud", "韋駝天で 3,500 点", "ostrich.score", 3500, true},
	{"ostrich_5500", mgGameOstrich, "ダチョウ神", "fa-sun", "韋駝天で 5,500 点", "ostrich.score", 5500, true},
	// 誤字祓い(typoGame.js の TITLES)
	{"typo_first", mgGameTypo, "はじめてのお祓い", "fa-spell-check", "誤字祓いをはじめて遊んだ", "typo.plays", 1, false},
	{"typo_3000", mgGameTypo, "誤字ハンター", "fa-search", "誤字祓いで 3,000 点", "typo.score", 3000, true},
	{"typo_8000", mgGameTypo, "校正の達人", "fa-pen-nib", "誤字祓いで 8,000 点", "typo.score", 8000, true},
	{"typo_15000", mgGameTypo, "言霊の守り手", "fa-book-open", "誤字祓いで 15,000 点", "typo.score", 15000, true},
	{"typo_25000", mgGameTypo, "誤字祓いの神", "fa-hat-wizard", "誤字祓いで 25,000 点", "typo.score", 25000, true},
	{"typo_combo30", mgGameTypo, "祓いの連なり", "fa-link", "誤字祓いで 30 コンボ", "typo.max_combo", 30, true},
	{"typo_fixed1000", mgGameTypo, "千の言の葉", "fa-leaf", "誤字祓いで累計 1,000 語を直した", "typo.fixed_total", 1000, false},
	// 神楽ビート
	{"rhythm_first", mgGameRhythm, "はじめての奉納", "fa-drum", "神楽ビートをはじめて遊んだ", "rhythm.plays", 1, false},
	{"rhythm_allsongs", mgGameRhythm, "全曲奉納", "fa-music", "神楽ビートの全曲を遊んだ", "rhythm.songs", int64(len(mgRhythmSongs)), false},
	{"rhythm_fc", mgGameRhythm, "途切れぬ拍", "fa-check-double", "神楽ビートでフルコンボ", "rhythm.full_combo", 1, false},
	{"rhythm_allkiwami", mgGameRhythm, "極めし者", "fa-gem", "神楽ビートで全極", "rhythm.all_kiwami", 1, false},
	{"rhythm_hardfc", mgGameRhythm, "修行明け", "fa-fist-raised", "修行でフルコンボ", "rhythm.hard_full_combo", 1, false},
	{"rhythm_hardfc_all", mgGameRhythm, "神楽の化身", "fa-dragon", "修行で全曲フルコンボ", "rhythm.hard_fc_songs", int64(len(mgRhythmSongs)), false},
	{"rhythm_950k", mgGameRhythm, "神懸かり", "fa-bolt", "神楽ビートで 950,000 点", "rhythm.score", 950000, false},
	// 共通
	{"all_three", "all", "三社参り", "fa-torii-gate", "3 つのミニゲームを全部遊んだ", "all.games", 3, false},
	{"all_plays100", "all", "遊び人", "fa-gamepad", "ミニゲームを合計 100 回遊んだ", "all.plays", 100, false},
	{"all_days7", "all", "常連", "fa-calendar-check", "ミニゲームを 7 日遊んだ", "all.days", 7, false},
}

// mgUnlock はまだ持っていない実績のうち、条件を満たしたものを取ったことにして返す(定義順)。
func mgUnlock(st *mgState, facts map[string]int64, now time.Time) []mgAchievementDef {
	if st.Achievements == nil {
		st.Achievements = map[string]time.Time{}
	}
	var got []mgAchievementDef
	for _, d := range mgAchievementDefs {
		if _, ok := st.Achievements[d.ID]; ok {
			continue
		}
		if facts[d.Metric] >= d.Min {
			st.Achievements[d.ID] = now
			got = append(got, d)
		}
	}
	return got
}

// mgEntry はランキングの 1 件(表示用)。
type mgEntry struct {
	Rank        int64     `json:"rank"`
	Score       int64     `json:"score"`
	DisplayName string    `json:"display_name"`
	ScreenName  string    `json:"screen_name"`
	ImagePath   string    `json:"image_path"`
	UpdatedAt   time.Time `json:"-"`
	ID          string    `json:"-"`
}

// mgRankEntries は点数の高い順に並べ、順位をつける。同点は同じ順位で、
// 並びは先に出した人が上(同時なら id 順)。
func mgRankEntries(es []mgEntry) []mgEntry {
	sort.SliceStable(es, func(i, j int) bool {
		if es[i].Score != es[j].Score {
			return es[i].Score > es[j].Score
		}
		if !es[i].UpdatedAt.Equal(es[j].UpdatedAt) {
			return es[i].UpdatedAt.Before(es[j].UpdatedAt)
		}
		return es[i].ID < es[j].ID
	})
	for i := range es {
		if i > 0 && es[i].Score == es[i-1].Score {
			es[i].Rank = es[i-1].Rank
		} else {
			es[i].Rank = int64(i) + 1
		}
	}
	return es
}

// mgBoardDocID はランキングの保存先(minigame_boards/{id}/scores/{github_id})。
func mgBoardDocID(board, periodKey string) string {
	return fmt.Sprintf("%s__%s", board, periodKey)
}
