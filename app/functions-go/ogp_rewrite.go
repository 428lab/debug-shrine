// プロフィールページのOGPメタタグ書き換え(ogpRewrite)エンドポイントのGo実装。
//
// Node版(app/functions/index.js の exports.ogpRewrite)からの移植であり、
// コールドスタートを短縮するために Go/Cloud Run functions として個別に
// デプロイする(関数名は ogpRewriteGo。既存の ogpRewrite(Node) とは別関数として
// 共存させる)。Firebase Hostingの `/u/*` リライト先を切り替えるまでは
// 実際のトラフィックは受けない。
//
// 挙動はNode版と同一にすることを優先し、独自の改善は入れていない
// (詳細は docs/backend.md「ogpRewrite エンドポイントのGo移植」を参照)。
package gofunctions

import (
	"context"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
)

func init() {
	functions.HTTP("OgpRewriteGo", ogpRewriteHandler)
}

// userPathPattern はNode版 `req_path.match("/u/(.+)")` と同一。
var userPathPattern = regexp.MustCompile(`/u/(.+)`)

var ogpHTTPClient = &http.Client{}

func ogpRewriteHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("ogpRewrite: request url: %s", r.URL.RequestURI())

	// ユーザー名はパス部分のみから取り出す。RequestURI(パス+クエリ)に対して
	// マッチさせると、共有リンク等に付くトラッキングパラメータ(?fbclid=... 等)まで
	// ユーザー名に含まれてしまい、og:image のユーザー参照や説明文が壊れる。
	reqPath := r.URL.Path
	m := userPathPattern.FindStringSubmatch(reqPath)
	if m == nil {
		// Node版は Firebase Hosting の `/u/*` リライト経由でのみ呼ばれる前提のため
		// この分岐は通常到達しない。Node版はここで正規表現マッチ結果に対して
		// 未定義動作(null.lengthの参照)を起こし例外化するため、Go版でも
		// 正常系としては扱わず internal error とする(意図的な仕様ではなく、
		// 到達しない想定のNode側の既存バグをそのまま踏襲)。
		log.Printf("ogpRewrite: mismatch query: %s", reqPath)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	username := m[1]

	if err := runOgpRewrite(r.Context(), w, username); err != nil {
		log.Printf("ogpRewrite: %v", err)
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("failed"))
	}
}

func runOgpRewrite(ctx context.Context, w http.ResponseWriter, username string) error {
	baseURL := os.Getenv("FUNC_BASE_URL")
	projectID := os.Getenv("OGP_PROJECT_ID")

	nowUnix := time.Now().Unix()
	// username はリクエストパス由来の外部入力なので、URLクエリ・HTML属性値の
	// 各文脈に応じてエスケープしてから埋め込む(生のまま埋め込むと `"` や `<` で
	// meta タグの属性を破壊してHTMLを注入できてしまう)。
	// og:image は Go版OGP生成関数(userOGPGo)を指す。userOGPGoはWebP(1200x630)を返す。
	ogpURL := fmt.Sprintf("https://us-central1-%s.cloudfunctions.net/userOGPGo?user=%s&t=%d", projectID, url.QueryEscape(username), nowUnix)
	description := html.EscapeString(fmt.Sprintf("これが%sの でばっぐのうりょくだ！", username))
	title := html.EscapeString(fmt.Sprintf("%sの でばっぐのうりょく - でばっぐ神社", username))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL, nil)
	if err != nil {
		return err
	}
	resp, err := ogpHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("base_url fetch: status %d", resp.StatusCode)
	}

	data := string(body)
	replacements := []struct{ from, to string }{
		{
			fmt.Sprintf(`<meta data-n-head="1" data-hid="og:image" property="og:image" content="%sogimage.png">`, baseURL),
			// og:image を差し替えると同時に、WebPであることと固定サイズ(1200x630)を
			// クローラに明示する og:image:type / :width / :height を後続に注入する。
			fmt.Sprintf(`<meta data-n-head="1" data-hid="og:image" property="og:image" content="%s"><meta data-n-head="1" data-hid="og:image:type" property="og:image:type" content="image/webp"><meta data-n-head="1" data-hid="og:image:width" property="og:image:width" content="1200"><meta data-n-head="1" data-hid="og:image:height" property="og:image:height" content="630">`, ogpURL),
		},
		{
			`<meta data-n-head="1" data-hid="og:description" name="og:description" property="og:description" content="バグった時の神頼み。">`,
			fmt.Sprintf(`<meta data-n-head="1" data-hid="og:description" name="og:description" property="og:description" content="%s">`, description),
		},
		{
			`<meta data-n-head="1" data-hid="description" name="description" content="バグった時の神頼み。">`,
			fmt.Sprintf(`<meta data-n-head="1" data-hid="description" name="description" content="%s">`, description),
		},
		{
			`<meta data-n-head="1" data-hid="og:description" name="og:description" content="バグった時の神頼み。">`,
			fmt.Sprintf(`<meta data-n-head="1" data-hid="og:description" name="og:description" content="%s">`, description),
		},
		{
			`<meta data-n-head="1" data-hid="og:title" name="og:title" content="でばっぐ神社">`,
			fmt.Sprintf(`<meta data-n-head="1" data-hid="og:title" name="og:title" content="%s">`, title),
		},
		{
			`<meta data-n-head="1" data-hid="twitter:title" property="twitter:title" content="でばっぐ神社">`,
			fmt.Sprintf(`<meta data-n-head="1" data-hid="twitter:title" property="twitter:title" content="%s">`, title),
		},
		{
			`<meta data-n-head="1" data-hid="twitter:description" property="twitter:description" content="バグった時の神頼み。">`,
			fmt.Sprintf(`<meta data-n-head="1" data-hid="twitter:description" property="twitter:description" content="%s">`, description),
		},
		{
			fmt.Sprintf(`<meta data-n-head="1" data-hid="twitter:image" property="twitter:image" content="%sogimage.png">`, baseURL),
			fmt.Sprintf(`<meta data-n-head="1" data-hid="twitter:image" property="twitter:image" content="%s">`, ogpURL),
		},
	}
	for _, rep := range replacements {
		data = strings.Replace(data, rep.from, rep.to, 1)
	}

	w.Header().Set("Cache-Control", "public, max-age=300, s-maxage=300")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, data)
	return nil
}
