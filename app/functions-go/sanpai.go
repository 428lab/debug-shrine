// 参拝処理(sanpai)エンドポイントのGo実装。
//
// Node版(app/functions/index.js の exports.sanpai)からの移植であり、
// コールドスタートを短縮するために Go/Cloud Run functions として個別に
// デプロイする(関数名は sanpaiGo。既存の sanpai(Node) とは別関数として
// 共存させ、フロントエンドの切替タイミングを制御できるようにしている)。
//
// 挙動はNode版と同一にすることを優先し、独自の改善は入れていない。
// 検証中に見つかった既存(Node版)の挙動上の注意点は docs/backend.md
// 「sanpai エンドポイントのGo移植」を参照。
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
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	"google.golang.org/grpc/codes"
	grpcstatus "google.golang.org/grpc/status"

	"github.com/428lab/debug-shrine/functions-go/internal/performance"
)

func init() {
	functions.HTTP("SanpaiGo", sanpaiHandler)
}

// bonusBranches はNode版 bonus_branchs と同一のパターン一覧。
// 各パターンは "^" + pattern + "$" として repo.name に照合する。
var bonusBranches = []string{
	"428lab/.*",
	"nostr-jp/.*",
	"penpenpng/rx-nostr",
	"akiomik/nosvelte",
}

var bonusBranchRegexps = compileBonusBranchRegexps(bonusBranches)

func compileBonusBranchRegexps(patterns []string) []*regexp.Regexp {
	res := make([]*regexp.Regexp, 0, len(patterns))
	for _, p := range patterns {
		res = append(res, regexp.MustCompile("^"+p+"$"))
	}
	return res
}

func matchesBonusBranch(repoName string) bool {
	for _, re := range bonusBranchRegexps {
		if re.MatchString(repoName) {
			return true
		}
	}
	return false
}

// sanpaiConfig は Node版 sanpai 定数(add_point/next_time)相当。
// next_time はプロジェクト(dev/prod)ごとに値が異なるため、Node版の
// `projectID == 'd-shrine' ? 300 : 60` を再現する代わりに、デプロイ時に
// 環境変数で明示的に注入する(dev: 60, prod: 300)。
type sanpaiConfig struct {
	AddPoint int
	NextTime int // seconds
}

func loadSanpaiConfig() sanpaiConfig {
	nextTime := 60
	if v := os.Getenv("SANPAI_NEXT_TIME_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			nextTime = n
		}
	}
	return sanpaiConfig{AddPoint: 1, NextTime: nextTime}
}

var (
	firebaseAuthOnce   sync.Once
	firebaseAuthClient *auth.Client
	firebaseAuthErr    error
)

func getFirebaseAuthClient(ctx context.Context) (*auth.Client, error) {
	firebaseAuthOnce.Do(func() {
		app, err := firebase.NewApp(ctx, nil)
		if err != nil {
			firebaseAuthErr = err
			return
		}
		firebaseAuthClient, firebaseAuthErr = app.Auth(ctx)
	})
	return firebaseAuthClient, firebaseAuthErr
}

// Node版(axios)はクライアント側タイムアウトを設定していないため、Go版も揃える
// (呼び出し全体の上限は Cloud Run functions のリクエストタイムアウト設定で担保する)。
var githubHTTPClient = &http.Client{}

// githubAPIBaseURL はテストでモックサーバーに差し替えるためのフック。
var githubAPIBaseURL = "https://api.github.com"

// githubEvent は GitHub Events API のイベントのうち、sanpai のロジックが
// 参照するフィールドのみを表す(保存には元のraw JSONバイト列をそのまま使う)。
type githubEvent struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	CreatedAt string `json:"created_at"`
	Payload   any    `json:"payload"`
	Repo      struct {
		Name string `json:"name"`
	} `json:"repo"`
}

// feedItem は1件のアクティビティを、フィルタ・保存双方に必要な形でまとめたもの。
type feedItem struct {
	Raw   json.RawMessage
	Event githubEvent
}

