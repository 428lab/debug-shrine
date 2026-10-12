package gofunctions

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"cloud.google.com/go/firestore"

	"github.com/428lab/debug-shrine/functions-go/internal/performance"
)

// このテストはFirestoreエミュレータが必要なため、FIRESTORE_EMULATOR_HOST が
// 設定されていない場合(通常のCI実行時)は自動的にスキップする。
// ローカルでの実行方法は functions-go/README.md を参照。
func emulatorClient(t *testing.T) *firestore.Client {
	t.Helper()
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("FIRESTORE_EMULATOR_HOST not set; skipping Firestore emulator integration test")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "d-shrine-dev")
	if err != nil {
		t.Fatalf("firestore.NewClient: %v", err)
	}
	t.Cleanup(func() { client.Close() })
	return client
}

func mockEvent(id, eventType, repoName, createdAt string) map[string]interface{} {
	return map[string]interface{}{
		"id":         id,
		"type":       eventType,
		"repo":       map[string]interface{}{"name": repoName},
		"created_at": createdAt,
		"payload":    map[string]interface{}{},
	}
}

func newMockGitHubServer(t *testing.T, events []map[string]interface{}) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(events)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func withMockGitHub(t *testing.T, srv *httptest.Server) {
	t.Helper()
	orig := githubAPIBaseURL
	githubAPIBaseURL = srv.URL
	t.Cleanup(func() { githubAPIBaseURL = orig })
}

func postSanpai(t *testing.T, ctx context.Context, client *firestore.Client, githubID, screenName string) map[string]interface{} {
	t.Helper()
	rec := httptest.NewRecorder()
	err := runSanpai(ctx, rec, client, sanpaiRequestBody{GithubID: githubID, ScreenName: screenName})
	if err != nil {
		t.Fatalf("runSanpai returned error: %v", err)
	}
	var out map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("failed to decode response %q: %v", rec.Body.String(), err)
	}
	return out
}

func setupTestUser(t *testing.T, ctx context.Context, client *firestore.Client, githubID string, data map[string]interface{}) {
	t.Helper()
	if _, err := client.Collection("users").Doc(githubID).Set(ctx, data); err != nil {
		t.Fatalf("failed to seed user doc: %v", err)
	}
}

// GitHub OAuth Appの資格情報がBasic認証ヘッダーで送られること
// (廃止済みのクエリパラメータ認証を使っていないこと)を確認する。
// Firestoreエミュレータ不要の純粋なHTTPテスト。
func TestFetchGitHubFeed_SendsBasicAuthHeader(t *testing.T) {
	t.Setenv("GITHUB_CLIENT_ID", "test-client-id")
	t.Setenv("GITHUB_CLIENT_SECRET", "test-client-secret")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok := r.BasicAuth()
		if !ok || user != "test-client-id" || pass != "test-client-secret" {
			t.Errorf("expected Basic auth with OAuth app credentials, got ok=%v user=%q", ok, user)
		}
		if r.URL.Query().Get("client_id") != "" || r.URL.Query().Get("client_secret") != "" {
			t.Errorf("credentials must not be sent as query parameters (removed by GitHub API): %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("[]"))
	}))
	defer srv.Close()
	withMockGitHub(t, srv)

	if _, err := fetchGitHubFeed(context.Background(), "octocat", time.Time{}); err != nil {
		t.Fatalf("fetchGitHubFeed: %v", err)
	}
}

// 資格情報が未設定(空)のときは Authorization ヘッダーを付けないことを確認する。
func TestFetchGitHubFeed_NoCredentials(t *testing.T) {
	t.Setenv("GITHUB_CLIENT_ID", "")
	t.Setenv("GITHUB_CLIENT_SECRET", "")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" {
			t.Errorf("Authorization header must be empty when credentials are not configured, got %q", r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("[]"))
	}))
	defer srv.Close()
	withMockGitHub(t, srv)

	if _, err := fetchGitHubFeed(context.Background(), "octocat", time.Time{}); err != nil {
		t.Fatalf("fetchGitHubFeed: %v", err)
	}
}

