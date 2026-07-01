package gofunctions

import (
	"context"
	"strconv"
	"testing"
	"time"
)

func TestRanking_TopListAndMyRank(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	entries := []map[string]interface{}{}
	for i := 1; i <= 120; i++ {
		n := strconv.Itoa(i)
		entries = append(entries, map[string]interface{}{
			"display_name": "user" + n,
			"screen_name":  "user" + n,
			"image_path":   "https://example.com/" + n + ".png",
			"battle_point": int64(1000 - i),
			"rank":         int64(i),
		})
	}
	now := time.Date(2026, 1, 1, 0, 0, 0, 123000000, time.UTC)
	docID := "ranking_cache_TestRanking_TopListAndMyRank"
	if _, err := client.Collection("cache_data").Doc(docID).Set(ctx, map[string]interface{}{
		"ranking":       entries,
		"latest_update": now,
	}); err != nil {
		t.Fatalf("failed to seed ranking cache: %v", err)
	}

	out, err := buildRankingResponseFromDoc(ctx, client, docID, "user50")
	if err != nil {
		t.Fatalf("buildRankingResponseFromDoc: %v", err)
	}
	if len(out.Ranking) != 100 {
		t.Errorf("ranking length = %d, want 100", len(out.Ranking))
	}
	if out.Ranking[0].ScreenName != "user1" {
		t.Errorf("ranking[0].screen_name = %q, want user1", out.Ranking[0].ScreenName)
	}
	if out.MyRank == nil || out.MyRank.ScreenName != "user50" {
		t.Fatalf("my_rank = %+v, want screen_name user50", out.MyRank)
	}
	if out.LatestUpdate == nil || out.LatestUpdate.Seconds != now.Unix() {
		t.Errorf("latest_update = %+v, want seconds=%d", out.LatestUpdate, now.Unix())
	}
}

func TestRanking_NoScreenNameOmitsMyRank(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	docID := "ranking_cache_TestRanking_NoScreenNameOmitsMyRank"
	if _, err := client.Collection("cache_data").Doc(docID).Set(ctx, map[string]interface{}{
		"ranking": []map[string]interface{}{
			{"display_name": "a", "screen_name": "a", "image_path": "", "battle_point": int64(1), "rank": int64(1)},
		},
		"latest_update": time.Now(),
	}); err != nil {
		t.Fatalf("failed to seed ranking cache: %v", err)
	}

	out, err := buildRankingResponseFromDoc(ctx, client, docID, "")
	if err != nil {
		t.Fatalf("buildRankingResponseFromDoc: %v", err)
	}
	if out.MyRank != nil {
		t.Errorf("my_rank should be nil when screen_name is not given, got: %+v", out.MyRank)
	}
}

func TestRanking_ScreenNameNotFound(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	docID := "ranking_cache_TestRanking_ScreenNameNotFound"
	if _, err := client.Collection("cache_data").Doc(docID).Set(ctx, map[string]interface{}{
		"ranking": []map[string]interface{}{
			{"display_name": "a", "screen_name": "a", "image_path": "", "battle_point": int64(1), "rank": int64(1)},
		},
		"latest_update": time.Now(),
	}); err != nil {
		t.Fatalf("failed to seed ranking cache: %v", err)
	}

	out, err := buildRankingResponseFromDoc(ctx, client, docID, "not-in-ranking")
	if err != nil {
		t.Fatalf("buildRankingResponseFromDoc: %v", err)
	}
	if out.MyRank != nil {
		t.Errorf("my_rank should be nil when screen_name is not found in ranking, got: %+v", out.MyRank)
	}
}
