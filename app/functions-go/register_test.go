package gofunctions

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRegister_NewUser(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	githubID := fmt.Sprintf("register-test-new-%d", time.Now().UnixNano())

	rec := httptest.NewRecorder()
	body := registerRequestBody{GithubID: githubID, DisplayName: "d", ScreenName: "s", ImagePath: "https://example.com/i.png"}
	if err := runRegister(ctx, rec, client, body, "auth-uid-1"); err != nil {
		t.Fatalf("runRegister error: %v", err)
	}
	assertJSONStatus(t, rec, "success")

	snap, err := client.Collection("users").Doc(githubID).Get(ctx)
	if err != nil {
		t.Fatalf("failed to fetch created doc: %v", err)
	}
	var stored struct {
		AuthUserUID string `firestore:"auth_user_uid"`
		Exp         int64  `firestore:"exp"`
	}
	if err := snap.DataTo(&stored); err != nil {
		t.Fatalf("DataTo: %v", err)
	}
	if stored.AuthUserUID != "auth-uid-1" {
		t.Errorf("auth_user_uid = %q, want auth-uid-1", stored.AuthUserUID)
	}
	if stored.Exp != 10 {
		t.Errorf("exp = %d, want 10", stored.Exp)
	}
}

func TestRegister_ExistingUserWithoutAuthUID(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	githubID := fmt.Sprintf("register-test-noauth-%d", time.Now().UnixNano())

	if _, err := client.Collection("users").Doc(githubID).Set(ctx, map[string]interface{}{
		"display_name": "d", "screen_name": "s", "image_path": "", "exp": 0,
	}); err != nil {
		t.Fatalf("failed to seed user: %v", err)
	}

	rec := httptest.NewRecorder()
	body := registerRequestBody{GithubID: githubID, DisplayName: "d", ScreenName: "s", ImagePath: "p"}
	if err := runRegister(ctx, rec, client, body, "auth-uid-2"); err != nil {
		t.Fatalf("runRegister error: %v", err)
	}
	assertJSONStatus(t, rec, "updated")
}

func TestRegister_AlreadyRegistered(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	githubID := fmt.Sprintf("register-test-registered-%d", time.Now().UnixNano())

	if _, err := client.Collection("users").Doc(githubID).Set(ctx, map[string]interface{}{
		"display_name": "d", "screen_name": "s", "image_path": "", "exp": 0, "auth_user_uid": "existing-uid",
	}); err != nil {
		t.Fatalf("failed to seed user: %v", err)
	}

	rec := httptest.NewRecorder()
	body := registerRequestBody{GithubID: githubID, DisplayName: "d", ScreenName: "s", ImagePath: "p"}
	if err := runRegister(ctx, rec, client, body, "auth-uid-3"); err != nil {
		t.Fatalf("runRegister error: %v", err)
	}
	assertJSONStatus(t, rec, "registered")
}

func TestRegisterHandler_NonPostMethod(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/register", nil)
	rec := httptest.NewRecorder()
	registerHandler(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
	assertJSONStatus(t, rec, "missing request")
}

func TestRegisterHandler_MissingAuthorizationHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	registerHandler(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
	assertJSONStatus(t, rec, "authorization missing.")
}

func TestRegisterHandler_MalformedBearerHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Token abc")
	rec := httptest.NewRecorder()
	registerHandler(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
	assertJSONStatus(t, rec, "authorization missing.")
}

func TestRegisterHandler_MalformedJSONBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(`{invalid`))
	req.Header.Set("Authorization", "Bearer some-token")
	rec := httptest.NewRecorder()
	registerHandler(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
	assertJSONStatus(t, rec, "missing request")
}

func assertJSONStatus(t *testing.T, rec *httptest.ResponseRecorder, want string) {
	t.Helper()
	var out map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("failed to decode response %q: %v", rec.Body.String(), err)
	}
	if out["status"] != want {
		t.Fatalf("status = %v, want %q (body=%s)", out["status"], want, rec.Body.String())
	}
}
