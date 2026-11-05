// Hugging Face の実績(マイページ・公開プロフィールの表示用)エンドポイント。
//
//	GET  ?user={screen_name}                      → 実績(ひも付けていなければ linked:false)
//	POST {github_id, hf_user}(Bearer 必須)       → ひも付け(hf_user が空なら外す)
//
// ひも付けの本人確認: Hugging Face のプロフィール設定の「GitHub username」は
// GET /api/users/{hf_user}/socials の socialHandles.github で公開されている。
// そこに書かれた GitHub 名と、このサイトにログインしている GitHub アカウント
// (screen_name)が一致したら認める。HF のプロフィールを書き換えられるのは HF の
// 本人だけ、このサイトの GitHub ログインは GitHub 側で本人確認済みなので、両方が
// 一致すればなりすましはできない(HF 側が GitHub 名を検証していなくてもよい)。
// 実績を取り直すたびに確かめ直し、合わなくなったら表示しない。
//
// ランキング(せんとうりょく)には入れない(使っている人が少なく不公平になるため)。
// HF の公開 API はレート制限があるので、結果はユーザードキュメントに 6 時間キャッシュする。
package gofunctions

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	"google.golang.org/grpc/codes"
	grpcstatus "google.golang.org/grpc/status"
)

func init() {
	functions.HTTP("HfStatsGo", hfStatsHandler)
}

// hfAPIBaseURL はテストでモックサーバーに差し替えるためのフック。
var hfAPIBaseURL = "https://huggingface.co"

var hfHTTPClient = &http.Client{Timeout: 10 * time.Second}

const hfStatsTTL = 6 * time.Hour

// hfRecentLimit は「最近更新したもの」に並べる数。
const hfRecentLimit = 5

