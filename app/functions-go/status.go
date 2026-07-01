// マイページ／プロフィール表示で使われる status エンドポイントのGo実装。
//
// Node版(app/functions/index.js の exports.status)からの移植であり、
// コールドスタートを短縮するために Go/Cloud Run functions として個別に
// デプロイする(関数名は statusGo。既存の status(Node) とは別関数として
// 共存させ、フロントエンドの切替タイミングを制御できるようにしている)。
//
// 挙動はNode版と同一にすることを優先し、独自の改善は入れていない
// (詳細は docs/backend.md の「status エンドポイントのGo移植」を参照)。
package gofunctions

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	"google.golang.org/api/iterator"

	"github.com/428lab/debug-shrine/functions-go/internal/performance"
)

func init() {
	functions.HTTP("StatusGo", statusHandler)
}

var (
	firestoreClientOnce sync.Once
	firestoreClient     *firestore.Client
	firestoreClientErr  error
)

// getFirestoreClient はコールドスタート時に1回だけ初期化し、以降のリクエストで再利用する。
//
// Cloud Run functions(2nd gen)の環境では GOOGLE_CLOUD_PROJECT 等の環境変数が
// 常に設定される保証がないため、firestore.DetectProjectID を使ってADC(Application
// Default Credentials)経由でプロジェクトIDを自動検出する
// (GOOGLE_CLOUD_PROJECT envvar -> ADCのcreds.ProjectID の順に試行される)。
func getFirestoreClient(ctx context.Context) (*firestore.Client, error) {
	firestoreClientOnce.Do(func() {
		firestoreClient, firestoreClientErr = firestore.NewClient(ctx, firestore.DetectProjectID)
	})
	return firestoreClient, firestoreClientErr
}

// userDocument は users/{id} ドキュメントのうち status エンドポイントが参照するフィールド。
type userDocument struct {
	DisplayName   string           `firestore:"display_name"`
	ScreenName    string           `firestore:"screen_name"`
	ImagePath     string           `firestore:"image_path"`
	Exp           int64            `firestore:"exp"`
	LastSanpai    time.Time        `firestore:"last_sanpai"`
	Status        *firestoreStatus `firestore:"status"`
	StatusVersion int64            `firestore:"status_version"`
}

// statusCacheIsCurrent は保存済み status キャッシュが現行の計算ロジックで作られたものか判定する。
// status が無い、または status_version が現行(performance.StatusLogicVersion)より古い場合は
// false(＝再計算が必要)。旧キャッシュには status_version フィールドが無く 0 として読まれるため
// 自動的に再計算対象になる。
func statusCacheIsCurrent(status *firestoreStatus, statusVersion int64) bool {
	return status != nil && statusVersion >= performance.StatusLogicVersion
}

// firestoreStatus は users/{id}.status の形状(Node版 user_formatted_performance の
// 戻り値 + last_sanpai)。performance.FormattedPerformance とフィールド名を同一に保つこと。
type firestoreStatus struct {
	User         performance.UserInfo `firestore:"user"`
	Points       int64                `firestore:"points"`
	HP           int64                `firestore:"hp"`
	Power        int64                `firestore:"power"`
	Intelligence int64                `firestore:"intelligence"`
	Defence      int64                `firestore:"defence"`
	Agility      int64                `firestore:"agility"`
	Total        int64                `firestore:"total"`
	Level        int64                `firestore:"level"`
	Exp          int64                `firestore:"exp"`
	NextExp      int64                `firestore:"next_exp"`
	Chart        performance.Chart    `firestore:"chart"`
	LastSanpai   string               `firestore:"last_sanpai"`
}

func toFirestoreStatus(f performance.FormattedPerformance, lastSanpai string) firestoreStatus {
	return firestoreStatus{
		User:         f.User,
		Points:       int64(f.Points),
		HP:           int64(f.HP),
		Power:        int64(f.Power),
		Intelligence: int64(f.Intelligence),
		Defence:      int64(f.Defence),
		Agility:      int64(f.Agility),
		Total:        int64(f.Total),
		Level:        int64(f.Level),
		Exp:          int64(f.Exp),
		NextExp:      int64(f.NextExp),
		Chart:        f.Chart,
		LastSanpai:   lastSanpai,
	}
}

// StatusResponse はクライアントに返すJSONの形状(Node版 return_Data と同一)。
type StatusResponse struct {
	performance.FormattedPerformance
	LastSanpai string `json:"last_sanpai"`
}

func fromFirestoreStatus(fs firestoreStatus) StatusResponse {
	return StatusResponse{
		FormattedPerformance: performance.FormattedPerformance{
			User:         fs.User,
			Points:       int(fs.Points),
			HP:           int(fs.HP),
			Power:        int(fs.Power),
			Intelligence: int(fs.Intelligence),
			Defence:      int(fs.Defence),
			Agility:      int(fs.Agility),
			Total:        int(fs.Total),
			Level:        int(fs.Level),
			Exp:          int(fs.Exp),
			NextExp:      int(fs.NextExp),
			Chart:        fs.Chart,
		},
		LastSanpai: fs.LastSanpai,
	}
}

