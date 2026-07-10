// 参拝履歴(草グラフ用)エンドポイント。
//
// 参拝成功時に書かれる users/{github_id}/sanpai_logs({add_point, timestamp})を
// JSTの日毎に集計して返す。GitHubのコントリビューショングラフ風の表示
// (web/components/SanpaiGrass.vue)のデータ源。
//
//	GET ?user={screen_name}        … 直近371日(53週)分
//	GET ?user={screen_name}&all=1  … 全期間(最古のログから現在まで)
//
// 集計済みの日別データのみ返すためレスポンスは全期間でも小さいが、
// all=1 はFirestoreの読み取りが履歴全量になるため、フロントエンドでは
// 明示的な「全期間を解析する」操作でのみ呼ぶ(詳細は docs/backend.md)。
package gofunctions

import (
	"context"
	"errors"
	"log"
	"net/http"
	"sort"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	"google.golang.org/api/iterator"
)

func init() {
	functions.HTTP("SanpaiHistoryGo", sanpaiHistoryHandler)
}

// 参拝履歴の集計はサイトの利用者がほぼ日本在住である前提でJST固定で日を切る。
// (UTCで切ると日本の朝9時前の参拝が前日扱いになり草の位置がずれる)
var jstLocation = time.FixedZone("JST", 9*60*60)

// defaultHistoryDays はデフォルト表示(直近1年)の日数。53週=371日。
const defaultHistoryDays = 371

type sanpaiHistoryDay struct {
	Date   string `json:"date"` // "YYYY-MM-DD"(JST)
	Count  int    `json:"count"`
	Points int64  `json:"points"`
}

type sanpaiHistoryResponse struct {
	Days        []sanpaiHistoryDay `json:"days"` // 参拝があった日のみ(昇順)
	TotalCount  int                `json:"total_count"`
	TotalPoints int64              `json:"total_points"`
	FirstSanpai string             `json:"first_sanpai,omitempty"` // all=1時のみ: 最古の参拝日
	Since       string             `json:"since"`
	Until       string             `json:"until"`
}

// sanpaiLogEntry は sanpai_logs ドキュメントのうち集計に使う部分。
type sanpaiLogEntry struct {
	AddPoint  int64     `firestore:"add_point"`
	Timestamp time.Time `firestore:"timestamp"`
}

func sanpaiHistoryHandler(w http.ResponseWriter, r *http.Request) {
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
	all := r.URL.Query().Get("all") == "1"

	ctx := r.Context()
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("sanpaiHistory: getFirestoreClient error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := runSanpaiHistory(ctx, w, client, screenName, all, time.Now()); err != nil {
		log.Printf("sanpaiHistory: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
	}
}

// runSanpaiHistory は本体。now を引数にしているのはテストで時刻を固定するため。
func runSanpaiHistory(ctx context.Context, w http.ResponseWriter, client *firestore.Client, screenName string, all bool, now time.Time) error {
	userDoc, err := findUserByScreenName(ctx, client, screenName)
	if err != nil {
		return err
	}
	if userDoc == nil {
		writeError(w, http.StatusNotFound, "user not registered.")
		return nil
	}

	today := startOfDayJST(now)
	query := userDoc.Ref.Collection("sanpai_logs").Query
	var since time.Time
	if !all {
		// 直近371日(今日を含む)。開始日のJST 0:00以降のログだけを読む。
		since = today.AddDate(0, 0, -(defaultHistoryDays - 1))
		query = query.Where("timestamp", ">=", since)
	}

	entries, err := loadSanpaiLogs(ctx, query)
	if err != nil {
		return err
	}

	days := aggregateSanpaiDays(entries, jstLocation)
	resp := sanpaiHistoryResponse{
		Days:  days,
		Until: formatDateJST(today),
	}
	for _, d := range days {
		resp.TotalCount += d.Count
		resp.TotalPoints += d.Points
	}
	if all {
		// 全期間: 開始は最古の参拝日(ログが無ければ今日)。
		if len(days) > 0 {
			resp.Since = days[0].Date
			resp.FirstSanpai = days[0].Date
		} else {
			resp.Since = resp.Until
		}
	} else {
		resp.Since = formatDateJST(since)
	}

	setSanpaiHistoryCacheHeaders(w, all)
	writeJSON(w, http.StatusOK, resp)
	return nil
}

// setSanpaiHistoryCacheHeaders は参拝履歴応答のキャッシュ方針を設定する。
//
// 参拝履歴は公開プロフィール(/u/{userName})にも出す公開データで、URLが
// user と all でキー分離されるためCDNの共有キャッシュに載せられる
// (ランキングのグローバル応答と同じ考え方。ranking.go 参照)。
//
// デフォルト(直近1年)は参拝直後に草が生えるのが見えてほしいので短め。
// 全期間(all=1)は過去分がほぼ不変・明示操作でしか呼ばれないため長めにして
// 全量読み取りの再実行を抑える。
func setSanpaiHistoryCacheHeaders(w http.ResponseWriter, all bool) {
	if all {
		w.Header().Set("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400")
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600")
}

func loadSanpaiLogs(ctx context.Context, query firestore.Query) ([]sanpaiLogEntry, error) {
	iter := query.Documents(ctx)
	defer iter.Stop()
	var entries []sanpaiLogEntry
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		var e sanpaiLogEntry
		if err := doc.DataTo(&e); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}

// aggregateSanpaiDays は参拝ログを loc の日付で日毎に集計する(純関数)。
// 返り値は日付昇順で、参拝があった日のみ含む(0の日はフロントエンドが埋める)。
func aggregateSanpaiDays(entries []sanpaiLogEntry, loc *time.Location) []sanpaiHistoryDay {
	byDate := map[string]*sanpaiHistoryDay{}
	for _, e := range entries {
		if e.Timestamp.IsZero() {
			continue
		}
		date := e.Timestamp.In(loc).Format("2006-01-02")
		d, ok := byDate[date]
		if !ok {
			d = &sanpaiHistoryDay{Date: date}
			byDate[date] = d
		}
		d.Count++
		d.Points += e.AddPoint
	}

	days := make([]sanpaiHistoryDay, 0, len(byDate))
	for _, d := range byDate {
		days = append(days, *d)
	}
	// "YYYY-MM-DD" は辞書順 == 日付順。
	sort.Slice(days, func(i, j int) bool { return days[i].Date < days[j].Date })
	return days
}

// startOfDayJST は now のJSTでの日付の 0:00(JST)を返す。
func startOfDayJST(now time.Time) time.Time {
	t := now.In(jstLocation)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, jstLocation)
}

func formatDateJST(t time.Time) string {
	return t.In(jstLocation).Format("2006-01-02")
}
