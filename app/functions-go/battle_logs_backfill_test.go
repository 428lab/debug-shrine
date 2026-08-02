package gofunctions

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/428lab/debug-shrine/functions-go/internal/performance"
)

func act(id, createdAt string) performance.Activity {
	return performance.Activity{Type: "PushEvent", CreatedAt: createdAt}
}

func TestBackfillGain_OnlyCountsAbsorbedActivitiesInPeriod(t *testing.T) {
	since := time.Date(2026, 8, 1, 0, 0, 0, 0, jst)
	// 取り込み済みの上限。これより後の活動は今後の参拝でライブに記録されるので、
	// ここで積むと二重計上になる。
	lastCreatedAt := "2026-08-02T10:00:00Z"

	activities := []performance.Activity{
		act("old", "2026-07-20T00:00:00Z"),    // 期間前
		act("in1", "2026-08-01T01:00:00Z"),    // 対象
		act("in2", "2026-08-02T09:00:00Z"),    // 対象
		act("future", "2026-08-02T23:00:00Z"), // 未取り込み(ライブで積まれる)
		act("broken", "not-a-timestamp"),      // 壊れた値は無視
	}

	gain := backfillGain(activities, since, lastCreatedAt, "u")
	if gain <= 0 {
		t.Fatalf("対象の活動があるので伸び幅が出るべき: %d", gain)
	}

	// 対象2件だけを渡した場合と一致すること(期間外・未取り込みが混ざっていない)。
	want := battleTotal(performance.ComputePerformanceIncrement(
		performance.RawUserData{User: "u"},
		[]performance.Activity{activities[1], activities[2]}, "").UserData)
	if gain != want {
		t.Errorf("gain = %d, want %d(期間外・未取り込みが混ざっている)", gain, want)
	}
}

func TestBackfillGain_ZeroWhenNothingAbsorbed(t *testing.T) {
	since := time.Date(2026, 8, 1, 0, 0, 0, 0, jst)
	activities := []performance.Activity{act("old", "2026-07-01T00:00:00Z")}

	if got := backfillGain(activities, since, "2026-08-02T10:00:00Z", "u"); got != 0 {
		t.Errorf("期間内の活動が無ければ0: %d", got)
	}
	// 取り込み済みの記録が無いユーザーは対象外。
	if got := backfillGain(activities, since, "", "u"); got != 0 {
		t.Errorf("last_activity_created_at が無ければ0: %d", got)
	}
}

func TestRunBattleLogBackfill_CreatesLogOnceAndIsIdempotent(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	since := time.Now().In(jst).Truncate(time.Hour).Add(-24 * time.Hour)
	key := fmt.Sprintf("test_%d", time.Now().UnixNano())
	githubID := "TestBattleBackfill_" + key

	userRef := client.Collection("users").Doc(githubID)
	if _, err := userRef.Set(ctx, map[string]interface{}{
		"screen_name":              "backfilluser",
		"last_activity_created_at": since.Add(2 * time.Hour).UTC().Format(time.RFC3339),
	}); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	for i := 0; i < 5; i++ {
		created := since.Add(time.Duration(i+1) * 10 * time.Minute).UTC().Format(time.RFC3339)
		if _, err := userRef.Collection("github_activities").Doc(fmt.Sprintf("a%d", i)).Set(ctx, map[string]interface{}{
			"raw": fmt.Sprintf(`{"id":"a%d","type":"PushEvent","created_at":%q,"payload":{"commits":[{"sha":"x"}]}}`, i, created),
		}); err != nil {
			t.Fatalf("seed activity: %v", err)
		}
	}

	if err := runBattleLogBackfill(ctx, client, since, key); err != nil {
		t.Fatalf("runBattleLogBackfill: %v", err)
	}
	docs, err := userRef.Collection(battleLogsCollection).Documents(ctx).GetAll()
	if err != nil {
		t.Fatalf("GetAll: %v", err)
	}
	if len(docs) != 1 {
		t.Fatalf("ログが1件作られるべき: %d件", len(docs))
	}
	if got, _ := docs[0].Data()["add_point"].(int64); got <= 0 {
		t.Errorf("add_point = %v, want > 0", docs[0].Data()["add_point"])
	}

	// 2度目は積み直さない(冪等)。
	if err := runBattleLogBackfill(ctx, client, since, key); err != nil {
		t.Fatalf("runBattleLogBackfill 2: %v", err)
	}
	docs, err = userRef.Collection(battleLogsCollection).Documents(ctx).GetAll()
	if err != nil {
		t.Fatalf("GetAll 2: %v", err)
	}
	if len(docs) != 1 {
		t.Errorf("2度目で増えてはいけない: %d件", len(docs))
	}
}
