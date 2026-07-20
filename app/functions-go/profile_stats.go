// プロフィール統計(ポートフォリオ用)エンドポイント。
//
// 参拝ログ(sanpai_logs)とおみくじログ(omikuji_logs)を集計して、
// 累計参拝・連続参拝ストリーク・おみくじ統計・称号(バッジ)を返す。
// 公開プロフィール(/u/{userName})とマイページの ProfileStats.vue が表示する。
//
//	GET ?user={screen_name}
//
// レベルはユーザードキュメントの status キャッシュ(statusGo が書く)から読む。
// キャッシュ未計算のユーザーは 0 になるが、statusGo が同じページで呼ばれて
// キャッシュが埋まるため次回以降は埋まる。
package gofunctions

import (
	"context"
	"log"
	"net/http"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
)

func init() {
	functions.HTTP("ProfileStatsGo", profileStatsHandler)
}

type sanpaiStats struct {
	TotalCount    int    `json:"total_count"`
	TotalPoints   int64  `json:"total_points"`
	FirstSanpai   string `json:"first_sanpai,omitempty"`
	CurrentStreak int    `json:"current_streak"`
	LongestStreak int    `json:"longest_streak"`
}

type omikujiStats struct {
	TotalCount int            `json:"total_count"`
	Tiers      map[string]int `json:"tiers"`
}

type profileBadge struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	// Emoji は旧クライアント・CDNキャッシュ互換のため残す(表示は icon 優先)。
	Emoji    string `json:"emoji"`
	Icon     string `json:"icon"`
	Desc     string `json:"desc"`
	Achieved bool   `json:"achieved"`
}

type profileStatsResponse struct {
	Sanpai  sanpaiStats    `json:"sanpai"`
	Omikuji omikujiStats   `json:"omikuji"`
	Level   int            `json:"level"`
	Badges  []profileBadge `json:"badges"`
}

func profileStatsHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	screenName := r.URL.Query().Get("user")
	if screenName == "" {
		writeError(w, http.StatusBadRequest, "user is required")
		return
	}

	ctx := r.Context()
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("profileStats: getFirestoreClient error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := runProfileStats(ctx, w, client, screenName, time.Now()); err != nil {
		log.Printf("profileStats: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
	}
}

func runProfileStats(ctx context.Context, w http.ResponseWriter, client *firestore.Client, screenName string, now time.Time) error {
	userDoc, err := findUserByScreenName(ctx, client, screenName)
	if err != nil {
		return err
	}
	if userDoc == nil {
		writeError(w, http.StatusNotFound, "user not registered.")
		return nil
	}

	// 参拝: 全ログを日毎に集計してストリークを出す(草の all=1 と同じ読み取り量)。
	entries, err := loadSanpaiLogs(ctx, userDoc.Ref.Collection("sanpai_logs").Query)
	if err != nil {
		return err
	}
	days := aggregateSanpaiDays(entries, jstLocation)

	stats := sanpaiStats{}
	for _, e := range entries {
		stats.TotalCount++
		stats.TotalPoints += e.AddPoint
	}
	if len(days) > 0 {
		stats.FirstSanpai = days[0].Date
	}
	stats.CurrentStreak, stats.LongestStreak = computeStreaks(days, now)

	// おみくじ: omikuji_logs(#155以降に記録開始)をレア度別に数える。
	omStats, err := loadOmikujiStats(ctx, userDoc)
	if err != nil {
		return err
	}

	level := readCachedLevel(userDoc)

	resp := profileStatsResponse{
		Sanpai:  stats,
		Omikuji: omStats,
		Level:   level,
		Badges: computeBadges(profileFacts{
			SanpaiTotal:   stats.TotalCount,
			CurrentStreak: stats.CurrentStreak,
			LongestStreak: stats.LongestStreak,
			Level:         level,
			OmikujiTotal:  omStats.TotalCount,
			ChokichiCount: omStats.Tiers["超吉"],
			DaikyoCount:   omStats.Tiers["大凶"],
		}),
	}

	// 公開データ・userでキー分離。参拝直後にストリークが伸びるのが見えるよう
	// 草のデフォルトと同じ短めのCDNキャッシュにする。
	w.Header().Set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600")
	writeJSON(w, http.StatusOK, resp)
	return nil
}

