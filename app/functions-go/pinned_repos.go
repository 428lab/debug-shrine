// ピン留めリポジトリ(代表リポジトリの本人指定)保存エンドポイント。
//
// 公開プロフィールの「GitHubの実績」内の代表リポジトリは、通常はスター上位の
// 自動選出(github_stats.go)だが、本人がリポジトリを指定(ピン留め)できる。
//
//	POST {github_id, repos: ["repo-name", ...]}(Bearer必須、最大6件)
//
// セキュリティ上のポイント:
//   - 書き込み系設定のため、IDトークンのUIDとユーザードキュメントの
//     auth_user_uid(registerGoがログイン毎に維持)の一致を必須にする
//     (他人のピンを書き換えられない)。
//   - 保存するメタデータ(スター数等)はクライアント申告ではなく、サーバーが
//     GitHub API(GET /repos/{owner}/{repo})で検証・取得した実値
//     (プロフィール上のスター数の自称詐称を防ぐ)。owner不一致は拒否。
package gofunctions

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	"google.golang.org/grpc/codes"
	grpcstatus "google.golang.org/grpc/status"
)

func init() {
	functions.HTTP("PinnedReposGo", pinnedReposHandler)
}

// maxPinnedRepos はピン留めの上限。GitHub本家のピン留め(6件)に合わせる。
const maxPinnedRepos = 6

// githubRepoNameRe はGitHubのリポジトリ名として妥当な形式
// (英数・ハイフン・アンダースコア・ドット、100文字以内)。
var githubRepoNameRe = regexp.MustCompile(`^[A-Za-z0-9._-]{1,100}$`)

type pinnedReposRequestBody struct {
	GithubID string   `json:"github_id"`
	Repos    []string `json:"repos"`
}

func pinnedReposHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed"})
		return
	}

	ctx := r.Context()

	var body pinnedReposRequestBody
	if err := decodeJSONBody(r, &body); err != nil {
		log.Printf("pinnedRepos: decodeJSONBody error: %v", err)
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "failed"})
		return
	}
	if body.GithubID == "" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed parameter"})
		return
	}

	token, ok := extractBearerToken(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "authorization missing."})
		return
	}
	authClient, err := getFirebaseAuthClient(ctx)
	if err != nil {
		log.Printf("pinnedRepos: getFirebaseAuthClient error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	decoded, err := authClient.VerifyIDToken(ctx, token)
	if err != nil {
		log.Printf("pinnedRepos: VerifyIDToken error: %v", err)
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "authorization missing."})
		return
	}

	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("pinnedRepos: getFirestoreClient error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := runPinnedRepos(ctx, w, client, body, decoded.UID); err != nil {
		log.Printf("pinnedRepos: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
	}
}

func runPinnedRepos(ctx context.Context, w http.ResponseWriter, client *firestore.Client, body pinnedReposRequestBody, authUID string) error {
	userRef := client.Collection("users").Doc(body.GithubID)
	userSnap, err := userRef.Get(ctx)
	if err != nil {
		if grpcstatus.Code(err) == codes.NotFound {
			writeJSON(w, http.StatusOK, map[string]string{"status": "failed", "message": "not registered"})
			return nil
		}
		return err
	}

	// 本人確認: トークンUIDとドキュメントの auth_user_uid の一致を必須にする。
	// auth_user_uid 未設定(registerGo を通っていない旧セッション)は再ログインを促す。
	var userData struct {
		AuthUserUID string `firestore:"auth_user_uid"`
		ScreenName  string `firestore:"screen_name"`
	}
	if err := userSnap.DataTo(&userData); err != nil {
		return err
	}
	if userData.AuthUserUID == "" || userData.AuthUserUID != authUID {
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "forbidden"})
		return nil
	}

	names, err := normalizePinnedRepoNames(body.Repos)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"status": "failed", "message": err.Error()})
		return nil
	}

	// 各リポジトリをGitHubで検証し、実データでメタデータを組み立てる。
	pinned := make([]githubTopRepo, 0, len(names))
	for _, name := range names {
		repo, err := fetchGithubRepo(ctx, userData.ScreenName, name)
		if err != nil {
			log.Printf("pinnedRepos: verify %s/%s failed: %v", userData.ScreenName, name, err)
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"status":  "failed",
				"message": fmt.Sprintf("repository not found: %s", name),
			})
			return nil
		}
		pinned = append(pinned, repo)
	}

	if _, err := userRef.Update(ctx, []firestore.Update{
		{Path: "pinned_repos", Value: pinned},
		{Path: "pinned_repos_updated_at", Value: time.Now()},
	}); err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":       "success",
		"pinned_repos": pinned,
	})
	return nil
}

// normalizePinnedRepoNames は名前の形式チェック・重複除去・件数制限を行う(純関数)。
func normalizePinnedRepoNames(repos []string) ([]string, error) {
	seen := map[string]bool{}
	names := make([]string, 0, len(repos))
	for _, name := range repos {
		if !githubRepoNameRe.MatchString(name) {
			return nil, fmt.Errorf("invalid repository name")
		}
		if seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	if len(names) > maxPinnedRepos {
		return nil, fmt.Errorf("too many repositories (max %d)", maxPinnedRepos)
	}
	return names, nil
}

// fetchGithubRepo は GET /repos/{owner}/{repo} で1件検証・取得する。
// owner がログイン本人でない場合(リダイレクト等で他人のリポジトリに解決された
// 場合を含む)はエラー。
func fetchGithubRepo(ctx context.Context, owner, name string) (githubTopRepo, error) {
	var repo struct {
		Name        string `json:"name"`
		HTMLURL     string `json:"html_url"`
		Description string `json:"description"`
		Stars       int64  `json:"stargazers_count"`
		Forks       int64  `json:"forks_count"`
		Language    string `json:"language"`
		Owner       struct {
			Login string `json:"login"`
		} `json:"owner"`
	}
	reqURL := fmt.Sprintf("%s/repos/%s/%s", githubAPIBaseURL, url.PathEscape(owner), url.PathEscape(name))
	if err := githubGetJSON(ctx, reqURL, &repo); err != nil {
		return githubTopRepo{}, err
	}
	if repo.Owner.Login != owner {
		return githubTopRepo{}, fmt.Errorf("owner mismatch: %s", repo.Owner.Login)
	}
	return githubTopRepo{
		Name:        repo.Name,
		HTMLURL:     repo.HTMLURL,
		Description: repo.Description,
		Stars:       repo.Stars,
		Forks:       repo.Forks,
		Language:    repo.Language,
	}, nil
}