// hfUserRe は HF のユーザー名として妥当な形式。
var hfUserRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$`)

// hfRepo は HF のリポジトリ一覧の 1 件(モデル・データセット・Space 共通)。
type hfRepo struct {
	ID               string `json:"id"`
	LastModified     string `json:"lastModified"`
	Likes            int64  `json:"likes"`
	Downloads        int64  `json:"downloads"`        // 直近 30 日
	DownloadsAllTime int64  `json:"downloadsAllTime"` // 累計(Space には無い)
}

type hfRecentRepo struct {
	ID           string `json:"id" firestore:"id"`
	Kind         string `json:"kind" firestore:"kind"` // model / dataset / space
	URL          string `json:"url" firestore:"url"`
	Likes        int64  `json:"likes" firestore:"likes"`
	Downloads    int64  `json:"downloads" firestore:"downloads"` // 累計(Space は 0)
	LastModified string `json:"last_modified" firestore:"last_modified"`
}

// hfStatsData はキャッシュとレスポンス共通の形。
type hfStatsData struct {
	Models         int64          `json:"models" firestore:"models"`
	Datasets       int64          `json:"datasets" firestore:"datasets"`
	Spaces         int64          `json:"spaces" firestore:"spaces"`
	LikesTotal     int64          `json:"likes_total" firestore:"likes_total"`
	DownloadsTotal int64          `json:"downloads_total" firestore:"downloads_total"` // モデルとデータセットの累計
	Followers      int64          `json:"followers" firestore:"followers"`
	CreatedAt      string         `json:"created_at" firestore:"created_at"`
	Recent         []hfRecentRepo `json:"recent" firestore:"recent"`
}

type hfStatsResponse struct {
	Linked bool   `json:"linked"`
	HfUser string `json:"hf_user,omitempty"`
	// Mismatch: ひも付けてあるが、HF のプロフィールの GitHub 名が合わなくなった
	Mismatch  bool         `json:"mismatch,omitempty"`
	Stats     *hfStatsData `json:"stats,omitempty"`
	FetchedAt string       `json:"fetched_at,omitempty"`
}

func hfStatsHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		w.WriteHeader(http.StatusNoContent)
		return
	}
	ctx := r.Context()
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("hfStats: getFirestoreClient error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if r.Method == http.MethodPost {
		var body struct {
			GithubID string `json:"github_id"`
			HfUser   string `json:"hf_user"`
		}
		if err := decodeJSONBody(r, &body); err != nil || body.GithubID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"status": "failed"})
			return
		}
		token, ok := extractBearerToken(r)
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "authorization missing."})
			return
		}
		authClient, err := getFirebaseAuthClient(ctx)
		if err != nil {
			log.Printf("hfStats: getFirebaseAuthClient error: %v", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		decoded, err := authClient.VerifyIDToken(ctx, token)
		if err != nil {
			writeJSON(w, http.StatusForbidden, map[string]string{"status": "authorization missing."})
			return
		}
		if err := runHfLink(ctx, w, client, body.GithubID, strings.TrimSpace(body.HfUser), decoded.UID, time.Now()); err != nil {
			log.Printf("hfStats: link: %v", err)
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	screenName := r.URL.Query().Get("user")
	if screenName == "" {
		writeError(w, http.StatusBadRequest, "user is required")
		return
	}
	if err := runHfStats(ctx, w, client, screenName, time.Now()); err != nil {
		log.Printf("hfStats: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
	}
}

// runHfLink はひも付ける(hfUser が空なら外す)。
func runHfLink(ctx context.Context, w http.ResponseWriter, client *firestore.Client, githubID, hfUser, authUID string, now time.Time) error {
	userRef := client.Collection("users").Doc(githubID)
	snap, err := userRef.Get(ctx)
	if err != nil {
		if grpcstatus.Code(err) == codes.NotFound {
			writeJSON(w, http.StatusOK, map[string]string{"status": "failed", "message": "not registered"})
			return nil
		}
		return err
	}
	var u struct {
		AuthUserUID string `firestore:"auth_user_uid"`
		ScreenName  string `firestore:"screen_name"`
	}
	if err := snap.DataTo(&u); err != nil {
		return err
	}
	// 本人確認(pinnedReposGo と同じ): トークンの UID とドキュメントの auth_user_uid
	if u.AuthUserUID == "" || u.AuthUserUID != authUID {
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "forbidden"})
		return nil
	}

	if hfUser == "" {
		_, err := userRef.Update(ctx, []firestore.Update{
			{Path: "hf_user", Value: firestore.Delete},
			{Path: "hf_stats", Value: firestore.Delete},
			{Path: "hf_stats_fetched_at", Value: firestore.Delete},
		})
		if err != nil {
			return err
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
		return nil
	}
	if !hfUserRe.MatchString(hfUser) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed", "message": "Hugging Face のユーザー名の形が正しくありません"})
		return nil
	}

	github, found, err := fetchHfGithubHandle(ctx, hfUser)
	if err != nil {
		log.Printf("hfStats: socials %s: %v", hfUser, err)
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed", "message": "Hugging Face に問い合わせられませんでした。時間をおいて試してください"})
		return nil
	}
	if !found {
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed", "message": "Hugging Face にそのユーザーが見つかりません"})
		return nil
	}
	if !hfGithubMatches(github, u.ScreenName) {
		writeJSON(w, http.StatusOK, map[string]string{
			"status":  "failed",
			"message": fmt.Sprintf("Hugging Face のプロフィール設定の「GitHub username」を %s にしてから、もう一度試してください", u.ScreenName),
		})
		return nil
	}

	stats, err := fetchHfStats(ctx, hfUser)
	if err != nil {
		log.Printf("hfStats: fetch %s: %v", hfUser, err)
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed", "message": "Hugging Face の実績を読めませんでした。時間をおいて試してください"})
		return nil
	}
	if _, err := userRef.Update(ctx, []firestore.Update{
		{Path: "hf_user", Value: hfUser},
		{Path: "hf_stats", Value: stats},
		{Path: "hf_stats_fetched_at", Value: now},
	}); err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "success",
		"result": hfStatsResponse{Linked: true, HfUser: hfUser, Stats: &stats, FetchedAt: now.UTC().Format(time.RFC3339)},
	})
	return nil
}

func runHfStats(ctx context.Context, w http.ResponseWriter, client *firestore.Client, screenName string, now time.Time) error {
	userDoc, err := findUserByScreenName(ctx, client, screenName)
	if err != nil {
		return err
	}
	if userDoc == nil {
		writeError(w, http.StatusNotFound, "user not registered.")
		return nil
	}
	hfUser, _ := dataString(userDoc, "hf_user")
	if hfUser == "" {
		writeHfStatsResponse(w, hfStatsResponse{Linked: false})
		return nil
	}

	cached, fetchedAt := readHfStatsCache(userDoc)
	if cached != nil && now.Sub(fetchedAt) < hfStatsTTL {
		writeHfStatsResponse(w, hfStatsResponse{Linked: true, HfUser: hfUser, Stats: cached, FetchedAt: fetchedAt.UTC().Format(time.RFC3339)})
		return nil
	}

	// 取り直す時は、ひも付けが今も正しいか確かめ直す
	github, found, err := fetchHfGithubHandle(ctx, hfUser)
	if err == nil && (!found || !hfGithubMatches(github, screenName)) {
		writeHfStatsResponse(w, hfStatsResponse{Linked: false, HfUser: hfUser, Mismatch: true})
		return nil
	}
	var stats hfStatsData
	if err == nil {
		stats, err = fetchHfStats(ctx, hfUser)
	}
	if err != nil {
		// HF 側の失敗。古いキャッシュがあればそれで凌ぐ(表示は鮮度より可用性を優先)
		log.Printf("hfStats: fetch %s failed: %v", hfUser, err)
		if cached != nil {
			writeHfStatsResponse(w, hfStatsResponse{Linked: true, HfUser: hfUser, Stats: cached, FetchedAt: fetchedAt.UTC().Format(time.RFC3339)})
			return nil
		}
		writeError(w, http.StatusBadGateway, "failed to fetch hugging face stats")
		return nil
	}
	if _, err := userDoc.Ref.Update(ctx, []firestore.Update{
		{Path: "hf_stats", Value: stats},
		{Path: "hf_stats_fetched_at", Value: now},
	}); err != nil {
		return err
	}
	writeHfStatsResponse(w, hfStatsResponse{Linked: true, HfUser: hfUser, Stats: &stats, FetchedAt: now.UTC().Format(time.RFC3339)})
	return nil
}

func writeHfStatsResponse(w http.ResponseWriter, res hfStatsResponse) {
	// 公開データ・user でキー分離。Firestore で 6h キャッシュするので CDN は短め
	// (ひも付けた直後に公開ページへ早く出るように)
	w.Header().Set("Cache-Control", "public, max-age=60, s-maxage=600, stale-while-revalidate=3600")
	writeJSON(w, http.StatusOK, res)
}

func dataString(doc *firestore.DocumentSnapshot, path string) (string, bool) {
	v, err := doc.DataAt(path)
	if err != nil {
		return "", false
	}
	s, ok := v.(string)
	return s, ok
}

func readHfStatsCache(doc *firestore.DocumentSnapshot) (*hfStatsData, time.Time) {
	v, err := doc.DataAt("hf_stats_fetched_at")
	if err != nil {
		return nil, time.Time{}
	}
	fetchedAt, ok := v.(time.Time)
	if !ok {
		return nil, time.Time{}
	}
	raw, err := doc.DataAt("hf_stats")
	if err != nil || raw == nil {
		return nil, time.Time{}
	}
	b, err := json.Marshal(raw)
	if err != nil {
		return nil, time.Time{}
	}
	var stats hfStatsData
	if err := json.Unmarshal(b, &stats); err != nil {
		return nil, time.Time{}
	}
	return &stats, fetchedAt
}

// hfGithubMatches は HF のプロフィールの GitHub 名とログイン中の GitHub 名が同じか
// (GitHub の名前は大文字・小文字を区別しない。URL や @ 付きで書かれていても読む)。
func hfGithubMatches(hfGithub, screenName string) bool {
	h := strings.TrimSpace(hfGithub)
	h = strings.TrimPrefix(h, "@")
	if i := strings.LastIndex(h, "github.com/"); i >= 0 {
		h = h[i+len("github.com/"):]
	}
	h = strings.Trim(h, "/")
	return h != "" && strings.EqualFold(h, screenName)
}

// fetchHfGithubHandle は HF のプロフィールに書かれた GitHub 名を読む。
// found=false はユーザーがいない(404)。
func fetchHfGithubHandle(ctx context.Context, hfUser string) (string, bool, error) {
	var res struct {
		SocialHandles struct {
			Github string `json:"github"`
		} `json:"socialHandles"`
	}
	status, err := hfGetJSON(ctx, fmt.Sprintf("%s/api/users/%s/socials", hfAPIBaseURL, url.PathEscape(hfUser)), &res)
	if status == http.StatusNotFound {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return res.SocialHandles.Github, true, nil
}

// fetchHfStats はユーザーの概要と、モデル・データセット・Space の一覧から実績を組む。
func fetchHfStats(ctx context.Context, hfUser string) (hfStatsData, error) {
	var overview struct {
		NumModels    int64  `json:"numModels"`
		NumDatasets  int64  `json:"numDatasets"`
		NumSpaces    int64  `json:"numSpaces"`
		NumFollowers int64  `json:"numFollowers"`
		CreatedAt    string `json:"createdAt"`
	}
	if _, err := hfGetJSON(ctx, fmt.Sprintf("%s/api/users/%s/overview", hfAPIBaseURL, url.PathEscape(hfUser)), &overview); err != nil {
		return hfStatsData{}, err
	}
	lists := map[string][]hfRepo{}
	for _, kind := range []string{"models", "datasets", "spaces"} {
		q := url.Values{}
		q.Set("author", hfUser)
		q.Set("limit", "100")
		q.Set("sort", "lastModified")
		q.Set("direction", "-1")
		for _, f := range []string{"likes", "lastModified", "downloads", "downloadsAllTime"} {
			if kind == "spaces" && strings.HasPrefix(f, "downloads") {
				continue // Space にダウンロード数は無い
			}
			q.Add("expand[]", f)
		}
		var repos []hfRepo
		if _, err := hfGetJSON(ctx, fmt.Sprintf("%s/api/%s?%s", hfAPIBaseURL, kind, q.Encode()), &repos); err != nil {
			return hfStatsData{}, err
		}
		lists[kind] = repos
	}
	stats := aggregateHfRepos(lists["models"], lists["datasets"], lists["spaces"])
	stats.Models = overview.NumModels
	stats.Datasets = overview.NumDatasets
	stats.Spaces = overview.NumSpaces
	stats.Followers = overview.NumFollowers
	stats.CreatedAt = overview.CreatedAt
	return stats, nil
}

// aggregateHfRepos は一覧から合計と最近更新したものを出す(純関数)。
// 一覧はそれぞれ最大 100 件(最近更新した順)なので、それ以上持つ人の合計は少なめに出る。
func aggregateHfRepos(models, datasets, spaces []hfRepo) hfStatsData {
	stats := hfStatsData{Recent: []hfRecentRepo{}}
	var all []hfRecentRepo
	add := func(kind string, repos []hfRepo) {
		for _, r := range repos {
			stats.LikesTotal += r.Likes
			dl := r.DownloadsAllTime
			if dl < r.Downloads {
				dl = r.Downloads
			}
			stats.DownloadsTotal += dl
			all = append(all, hfRecentRepo{ID: r.ID, Kind: kind, URL: hfRepoURL(kind, r.ID), Likes: r.Likes, Downloads: dl, LastModified: r.LastModified})
		}
	}
	add("model", models)
	add("dataset", datasets)
	add("space", spaces)
	sort.SliceStable(all, func(i, j int) bool { return all[i].LastModified > all[j].LastModified })
	if len(all) > hfRecentLimit {
		all = all[:hfRecentLimit]
	}
	stats.Recent = append(stats.Recent, all...)
	return stats
}

func hfRepoURL(kind, id string) string {
	switch kind {
	case "dataset":
		return "https://huggingface.co/datasets/" + id
	case "space":
		return "https://huggingface.co/spaces/" + id
	}
	return "https://huggingface.co/" + id
}

// hfGetJSON は HF の公開 API への GET(認証なし)。HTTP の状態コードも返す。
func hfGetJSON(ctx context.Context, reqURL string, out any) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", "debug-shrine-hfStatsGo")
	resp, err := hfHTTPClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return resp.StatusCode, err
	}
	if resp.StatusCode != http.StatusOK {
		return resp.StatusCode, fmt.Errorf("hf api %s: status %d", reqURL, resp.StatusCode)
	}
	return resp.StatusCode, json.Unmarshal(body, out)
}