func TestSanpai_NotRegistered(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	out := postSanpai(t, ctx, client, "no-such-user-999", "no-such-user-999")
	if out["status"] != "failed" || out["message"] != "not registered" {
		t.Fatalf("unexpected response: %+v", out)
	}
}

func TestSanpai_FirstTime_FullCalculation(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	githubID := fmt.Sprintf("sanpai-test-first-%d", time.Now().UnixNano())

	setupTestUser(t, ctx, client, githubID, map[string]interface{}{
		"display_name": "Test User",
		"screen_name":  githubID,
		"image_path":   "https://example.com/icon.png",
		"exp":          10,
	})

	events := []map[string]interface{}{
		mockEvent("1", "PushEvent", "428lab/foo", "2024-01-01T00:00:00Z"),
		mockEvent("2", "ForkEvent", "someone/bar", "2024-01-01T00:10:00Z"),
		mockEvent("3", "PullRequestEvent", "someone/bar", "2024-01-01T00:20:00Z"),
	}
	withMockGitHub(t, newMockGitHubServer(t, events))

	out := postSanpai(t, ctx, client, githubID, githubID)
	if out["status"] != "success" {
		t.Fatalf("unexpected response: %+v", out)
	}
	// イベントは JST 2024-01-01(年末年始)なので各 mag=bonusMagYearEnd。
	// add_exp = 1(base) + floor(3*mag/5) + bonus_branch match("428lab/foo")=1
	wantAddExp := 1 + (3*bonusMagYearEnd)/5 + 1
	// ボーナスが無い場合の式: 1 + floor(3/5) + 1
	wantBonusPoint := wantAddExp - (1 + 3/5 + 1)
	if got := int(out["add_exp"].(float64)); got != wantAddExp {
		t.Errorf("add_exp = %d, want %d", got, wantAddExp)
	}
	if got, want := out["msg"], fmt.Sprintf("ボーナスタイム: 年末年始 ×%d 3件", bonusMagYearEnd); got != want {
		t.Errorf("msg = %q, want %q", got, want)
	}
	if got := int(out["action_count"].(float64)); got != 3 {
		t.Errorf("action_count = %d, want 3", got)
	}
	if got := int(out["updated_repo_count"].(float64)); got != 2 {
		t.Errorf("updated_repo_count = %d, want 2", got)
	}
	if got := int(out["points_before"].(float64)); got != 10 {
		t.Errorf("points_before = %d, want 10", got)
	}
	if got := int(out["points_after"].(float64)); got != 10+wantAddExp {
		t.Errorf("points_after = %d, want %d", got, 10+wantAddExp)
	}

	snap, err := client.Collection("users").Doc(githubID).Get(ctx)
	if err != nil {
		t.Fatalf("failed to re-fetch user doc: %v", err)
	}
	var updated sanpaiUserDocument
	if err := snap.DataTo(&updated); err != nil {
		t.Fatalf("DataTo: %v", err)
	}
	if updated.Exp != int64(10+wantAddExp) {
		t.Errorf("stored exp = %d, want %d", updated.Exp, 10+wantAddExp)
	}
	cached, err := decodeCurrentStatusCache(snap, updated.StatusVersion)
	if err != nil {
		t.Fatalf("decodeCurrentStatusCache: %v", err)
	}
	if cached == nil {
		t.Fatalf("expected status cache to be written")
	}
	if updated.LastActivityCreatedAt != "2024-01-01T00:20:00Z" {
		t.Errorf("last_activity_created_at = %q, want 2024-01-01T00:20:00Z", updated.LastActivityCreatedAt)
	}
	if updated.LastSanpai.IsZero() {
		t.Errorf("expected last_sanpai to be set")
	}

	iter := client.Collection("users").Doc(githubID).Collection("github_activities").Documents(ctx)
	count := 0
	for {
		_, err := iter.Next()
		if err != nil {
			break
		}
		count++
	}
	if count != 3 {
		t.Errorf("stored activity count = %d, want 3", count)
	}

	// sanpai_logs にボーナス由来の増分(bonus_point)が書かれること。
	logs, err := client.Collection("users").Doc(githubID).Collection("sanpai_logs").Documents(ctx).GetAll()
	if err != nil {
		t.Fatalf("failed to read sanpai_logs: %v", err)
	}
	if len(logs) != 1 {
		t.Fatalf("sanpai_logs count = %d, want 1", len(logs))
	}
	if got := logs[0].Data()["add_point"]; got != int64(wantAddExp) {
		t.Errorf("sanpai_logs.add_point = %v, want %d", got, wantAddExp)
	}
	if got := logs[0].Data()["bonus_point"]; got != int64(wantBonusPoint) {
		t.Errorf("sanpai_logs.bonus_point = %v, want %d", got, wantBonusPoint)
	}
}

