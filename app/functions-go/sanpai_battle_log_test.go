package gofunctions

import (
	"context"
	"fmt"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
)

// battleLogGains は参拝で積まれたせんとうりょく獲得ログの値を返す。
func battleLogGains(t *testing.T, ctx context.Context, client *firestore.Client, githubID string) []int64 {
	t.Helper()
	docs, err := client.Collection("users").Doc(githubID).
		Collection(battleLogsCollection).Documents(ctx).GetAll()
	if err != nil {
		t.Fatalf("GetAll(%s): %v", battleLogsCollection, err)
	}
	gains := make([]int64, 0, len(docs))
	for _, d := range docs {
		v, _ := d.Data()["add_point"].(int64)
		gains = append(gains, v)
	}
	return gains
}

// TestSanpai_AppendsBattleLog は参拝でせんとうりょくの獲得ログが積まれることを
// 検証する。週間・月間ランキングはこのログの合計で作るため、参拝のたびに
// 「その回で伸びた分」が残っている必要がある。
func TestSanpai_AppendsBattleLog(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	githubID := fmt.Sprintf("sanpai-battle-log-%d", time.Now().UnixNano())

	setupTestUser(t, ctx, client, githubID, map[string]interface{}{
		"display_name": "Battle Log User",
		"screen_name":  githubID,
		"image_path":   "https://example.com/icon.png",
		"exp":          10,
	})

	events := []map[string]interface{}{
		mockEvent("battle-evt-1", "PushEvent", "someone/bar", time.Now().UTC().Add(-2*time.Hour).Format(time.RFC3339)),
		mockEvent("battle-evt-2", "PushEvent", "someone/bar", time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)),
	}
	withMockGitHub(t, newMockGitHubServer(t, events))

	if out := postSanpai(t, ctx, client, githubID, githubID); out["status"] != "success" {
		t.Fatalf("参拝が成功していない: %+v", out)
	}

	gains := battleLogGains(t, ctx, client, githubID)
	if len(gains) != 1 {
		t.Fatalf("参拝1回につきログ1件が積まれるべき: %+v", gains)
	}
	if gains[0] <= 0 {
		t.Fatalf("伸びた分が記録されるべき: %d", gains[0])
	}

	snap, err := client.Collection("users").Doc(githubID).Get(ctx)
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if total := int64(statusTotalFromSnapshot(snap)); gains[0] > total {
		t.Errorf("伸び幅が総量を超えている: gain=%d total=%d", gains[0], total)
	}
}

// TestSanpai_BattleLogIgnoresStaleCacheCorrection は、キャッシュが古いユーザーが
// 久しぶりに参拝したとき、記録されるのが「その回の新着イベント分」だけであることを
// 検証する。
//
// 以前の基準値方式では、キャッシュの訂正分(古い値と再計算後の値の差)や、
// 過去の全活動を初めて集計した分まで「期間中に伸びた分」として計上され、
// 何年も参拝していないユーザーが週間ランキングに現れていた。
func TestSanpai_BattleLogIgnoresStaleCacheCorrection(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	githubID := fmt.Sprintf("sanpai-stale-cache-%d", time.Now().UnixNano())

	// 旧ロジックで計算された、実態とずれた status キャッシュ。status_version が
	// 無いので参拝時は全件再計算パスに入る。
	setupTestUser(t, ctx, client, githubID, map[string]interface{}{
		"display_name": "Returning User",
		"screen_name":  githubID,
		"image_path":   "https://example.com/icon.png",
		"exp":          10,
		"status":       map[string]interface{}{"total": int64(1)},
	})

	// 過去に溜まっている活動。全件再計算するとこれらもせんとうりょくになるが、
	// 今回の参拝で稼いだ分ではないのでログに入ってはいけない。
	for i := 0; i < 20; i++ {
		id := fmt.Sprintf("old-%d", i)
		created := time.Date(2022, 1, 3, 1, i, 0, 0, time.UTC).Format(time.RFC3339)
		if _, err := client.Collection("users").Doc(githubID).
			Collection("github_activities").Doc(id).Set(ctx, map[string]interface{}{
			"raw": fmt.Sprintf(`{"id":%q,"type":"PushEvent","created_at":%q,"payload":{"commits":[{"sha":"a"}]}}`, id, created),
		}); err != nil {
			t.Fatalf("seed activity: %v", err)
		}
	}

	events := []map[string]interface{}{
		mockEvent("stale-evt-1", "PushEvent", "someone/bar", time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)),
	}
	withMockGitHub(t, newMockGitHubServer(t, events))

	if out := postSanpai(t, ctx, client, githubID, githubID); out["status"] != "success" {
		t.Fatalf("参拝が成功していない: %+v", out)
	}

	snap, err := client.Collection("users").Doc(githubID).Get(ctx)
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	total := int64(statusTotalFromSnapshot(snap))
	if total <= 0 {
		t.Fatalf("再計算後の総量が0: %d", total)
	}

	var gain int64
	for _, g := range battleLogGains(t, ctx, client, githubID) {
		gain += g
	}
	// 20件の過去活動に対して新着は1件。総量まるごとが記録されていないこと。
	if gain >= total {
		t.Errorf("過去分・キャッシュ訂正分が伸び幅に混ざっている: gain=%d total=%d", gain, total)
	}
}
