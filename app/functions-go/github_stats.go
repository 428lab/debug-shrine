// GitHub実績統計(ポートフォリオ用)エンドポイント。
//
// GitHub公開APIからユーザーの公開リポジトリ・スター・フォロワー等を取得し、
// ポートフォリオ表示用に集計して返す(表示: web/components/GithubStats.vue)。
//
//	GET ?user={screen_name}
//
// GitHub APIのレート制限(OAuth App認証で5000req/h)を守るため、集計結果は
// ユーザードキュメントに6時間キャッシュする。GitHub側の障害時はキャッシュが
// 古くてもそれを返す(ポートフォリオ表示は鮮度より可用性を優先)。
package gofunctions

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"sort"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
)

func init() {
	functions.HTTP("GithubStatsGo", githubStatsHandler)
}

// githubStatsTTL はFirestoreキャッシュの有効期間。リポジトリ統計は分単位で
// 変わるものではないため長めに取り、GitHub APIへの到達を抑える。
const githubStatsTTL = 6 * time.Hour

// githubRepoAPI は GET /users/{login}/repos の1件から使うフィールド。
type githubRepoAPI struct {
	Name        string `json:"name"`
	HTMLURL     string `json:"html_url"`
	Description string `json:"description"`
	Stars       int64  `json:"stargazers_count"`
	Forks       int64  `json:"forks_count"`
	Language    string `json:"language"`
	Fork        bool   `json:"fork"`
}

// githubUserAPI は GET /users/{login} から使うフィールド。
type githubUserAPI struct {
	Followers   int64  `json:"followers"`
	PublicRepos int64  `json:"public_repos"`
	CreatedAt   string `json:"created_at"`
}

type githubLangCount struct {
	Name  string `json:"name" firestore:"name"`
	Count int64  `json:"count" firestore:"count"`
}

type githubTopRepo struct {
	Name        string `json:"name" firestore:"name"`
	HTMLURL     string `json:"html_url" firestore:"html_url"`
	Description string `json:"description" firestore:"description"`
	Stars       int64  `json:"stars" firestore:"stars"`
	Forks       int64  `json:"forks" firestore:"forks"`
	Language    string `json:"language" firestore:"language"`
}

// githubStatsData はFirestoreキャッシュとレスポンス双方の形。
type githubStatsData struct {
	Followers        int64             `json:"followers" firestore:"followers"`
	PublicRepos      int64             `json:"public_repos" firestore:"public_repos"`
	AccountCreatedAt string            `json:"account_created_at" firestore:"account_created_at"`
	OriginalCount    int64             `json:"original_count" firestore:"original_count"`
	ForkCount        int64             `json:"fork_count" firestore:"fork_count"`
	StarsTotal       int64             `json:"stars_total" firestore:"stars_total"`
	ForksTotal       int64             `json:"forks_total" firestore:"forks_total"`
	Languages        []githubLangCount `json:"languages" firestore:"languages"`
	TopRepos         []githubTopRepo   `json:"top_repos" firestore:"top_repos"`
}

type githubStatsResponse struct {
	githubStatsData
	FetchedAt string `json:"fetched_at"`
}

func githubStatsHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	screenName := r.URL.Query().Get("user")
	if screenName == "" {
		writeError(w, http.StatusBadRequest, "user is required")
		return
	}

	ctx := r.Context()
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("githubStats: getFirestoreClient error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := runGithubStats(ctx, w, client, screenName, time.Now()); err != nil {
		log.Printf("githubStats: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
	}
}

func runGithubStats(ctx context.Context, w http.ResponseWriter, client *firestore.Client, screenName string, now time.Time) error {
	userDoc, err := findUserByScreenName(ctx, client, screenName)
	if err != nil {
		return err
	}
	if userDoc == nil {
		writeError(w, http.StatusNotFound, "user not registered.")
		return nil
	}

	cached, fetchedAt := readGithubStatsCache(userDoc)
	if cached != nil && now.Sub(fetchedAt) < githubStatsTTL {
		writeGithubStatsResponse(w, *cached, fetchedAt)
		return nil
	}

	stats, err := fetchGithubStats(ctx, screenName)
	if err != nil {
		// GitHub側の失敗。古いキャッシュがあればそれで凌ぐ(可用性優先)。
		if cached != nil {
			log.Printf("githubStats: fetch failed, serving stale cache: %v", err)
			writeGithubStatsResponse(w, *cached, fetchedAt)
			return nil
		}
		log.Printf("githubStats: fetch failed with no cache: %v", err)
		writeError(w, http.StatusBadGateway, "failed to fetch github stats")
		return nil
	}

	if _, err := userDoc.Ref.Update(ctx, []firestore.Update{
		{Path: "github_stats", Value: stats},
		{Path: "github_stats_fetched_at", Value: now},
	}); err != nil {
		return err
	}

	writeGithubStatsResponse(w, stats, now)
	return nil
}