// ボーナスタイムの加点計算(エミュレータ不要)。
func TestComputeAddExp(t *testing.T) {
	ev := func(repo, createdAt string) feedItem {
		return feedItem{Event: githubEvent{CreatedAt: createdAt, Repo: struct {
			Name string `json:"name"`
		}{Name: repo}}}
	}
	repeat := func(n int, repo, createdAt string) []feedItem {
		res := make([]feedItem, n)
		for i := range res {
			res[i] = ev(repo, createdAt)
		}
		return res
	}
	// 時刻はすべて UTC 03:00(JST 12:00)にして日付の境界から離す。
	const (
		weekday  = "2026-09-28T03:00:00Z" // 月曜
		saturday = "2026-09-26T03:00:00Z"
		yotsuya  = "2026-04-28T03:00:00Z" // 火曜
		newYear  = "2026-01-01T03:00:00Z"
	)
	cases := []struct {
		name      string
		items     []feedItem
		wantExp   int
		wantBonus int
		wantMsg   string
	}{
		{
			name:    "平日のみ・対象外 repo(現行式と一致)",
			items:   repeat(7, "foo/bar", weekday),
			wantExp: 1 + 7/5 + 0, // 2
			wantMsg: "",
		},
		{
			name:      "土曜 3件",
			items:     repeat(3, "foo/bar", saturday),
			wantExp:   1 + (3*2)/5, // 2
			wantBonus: 1,
			wantMsg:   "ボーナスタイム: 土日・祝日 ×2 3件",
		},
		{
			name:      "4/28 に 428lab 2件 + 平日 1件",
			items:     append(repeat(2, "428lab/x", yotsuya), ev("foo/bar", weekday)),
			wantExp:   1 + (4+4+1)/5 + 2*2, // 6
			wantBonus: 3,                   // 現行式 1 + 0 + 2 = 3
			wantMsg:   "ボーナスタイム: よつやの日 ×4 2件 / 428lab ×2 2件",
		},
		{
			name:    "1/1 に nostr-jp 1件",
			items:   []feedItem{ev("nostr-jp/x", newYear)},
			wantExp: 1 + 3/5 + 1, // 2
			wantMsg: "ボーナスタイム: 年末年始 ×3 1件",
		},
		{
			name:    "4/28 以外の 428lab は現行どおり +1",
			items:   []feedItem{ev("428lab/x", saturday)},
			wantExp: 1 + 2/5 + 1, // 2
			wantMsg: "ボーナスタイム: 土日・祝日 ×2 1件",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, bd := computeAddExp(1, c.items)
			if got != c.wantExp {
				t.Errorf("addExp = %d, want %d", got, c.wantExp)
			}
			if bd.BonusPoint != c.wantBonus {
				t.Errorf("BonusPoint = %d, want %d", bd.BonusPoint, c.wantBonus)
			}
			if msg := buildBonusMsg(bd); msg != c.wantMsg {
				t.Errorf("msg = %q, want %q", msg, c.wantMsg)
			}
		})
	}
}

// msg は固定順で、0件の項は出さない。
func TestBuildBonusMsg_Order(t *testing.T) {
	got := buildBonusMsg(bonusBreakdown{Yotsuya: 2, YearEnd: 1, Holiday: 3, Lab428OnYotsuya: 2})
	want := "ボーナスタイム: よつやの日 ×4 2件 / 年末年始 ×3 1件 / 土日・祝日 ×2 3件 / 428lab ×2 2件"
	if got != want {
		t.Errorf("msg = %q, want %q", got, want)
	}
	if got := buildBonusMsg(bonusBreakdown{}); got != "" {
		t.Errorf("msg = %q, want empty", got)
	}
}