func setCORSHeaders(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		origin = "*"
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Vary", "Origin")
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("status: failed to encode response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"status": "failed", "message": message})
}

// decodeJSONBody はリクエストボディをJSONとしてデコードする。
//
// Node版(Firebase Functions)はExpressのbody-parserがハンドラ本体より前に
// リクエストボディをパースし、不正なJSONの場合はハンドラに到達する前に
// 400を返す(空ボディの場合はエラーにせず `{}` 扱いにする)。Go版は自前で
// デコードするため、同じ理由で失敗した場合は呼び出し元でハンドラ本体
// (認証チェック等)より先に400を返すこと。
func decodeJSONBody(r *http.Request, v any) error {
	if r.Body == nil {
		return nil
	}
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil {
		if errors.Is(err, io.EOF) {
			// ボディが空(Content-Length: 0 等)。Express body-parserもエラーにしない。
			return nil
		}
		return err
	}
	return nil
}

func statusHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	ctx := r.Context()
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("status: getFirestoreClient error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	screenName := r.URL.Query().Get("user")
	userDoc, err := findUserByScreenName(ctx, client, screenName)
	if err != nil {
		log.Printf("status: findUserByScreenName error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if userDoc == nil {
		writeError(w, http.StatusNotFound, "user not registered.")
		return
	}

	var userData userDocument
	if err := userDoc.DataTo(&userData); err != nil {
		log.Printf("status: DataTo error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if statusCacheIsCurrent(userData.Status, userData.StatusVersion) {
		resp := fromFirestoreStatus(*userData.Status)
		resp.LastSanpai = formatLastSanpai(userData.LastSanpai)
		writeJSON(w, http.StatusOK, resp)
		return
	}

	activities, err := loadActivities(ctx, userDoc.Ref)
	if err != nil {
		log.Printf("status: loadActivities error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	raw := performance.UserPerformance(activities, screenName)
	formatted := performance.UserFormattedPerformance(raw, performance.AppendData{
		Exp: int(userData.Exp),
		User: performance.UserInfo{
			DisplayName:     userData.DisplayName,
			ScreenName:      userData.ScreenName,
			GithubImagePath: userData.ImagePath,
		},
	})
	// last_sanpai は cache-current パス(上)と同じく、キャッシュ有無に関わらず
	// トップレベルの last_sanpai(Timestamp)から生成する。未参拝(ゼロ値)のときだけ
	// formatLastSanpai が "参拝していないようです" を返す。
	// ※status_version 導入によりキャッシュ未計算の既存ユーザーは初回に必ずこの
	//   recompute パスを通るため、ここで固定文字列にすると参拝済みでも未参拝表示になる。
	resp := StatusResponse{FormattedPerformance: formatted, LastSanpai: formatLastSanpai(userData.LastSanpai)}

	if _, err := userDoc.Ref.Update(ctx, []firestore.Update{
		{Path: "status", Value: toFirestoreStatus(formatted, resp.LastSanpai)},
		{Path: "status_version", Value: performance.StatusLogicVersion},
	}); err != nil {
		log.Printf("status: cache write-back error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func findUserByScreenName(ctx context.Context, client *firestore.Client, screenName string) (*firestore.DocumentSnapshot, error) {
	if screenName == "" {
		return nil, nil
	}
	iter := client.Collection("users").Where("screen_name", "==", screenName).Limit(1).Documents(ctx)
	defer iter.Stop()
	doc, err := iter.Next()
	if errors.Is(err, iterator.Done) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return doc, nil
}

type activityDoc struct {
	Raw string `firestore:"raw"`
}

func loadActivities(ctx context.Context, userRef *firestore.DocumentRef) ([]performance.Activity, error) {
	iter := userRef.Collection("github_activities").Documents(ctx)
	defer iter.Stop()
	var activities []performance.Activity
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		var raw activityDoc
		if err := doc.DataTo(&raw); err != nil {
			return nil, err
		}
		var a performance.Activity
		if err := json.Unmarshal([]byte(raw.Raw), &a); err != nil {
			return nil, err
		}
		activities = append(activities, a)
	}
	return activities, nil
}

// formatLastSanpai は Node版の moment(...).format('YYYY年MM月DD日 HH:mm') と同一の文字列を返す。
// Cloud Functions の実行環境はデフォルトタイムゾーンがUTCであるため、UTCとして整形する。
//
// last_sanpai(トップレベル)が存在しない状態で status キャッシュだけが存在するユーザー
// (一度もsanpaiせずプロフィールを2回以上見ると発生し得る)に対しては、status未保存時の
// フル計算パスと同じく「参拝していないようです」を返す(未参拝ユーザーの正しい表示)。
// ※移植前のNode版はこの場合 `undefined.toDate()` を呼び出して例外になるバグがあった。
// 本移植に合わせてNode版も同じく修正済み。
func formatLastSanpai(t time.Time) string {
	if t.IsZero() {
		return "参拝していないようです"
	}
	return t.UTC().Format("2006年01月02日 15:04")
}
