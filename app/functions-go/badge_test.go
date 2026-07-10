package gofunctions

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRenderBadgeSVG(t *testing.T) {
	svg := renderBadgeSVG("でばっぐ神社", "Lv.42 戦闘力 9999")
	for _, want := range []string{
		"<svg", "でばっぐ神社", "Lv.42 戦闘力 9999", "#c9302c",
		`role="img"`, "<title>",
	} {
		if !strings.Contains(svg, want) {
			t.Errorf("svg missing %q", want)
		}
	}
	// XMLエスケープ(値に記号が混ざっても壊れない)
	esc := renderBadgeSVG("a&b", `<x>"y"`)
	if strings.Contains(esc, "<x>") || !strings.Contains(esc, "&amp;b") {
		t.Errorf("svg not escaped: %s", esc)
	}
}

func TestEstimateBadgeTextWidth(t *testing.T) {
	if w := estimateBadgeTextWidth("abc"); w != 21 {
		t.Errorf("ascii width = %d, want 21", w)
	}
	if w := estimateBadgeTextWidth("神社"); w != 24 {
		t.Errorf("cjk width = %d, want 24", w)
	}
	if w := estimateBadgeTextWidth(""); w != 0 {
		t.Errorf("empty width = %d, want 0", w)
	}
}

// エミュレータ統合: statusキャッシュあり/なし/未登録のバッジ出力。
func TestBadge_Variants(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	// statusキャッシュあり
	uid := "badge-test-user-1"
	userRef := client.Collection("users").Doc(uid)
	if _, err := userRef.Set(ctx, map[string]interface{}{
		"screen_name": "badge-tester",
		"status":      map[string]interface{}{"level": int64(42), "total": int64(9999)},
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	t.Cleanup(func() { userRef.Delete(context.Background()) })

	rec := httptest.NewRecorder()
	if err := runBadge(ctx, rec, client, "badge-tester"); err != nil {
		t.Fatalf("runBadge: %v", err)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/svg+xml; charset=utf-8" {
		t.Errorf("Content-Type = %q", ct)
	}
	if !strings.Contains(rec.Body.String(), "Lv.42 戦闘力 9999") {
		t.Errorf("badge body = %s", rec.Body.String())
	}
	if !strings.Contains(rec.Header().Get("Cache-Control"), "s-maxage=3600") {
		t.Errorf("Cache-Control = %q", rec.Header().Get("Cache-Control"))
	}

	// statusキャッシュなし → 参拝求ム
	uid2 := "badge-test-user-2"
	userRef2 := client.Collection("users").Doc(uid2)
	if _, err := userRef2.Set(ctx, map[string]interface{}{"screen_name": "badge-fresh"}); err != nil {
		t.Fatalf("seed2: %v", err)
	}
	t.Cleanup(func() { userRef2.Delete(context.Background()) })
	rec = httptest.NewRecorder()
	if err := runBadge(ctx, rec, client, "badge-fresh"); err != nil {
		t.Fatalf("runBadge fresh: %v", err)
	}
	if !strings.Contains(rec.Body.String(), "参拝求ム") {
		t.Errorf("fresh badge = %s", rec.Body.String())
	}

	// 未登録 → 200で「未登録」バッジ(READMEで壊れた画像にしない)
	rec = httptest.NewRecorder()
	if err := runBadge(ctx, rec, client, "no-such-badge-user"); err != nil {
		t.Fatalf("runBadge unknown: %v", err)
	}
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "未登録") {
		t.Errorf("unknown badge: code=%d body=%s", rec.Code, rec.Body.String())
	}
}
