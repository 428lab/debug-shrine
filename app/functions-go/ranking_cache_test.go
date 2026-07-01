package gofunctions

import (
	"context"
	"testing"
)

func TestRankingCache_CreatesMissingEntriesAndSkipsExisting(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	newUserID := "TestRankingCache_new_user"
	if _, err := client.Collection("users").Doc(newUserID).Set(ctx, map[string]interface{}{
		"display_name": "new user",
		"screen_name":  "new_user",
		"status":       map[string]interface{}{"total": int64(42)},
	}); err != nil {
		t.Fatalf("failed to seed new user: %v", err)
	}

	existingUserID := "TestRankingCache_existing_user"
	if _, err := client.Collection("users").Doc(existingUserID).Set(ctx, map[string]interface{}{
		"display_name": "existing user",
		"screen_name":  "existing_user",
		"status":       map[string]interface{}{"total": int64(999)},
	}); err != nil {
		t.Fatalf("failed to seed existing user: %v", err)
	}
	if _, err := client.Collection("point_ranking").Doc(existingUserID).Set(ctx, map[string]interface{}{
		"display_name": "existing user",
		"screen_name":  "existing_user",
		"battle_point": int64(1), // 既存の値。上書きされないことを確認する。
		"rank":         int64(5),
	}); err != nil {
		t.Fatalf("failed to seed existing point_ranking: %v", err)
	}

	noStatusUserID := "TestRankingCache_no_status_user"
	if _, err := client.Collection("users").Doc(noStatusUserID).Set(ctx, map[string]interface{}{
		"display_name": "no status",
		"screen_name":  "no_status_user",
	}); err != nil {
		t.Fatalf("failed to seed no-status user: %v", err)
	}

	if err := runRankingCache(ctx, client); err != nil {
		t.Fatalf("runRankingCache: %v", err)
	}

	newDoc, err := client.Collection("point_ranking").Doc(newUserID).Get(ctx)
	if err != nil {
		t.Fatalf("failed to read new point_ranking doc: %v", err)
	}
	var newData map[string]interface{}
	if err := newDoc.DataTo(&newData); err != nil {
		t.Fatalf("DataTo: %v", err)
	}
	if newData["battle_point"] != int64(42) {
		t.Errorf("new point_ranking battle_point = %v, want 42", newData["battle_point"])
	}
	if newData["rank"] != int64(0) {
		t.Errorf("new point_ranking rank = %v, want 0", newData["rank"])
	}

	existingDoc, err := client.Collection("point_ranking").Doc(existingUserID).Get(ctx)
	if err != nil {
		t.Fatalf("failed to read existing point_ranking doc: %v", err)
	}
	var existingData map[string]interface{}
	if err := existingDoc.DataTo(&existingData); err != nil {
		t.Fatalf("DataTo: %v", err)
	}
	if existingData["battle_point"] != int64(1) {
		t.Errorf("existing point_ranking should be untouched, battle_point = %v, want 1", existingData["battle_point"])
	}

	if _, err := client.Collection("point_ranking").Doc(noStatusUserID).Get(ctx); err == nil {
		t.Error("status未計算のユーザーに対してpoint_rankingドキュメントが作成されるべきではない")
	}
}
