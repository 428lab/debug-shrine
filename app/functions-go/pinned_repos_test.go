package gofunctions

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
)

func TestNormalizePinnedRepoNames(t *testing.T) {
	// 正常系: 重複除去・順序保持
	names, err := normalizePinnedRepoNames([]string{"repo-a", "repo.b", "repo_a", "repo-a"})
	if err != nil || len(names) != 3 || names[0] != "repo-a" || names[2] != "repo_a" {
		t.Errorf("normalize = %v, %v", names, err)
	}

	// 形式違反
	for _, bad := range []string{"", "has space", "own/er", "日本語", "a<script>"} {
		if _, err := normalizePinnedRepoNames([]string{bad}); err == nil {
			t.Errorf("name %q should be rejected", bad)
		}
	}

	// 上限超過(7件)
	many := make([]string, 7)
	for i := range many {
		many[i] = fmt.Sprintf("repo-%d", i)
	}
	if _, err := normalizePinnedRepoNames(many); err == nil {
		t.Error("7 repos should exceed the limit")
	}

	// 空 = ピン解除は許可
	if names, err := normalizePinnedRepoNames(nil); err != nil || len(names) != 0 {
		t.Errorf("empty should be allowed: %v %v", names, err)
	}
}

// モックGitHub: /repos/{owner}/{repo} を返す(存在するのは owner=pin-tester の repo-a / repo-b)。
func mockGithubForPins(t *testing.T) {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/pin-tester/repo-a", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"name":"repo-a","html_url":"https://github.com/pin-tester/repo-a","description":"desc A","stargazers_count":12,"forks_count":3,"language":"Go","owner":{"login":"pin-tester"}}`)
	})
	mux.HandleFunc("/repos/pin-tester/repo-b", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"name":"repo-b","html_url":"https://github.com/pin-tester/repo-b","description":"","stargazers_count":0,"forks_count":0,"language":"Vue","owner":{"login":"pin-tester"}}`)
	})
	// 他人のリポジトリに解決されるケース(移管など)
	mux.HandleFunc("/repos/pin-tester/moved", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"name":"moved","owner":{"login":"someone-else"}}`)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	srv := httptest.NewServer(mux)
	orig := githubAPIBaseURL
	githubAPIBaseURL = srv.URL
	t.Cleanup(func() {
		githubAPIBaseURL = orig
		srv.Close()
	})
}

func TestPinnedRepos_SaveAndReflect(t *testing.T) {
	client := emulatorClient(t)
	mockGithubForPins(t)
	ctx := context.Background()

	uid := "pinned-repos-test-user-1"
	userRef := client.Collection("users").Doc(uid)
	if _, err := userRef.Set(ctx, map[string]interface{}{
		"screen_name":   "pin-tester",
		"auth_user_uid": "auth-uid-1",
	}); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() { userRef.Delete(context.Background()) })

	// 1) 正常保存(順序保持)
	rec := httptest.NewRecorder()
	if err := runPinnedRepos(ctx, rec, client, pinnedReposRequestBody{
		GithubID: uid, Repos: []string{"repo-b", "repo-a"},
	}, "auth-uid-1"); err != nil {
		t.Fatalf("runPinnedRepos: %v", err)
	}
	var resp struct {
		Status      string          `json:"status"`
		PinnedRepos []githubTopRepo `json:"pinned_repos"`
	}
	json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Status != "success" || len(resp.PinnedRepos) != 2 {
		t.Fatalf("save resp = %s", rec.Body.String())
	}
	if resp.PinnedRepos[0].Name != "repo-b" || resp.PinnedRepos[1].Stars != 12 {
		t.Errorf("pinned = %+v (順序・GitHub実値の検証)", resp.PinnedRepos)
	}

	// 2) githubStatsGo に反映される(source=pinned、本人順)
	//    github_stats キャッシュを直接置いてGitHubの/users系を呼ばせない。
	if _, err := userRef.Update(ctx, []firestore.Update{
		{Path: "github_stats", Value: githubStatsData{
			TopRepos:  []githubTopRepo{{Name: "star-top"}},
			Languages: []githubLangCount{},
		}},
		{Path: "github_stats_fetched_at", Value: time.Now()},
	}); err != nil {
		t.Fatalf("seed cache: %v", err)
	}
	rec = httptest.NewRecorder()
	if err := runGithubStats(ctx, rec, client, "pin-tester", time.Now()); err != nil {
		t.Fatalf("runGithubStats: %v", err)
	}
	var statsResp githubStatsResponse
	json.Unmarshal(rec.Body.Bytes(), &statsResp)
	if statsResp.TopReposSource != "pinned" || len(statsResp.TopRepos) != 2 ||
		statsResp.TopRepos[0].Name != "repo-b" {
		t.Errorf("stats resp = source=%s repos=%+v", statsResp.TopReposSource, statsResp.TopRepos)
	}

	// 3) 空配列で保存 = ピン解除 → スター上位に戻る
	rec = httptest.NewRecorder()
	if err := runPinnedRepos(ctx, rec, client, pinnedReposRequestBody{GithubID: uid}, "auth-uid-1"); err != nil {
		t.Fatalf("unpin: %v", err)
	}
	rec = httptest.NewRecorder()
	if err := runGithubStats(ctx, rec, client, "pin-tester", time.Now()); err != nil {
		t.Fatalf("runGithubStats after unpin: %v", err)
	}
	statsResp = githubStatsResponse{}
	json.Unmarshal(rec.Body.Bytes(), &statsResp)
	if statsResp.TopReposSource != "stars" || len(statsResp.TopRepos) != 1 ||
		statsResp.TopRepos[0].Name != "star-top" {
		t.Errorf("after unpin = source=%s repos=%+v", statsResp.TopReposSource, statsResp.TopRepos)
	}
}

