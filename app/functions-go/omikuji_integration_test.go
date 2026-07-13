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
	kuda := mockKuda(t)
	ctx := context.Background()
	t.Setenv("OMIKUJI_COOLDOWN_SECONDS", "3600")

	uid := "omikuji-test-user-1"
	userRef := client.Collection("users").Doc(uid)
	if _, err := userRef.Set(ctx, map[string]interface{}{"screen_name": "tester"}); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() { userRef.Delete(context.Background()) })

	body := omikujiRequestBody{GithubID: uid}

	// 1) peek: 未抽選なので available。kuda(物理乱数)は消費しない
	rec := httptest.NewRecorder()
	if err := runOmikuji(ctx, rec, client, omikujiRequestBody{GithubID: uid, Peek: true}); err != nil {
		t.Fatalf("runOmikuji peek: %v", err)
	}
	if got := decodeOmikujiResp(t, rec)["status"]; got != "available" {
		t.Fatalf("peek status = %v, want available", got)
	}
	if kuda.Calls != 0 {
		t.Errorf("peek should not consume kuda bytes (calls=%d)", kuda.Calls)
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
	// 抽選は3バイト消費し、結果に出自(entropy)が付く
	if kuda.Calls != 3 {
		t.Errorf("draw should consume 3 kuda bytes (calls=%d)", kuda.Calls)
	}
	entropy, ok := result["entropy"].(map[string]interface{})
	if !ok || entropy["source"] != "physical" {
		t.Errorf("result entropy = %v, want source=physical", result["entropy"])
	}
	if batches, ok := entropy["batches"].([]interface{}); !ok || len(batches) == 0 {
		t.Errorf("entropy batches = %v, want non-empty", entropy["batches"])
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

// kuda(物理乱数)が枯渇・停止しているときは疑似乱数へフォールバックせず
// no_entropy を返し、クールダウン(last_omikuji)を消費しない。
func TestOmikuji_RunOmikuji_NoEntropy(t *testing.T) {
	client := emulatorClient(t)
	kuda := mockKuda(t)
	kuda.Depleted = true
	ctx := context.Background()
	t.Setenv("OMIKUJI_COOLDOWN_SECONDS", "3600")

	uid := "omikuji-test-user-3"
	userRef := client.Collection("users").Doc(uid)
	if _, err := userRef.Set(ctx, map[string]interface{}{"screen_name": "tester3"}); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() { userRef.Delete(context.Background()) })

	rec := httptest.NewRecorder()
	if err := runOmikuji(ctx, rec, client, omikujiRequestBody{GithubID: uid}); err != nil {
		t.Fatalf("runOmikuji: %v", err)
	}
	if got := decodeOmikujiResp(t, rec)["status"]; got != "no_entropy" {
		t.Fatalf("status = %v, want no_entropy", got)
	}
	// クールダウンは消費されない(復旧後にすぐ引き直せる)
	snap, err := userRef.Get(ctx)
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if _, err := snap.DataAt("last_omikuji"); err == nil {
		t.Error("last_omikuji should NOT be written on no_entropy")
	}

	// 復旧したら普通に引ける
	kuda.Depleted = false
	rec = httptest.NewRecorder()
	if err := runOmikuji(ctx, rec, client, omikujiRequestBody{GithubID: uid}); err != nil {
		t.Fatalf("runOmikuji after recovery: %v", err)
	}
	if got := decodeOmikujiResp(t, rec)["status"]; got != "success" {
		t.Errorf("status after recovery = %v, want success", got)
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
