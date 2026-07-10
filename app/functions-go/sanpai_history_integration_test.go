package gofunctions

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
)

// Firestore エミュレータが必要(FIRESTORE_EMULATOR_HOST 未設定時は自動スキップ)。

func decodeHistoryResp(t *testing.T, rec *httptest.ResponseRecorder) sanpaiHistoryResponse {
	t.Helper()
	var resp sanpaiHistoryResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v (body=%s)", err, rec.Body.String())
	}
	return resp
}

func seedSanpaiLog(t *testing.T, userRef *firestore.DocumentRef, ts time.Time, addPoint int64) {
	t.Helper()
	if _, _, err := userRef.Collection("sanpai_logs").Add(context.Background(), map[string]interface{}{
		"add_point": addPoint,
		"timestamp": ts,
	}); err != nil {
		t.Fatalf("seed sanpai_log: %v", err)
	}
}

func TestSanpaiHistory_DefaultAndAll(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	uid := "sanpai-history-test-user-1"
	userRef := client.Collection("users").Doc(uid)
	if _, err := userRef.Set(ctx, map[string]interface{}{"screen_name": "history-tester"}); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() {
		iter := userRef.Collection("sanpai_logs").Documents(context.Background())
		for {
			doc, err := iter.Next()
			if err != nil {
				break
			}
			doc.Ref.Delete(context.Background())
		}
		userRef.Delete(context.Background())
	})

	now := time.Date(2026, 7, 10, 12, 0, 0, 0, jstLocation)
	// 直近期間内: 同日2回 + 別日1回
	seedSanpaiLog(t, userRef, time.Date(2026, 7, 9, 9, 0, 0, 0, jstLocation), 5)
	seedSanpaiLog(t, userRef, time.Date(2026, 7, 9, 21, 0, 0, 0, jstLocation), 7)
	seedSanpaiLog(t, userRef, time.Date(2026, 7, 1, 10, 0, 0, 0, jstLocation), 3)
	// 期間外(4年前 = 全期間でのみ現れる)
	seedSanpaiLog(t, userRef, time.Date(2022, 1, 2, 10, 0, 0, 0, jstLocation), 11)

	// 1) デフォルト(直近371日): 期間外の2022年ログは含まれない
	rec := httptest.NewRecorder()
	if err := runSanpaiHistory(ctx, rec, client, "history-tester", false, now); err != nil {
		t.Fatalf("runSanpaiHistory default: %v", err)
	}
	resp := decodeHistoryResp(t, rec)
	if len(resp.Days) != 2 {
		t.Fatalf("default days = %d (%+v), want 2", len(resp.Days), resp.Days)
	}
	if resp.Days[0].Date != "2026-07-01" || resp.Days[1].Date != "2026-07-09" {
		t.Errorf("default days order = %+v", resp.Days)
	}
	if resp.Days[1].Count != 2 || resp.Days[1].Points != 12 {
		t.Errorf("7/9 = %+v, want count=2 points=12", resp.Days[1])
	}
	if resp.TotalCount != 3 || resp.TotalPoints != 15 {
		t.Errorf("default totals = %d/%d, want 3/15", resp.TotalCount, resp.TotalPoints)
	}
	if resp.Until != "2026-07-10" {
		t.Errorf("until = %q, want 2026-07-10", resp.Until)
	}
	if resp.FirstSanpai != "" {
		t.Errorf("default first_sanpai = %q, want empty", resp.FirstSanpai)
	}
	if got := rec.Header().Get("Cache-Control"); got != "public, max-age=60, s-maxage=300, stale-while-revalidate=600" {
		t.Errorf("default Cache-Control = %q", got)
	}

	// 2) 全期間(all=1): 2022年のログも含まれ、since/first_sanpai が最古日
	rec = httptest.NewRecorder()
	if err := runSanpaiHistory(ctx, rec, client, "history-tester", true, now); err != nil {
		t.Fatalf("runSanpaiHistory all: %v", err)
	}
	respAll := decodeHistoryResp(t, rec)
	if len(respAll.Days) != 3 {
		t.Fatalf("all days = %d (%+v), want 3", len(respAll.Days), respAll.Days)
	}
	if respAll.Days[0].Date != "2022-01-02" {
		t.Errorf("all first day = %+v, want 2022-01-02", respAll.Days[0])
	}
	if respAll.Since != "2022-01-02" || respAll.FirstSanpai != "2022-01-02" {
		t.Errorf("all since/first = %q/%q, want 2022-01-02", respAll.Since, respAll.FirstSanpai)
	}
	if respAll.TotalCount != 4 || respAll.TotalPoints != 26 {
		t.Errorf("all totals = %d/%d, want 4/26", respAll.TotalCount, respAll.TotalPoints)
	}
	if got := rec.Header().Get("Cache-Control"); got != "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" {
		t.Errorf("all Cache-Control = %q", got)
	}
}

func TestSanpaiHistory_EmptyLogsAndUnknownUser(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, jstLocation)

	uid := "sanpai-history-test-user-2"
	userRef := client.Collection("users").Doc(uid)
	if _, err := userRef.Set(ctx, map[string]interface{}{"screen_name": "history-empty"}); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() { userRef.Delete(context.Background()) })

	// ログなしユーザー: days は空配列、totalは0
	rec := httptest.NewRecorder()
	if err := runSanpaiHistory(ctx, rec, client, "history-empty", true, now); err != nil {
		t.Fatalf("runSanpaiHistory empty: %v", err)
	}
	resp := decodeHistoryResp(t, rec)
	if len(resp.Days) != 0 || resp.TotalCount != 0 {
		t.Errorf("empty user resp = %+v", resp)
	}
	if resp.Since != "2026-07-10" || resp.Until != "2026-07-10" {
		t.Errorf("empty since/until = %q/%q", resp.Since, resp.Until)
	}

	// 未登録ユーザー: 404
	rec = httptest.NewRecorder()
	if err := runSanpaiHistory(ctx, rec, client, "no-such-user-history", false, now); err != nil {
		t.Fatalf("runSanpaiHistory unknown: %v", err)
	}
	if rec.Code != 404 {
		t.Errorf("unknown user status = %d, want 404", rec.Code)
	}
}
