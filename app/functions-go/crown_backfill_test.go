package gofunctions

import (
	"context"
	"testing"

	"cloud.google.com/go/firestore"
)

func TestRunCrownBackfill(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	prefix := "TestCrownBackfill_"
	seedUser := func(id, screenName string, crowns map[string]interface{}) {
		data := map[string]interface{}{"screen_name": screenName}
		if crowns != nil {
			data["crowns"] = crowns
		}
		if _, err := client.Collection("users").Doc(prefix+id).Set(ctx, data); err != nil {
			t.Fatalf("seed user: %v", err)
		}
	}
	// a は1位の称号を既に持っている(締めのたびに付いた値。触らない)
	seedUser("a", "cbA", map[string]interface{}{
		"week_battle_first": map[string]interface{}{"count": int64(1), "latest_period": "2025-01-06"},
	})
	seedUser("b", "cbB", nil)
	seedUser("c", "cbC", nil)
	// 同じ screen_name が2人いる人には付けない
	seedUser("d1", "cbD", nil)
	seedUser("d2", "cbD", nil)

	seedArchive := func(id string, doc rankingArchiveDoc) {
		if _, err := client.Collection("ranking_archive").Doc(id).Set(ctx, doc); err != nil {
			t.Fatalf("seed archive: %v", err)
		}
	}
	seedArchive("week_2025-01-06", rankingArchiveDoc{PeriodType: "week", PeriodKey: "2025-01-06",
		BattleRanks: []periodRankEntry{{"cbA", 30, 1}, {"cbB", 20, 2}, {"cbC", 10, 3}, {"cbD", 9, 3}}})
	seedArchive("week_2025-01-13", rankingArchiveDoc{PeriodType: "week", PeriodKey: "2025-01-13",
		BattleRanks: []periodRankEntry{{"cbC", 30, 1}, {"cbB", 20, 2}}})

	count := func(id, crownID string) (int64, string) {
		t.Helper()
		s, err := client.Collection("users").Doc(prefix + id).Get(ctx)
		if err != nil {
			t.Fatalf("get user: %v", err)
		}
		v, err := s.DataAt("crowns." + crownID + ".count")
		if err != nil {
			return 0, ""
		}
		latest, _ := s.DataAt("crowns." + crownID + ".latest_period")
		n, _ := v.(int64)
		l, _ := latest.(string)
		return n, l
	}

	// 2回動かしても同じ(加算ではなく数え直し)
	for i := 0; i < 2; i++ {
		if err := runCrownBackfill(ctx, client); err != nil {
			t.Fatalf("runCrownBackfill: %v", err)
		}
		if n, l := count("b", "week_battle_second"); n != 2 || l != "2025-01-13" {
			t.Errorf("run %d: b の2位 = %d %q, want 2 2025-01-13", i, n, l)
		}
		if n, _ := count("c", "week_battle_third"); n != 1 {
			t.Errorf("run %d: c の3位 = %d, want 1", i, n)
		}
		// 1位の称号には触らない(アーカイブからは付けない・消さない)
		if n, _ := count("a", "week_battle_first"); n != 1 {
			t.Errorf("run %d: a の1位が変わった = %d", i, n)
		}
		if n, _ := count("c", "week_battle_first"); n != 0 {
			t.Errorf("run %d: 1位はさかのぼって付けない: c = %d", i, n)
		}
		for _, id := range []string{"d1", "d2"} {
			if n, _ := count(id, "week_battle_third"); n != 0 {
				t.Errorf("run %d: screen_name が重なる %s に付いた", i, id)
			}
		}
	}

	// その後の締めの加算とも合う(締めで1つ増えた後に数え直しても、その期間のアーカイブが入る)
	if _, err := client.Collection("users").Doc(prefix+"c").Set(ctx, map[string]interface{}{
		"crowns": map[string]interface{}{"week_battle_third": map[string]interface{}{"count": firestore.Increment(1)}},
	}, firestore.MergeAll); err != nil {
		t.Fatalf("increment: %v", err)
	}
	seedArchive("week_2025-01-20", rankingArchiveDoc{PeriodType: "week", PeriodKey: "2025-01-20",
		BattleRanks: []periodRankEntry{{"cbA", 9, 1}, {"cbB", 8, 2}, {"cbC", 7, 3}}})
	if err := runCrownBackfill(ctx, client); err != nil {
		t.Fatalf("runCrownBackfill: %v", err)
	}
	if n, l := count("c", "week_battle_third"); n != 2 || l != "2025-01-20" {
		t.Errorf("c の3位 = %d %q, want 2 2025-01-20", n, l)
	}
}
