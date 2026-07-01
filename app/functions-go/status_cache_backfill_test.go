package gofunctions

import (
	"context"
	"testing"
	"time"
)

func TestStatusCacheBackfill_BackfillsRecentlyActiveUsersWithoutStatus(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	now := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)

	targetID := "TestStatusCacheBackfill_target"
	if _, err := client.Collection("users").Doc(targetID).Set(ctx, map[string]interface{}{
		"display_name": "target user",
		"screen_name":  "backfill_target",
		"image_path":   "https://example.com/target.png",
		"last_sanpai":  now.AddDate(0, 0, -1),
	}); err != nil {
		t.Fatalf("failed to seed target user: %v", err)
	}
	if _, err := client.Collection("users").Doc(targetID).Collection("github_activities").Doc("1").Set(ctx, map[string]interface{}{
		"raw": `{"id":"1","type":"PushEvent","created_at":"2026-05-31T00:00:00Z","payload":{"commits":[{"sha":"a"}]}}`,
	}); err != nil {
		t.Fatalf("failed to seed activity: %v", err)
	}

	alreadyCachedID := "TestStatusCacheBackfill_already_cached"
	if _, err := client.Collection("users").Doc(alreadyCachedID).Set(ctx, map[string]interface{}{
		"display_name": "cached user",
		"screen_name":  "backfill_cached",
		"last_sanpai":  now.AddDate(0, 0, -1),
		"status":       map[string]interface{}{"total": int64(1)},
	}); err != nil {
		t.Fatalf("failed to seed already-cached user: %v", err)
	}

	dormantID := "TestStatusCacheBackfill_dormant"
	if _, err := client.Collection("users").Doc(dormantID).Set(ctx, map[string]interface{}{
		"display_name": "dormant user",
		"screen_name":  "backfill_dormant",
		"last_sanpai":  now.AddDate(0, -7, 0),
	}); err != nil {
		t.Fatalf("failed to seed dormant user: %v", err)
	}

	if err := runStatusCacheBackfill(ctx, client, now); err != nil {
		t.Fatalf("runStatusCacheBackfill: %v", err)
	}

	targetDoc, err := client.Collection("users").Doc(targetID).Get(ctx)
	if err != nil {
		t.Fatalf("failed to read target user: %v", err)
	}
	var targetData backfillUserDoc
	if err := targetDoc.DataTo(&targetData); err != nil {
		t.Fatalf("DataTo: %v", err)
	}
	if targetData.Status == nil {
		t.Fatal("target user should have status cached after backfill")
	}
	if targetData.Status.User.ScreenName != "backfill_target" {
		t.Errorf("cached status.user.screen_name = %q, want backfill_target", targetData.Status.User.ScreenName)
	}

	cachedDoc, err := client.Collection("users").Doc(alreadyCachedID).Get(ctx)
	if err != nil {
		t.Fatalf("failed to read already-cached user: %v", err)
	}
	var cachedData backfillUserDoc
	if err := cachedDoc.DataTo(&cachedData); err != nil {
		t.Fatalf("DataTo: %v", err)
	}
	if cachedData.Status == nil || cachedData.Status.Total != 1 {
		t.Errorf("already-cached user's status should be untouched, got %+v", cachedData.Status)
	}

	dormantDoc, err := client.Collection("users").Doc(dormantID).Get(ctx)
	if err != nil {
		t.Fatalf("failed to read dormant user: %v", err)
	}
	var dormantData backfillUserDoc
	if err := dormantDoc.DataTo(&dormantData); err != nil {
		t.Fatalf("DataTo: %v", err)
	}
	if dormantData.Status != nil {
		t.Errorf("dormant user (last_sanpai > 6 months ago) should not be backfilled, got status=%+v", dormantData.Status)
	}
}

// TestStatusCacheBackfill_RespectsMaxPerRunLimit は、対象ユーザーがMAX_PER_RUNを
// 超えて存在する場合に「1回の実行では処理しきらない(=次回に持ち越す)」ことを検証する。
// 同一Firestoreを共有する他テストの影響を受けても壊れないよう、厳密な処理件数の
// 一致ではなく「1回目で全件は終わらない」「複数回実行すれば最終的に全件終わる」
// という不変条件で検証する。
func TestStatusCacheBackfill_RespectsMaxPerRunLimit(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	now := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)

	prefix := "TestStatusCacheBackfill_MaxPerRun_"
	total := statusCacheBackfillMaxPerRun + 3
	ids := make([]string, total)
	for i := 0; i < total; i++ {
		id := prefix + string(rune('a'+i))
		ids[i] = id
		if _, err := client.Collection("users").Doc(id).Set(ctx, map[string]interface{}{
			"display_name": "user " + id,
			"screen_name":  id,
			"last_sanpai":  now.AddDate(0, 0, -1),
		}); err != nil {
			t.Fatalf("failed to seed user %s: %v", id, err)
		}
	}

	countBackfilled := func() int {
		n := 0
		for _, id := range ids {
			doc, err := client.Collection("users").Doc(id).Get(ctx)
			if err != nil {
				t.Fatalf("failed to read user %s: %v", id, err)
			}
			var data backfillUserDoc
			if err := doc.DataTo(&data); err != nil {
				t.Fatalf("DataTo: %v", err)
			}
			if data.Status != nil {
				n++
			}
		}
		return n
	}

	if err := runStatusCacheBackfill(ctx, client, now); err != nil {
		t.Fatalf("runStatusCacheBackfill (1st run): %v", err)
	}
	afterFirstRun := countBackfilled()
	if afterFirstRun >= total {
		t.Errorf("1回目の実行で%d件全て処理されてしまった(MAX_PER_RUN=%dの上限が効いていない)", total, statusCacheBackfillMaxPerRun)
	}

	// 他ユーザーとの共有状態による揺れを許容しつつ、複数回実行すれば
	// 最終的に全員処理されることを確認する(上限が処理漏れを起こしていないこと)。
	const maxRuns = 5
	for i := 0; i < maxRuns && countBackfilled() < total; i++ {
		if err := runStatusCacheBackfill(ctx, client, now); err != nil {
			t.Fatalf("runStatusCacheBackfill (retry): %v", err)
		}
	}
	if got := countBackfilled(); got != total {
		t.Errorf("複数回実行後の処理済み件数 = %d, want %d", got, total)
	}
}
