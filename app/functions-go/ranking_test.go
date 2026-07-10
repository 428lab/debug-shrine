package gofunctions

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

func TestRanking_CacheHeaders(t *testing.T) {
	// screen_name 無し(全員共通のグローバル応答)は共有キャッシュ可能にする。
	globalRec := httptest.NewRecorder()
	setRankingCacheHeaders(globalRec, "")
	got := globalRec.Header().Get("Cache-Control")
	want := "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
	if got != want {
		t.Errorf("global Cache-Control = %q, want %q", got, want)
	}

	// screen_name 付き(my_rank を含む個人化応答)は共有キャッシュに載せない。
	// 他人に別人の順位が返る事故を防ぐため no-store であることを保証する。
	personalRec := httptest.NewRecorder()
	setRankingCacheHeaders(personalRec, "user50")
	got = personalRec.Header().Get("Cache-Control")
	want = "private, no-store"
	if got != want {
		t.Errorf("personalized Cache-Control = %q, want %q", got, want)
	}
}

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

func TestRanking_MissingRankingFieldIsError(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	docID := "ranking_cache_TestRanking_MissingRankingFieldIsError"
	if _, err := client.Collection("cache_data").Doc(docID).Set(ctx, map[string]interface{}{
		"latest_update": time.Now(),
	}); err != nil {
		t.Fatalf("failed to seed ranking cache: %v", err)
	}

	if _, err := buildRankingResponseFromDoc(ctx, client, docID, ""); err == nil {
		t.Fatal("expected an error when ranking field is missing, got nil")
	}
}

func TestRanking_ResponseJSONFieldNames(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	docID := "ranking_cache_TestRanking_ResponseJSONFieldNames"
	now := time.Date(2026, 2, 2, 3, 4, 5, 600000000, time.UTC)
	if _, err := client.Collection("cache_data").Doc(docID).Set(ctx, map[string]interface{}{
		"ranking": []map[string]interface{}{
			{"display_name": "a", "screen_name": "a", "image_path": "", "battle_point": int64(1), "rank": int64(1)},
		},
		"latest_update": now,
	}); err != nil {
		t.Fatalf("failed to seed ranking cache: %v", err)
	}

	out, err := buildRankingResponseFromDoc(ctx, client, docID, "a")
	if err != nil {
		t.Fatalf("buildRankingResponseFromDoc: %v", err)
	}
	raw, err := json.Marshal(out)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	var asMap map[string]interface{}
	if err := json.Unmarshal(raw, &asMap); err != nil {
		t.Fatalf("json.Unmarshal: %v", err)
	}
	latestUpdate, ok := asMap["latest_update"].(map[string]interface{})
	if !ok {
		t.Fatalf("latest_update is not an object: %v", asMap["latest_update"])
	}
	if _, ok := latestUpdate["_seconds"]; !ok {
		t.Errorf("latest_update JSON is missing _seconds key: %v", latestUpdate)
	}
	if _, ok := latestUpdate["_nanoseconds"]; !ok {
		t.Errorf("latest_update JSON is missing _nanoseconds key: %v", latestUpdate)
	}
	myRank, ok := asMap["my_rank"].(map[string]interface{})
	if !ok {
		t.Fatalf("my_rank is not an object: %v", asMap["my_rank"])
	}
	if myRank["screen_name"] != "a" {
		t.Errorf("my_rank.screen_name = %v, want a", myRank["screen_name"])
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