func TestSanpai_Cooldown_Expire(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	githubID := fmt.Sprintf("sanpai-test-cooldown-%d", time.Now().UnixNano())

	setupTestUser(t, ctx, client, githubID, map[string]interface{}{
		"display_name": "Test User",
		"screen_name":  githubID,
		"image_path":   "",
		"exp":          0,
		"last_sanpai":  time.Now(),
	})

	out := postSanpai(t, ctx, client, githubID, githubID)
	if out["status"] != "expire" {
		t.Fatalf("unexpected response: %+v", out)
	}
	if got := int(out["add_exp"].(float64)); got != 0 {
		t.Errorf("add_exp = %d, want 0", got)
	}
}

func TestSanpai_NoAction(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	githubID := fmt.Sprintf("sanpai-test-noaction-%d", time.Now().UnixNano())

	past := time.Now().Add(-1 * time.Hour)
	setupTestUser(t, ctx, client, githubID, map[string]interface{}{
		"display_name": "Test User",
		"screen_name":  githubID,
		"image_path":   "",
		"exp":          0,
		"last_sanpai":  past,
	})

	// last_sanpaiより前のイベントしかない -> noaction
	events := []map[string]interface{}{
		mockEvent("1", "PushEvent", "someone/bar", past.Add(-1*time.Hour).UTC().Format(time.RFC3339)),
	}
	withMockGitHub(t, newMockGitHubServer(t, events))

	out := postSanpai(t, ctx, client, githubID, githubID)
	if out["status"] != "noaction" {
		t.Fatalf("unexpected response: %+v", out)
	}
}

func TestSanpai_Increment_MatchesFullRecalculation(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	githubID := fmt.Sprintf("sanpai-test-increment-%d", time.Now().UnixNano())

	setupTestUser(t, ctx, client, githubID, map[string]interface{}{
		"display_name": "Test User",
		"screen_name":  githubID,
		"image_path":   "",
		"exp":          5,
	})

	firstBatch := []map[string]interface{}{
		mockEvent("1", "PushEvent", "someone/bar", "2024-01-01T00:00:00Z"),
		mockEvent("2", "ForkEvent", "someone/bar", "2024-01-01T00:05:00Z"),
	}
	withMockGitHub(t, newMockGitHubServer(t, firstBatch))
	first := postSanpai(t, ctx, client, githubID, githubID)
	if first["status"] != "success" {
		t.Fatalf("first sanpai failed: %+v", first)
	}

	// クールダウンを回避するため last_sanpai を過去に巻き戻す(テスト用の直接操作)。
	// ただし1回目で処理済みのイベント(〜00:05:00Z)より後、2回目の新規イベント
	// (00:10:00Z〜)より前にする必要がある(でないと既処理イベントを新着として
	// 二重集計してしまい、本番では起きない不変条件違反を人為的に作ってしまう)。
	if _, err := client.Collection("users").Doc(githubID).Update(ctx, []firestore.Update{
		{Path: "last_sanpai", Value: time.Date(2024, 1, 1, 0, 6, 0, 0, time.UTC)},
	}); err != nil {
		t.Fatalf("failed to rewind last_sanpai: %v", err)
	}

	secondBatch := append(append([]map[string]interface{}{}, firstBatch...),
		mockEvent("3", "PullRequestEvent", "someone/bar", "2024-01-01T00:10:00Z"),
		mockEvent("4", "IssueCommentEvent", "someone/bar", "2024-01-01T00:15:00Z"),
	)
	withMockGitHub(t, newMockGitHubServer(t, secondBatch))
	second := postSanpai(t, ctx, client, githubID, githubID)
	if second["status"] != "success" {
		t.Fatalf("second sanpai failed: %+v", second)
	}

	// 全件(4件)を一発で計算した場合の戦闘力と、増分計算2回分の結果が一致することを確認する。
	allActivities := []performance.Activity{
		{Type: "PushEvent", CreatedAt: "2024-01-01T00:00:00Z"},
		{Type: "ForkEvent", CreatedAt: "2024-01-01T00:05:00Z"},
		{Type: "PullRequestEvent", CreatedAt: "2024-01-01T00:10:00Z"},
		{Type: "IssueCommentEvent", CreatedAt: "2024-01-01T00:15:00Z"},
	}
	fullRaw := performance.UserPerformance(allActivities, githubID)
	fullFormatted := performance.UserFormattedPerformance(fullRaw, performance.AppendData{})

	if got := int(second["power_after"].(float64)); got != fullFormatted.Total {
		t.Errorf("power_after(increment) = %d, want %d(full recalculation)", got, fullFormatted.Total)
	}
}

