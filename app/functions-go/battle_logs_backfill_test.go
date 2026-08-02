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

	entries := backfillEntries(activities, since, time.Time{}, lastCreatedAt, "u")
	if len(entries) == 0 {
		t.Fatalf("対象の活動があるので伸び幅が出るべき")
	}
	// 活動ごとに、その活動の時刻で積まれること。
	for _, e := range entries {
		if e.At.Before(since) || e.At.After(parseActivityTime(lastCreatedAt)) {
			t.Errorf("範囲外の時刻が混ざっている: %v", e.At)
		}
	}

	// 合計は、対象2件をまとめて計算した場合と一致すること
	// (期間外・未取り込みが混ざっておらず、間隔の寄与も取りこぼしていない)。
	var got int
	for _, e := range entries {
		got += e.Gain
	}
	want := battleTotal(performance.ComputePerformanceIncrement(
		performance.RawUserData{User: "u"},
		[]performance.Activity{activities[1], activities[2]}, "").UserData)
	if got != want {
		t.Errorf("合計 = %d, want %d", got, want)
	}
}

func TestBackfillGain_ZeroWhenNothingAbsorbed(t *testing.T) {
	since := time.Date(2026, 8, 1, 0, 0, 0, 0, jst)
	activities := []performance.Activity{act("old", "2026-07-01T00:00:00Z")}

	if got := backfillEntries(activities, since, time.Time{}, "2026-08-02T10:00:00Z", "u"); len(got) != 0 {
		t.Errorf("期間内の活動が無ければ空: %+v", got)
	}
	// 取り込み済みの記録が無いユーザーは対象外。
	if got := backfillEntries(activities, since, time.Time{}, "", "u"); len(got) != 0 {
		t.Errorf("last_activity_created_at が無ければ空: %+v", got)
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
	if len(docs) != 5 {
		t.Fatalf("活動1件につきログ1件が作られるべき: %d件", len(docs))
	}
	for _, d := range docs {
		if got, _ := d.Data()["add_point"].(int64); got <= 0 {
			t.Errorf("add_point = %v, want > 0", d.Data()["add_point"])
		}
	}
	before := len(docs)

	// 2度目は積み直さない(冪等)。
	if err := runBattleLogBackfill(ctx, client, since, key); err != nil {
		t.Fatalf("runBattleLogBackfill 2: %v", err)
	}
	docs, err = userRef.Collection(battleLogsCollection).Documents(ctx).GetAll()
	if err != nil {
		t.Fatalf("GetAll 2: %v", err)
	}
	if len(docs) != before {
		t.Errorf("2度目で増えてはいけない: %d件 (1度目 %d件)", len(docs), before)
	}
}

func TestBackfillEntries_RespectsUntil(t *testing.T) {
	// 既にログのある期間と重ねると二重計上になるため、上限を指定できる。
	since := time.Date(2026, 7, 1, 0, 0, 0, 0, jst)
	until := time.Date(2026, 7, 27, 0, 0, 0, 0, jst)
	activities := []performance.Activity{
		act("in", "2026-07-10T00:00:00Z"),
		// created_at はUTC、期間の境界はJST。7/26 21:00 JST は上限の内側。
		act("boundary", "2026-07-26T12:00:00Z"),
		// 7/27 08:00 JST。上限より後で、既にログがある範囲。
		act("after", "2026-07-26T23:00:00Z"),
	}
	entries := backfillEntries(activities, since, until, "2026-07-31T00:00:00Z", "u")
	for _, e := range entries {
		if !e.At.Before(until) {
			t.Errorf("上限より後の活動が混ざっている: %v", e.At)
		}
	}
	if len(entries) != 2 {
		t.Errorf("上限内の2件だけが対象: %+v", entries)
	}
}

func TestPeriodKeyLayout(t *testing.T) {
	if got := periodKeyLayout("month"); got != "2006-01" {
		t.Errorf("月のキー書式 = %q", got)
	}
	if got := periodKeyLayout("week"); got != "2006-01-02" {
		t.Errorf("週のキー書式 = %q", got)
	}
}
