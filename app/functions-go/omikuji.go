// おみくじ(omikuji)エンドポイントのGo実装。
//
// 8時間に1回だけ引けるIT系おみくじ。結果(レア度＝tier と具体的な文言)は
// 必ずサーバーが決定し、フロントの物理演出(Plinko/ピタゴラ)は「サーバーが
// 決めたレア度のビンへ着地するよう誘導する」だけの見た目担当とする
// (クールダウン・レア度の公平性をクライアントに委ねないため。設計は
// docs/backend.md「おみくじ機能」を参照)。
//
// おみくじの文言データは omikuji_data.go に埋め込み(Firestore読み取り不要)。
package gofunctions

import (
	"context"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	"google.golang.org/grpc/codes"
	grpcstatus "google.golang.org/grpc/status"
)

func init() {
	functions.HTTP("OmikujiGo", omikujiHandler)
}

// レア度(tier)。値そのものが表示・保存に使われる文字列。
const (
	TierChokichi = "超吉" // 超レア
	TierDaikichi = "大吉"
	TierChukichi = "中吉"
	TierShokichi = "小吉"
	TierSuekichi = "末吉"
	TierKyo      = "凶"
	TierDaikyo   = "大凶"
)

// omikujiLine はおみくじの各カテゴリ(待ち人・失物 等をIT風にもじったもの)の一行。
type omikujiLine struct {
	Category string `firestore:"category" json:"category"`
	Text     string `firestore:"text" json:"text"`
}

// omikujiEntry はおみくじ1件。ID は安定な識別子。
type omikujiEntry struct {
	ID      string        `firestore:"id" json:"id"`
	Tier    string        `firestore:"tier" json:"tier"`
	Fortune string        `firestore:"fortune" json:"fortune"` // 総合運の一言(オチ)
	Lines   []omikujiLine `firestore:"lines" json:"lines"`
}

// tierWeight はレア度の抽選重み。合計は tierWeightTotal で算出する(百分率に
// 縛られず後から自由に調整できる)。順序は「良い→悪い」で固定し、抽選の
// 累積計算とビンの並びに使う。
type tierWeight struct {
	Tier   string
	Weight int
}

var tierWeights = []tierWeight{
	{TierChokichi, 2},
	{TierDaikichi, 13},
	{TierChukichi, 20},
	{TierShokichi, 22},
	{TierSuekichi, 20},
	{TierKyo, 15},
	{TierDaikyo, 8},
}

func tierWeightTotal() int {
	total := 0
	for _, w := range tierWeights {
		total += w.Weight
	}
	return total
}

// drawTierByValue は r∈[0,1) を受け取り、重みに従ってレア度を1つ返す。
// rand から切り離してあるのはテストで分布を決定的に検証するため。
func drawTierByValue(r float64) string {
	total := tierWeightTotal()
	// r をスケールして累積重みと比較する。
	target := r * float64(total)
	cum := 0.0
	for _, w := range tierWeights {
		cum += float64(w.Weight)
		if target < cum {
			return w.Tier
		}
	}
	// 数値誤差で末尾を超えた場合は最後のレア度に丸める。
	return tierWeights[len(tierWeights)-1].Tier
}

// entriesForTier は指定レア度のおみくじ一覧を返す。
func entriesForTier(tier string) []omikujiEntry {
	res := make([]omikujiEntry, 0, 16)
	for i := range omikujiEntries {
		if omikujiEntries[i].Tier == tier {
			res = append(res, omikujiEntries[i])
		}
	}
	return res
}

// pickEntryByValue は指定レア度の中から r∈[0,1) で1件選ぶ。
// 該当レア度のエントリが無い場合は ok=false(データ不備の検出用)。
func pickEntryByValue(tier string, r float64) (omikujiEntry, bool) {
	list := entriesForTier(tier)
	if len(list) == 0 {
		return omikujiEntry{}, false
	}
	idx := int(r * float64(len(list)))
	if idx >= len(list) {
		idx = len(list) - 1
	}
	return list[idx], true
}

// loadOmikujiCooldownSeconds はクールダウン秒数を環境変数から読む
// (本番=28800(8時間)、dev=検証用に短く設定する。未設定時は28800)。
func loadOmikujiCooldownSeconds() int64 {
	if v := os.Getenv("OMIKUJI_COOLDOWN_SECONDS"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			return n
		}
	}
	return 8 * 60 * 60
}