// エミュレータを必要としないハンドラレベルのテスト(認証・ボディパースの分岐)。

func TestSanpaiHandler_MalformedJSONBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/sanpai", strings.NewReader(`{invalid`))
	req.Header.Set("Authorization", "Bearer some-token")
	rec := httptest.NewRecorder()
	sanpaiHandler(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
	var out map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("failed to decode response %q: %v", rec.Body.String(), err)
	}
	if out["status"] != "failed" {
		t.Errorf("status field = %v, want failed", out["status"])
	}
}

func TestSanpaiHandler_NonPostMethod(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/sanpai", nil)
	rec := httptest.NewRecorder()
	sanpaiHandler(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
}

func TestSanpaiHandler_MissingAuthorizationHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/sanpai", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	sanpaiHandler(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
}

// events を新しい順に n 件返すモックページを組み立てる(created_at は base から1分ずつ遡る)。
func mockEventsPage(base time.Time, offset, n int) string {
	items := make([]string, 0, n)
	for i := 0; i < n; i++ {
		at := base.Add(-time.Duration(offset+i) * time.Minute).UTC().Format(time.RFC3339)
		items = append(items, fmt.Sprintf(
			`{"id":"e%d","type":"PushEvent","created_at":%q,"repo":{"name":"o/r"},"payload":{}}`,
			offset+i, at))
	}
	return "[" + strings.Join(items, ",") + "]"
}

// 普段の参拝(前回から100件も動いていない)では1ページで打ち切ること。
// ここが増えると全ユーザーのGitHub API呼び出しが毎回3倍になる。
func TestFetchGitHubFeed_StopsAtFirstPageWhenCaughtUp(t *testing.T) {
	now := time.Now()
	since := now.Add(-30 * time.Minute) // 30件目より新しい
	var pages int32

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&pages, 1)
		w.Header().Set("Content-Type", "application/json")
		// 1ページ丸ごと(100件)返す。ただし since 以前の分が含まれる。
		_, _ = w.Write([]byte(mockEventsPage(now, 0, githubFeedPerPage)))
	}))
	defer srv.Close()
	withMockGitHub(t, srv)

	items, err := fetchGitHubFeed(context.Background(), "octocat", since)
	if err != nil {
		t.Fatalf("fetchGitHubFeed: %v", err)
	}
	if got := atomic.LoadInt32(&pages); got != 1 {
		t.Errorf("取得済みの範囲に達したら打ち切るべき: %d ページ取得した", got)
	}
	if len(items) != githubFeedPerPage {
		t.Errorf("件数 = %d, want %d", len(items), githubFeedPerPage)
	}
}

// 100件を超えて動いている場合は上限(3ページ=300件)まで遡ること。
// これが無いと超過分を永久に取りこぼす(#239)。
func TestFetchGitHubFeed_PaginatesUpToMaxPages(t *testing.T) {
	now := time.Now()
	since := now.Add(-365 * 24 * time.Hour) // どのページにも到達しない
	var pages int32

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := atomic.AddInt32(&pages, 1)
		if got := r.URL.Query().Get("page"); got != fmt.Sprint(p) {
			t.Errorf("page パラメータ = %q, want %d", got, p)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(mockEventsPage(now, int(p-1)*githubFeedPerPage, githubFeedPerPage)))
	}))
	defer srv.Close()
	withMockGitHub(t, srv)

	items, err := fetchGitHubFeed(context.Background(), "octocat", since)
	if err != nil {
		t.Fatalf("fetchGitHubFeed: %v", err)
	}
	if got := atomic.LoadInt32(&pages); got != githubFeedMaxPages {
		t.Errorf("ページ数 = %d, want %d (Events APIの上限)", got, githubFeedMaxPages)
	}
	want := githubFeedPerPage * githubFeedMaxPages
	if len(items) != want {
		t.Errorf("件数 = %d, want %d", len(items), want)
	}
}

