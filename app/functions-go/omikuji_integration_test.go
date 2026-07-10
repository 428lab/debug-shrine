package gofunctions

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"
)

// これらは Firestore エミュレータが必要。FIRESTORE_EMULATOR_HOST 未設定時は
// emulatorClient が自動スキップする(通常のローカル go test では走らない)。

func decodeOmikujiResp(t *testing.T, rec *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var m map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("unmarshal response: %v (body=%s)", err, rec.Body.String())
	}
	return m
}

func TestOmikuji_RunOmikuji_PeekDrawCooldown(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	t.Setenv("OMIKUJI_COOLDOWN_SECONDS", "3600")

	uid := "omikuji-test-user-1"
	userRef := client.Collection("users").Doc(uid)
	if _, err := userRef.Set(ctx, map[string]interface{}{"screen_name": "tester"}); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() { userRef.Delete(context.Background()) })

	body := omikujiRequestBody{GithubID: uid}

	// 1) peek: 未抽選なので available
	rec := httptest.NewRecorder()
	if err := runOmikuji(ctx, rec, client, omikujiRequestBody{GithubID: uid, Peek: true}); err != nil {
		t.Fatalf("runOmikuji peek: %v", err)
	}
	if got := decodeOmikujiResp(t, rec)["status"]; got != "available" {
		t.Fatalf("peek status = %v, want available", got)
	}

	// 2) draw: success + 結果 + 保存
	rec = httptest.NewRecorder()
	if err := runOmikuji(ctx, rec, client, body); err != nil {
		t.Fatalf("runOmikuji draw: %v", err)
	}
	resp := decodeOmikujiResp(t, rec)
	if resp["status"] != "success" {
		t.Fatalf("draw status = %v, want success", resp["status"])
	}
	result, ok := resp["result"].(map[string]interface{})
	if !ok || result["tier"] == "" || result["fortune"] == "" {
		t.Fatalf("draw result missing tier/fortune: %v", resp["result"])
	}
	// 保存確認
	snap, err := userRef.Get(ctx)
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if _, err := snap.DataAt("last_omikuji"); err != nil {
		t.Errorf("last_omikuji not saved: %v", err)
	}
	if _, err := snap.DataAt("omikuji_result"); err != nil {
		t.Errorf("omikuji_result not saved: %v", err)
	}

	// 3) 直後に再draw → cooldown(前回結果 + 残り秒)
	rec = httptest.NewRecorder()
	if err := runOmikuji(ctx, rec, client, body); err != nil {
		t.Fatalf("runOmikuji second draw: %v", err)
	}
	resp2 := decodeOmikujiResp(t, rec)
	if resp2["status"] != "cooldown" {
		t.Fatalf("second draw status = %v, want cooldown", resp2["status"])
	}
	if rem, _ := resp2["remaining_seconds"].(float64); rem <= 0 {
		t.Errorf("remaining_seconds = %v, want > 0", resp2["remaining_seconds"])
	}
	if _, ok := resp2["result"].(map[string]interface{}); !ok {
		t.Errorf("cooldown response should include previous result")
	}
}

func TestOmikuji_RunOmikuji_NotRegistered(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	rec := httptest.NewRecorder()
	if err := runOmikuji(ctx, rec, client, omikujiRequestBody{GithubID: "no-such-user-xyz"}); err != nil {
		t.Fatalf("runOmikuji: %v", err)
	}
	if got := decodeOmikujiResp(t, rec)["status"]; got != "failed" {
		t.Errorf("status = %v, want failed (not registered)", got)
	}
}

func TestOmikuji_RunOmikuji_AvailableAfterCooldown(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	t.Setenv("OMIKUJI_COOLDOWN_SECONDS", "100")

	uid := "omikuji-test-user-2"
	userRef := client.Collection("users").Doc(uid)
	// last_omikuji を200秒前に置く → クールダウン(100秒)切れで再び引ける
	if _, err := userRef.Set(ctx, map[string]interface{}{
		"screen_name":  "tester2",
		"last_omikuji": time.Now().Add(-200 * time.Second),
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	t.Cleanup(func() { userRef.Delete(context.Background()) })

	rec := httptest.NewRecorder()
	if err := runOmikuji(ctx, rec, client, omikujiRequestBody{GithubID: uid, Peek: true}); err != nil {
		t.Fatalf("peek: %v", err)
	}
	if got := decodeOmikujiResp(t, rec)["status"]; got != "available" {
		t.Errorf("peek after cooldown expired = %v, want available", got)
	}
}