func TestPinnedRepos_AuthAndValidation(t *testing.T) {
	client := emulatorClient(t)
	mockGithubForPins(t)
	ctx := context.Background()

	uid := "pinned-repos-test-user-2"
	userRef := client.Collection("users").Doc(uid)
	if _, err := userRef.Set(ctx, map[string]interface{}{
		"screen_name":   "pin-tester",
		"auth_user_uid": "auth-uid-2",
	}); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() { userRef.Delete(context.Background()) })

	assertNotSaved := func(label string) {
		t.Helper()
		snap, _ := userRef.Get(ctx)
		if _, err := snap.DataAt("pinned_repos"); err == nil {
			t.Errorf("%s: pinned_repos should NOT be written", label)
		}
	}

	// UID不一致 → 403・書き込み無し
	rec := httptest.NewRecorder()
	if err := runPinnedRepos(ctx, rec, client, pinnedReposRequestBody{
		GithubID: uid, Repos: []string{"repo-a"},
	}, "attacker-uid"); err != nil {
		t.Fatalf("mismatch: %v", err)
	}
	if rec.Code != http.StatusForbidden {
		t.Errorf("uid mismatch code = %d, want 403", rec.Code)
	}
	assertNotSaved("uid mismatch")

	// auth_user_uid 未設定 → 403
	uid3 := "pinned-repos-test-user-3"
	userRef3 := client.Collection("users").Doc(uid3)
	userRef3.Set(ctx, map[string]interface{}{"screen_name": "pin-tester"})
	t.Cleanup(func() { userRef3.Delete(context.Background()) })
	rec = httptest.NewRecorder()
	if err := runPinnedRepos(ctx, rec, client, pinnedReposRequestBody{
		GithubID: uid3, Repos: []string{"repo-a"},
	}, "any-uid"); err != nil {
		t.Fatalf("no auth uid: %v", err)
	}
	if rec.Code != http.StatusForbidden {
		t.Errorf("missing auth_user_uid code = %d, want 403", rec.Code)
	}

	// 存在しないリポジトリ → failed・書き込み無し
	rec = httptest.NewRecorder()
	if err := runPinnedRepos(ctx, rec, client, pinnedReposRequestBody{
		GithubID: uid, Repos: []string{"no-such-repo"},
	}, "auth-uid-2"); err != nil {
		t.Fatalf("missing repo: %v", err)
	}
	var resp map[string]interface{}
	json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp["status"] != "failed" {
		t.Errorf("missing repo resp = %v", resp)
	}
	assertNotSaved("missing repo")

	// owner不一致(移管済み等)→ failed・書き込み無し
	rec = httptest.NewRecorder()
	if err := runPinnedRepos(ctx, rec, client, pinnedReposRequestBody{
		GithubID: uid, Repos: []string{"moved"},
	}, "auth-uid-2"); err != nil {
		t.Fatalf("moved repo: %v", err)
	}
	resp = map[string]interface{}{}
	json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp["status"] != "failed" {
		t.Errorf("owner mismatch resp = %v", resp)
	}
	assertNotSaved("owner mismatch")
}