// 埋まっていないページが来たらそこで終わり(存在しないページを叩かない)。
func TestFetchGitHubFeed_StopsOnShortPage(t *testing.T) {
	now := time.Now()
	var pages int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := atomic.AddInt32(&pages, 1)
		w.Header().Set("Content-Type", "application/json")
		if p == 1 {
			_, _ = w.Write([]byte(mockEventsPage(now, 0, githubFeedPerPage)))
			return
		}
		_, _ = w.Write([]byte(mockEventsPage(now, githubFeedPerPage, 3)))
	}))
	defer srv.Close()
	withMockGitHub(t, srv)

	items, err := fetchGitHubFeed(context.Background(), "octocat", time.Time{})
	if err != nil {
		t.Fatalf("fetchGitHubFeed: %v", err)
	}
	if got := atomic.LoadInt32(&pages); got != 2 {
		t.Errorf("ページ数 = %d, want 2 (2ページ目が埋まっていないので打ち切る)", got)
	}
	if len(items) != githubFeedPerPage+3 {
		t.Errorf("件数 = %d, want %d", len(items), githubFeedPerPage+3)
	}
}

func TestReachedSince(t *testing.T) {
	now := time.Now()
	items := []feedItem{
		{Event: githubEvent{CreatedAt: now.Add(-1 * time.Minute).UTC().Format(time.RFC3339)}},
		{Event: githubEvent{CreatedAt: now.Add(-10 * time.Minute).UTC().Format(time.RFC3339)}},
		{Event: githubEvent{CreatedAt: "壊れた値"}},
	}
	if !reachedSince(items, now.Add(-5*time.Minute)) {
		t.Errorf("since 以前の要素があるので true のはず")
	}
	if reachedSince(items, now.Add(-60*time.Minute)) {
		t.Errorf("すべて since より新しいので false のはず")
	}
	if reachedSince(nil, now) {
		t.Errorf("空なら false")
	}
}

// ページの取得中に新しいイベントが増えると窓がずれ、同じイベントが2つのページに
// 載ることがある。重複したまま返すと、同一バッチ内で同じドキュメントへ2回書く
// ことになり Firestore に弾かれる(参拝そのものが失敗する)うえ、ポイントと
// 能力値も二重計上になる。
func TestFetchGitHubFeed_DedupesAcrossPages(t *testing.T) {
	now := time.Now()
	var pages int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := atomic.AddInt32(&pages, 1)
		w.Header().Set("Content-Type", "application/json")
		// 2ページとも同じ offset から返す = 全件重複する状況を作る。
		_, _ = w.Write([]byte(mockEventsPage(now, 0, githubFeedPerPage)))
		_ = p
	}))
	defer srv.Close()
	withMockGitHub(t, srv)

	items, err := fetchGitHubFeed(context.Background(), "octocat", time.Time{})
	if err != nil {
		t.Fatalf("fetchGitHubFeed: %v", err)
	}
	if len(items) != githubFeedPerPage {
		t.Errorf("重複を除いた件数 = %d, want %d", len(items), githubFeedPerPage)
	}
	seen := map[string]bool{}
	for _, it := range items {
		if seen[it.Event.ID] {
			t.Fatalf("重複したイベントIDが残っている: %s", it.Event.ID)
		}
		seen[it.Event.ID] = true
	}
}

// 途中のページで失敗したら参拝ごと失敗させる(部分的に進めると last_sanpai が
// 進んで、取れなかったイベントを二度と拾えなくなる)。
func TestFetchGitHubFeed_FailsWhenLaterPageFails(t *testing.T) {
	now := time.Now()
	var pages int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := atomic.AddInt32(&pages, 1)
		if p == 1 {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(mockEventsPage(now, 0, githubFeedPerPage)))
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()
	withMockGitHub(t, srv)

	if _, err := fetchGitHubFeed(context.Background(), "octocat", time.Time{}); err == nil {
		t.Errorf("2ページ目が失敗したらエラーを返すべき(部分的に進めない)")
	}
}
