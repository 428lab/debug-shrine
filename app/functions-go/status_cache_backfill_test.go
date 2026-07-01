package gofunctions

import (
	"context"
	"testing"
	"time"

	"github.com/428lab/debug-shrine/functions-go/internal/performance"
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
		"display_name":   "cached user",
		"screen_name":    "backfill_cached",
		"last_sanpai":    now.AddDate(0, 0, -1),
		"status":         map[string]interface{}{"total": int64(1)},
		"status_version": performance.StatusLogicVersion,
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

// TestStatusCacheBackfill_RecomputesOldVersionStatus は、status は保存済みだが
// status_version が現行(performance.StatusLogicVersion)より古いユーザーが
// 再計算され、現行バージョンが刻まれることを検証する(案A: バージョン印による
// 自己修復の要)。共有エミュレータの他ユーザーが1回あたり最大10件の枠を消費し得るため、
// 「対象が現行バージョンになるまで」バックフィルを繰り返し実行して確認する。
func TestStatusCacheBackfill_RecomputesOldVersionStatus(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	now := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)

	oldVersionID := "TestStatusCacheBackfill_old_version"
	if _, err := client.Collection("users").Doc(oldVersionID).Set(ctx, map[string]interface{}{
		"display_name": "old version user",
		"screen_name":  "backfill_oldver",
		"image_path":   "https://example.com/oldver.png",
		"last_sanpai":  now.AddDate(0, 0, -1),
		// 旧ロジックで計算された(status_version フィールドが存在しない)stale なキャッシュ。
		"status": map[string]interface{}{"total": int64(99999)},
	}); err != nil {
		t.Fatalf("failed to seed old-version user: %v", err)
	}
	if _, err := client.Collection("users").Doc(oldVersionID).Collection("github_activities").Doc("1").Set(ctx, map[string]interface{}{
		"raw": `{"id":"1","type":"PushEvent","created_at":"2026-05-31T00:00:00Z","payload":{"commits":[{"sha":"a"}]}}`,
	}); err != nil {
		t.Fatalf("failed to seed activity: %v", err)
	}

	readOldVersion := func() backfillUserDoc {
		doc, err := client.Collection("users").Doc(oldVersionID).Get(ctx)
		if err != nil {
			t.Fatalf("failed to read old-version user: %v", err)
		}
		var data backfillUserDoc
		if err := doc.DataTo(&data); err != nil {
			t.Fatalf("DataTo: %v", err)
		}
		return data
	}

	// バックフィルは1回あたり最大10件しか処理しないため、共有エミュレータに
	// 未処理(非現行)ユーザーが多数いると対象に届くまで複数回必要になる。
	// 処理は単調(処理済みは次回スキップ)なので、対象が現行になるまで繰り返す。
	// 無限ループ防止に十分大きな上限を設ける(実際は数回で収束する)。
	const maxRuns = 100
	i := 0
	for ; i < maxRuns && readOldVersion().StatusVersion < performance.StatusLogicVersion; i++ {
		if err := runStatusCacheBackfill(ctx, client, now); err != nil {
			t.Fatalf("runStatusCacheBackfill: %v", err)
		}
	}
	if i >= maxRuns {
		t.Fatalf("old-version user was not recomputed within %d backfill runs", maxRuns)
	}

	got := readOldVersion()
	if got.StatusVersion != performance.StatusLogicVersion {
		t.Fatalf("old-version user status_version = %d, want %d (再計算されていない)", got.StatusVersion, performance.StatusLogicVersion)
	}
	if got.Status == nil {
		t.Fatal("old-version user should have recomputed status")
	}
	// stale 値(99999)が現行ロジックの再計算結果で上書きされていること。
	if got.Status.Total == 99999 {
		t.Error("old-version user's stale status.total was not recomputed")
	}
	if got.Status.User.ScreenName != "backfill_oldver" {
		t.Errorf("recomputed status.user.screen_name = %q, want backfill_oldver", got.Status.User.ScreenName)
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