// fetchGitHubFeed は GitHub Events API から公開アクティビティを取得する
// (Node版 get_feed と同一のURL・クエリパラメータ)。
func fetchGitHubFeed(ctx context.Context, username string) ([]feedItem, error) {
	clientID := os.Getenv("GITHUB_CLIENT_ID")
	clientSecret := os.Getenv("GITHUB_CLIENT_SECRET")

	reqURL := fmt.Sprintf(
		"%s/users/%s/events/public?per_page=100",
		githubAPIBaseURL, url.PathEscape(username),
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	// GitHub API は User-Agent ヘッダーが無いリクエストを拒否するため必須。
	req.Header.Set("User-Agent", "debug-shrine-sanpaiGo")
	// OAuth Appの資格情報はBasic認証ヘッダーで送る。旧来のクエリパラメータ認証
	// (?client_id=...&client_secret=...)は2021-05-05にGitHub APIから撤廃されており、
	// 付けても単に無視されて未認証(IPごと60req/h)として扱われるため、
	// 認証済みのレート制限(5000req/h)を得るにはヘッダーで送る必要がある。
	// https://docs.github.com/en/rest/overview/authenticating-to-the-rest-api
	if clientID != "" && clientSecret != "" {
		req.SetBasicAuth(clientID, clientSecret)
	}

	resp, err := githubHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	log.Printf(
		"GitHub X-RateLimit-Limit: %s, X-RateLimit-Reset: %s, X-RateLimit-Used: %s",
		resp.Header.Get("X-RateLimit-Limit"), resp.Header.Get("X-RateLimit-Reset"), resp.Header.Get("X-RateLimit-Used"),
	)

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github events api: status %d: %s", resp.StatusCode, string(respBody))
	}

	var raws []json.RawMessage
	if err := json.Unmarshal(respBody, &raws); err != nil {
		return nil, err
	}
	items := make([]feedItem, len(raws))
	for i, r := range raws {
		items[i].Raw = r
		if err := json.Unmarshal(r, &items[i].Event); err != nil {
			return nil, err
		}
	}
	return items, nil
}

type sanpaiRequestBody struct {
	GithubID   string `json:"github_id"`
	ScreenName string `json:"screen_name"`
}

func sanpaiHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	ctx := r.Context()

	// Node版はExpressのbody-parserがルートハンドラ本体(メソッドチェックや
	// 認証チェックより前)でリクエストボディをパースするため、不正なJSONの
	// 場合はそれらに到達する前に400を返す。Go版もその順序を揃える。
	var body sanpaiRequestBody
	if err := decodeJSONBody(r, &body); err != nil {
		log.Printf("sanpai: decodeJSONBody error: %v", err)
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "failed"})
		return
	}

	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed"})
		return
	}

	token, ok := extractBearerToken(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "authorization missing."})
		return
	}

	authClient, err := getFirebaseAuthClient(ctx)
	if err != nil {
		log.Printf("sanpai: getFirebaseAuthClient error: %v", err)
		writeJSON(w, http.StatusOK, map[string]string{"status": "missing server error."})
		return
	}
	if _, err := authClient.VerifyIDToken(ctx, token); err != nil {
		log.Printf("sanpai: VerifyIDToken error: %v", err)
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "authorization missing."})
		return
	}

	if body.GithubID == "" || body.ScreenName == "" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed parameter"})
		return
	}

	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("sanpai: getFirestoreClient error: %v", err)
		writeJSON(w, http.StatusOK, map[string]string{"status": "missing server error."})
		return
	}

	if err := runSanpai(ctx, w, client, body); err != nil {
		log.Printf("sanpai: transaction failure: %v", err)
		writeJSON(w, http.StatusOK, map[string]string{"status": "missing server error."})
	}
}