type omikujiRequestBody struct {
	GithubID string `json:"github_id"`
	// Peek=true のときは抽選せず現在の状態(クールダウン/引ける)と前回結果だけ返す。
	// フロントがページ表示時に状態を取得するために使う。
	Peek bool `json:"peek"`
}

// omikujiUserDocument は users/{id} のうちおみくじが参照するフィールド。
type omikujiUserDocument struct {
	LastOmikuji time.Time `firestore:"last_omikuji"`
}

func omikujiHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	ctx := r.Context()

	var body omikujiRequestBody
	if err := decodeJSONBody(r, &body); err != nil {
		log.Printf("omikuji: decodeJSONBody error: %v", err)
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
		log.Printf("omikuji: getFirebaseAuthClient error: %v", err)
		writeJSON(w, http.StatusOK, map[string]string{"status": "missing server error."})
		return
	}
	if _, err := authClient.VerifyIDToken(ctx, token); err != nil {
		log.Printf("omikuji: VerifyIDToken error: %v", err)
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "authorization missing."})
		return
	}

	if body.GithubID == "" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed parameter"})
		return
	}

	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("omikuji: getFirestoreClient error: %v", err)
		writeJSON(w, http.StatusOK, map[string]string{"status": "missing server error."})
		return
	}

	if err := runOmikuji(ctx, w, client, body); err != nil {
		log.Printf("omikuji: failure: %v", err)
		writeJSON(w, http.StatusOK, map[string]string{"status": "missing server error."})
	}
}

// runOmikuji はおみくじ本体。クールダウン中は前回結果と残り秒を返し、
// 引ける場合は抽選して last_omikuji / omikuji_result を保存する。
func runOmikuji(ctx context.Context, w http.ResponseWriter, client *firestore.Client, body omikujiRequestBody) error {
	cooldown := loadOmikujiCooldownSeconds()
	userRef := client.Collection("users").Doc(body.GithubID)

	userSnap, err := userRef.Get(ctx)
	if err != nil {
		if grpcstatus.Code(err) == codes.NotFound {
			writeJSON(w, http.StatusOK, map[string]string{"status": "failed", "message": "not registered"})
			return nil
		}
		return err
	}

	var userData omikujiUserDocument
	if err := userSnap.DataTo(&userData); err != nil {
		return err
	}

	now := time.Now()
	if !userData.LastOmikuji.IsZero() {
		nextAvailable := userData.LastOmikuji.Unix() + cooldown
		if nextAvailable > now.Unix() {
			// クールダウン中。前回引いた結果(あれば)と残り秒を返す。
			resp := map[string]interface{}{
				"status":            "cooldown",
				"remaining_seconds": nextAvailable - now.Unix(),
			}
			if lastResult, err := userSnap.DataAt("omikuji_result"); err == nil && lastResult != nil {
				resp["result"] = lastResult
			}
			writeJSON(w, http.StatusOK, resp)
			return nil
		}
	}

	// ここに来た時点で「引ける」状態。peek(状態確認のみ)なら抽選せず返す。
	if body.Peek {
		writeJSON(w, http.StatusOK, map[string]interface{}{"status": "available"})
		return nil
	}

	tier := drawTierByValue(rand.Float64())
	entry, ok := pickEntryByValue(tier, rand.Float64())
	if !ok {
		// データ不備(そのレア度のエントリが存在しない)。異常系として扱う。
		return errNoEntryForTier(tier)
	}

	result := map[string]interface{}{
		"id":      entry.ID,
		"tier":    entry.Tier,
		"fortune": entry.Fortune,
		"lines":   linesToMaps(entry.Lines),
	}

	if _, err := userRef.Update(ctx, []firestore.Update{
		{Path: "last_omikuji", Value: firestore.ServerTimestamp},
		{Path: "omikuji_result", Value: result},
	}); err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":            "success",
		"remaining_seconds": cooldown,
		"result":            result,
	})
	return nil
}

func linesToMaps(lines []omikujiLine) []map[string]interface{} {
	res := make([]map[string]interface{}, len(lines))
	for i, l := range lines {
		res[i] = map[string]interface{}{"category": l.Category, "text": l.Text}
	}
	return res
}

func errNoEntryForTier(tier string) error {
	return &omikujiDataError{Tier: tier}
}

type omikujiDataError struct{ Tier string }

func (e *omikujiDataError) Error() string {
	return "omikuji: no entry for tier " + e.Tier
}