func writeGithubStatsResponse(w http.ResponseWriter, stats githubStatsData, fetchedAt time.Time) {
	// 公開データ・userでキー分離。Firestore側で6hキャッシュするためCDNも長めで良い。
	w.Header().Set("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400")
	writeJSON(w, http.StatusOK, githubStatsResponse{
		githubStatsData: stats,
		FetchedAt:       fetchedAt.UTC().Format(time.RFC3339),
	})
}

func readGithubStatsCache(userDoc *firestore.DocumentSnapshot) (*githubStatsData, time.Time) {
	v, err := userDoc.DataAt("github_stats_fetched_at")
	if err != nil {
		return nil, time.Time{}
	}
	fetchedAt, ok := v.(time.Time)
	if !ok {
		return nil, time.Time{}
	}
	raw, err := userDoc.DataAt("github_stats")
	if err != nil || raw == nil {
		return nil, time.Time{}
	}
	// Firestoreのmapを構造体へ移し替える(JSON経由が最も単純で安全)。
	b, err := json.Marshal(raw)
	if err != nil {
		return nil, time.Time{}
	}
	var stats githubStatsData
	if err := json.Unmarshal(b, &stats); err != nil {
		return nil, time.Time{}
	}
	return &stats, fetchedAt
}

// fetchGithubStats はGitHub公開APIからユーザー情報と全ownerリポジトリを取得して集計する。
func fetchGithubStats(ctx context.Context, login string) (githubStatsData, error) {
	var user githubUserAPI
	if err := githubGetJSON(ctx, fmt.Sprintf("%s/users/%s", githubAPIBaseURL, url.PathEscape(login)), &user); err != nil {
		return githubStatsData{}, err
	}

	// ownerリポジトリを最大3ページ(300件)まで取得。それ以上持つユーザーは稀で、
	// スター上位・言語割合の傾向は300件で十分に出る。
	var repos []githubRepoAPI
	for page := 1; page <= 3; page++ {
		var batch []githubRepoAPI
		reqURL := fmt.Sprintf(
			"%s/users/%s/repos?per_page=100&type=owner&sort=pushed&page=%d",
			githubAPIBaseURL, url.PathEscape(login), page,
		)
		if err := githubGetJSON(ctx, reqURL, &batch); err != nil {
			return githubStatsData{}, err
		}
		repos = append(repos, batch...)
		if len(batch) < 100 {
			break
		}
	}

	stats := aggregateGithubRepos(repos)
	stats.Followers = user.Followers
	stats.PublicRepos = user.PublicRepos
	stats.AccountCreatedAt = user.CreatedAt
	return stats, nil
}

// aggregateGithubRepos はリポジトリ一覧から統計を集計する(純関数)。
//   - スター/フォーク合計・言語割合は本人作(非フォーク)のみを数える
//     (フォークのスターや言語は本人の実績ではないため)
//   - top_repos はスター数上位4件(同数はそのままの順=pushed順)
func aggregateGithubRepos(repos []githubRepoAPI) githubStatsData {
	stats := githubStatsData{
		Languages: []githubLangCount{},
		TopRepos:  []githubTopRepo{},
	}
	langs := map[string]int64{}
	var originals []githubRepoAPI
	for _, r := range repos {
		if r.Fork {
			stats.ForkCount++
			continue
		}
		stats.OriginalCount++
		stats.StarsTotal += r.Stars
		stats.ForksTotal += r.Forks
		if r.Language != "" {
			langs[r.Language]++
		}
		originals = append(originals, r)
	}

	for name, count := range langs {
		stats.Languages = append(stats.Languages, githubLangCount{Name: name, Count: count})
	}
	sort.Slice(stats.Languages, func(i, j int) bool {
		if stats.Languages[i].Count != stats.Languages[j].Count {
			return stats.Languages[i].Count > stats.Languages[j].Count
		}
		return stats.Languages[i].Name < stats.Languages[j].Name
	})

	sort.SliceStable(originals, func(i, j int) bool { return originals[i].Stars > originals[j].Stars })
	for i, r := range originals {
		if i >= 4 {
			break
		}
		stats.TopRepos = append(stats.TopRepos, githubTopRepo{
			Name:        r.Name,
			HTMLURL:     r.HTMLURL,
			Description: r.Description,
			Stars:       r.Stars,
			Forks:       r.Forks,
			Language:    r.Language,
		})
	}
	return stats
}

// githubGetJSON はGitHub APIへの認証付きGET(sanpai.go fetchGitHubFeed と同じ流儀)。
func githubGetJSON(ctx context.Context, reqURL string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "debug-shrine-githubStatsGo")
	clientID := os.Getenv("GITHUB_CLIENT_ID")
	clientSecret := os.Getenv("GITHUB_CLIENT_SECRET")
	if clientID != "" && clientSecret != "" {
		req.SetBasicAuth(clientID, clientSecret)
	}

	resp, err := githubHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("github api %s: status %d: %s", reqURL, resp.StatusCode, string(body))
	}
	return json.Unmarshal(body, out)
}