func extractBearerToken(r *http.Request) (string, bool) {
	h := r.Header.Get("Authorization")
	if h == "" {
		return "", false
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(h, prefix) {
		return "", false
	}
	return strings.TrimPrefix(h, prefix), true
}

// sanpaiUserDocument は users/{id} ドキュメントのうち sanpai が参照するフィールド。
//
// status キャッシュ(status フィールド)は意図的にこの struct に含めない。
// 旧バージョンのキャッシュはフィールドの型が現行の firestoreStatus と一致しない場合があり
// (詳細は decodeCurrentStatusCache 参照)、ドキュメント全体を一括デコードすると型不一致で
// デコード全体が失敗して参拝処理全体が中断してしまう。status は decodeCurrentStatusCache で
// 個別に(現行バージョン時のみ)デコードする。
type sanpaiUserDocument struct {
	DisplayName           string    `firestore:"display_name"`
	ScreenName            string    `firestore:"screen_name"`
	ImagePath             string    `firestore:"image_path"`
	Exp                   int64     `firestore:"exp"`
	LastSanpai            time.Time `firestore:"last_sanpai"`
	LastActivityCreatedAt string    `firestore:"last_activity_created_at"`
	StatusVersion         int64     `firestore:"status_version"`
}

// runSanpai は参拝処理の本体。エラーを返した場合は呼び出し元で
// "missing server error." として応答する(Node版の外側try/catchに相当)。
// 正常系(failed/expire/noaction/successいずれも)のレスポンス送信はこの関数内で完結する。
func runSanpai(ctx context.Context, w http.ResponseWriter, client *firestore.Client, body sanpaiRequestBody) error {
	cfg := loadSanpaiConfig()
	userRef := client.Collection("users").Doc(body.GithubID)

	userSnap, err := userRef.Get(ctx)
	if err != nil {
		if grpcstatus.Code(err) == codes.NotFound {
			writeJSON(w, http.StatusOK, map[string]string{"status": "failed", "message": "not registered"})
			return nil
		}
		return err
	}

	var userData sanpaiUserDocument
	if err := userSnap.DataTo(&userData); err != nil {
		return err
	}

	// status キャッシュは現行バージョンのときだけ厳密デコードする(旧フォーマットは
	// 触らず下の全件再計算で作り直す。詳細は decodeCurrentStatusCache 参照)。
	cachedStatus, err := decodeCurrentStatusCache(userSnap, userData.StatusVersion)
	if err != nil {
		return err
	}

	addExp := cfg.AddPoint
	hasLastSanpai := !userData.LastSanpai.IsZero()

	if hasLastSanpai {
		// Node版は Firestore Timestamp の整数秒(.seconds、ナノ秒切り捨て)同士を比較するため、
		// Go側も time.Time の丸め込みではなく Unix()(整数秒)で揃える。
		if userData.LastSanpai.Unix()+int64(cfg.NextTime) > time.Now().Unix() {
			writeJSON(w, http.StatusOK, map[string]interface{}{"status": "expire", "add_exp": 0, "next_time": cfg.NextTime})
			return nil
		}
	}

	feed, err := fetchGitHubFeed(ctx, userData.ScreenName)
	if err != nil {
		// Node版はGitHub取得失敗時に例外化し外側catchで "missing server error." になる。
		return err
	}

	var since time.Time
	if hasLastSanpai {
		since = userData.LastSanpai
	} else {
		since, _ = time.Parse(time.RFC3339, "2008-04-01T00:00:00Z")
	}

	var splited []feedItem
	for _, it := range feed {
		created, err := time.Parse(time.RFC3339, it.Event.CreatedAt)
		if err != nil {
			continue
		}
		if created.After(since) {
			splited = append(splited, it)
		}
	}

	addExp += len(splited) / 5
	for _, it := range splited {
		if matchesBonusBranch(it.Event.Repo.Name) {
			addExp++
		}
	}

	if len(splited) == 0 {
		writeJSON(w, http.StatusOK, map[string]interface{}{"status": "noaction", "add_exp": 0})
		return nil
	}

	// アクティビティ反映
	batch := client.Batch()
	activityColl := userRef.Collection("github_activities")
	for _, it := range splited {
		docRef := activityColl.Doc(it.Event.ID)
		batch.Set(docRef, map[string]interface{}{
			"id":         it.Event.ID,
			"type":       it.Event.Type,
			"created_at": it.Event.CreatedAt,
			"raw":        string(it.Raw),
		})
	}
	if _, err := batch.Commit(ctx); err != nil {
		return err
	}

	// 意図的な省略: Node版にはここに「2022/1/1〜1/3はポイント3倍」という
	// 期間限定ボーナス(get_bonus_mag/msg)があるが、判定基準の date_now が
	// Node側でコールドスタート時刻に固定される実装のため、対象期間(2022年)を
	// 過ぎた現在は常に等倍(bonus_mag=1, msg="")になり実害がない。将来にわたり
	// 再度真になることのない期間限定ロジックのため、Go版では意図的に移植せず
	// msg は常に空文字とする(詳細は docs/backend.md 参照)。

	// 参拝可能時間のロックのため last_sanpai を先に確定させる
	// (exp/status は計算後の下の update でまとめて反映する)
	if _, err := userRef.Update(ctx, []firestore.Update{
		{Path: "last_sanpai", Value: firestore.ServerTimestamp},
	}); err != nil {
		return err
	}

	if _, _, err := userRef.Collection("sanpai_logs").Add(ctx, map[string]interface{}{
		"add_point": addExp,
		"timestamp": firestore.ServerTimestamp,
	}); err != nil {
		return err
	}

	newExp := int(userData.Exp) + addExp

	activities := make([]performance.Activity, len(splited))
	for i, it := range splited {
		activities[i] = performance.Activity{Type: it.Event.Type, CreatedAt: it.Event.CreatedAt, Payload: it.Event.Payload}
	}

	var rawUserData performance.RawUserData
	var lastActivityCreatedAt string
	if statusCacheIsCurrent(cachedStatus, userData.StatusVersion) && userData.LastActivityCreatedAt != "" {
		// 保存済みステータスに新着分だけを加算(全件再集計しない)。
		// splited は「created_at > last_sanpai」で抽出した未集計イベントのみ、
		// last_activity_created_at は累積済みイベントの最大時刻であり、
		// ComputePerformanceIncrement の不変条件(新着は累積分より後)を満たす。
		//
		// status_version が古いキャッシュ(旧ロジックで計算)を基準に増分すると
		// 過去分の誤りを現行バージョンとして固定化してしまうため、その場合は
		// この分岐に入らず下の全件再計算パスに落として基準ごと作り直す。
		baseUserData := performance.RawUserDataFromStatus(fromFirestoreStatus(*cachedStatus).FormattedPerformance, userData.ScreenName)
		inc := performance.ComputePerformanceIncrement(baseUserData, activities, userData.LastActivityCreatedAt)
		rawUserData = inc.UserData
		lastActivityCreatedAt = inc.LastCreatedAt
	} else {
		// 初回(status未保存)は全アクティビティから計算し、増分計算の基準を初期化する
		allActivities, err := loadActivities(ctx, userRef)
		if err != nil {
			return err
		}
		rawUserData = performance.UserPerformance(allActivities, userData.ScreenName)
		lastActivityCreatedAt = performance.LatestActivityCreatedAt(allActivities)
	}

	formatted := performance.UserFormattedPerformance(rawUserData, performance.AppendData{
		Exp: newExp,
		User: performance.UserInfo{
			DisplayName:     userData.DisplayName,
			ScreenName:      userData.ScreenName,
			GithubImagePath: userData.ImagePath,
		},
	})

	if _, err := userRef.Update(ctx, []firestore.Update{
		{Path: "last_sanpai", Value: firestore.ServerTimestamp},
		{Path: "exp", Value: firestore.Increment(addExp)},
		{Path: "status", Value: toFirestoreStatus(formatted, "")},
		{Path: "status_version", Value: performance.StatusLogicVersion},
		{Path: "last_activity_created_at", Value: lastActivityCreatedAt},
	}); err != nil {
		return err
	}

	// 参拝による変化(before/after)を算出してフロントの変化表示に渡す。
	// 参拝前の戦闘力は、旧フォーマットのキャッシュからも取得できるよう status.total を
	// 型に寛容に読み取る(Node版 power_before と同じ扱い)。
	powerBefore := statusTotalFromSnapshot(userSnap)
	pointsBefore := int(userData.Exp)
	levelBefore := performance.GetLevel(powerBefore)

	updatedRepos := map[string]struct{}{}
	for _, it := range splited {
		if it.Event.Repo.Name != "" {
			updatedRepos[it.Event.Repo.Name] = struct{}{}
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":             "success",
		"add_exp":            addExp,
		"level":              formatted.Level,
		"exp":                formatted.Points,
		"next_exp":           formatted.NextExp,
		"msg":                "",
		"points_before":      pointsBefore,
		"points_after":       formatted.Points,
		"power_before":       powerBefore,
		"power_after":        formatted.Total,
		"level_before":       levelBefore,
		"level_after":        formatted.Level,
		"updated_repo_count": len(updatedRepos),
		"action_count":       len(splited),
		"next_time":          cfg.NextTime,
	})
	return nil
}