// computeStreaks は日別集計(昇順)から連続参拝日数を計算する(純関数)。
//   - current: 今日または昨日から途切れず遡れる日数(今日まだ参拝していなくても
//     昨日までの連続は「継続中」として数える)
//   - longest: 期間中の最長連続日数
func computeStreaks(days []sanpaiHistoryDay, now time.Time) (current, longest int) {
	if len(days) == 0 {
		return 0, 0
	}
	dates := make(map[string]bool, len(days))
	for _, d := range days {
		dates[d.Date] = true
	}

	// longest: 昇順の日別リストを1日刻みの連続で数える。
	run := 1
	longest = 1
	for i := 1; i < len(days); i++ {
		if nextDateJST(days[i-1].Date) == days[i].Date {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
	}

	// current: 今日から遡る。今日が未参拝なら昨日を起点にする。
	today := startOfDayJST(now)
	cursor := formatDateJST(today)
	if !dates[cursor] {
		cursor = formatDateJST(today.AddDate(0, 0, -1))
	}
	for dates[cursor] {
		current++
		cursor = prevDateJST(cursor)
	}
	return current, longest
}

func nextDateJST(date string) string {
	t, err := time.ParseInLocation("2006-01-02", date, jstLocation)
	if err != nil {
		return ""
	}
	return t.AddDate(0, 0, 1).Format("2006-01-02")
}

func prevDateJST(date string) string {
	t, err := time.ParseInLocation("2006-01-02", date, jstLocation)
	if err != nil {
		return ""
	}
	return t.AddDate(0, 0, -1).Format("2006-01-02")
}

type omikujiLogDoc struct {
	Tier string `firestore:"tier"`
}

func loadOmikujiStats(ctx context.Context, userDoc *firestore.DocumentSnapshot) (omikujiStats, error) {
	stats := omikujiStats{Tiers: map[string]int{}}
	docs, err := userDoc.Ref.Collection("omikuji_logs").Documents(ctx).GetAll()
	if err != nil {
		return stats, err
	}
	for _, doc := range docs {
		var d omikujiLogDoc
		if err := doc.DataTo(&d); err != nil {
			return stats, err
		}
		if d.Tier == "" {
			continue
		}
		stats.TotalCount++
		stats.Tiers[d.Tier]++
	}
	return stats, nil
}

// readCachedLevel は statusGo が書く status キャッシュからレベルを取り出す。
// 未計算・型不一致は 0(バッジ判定でレベル条件が付かないだけで害はない)。
func readCachedLevel(userDoc *firestore.DocumentSnapshot) int {
	v, err := userDoc.DataAt("status.level")
	if err != nil {
		return 0
	}
	if n, ok := v.(int64); ok {
		return int(n)
	}
	return 0
}

// profileFacts は称号判定に使う事実の集合。
type profileFacts struct {
	SanpaiTotal   int
	CurrentStreak int
	LongestStreak int
	Level         int
	OmikujiTotal  int
	ChokichiCount int
	DaikyoCount   int
}

type badgeDef struct {
	ID    string
	Label string
	// Emoji は互換用に残し、表示用アイコンは Icon(FontAwesome無料版のクラス名)。
	// 絵文字は機種依存のため使わない方針(DESIGN.md / #183)。無料版に無い
	// 絵文字は意訳(🏮→shoe-prints 🕯️→moon 🎋→scroll 🌩️→cloud-showers-heavy)。
	Emoji    string
	Icon     string
	Desc     string
	Achieved func(profileFacts) bool
}

// 称号の定義。達成済みかどうかに関わらず全件返し、フロントで未達成をグレー表示
// する(コレクション欲を煽る)。条件はすべて既存の集計から導出できるものに限る。
var badgeDefs = []badgeDef{
	{"hatsumode", "初参拝", "⛩️", "fa-torii-gate", "はじめての参拝", func(f profileFacts) bool { return f.SanpaiTotal >= 1 }},
	{"sanpai10", "常連さん", "🏮", "fa-shoe-prints", "参拝10回", func(f profileFacts) bool { return f.SanpaiTotal >= 10 }},
	{"sanpai50", "信徒", "🙏", "fa-praying-hands", "参拝50回", func(f profileFacts) bool { return f.SanpaiTotal >= 50 }},
	{"sanpai100", "百度参り", "💯", "fa-certificate", "参拝100回", func(f profileFacts) bool { return f.SanpaiTotal >= 100 }},
	{"sanpai365", "毎日詣で", "📅", "fa-calendar-check", "参拝365回", func(f profileFacts) bool { return f.SanpaiTotal >= 365 }},
	{"sanpai1000", "千日参り", "🌟", "fa-star", "参拝1000回", func(f profileFacts) bool { return f.SanpaiTotal >= 1000 }},
	{"streak3", "三日坊主克服", "🔥", "fa-fire", "3日連続参拝", func(f profileFacts) bool { return f.LongestStreak >= 3 }},
	{"streak7", "七日詣", "🕯️", "fa-moon", "7日連続参拝", func(f profileFacts) bool { return f.LongestStreak >= 7 }},
	{"streak30", "皆勤賞", "🎖️", "fa-medal", "30日連続参拝", func(f profileFacts) bool { return f.LongestStreak >= 30 }},
	{"streak100", "求道者", "⚡", "fa-bolt", "100日連続参拝", func(f profileFacts) bool { return f.LongestStreak >= 100 }},
	{"lv10", "見習い神主", "🌱", "fa-seedling", "レベル10到達", func(f profileFacts) bool { return f.Level >= 10 }},
	{"lv25", "本殿の主", "🛠️", "fa-tools", "レベル25到達", func(f profileFacts) bool { return f.Level >= 25 }},
	{"lv50", "生き神", "👑", "fa-crown", "レベル50到達", func(f profileFacts) bool { return f.Level >= 50 }},
	{"omikuji10", "おみくじ好き", "🎋", "fa-scroll", "おみくじ10回", func(f profileFacts) bool { return f.OmikujiTotal >= 10 }},
	{"chokichi", "天に選ばれし者", "🌈", "fa-rainbow", "超吉を引いた", func(f profileFacts) bool { return f.ChokichiCount >= 1 }},
	{"daikyo", "受難の日", "💀", "fa-skull", "大凶を引いた", func(f profileFacts) bool { return f.DaikyoCount >= 1 }},
	{"daikyo3", "不運の帝王", "🌩️", "fa-cloud-showers-heavy", "大凶を3回引いた", func(f profileFacts) bool { return f.DaikyoCount >= 3 }},
}

func computeBadges(f profileFacts) []profileBadge {
	badges := make([]profileBadge, 0, len(badgeDefs))
	for _, def := range badgeDefs {
		badges = append(badges, profileBadge{
			ID:       def.ID,
			Label:    def.Label,
			Emoji:    def.Emoji,
			Icon:     def.Icon,
			Desc:     def.Desc,
			Achieved: def.Achieved(f),
		})
	}
	return badges
}
