package gofunctions

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"
)

// Firestore エミュレータが必要(FIRESTORE_EMULATOR_HOST 未設定時は自動スキップ)。

func TestProfileStats_Basic(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	uid := "profile-stats-test-user-1"
	userRef := client.Collection("users").Doc(uid)
	if _, err := userRef.Set(ctx, map[string]interface{}{
		"screen_name": "stats-tester",
		"status":      map[string]interface{}{"level": int64(12)},
	}); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() {
		for _, sub := range []string{"sanpai_logs", "omikuji_logs"} {
			iter := userRef.Collection(sub).Documents(context.Background())
			for {
				doc, err := iter.Next()
				if err != nil {
					break
				}
				doc.Ref.Delete(context.Background())
			}
		}
		userRef.Delete(context.Background())
	})

	now := time.Date(2026, 7, 10, 12, 0, 0, 0, jstLocation)
	// 3日連続(7/8,7/9,7/10) + 離れた1日(7/1)
	seedSanpaiLog(t, userRef, time.Date(2026, 7, 8, 9, 0, 0, 0, jstLocation), 5)
	seedSanpaiLog(t, userRef, time.Date(2026, 7, 9, 9, 0, 0, 0, jstLocation), 5)
	seedSanpaiLog(t, userRef, time.Date(2026, 7, 10, 9, 0, 0, 0, jstLocation), 5)
	seedSanpaiLog(t, userRef, time.Date(2026, 7, 1, 9, 0, 0, 0, jstLocation), 5)
	// おみくじログ: 大凶1回
	if _, _, err := userRef.Collection("omikuji_logs").Add(ctx, map[string]interface{}{
		"entry_id": "daikyo-001", "tier": "大凶", "timestamp": now,
	}); err != nil {
		t.Fatalf("seed omikuji_log: %v", err)
	}

	rec := httptest.NewRecorder()
	if err := runProfileStats(ctx, rec, client, "stats-tester", now); err != nil {
		t.Fatalf("runProfileStats: %v", err)
	}
	var resp profileStatsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v (body=%s)", err, rec.Body.String())
	}

	if resp.Sanpai.TotalCount != 4 || resp.Sanpai.TotalPoints != 20 {
		t.Errorf("sanpai totals = %+v, want count=4 points=20", resp.Sanpai)
	}
	if resp.Sanpai.FirstSanpai != "2026-07-01" {
		t.Errorf("first_sanpai = %q, want 2026-07-01", resp.Sanpai.FirstSanpai)
	}
	if resp.Sanpai.CurrentStreak != 3 || resp.Sanpai.LongestStreak != 3 {
		t.Errorf("streaks = %d/%d, want 3/3", resp.Sanpai.CurrentStreak, resp.Sanpai.LongestStreak)
	}
	if resp.Omikuji.TotalCount != 1 || resp.Omikuji.Tiers["大凶"] != 1 {
		t.Errorf("omikuji = %+v", resp.Omikuji)
	}
	if resp.Level != 12 {
		t.Errorf("level = %d, want 12", resp.Level)
	}
	achieved := map[string]bool{}
	for _, b := range resp.Badges {
		achieved[b.ID] = b.Achieved
	}
	if !achieved["hatsumode"] || !achieved["streak3"] || !achieved["lv10"] || !achieved["daikyo"] {
		t.Errorf("expected badges not achieved: %+v", achieved)
	}
	if achieved["sanpai10"] || achieved["daikyo3"] {
		t.Errorf("unexpected badges achieved: %+v", achieved)
	}
	if got := rec.Header().Get("Cache-Control"); got != "public, max-age=60, s-maxage=300, stale-while-revalidate=600" {
		t.Errorf("Cache-Control = %q", got)
	}

	// 未登録ユーザーは404
	rec = httptest.NewRecorder()
	if err := runProfileStats(ctx, rec, client, "no-such-user-stats", now); err != nil {
		t.Fatalf("runProfileStats unknown: %v", err)
	}
	if rec.Code != 404 {
		t.Errorf("unknown user status = %d, want 404", rec.Code)
	}
}

// おみくじを引くと omikuji_logs が書かれる(profileStatsGoのデータ源になる)ことの確認。
func TestOmikuji_WritesLog(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	t.Setenv("OMIKUJI_COOLDOWN_SECONDS", "3600")

	uid := "omikuji-log-test-user-1"
	userRef := client.Collection("users").Doc(uid)
	if _, err := userRef.Set(ctx, map[string]interface{}{"screen_name": "log-tester"}); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() {
		iter := userRef.Collection("omikuji_logs").Documents(context.Background())
		for {
			doc, err := iter.Next()
			if err != nil {
				break
			}
			doc.Ref.Delete(context.Background())
		}
		userRef.Delete(context.Background())
	})

	rec := httptest.NewRecorder()
	if err := runOmikuji(ctx, rec, client, omikujiRequestBody{GithubID: uid}); err != nil {
		t.Fatalf("runOmikuji: %v", err)
	}
	docs, err := userRef.Collection("omikuji_logs").Documents(ctx).GetAll()
	if err != nil {
		t.Fatalf("read omikuji_logs: %v", err)
	}
	if len(docs) != 1 {
		t.Fatalf("omikuji_logs count = %d, want 1", len(docs))
	}
	data := docs[0].Data()
	if data["tier"] == "" || data["entry_id"] == "" || data["timestamp"] == nil {
		t.Errorf("omikuji_log fields missing: %v", data)
	}
}
