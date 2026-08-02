package gofunctions

import (
	"context"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
)

func TestRunRankingCloseRetry_ClosesPreviousWeekAndIsIdempotent(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	// 2026-08-03(月)の 2:00 に実行 → 直前の週は 2026-07-27 〜 2026-08-02。
	now := time.Date(2026, 8, 3, 2, 0, 0, 0, jst)
	prevStart := time.Date(2026, 7, 27, 0, 0, 0, 0, jst)

	prefix := "TestCloseRetry_"
	seed := func(collection, id string, point int64, at time.Time) {
		userRef := client.Collection("users").Doc(prefix + id)
		if _, err := userRef.Set(ctx, map[string]interface{}{
			"display_name": "name" + id, "screen_name": "screen" + id,
		}, firestore.MergeAll); err != nil {
			t.Fatalf("seed user: %v", err)
		}
		if _, _, err := userRef.Collection(collection).Add(ctx, map[string]interface{}{
			"add_point": point, "timestamp": at,
		}); err != nil {
			t.Fatalf("seed %s: %v", collection, err)
		}
	}
	seed(battleLogsCollection, "a", 700, prevStart.Add(30*time.Hour))
	seed(battleLogsCollection, "b", 40, prevStart.Add(31*time.Hour))
	seed("sanpai_logs", "a", 15, prevStart.Add(30*time.Hour))
	// 締める週の外(新しい週)。確定値に入ってはいけない。
	seed(battleLogsCollection, "a", 9999, now)

	if err := runRankingCloseRetry(ctx, client, now); err != nil {
		t.Fatalf("runRankingCloseRetry: %v", err)
	}

	snap, err := client.Collection("ranking_archive").Doc("week_2026-07-27").Get(ctx)
	if err != nil {
		t.Fatalf("アーカイブが作られていない: %v", err)
	}
	var doc rankingArchiveDoc
	if err := snap.DataTo(&doc); err != nil {
		t.Fatalf("DataTo: %v", err)
	}
	if len(doc.BattleTop) < 2 || doc.BattleTop[0].ScreenName != "screena" || doc.BattleTop[0].Value != 700 {
		t.Fatalf("せんとうりょくの確定順位が違う(週外の9999が混ざっていないか): %+v", doc.BattleTop)
	}
	if len(doc.PointsTop) < 1 || doc.PointsTop[0].ScreenName != "screena" {
		t.Errorf("ぽいんとの確定順位が違う: %+v", doc.PointsTop)
	}

	crownCount := func() int64 {
		s, err := client.Collection("users").Doc(prefix + "a").Get(ctx)
		if err != nil {
			t.Fatalf("get user: %v", err)
		}
		v, err := s.DataAt("crowns.week_battle_first.count")
		if err != nil {
			t.Fatalf("称号が付いていない: %v", err)
		}
		n, _ := v.(int64)
		return n
	}
	if got := crownCount(); got != 1 {
		t.Errorf("称号の回数 = %d, want 1", got)
	}

	// 2度目は既にアーカイブがあるので何もしない(称号も増えない)。
	if err := runRankingCloseRetry(ctx, client, now); err != nil {
		t.Fatalf("runRankingCloseRetry 2: %v", err)
	}
	if got := crownCount(); got != 1 {
		t.Errorf("2度目で称号が増えてはいけない: %d", got)
	}
}
