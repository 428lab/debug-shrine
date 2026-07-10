package gofunctions

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestAggregateGithubRepos(t *testing.T) {
	repos := []githubRepoAPI{
		{Name: "big", Stars: 100, Forks: 10, Language: "Go"},
		{Name: "mid", Stars: 30, Forks: 3, Language: "Go"},
		{Name: "small", Stars: 5, Forks: 0, Language: "JavaScript"},
		{Name: "nolang", Stars: 1, Forks: 0, Language: ""},
		{Name: "tiny1", Stars: 0, Forks: 0, Language: "Python"},
		{Name: "tiny2", Stars: 0, Forks: 0, Language: "Python"},
		// フォークはスター・言語・top_reposに入れない
		{Name: "forked", Stars: 9999, Forks: 500, Language: "Rust", Fork: true},
	}
	stats := aggregateGithubRepos(repos)

	if stats.OriginalCount != 6 || stats.ForkCount != 1 {
		t.Errorf("counts = %d/%d, want 6/1", stats.OriginalCount, stats.ForkCount)
	}
	if stats.StarsTotal != 136 || stats.ForksTotal != 13 {
		t.Errorf("stars/forks = %d/%d, want 136/13", stats.StarsTotal, stats.ForksTotal)
	}
	// 言語はリポジトリ数の降順(同数は名前順)。言語なしは数えない
	wantLangs := []githubLangCount{{"Go", 2}, {"Python", 2}, {"JavaScript", 1}}
	if len(stats.Languages) != len(wantLangs) {
		t.Fatalf("languages = %+v", stats.Languages)
	}
	for i, w := range wantLangs {
		if stats.Languages[i] != w {
			t.Errorf("languages[%d] = %+v, want %+v", i, stats.Languages[i], w)
		}
	}
	// top_repos はスター上位4件(フォーク除外)
	if len(stats.TopRepos) != 4 || stats.TopRepos[0].Name != "big" || stats.TopRepos[3].Name != "nolang" {
		t.Errorf("top_repos = %+v", stats.TopRepos)
	}
}

func TestAggregateGithubRepos_Empty(t *testing.T) {
	stats := aggregateGithubRepos(nil)
	if stats.OriginalCount != 0 || len(stats.Languages) != 0 || len(stats.TopRepos) != 0 {
		t.Errorf("empty stats = %+v", stats)
	}
	// JSONで null にならない(フロントの .map が壊れない)
	b, _ := json.Marshal(stats)
	var m map[string]interface{}
	json.Unmarshal(b, &m)
	if m["languages"] == nil || m["top_repos"] == nil {
		t.Errorf("languages/top_repos should be [] not null: %s", string(b))
	}
}

// GitHub APIをモックして fetchGithubStats の取得・ページングを検証する。
func TestFetchGithubStats_MockServer(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/users/tester", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"followers": 42, "public_repos": 150, "created_at": "2015-04-01T00:00:00Z"}`)
	})
	mux.HandleFunc("/users/tester/repos", func(w http.ResponseWriter, r *http.Request) {
		page := r.URL.Query().Get("page")
		if r.URL.Query().Get("per_page") != "100" || r.URL.Query().Get("type") != "owner" {
			t.Errorf("unexpected query: %s", r.URL.RawQuery)
		}
		switch page {
		case "1":
			// 100件返して次ページを引かせる
			repos := make([]map[string]interface{}, 100)
			for i := range repos {
				repos[i] = map[string]interface{}{
					"name": fmt.Sprintf("repo%d", i), "stargazers_count": 1, "language": "Go",
				}
			}
			json.NewEncoder(w).Encode(repos)
		case "2":
			fmt.Fprint(w, `[{"name":"last","stargazers_count":50,"language":"TypeScript"}]`)
		default:
			t.Errorf("unexpected page: %s", page)
			fmt.Fprint(w, `[]`)
		}
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	orig := githubAPIBaseURL
	githubAPIBaseURL = srv.URL
	defer func() { githubAPIBaseURL = orig }()

	stats, err := fetchGithubStats(context.Background(), "tester")
	if err != nil {
		t.Fatalf("fetchGithubStats: %v", err)
	}
	if stats.Followers != 42 || stats.PublicRepos != 150 {
		t.Errorf("user fields = %+v", stats)
	}
	if stats.OriginalCount != 101 || stats.StarsTotal != 150 {
		t.Errorf("aggregates = original=%d stars=%d, want 101/150", stats.OriginalCount, stats.StarsTotal)
	}
	if stats.Languages[0].Name != "Go" || stats.Languages[0].Count != 100 {
		t.Errorf("languages = %+v", stats.Languages)
	}
	if stats.TopRepos[0].Name != "last" || stats.TopRepos[0].Stars != 50 {
		t.Errorf("top repo = %+v", stats.TopRepos[0])
	}
	if stats.AccountCreatedAt != "2015-04-01T00:00:00Z" {
		t.Errorf("created_at = %q", stats.AccountCreatedAt)
	}
}

// エミュレータ統合: キャッシュの書き込みと再利用、GitHub障害時のstale応答。
func TestGithubStats_CacheAndStale(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	// モックGitHub(1回目だけ成功、以降500)
	calls := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/users/cache-tester", func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls > 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		fmt.Fprint(w, `{"followers": 7, "public_repos": 2, "created_at": "2020-01-01T00:00:00Z"}`)
	})
	mux.HandleFunc("/users/cache-tester/repos", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"name":"a","stargazers_count":3,"language":"Go"}]`)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	orig := githubAPIBaseURL
	githubAPIBaseURL = srv.URL
	defer func() { githubAPIBaseURL = orig }()

	uid := "github-stats-test-user-1"
	userRef := client.Collection("users").Doc(uid)
	if _, err := userRef.Set(ctx, map[string]interface{}{"screen_name": "cache-tester"}); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() { userRef.Delete(context.Background()) })

	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)

	// 1回目: GitHubから取得してキャッシュされる
	rec := httptest.NewRecorder()
	if err := runGithubStats(ctx, rec, client, "cache-tester", now); err != nil {
		t.Fatalf("first run: %v", err)
	}
	var resp githubStatsResponse
	json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Followers != 7 || resp.StarsTotal != 3 {
		t.Errorf("first resp = %+v", resp)
	}

	// 2回目(TTL内): GitHubを叩かずキャッシュから返る(callsが増えない)
	callsBefore := calls
	rec = httptest.NewRecorder()
	if err := runGithubStats(ctx, rec, client, "cache-tester", now.Add(time.Hour)); err != nil {
		t.Fatalf("second run: %v", err)
	}
	if calls != callsBefore {
		t.Errorf("cache hit should not call GitHub (calls %d -> %d)", callsBefore, calls)
	}

	// 3回目(TTL切れ・GitHubは500): staleキャッシュで応答する
	rec = httptest.NewRecorder()
	if err := runGithubStats(ctx, rec, client, "cache-tester", now.Add(7*time.Hour)); err != nil {
		t.Fatalf("third run: %v", err)
	}
	if rec.Code != 200 {
		t.Fatalf("stale response code = %d, want 200", rec.Code)
	}
	json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Followers != 7 {
		t.Errorf("stale resp = %+v", resp)
	}
}
