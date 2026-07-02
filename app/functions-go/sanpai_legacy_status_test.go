package gofunctions

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/428lab/debug-shrine/functions-go/internal/performance"
)

// TestSanpai_LegacyStatusCache_DoesNotAbort は、Node版(旧ロジック)が書いた
// status キャッシュを持つ移行ユーザーでも参拝が成功することを検証する回帰テスト。
//
// 旧 status は status.user がオブジェクトではなく文字列(username)であるなど、
// 現行の firestoreStatus と型が一致しないことがある。以前は runSanpai 冒頭の
// DataTo がドキュメント全体をデコードする際にこの型不一致で失敗し、参拝全体が
// "missing server error"(HTTP 200・add_exp 無し)となってフロントで
// 「undefinedポイント獲得」と表示される不具合があった。status_version が古い
// (＝status を再計算する)場合は status キャッシュをデコードしないことで回避する。
func TestSanpai_LegacyStatusCache_DoesNotAbort(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	githubID := fmt.Sprintf("sanpai-legacy-status-%d", time.Now().UnixNano())

	// 旧フォーマットの status(user が文字列・status_version 無し)を持つ移行ユーザー。
	setupTestUser(t, ctx, client, githubID, map[string]interface{}{
		"display_name": "Legacy User",
		"screen_name":  githubID,
		"image_path":   "https://example.com/icon.png",
		"exp":          10,
		"status": map[string]interface{}{
			"user":  "octocat", // 旧フォーマット: user がオブジェクトではなく文字列
			"total": int64(1234),
			"hp":    int64(1),
			"power": int64(2),
		},
		// status_version は意図的に未設定(＝旧ロジックのキャッシュ)
	})

	// last_sanpai より後(未参拝ユーザーなので 2008 以降)の新規イベントを1件返す。
	events := []map[string]interface{}{
		mockEvent("legacy-evt-1", "PushEvent", "someone/bar", time.Now().UTC().Format(time.RFC3339)),
	}
	withMockGitHub(t, newMockGitHubServer(t, events))

	// runSanpai は旧 status のデコードで失敗せず success を返すべき。
	out := postSanpai(t, ctx, client, githubID, githubID)
	if out["status"] != "success" {
		t.Fatalf("legacy-status user sanpai should succeed, got: %+v", out)
	}
	if out["add_exp"] == nil {
		t.Fatalf("response must include add_exp (undefined になるとフロントで「undefinedポイント」表示): %+v", out)
	}
	// 参拝前の戦闘力は旧 status.total を寛容に読み取れていること。
	if got := int(out["power_before"].(float64)); got != 1234 {
		t.Errorf("power_before = %d, want 1234 (旧 status.total を読み取れていない)", got)
	}

	// 再計算により status_version が現行に更新され、user がオブジェクトで再保存されること。
	snap, err := client.Collection("users").Doc(githubID).Get(ctx)
	if err != nil {
		t.Fatalf("failed to re-fetch user doc: %v", err)
	}
	var updated sanpaiUserDocument
	if err := snap.DataTo(&updated); err != nil {
		t.Fatalf("DataTo after sanpai: %v", err)
	}
	if updated.StatusVersion != performance.StatusLogicVersion {
		t.Errorf("status_version = %d, want %d (再計算で更新されていない)", updated.StatusVersion, performance.StatusLogicVersion)
	}
	cached, err := decodeCurrentStatusCache(snap, updated.StatusVersion)
	if err != nil {
		t.Fatalf("decodeCurrentStatusCache after sanpai: %v", err)
	}
	if cached == nil || cached.User.ScreenName != githubID {
		t.Errorf("recomputed status.user should be an object with screen_name=%q, got %+v", githubID, cached)
	}
}
