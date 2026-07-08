package gofunctions

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func sampleIndexHTML(baseURL string) string {
	return `<!DOCTYPE html><html><head>
<meta data-n-head="1" data-hid="og:image" property="og:image" content="` + baseURL + `ogimage.png">
<meta data-n-head="1" data-hid="og:description" name="og:description" property="og:description" content="バグった時の神頼み。">
<meta data-n-head="1" data-hid="description" name="description" content="バグった時の神頼み。">
<meta data-n-head="1" data-hid="og:title" name="og:title" content="でばっぐ神社">
<meta data-n-head="1" data-hid="twitter:title" property="twitter:title" content="でばっぐ神社">
<meta data-n-head="1" data-hid="twitter:description" property="twitter:description" content="バグった時の神頼み。">
<meta data-n-head="1" data-hid="twitter:image" property="twitter:image" content="` + baseURL + `ogimage.png">
</head><body></body></html>`
}

func TestOgpRewrite_Success(t *testing.T) {
	var baseURL string
	baseSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(sampleIndexHTML(baseURL)))
	}))
	defer baseSrv.Close()

	baseURL = baseSrv.URL + "/"
	t.Setenv("FUNC_BASE_URL", baseURL)
	t.Setenv("OGP_PROJECT_ID", "d-shrine-dev")

	req := httptest.NewRequest(http.MethodGet, "/u/octocat", nil)
	rec := httptest.NewRecorder()
	ogpRewriteHandler(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body=%s)", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, "octocatの でばっぐのうりょくだ！") {
		t.Errorf("description not rewritten; body=%s", body)
	}
	if !strings.Contains(body, "octocatの でばっぐのうりょく - でばっぐ神社") {
		t.Errorf("title not rewritten; body=%s", body)
	}
	if strings.Contains(body, "バグった時の神頼み。") {
		t.Errorf("default description text should have been replaced; body=%s", body)
	}
	if strings.Contains(body, `content="でばっぐ神社"`) {
		t.Errorf("default title text should have been replaced; body=%s", body)
	}
	if !strings.Contains(body, "userOGPGo?user=octocat") {
		t.Errorf("og:image should point to userOGPGo; body=%s", body)
	}
	ogImageTag := extractMetaTag(body, "og:image")
	twitterImageTag := extractMetaTag(body, "twitter:image")
	if ogImageTag == "" || !strings.Contains(ogImageTag, "userOGPGo?user=octocat") {
		t.Errorf("og:image tag not rewritten correctly: %q", ogImageTag)
	}
	if twitterImageTag == "" || !strings.Contains(twitterImageTag, "userOGPGo?user=octocat") {
		t.Errorf("twitter:image tag not rewritten correctly: %q", twitterImageTag)
	}
	// WebP出力に伴い og:image:type / :width / :height を注入していること。
	if !strings.Contains(body, `property="og:image:type" content="image/webp"`) {
		t.Errorf("og:image:type=image/webp not injected; body=%s", body)
	}
	if !strings.Contains(body, `property="og:image:width" content="1200"`) ||
		!strings.Contains(body, `property="og:image:height" content="630"`) {
		t.Errorf("og:image dimensions not injected; body=%s", body)
	}
	if got := rec.Header().Get("Cache-Control"); got != "public, max-age=300, s-maxage=300" {
		t.Errorf("Cache-Control = %q, want public, max-age=300, s-maxage=300", got)
	}
}

// extractMetaTag はテスト用に data-hid="name" を持つmetaタグの1行を取り出す。
func extractMetaTag(html, dataHid string) string {
	for _, line := range strings.Split(html, "\n") {
		if strings.Contains(line, `data-hid="`+dataHid+`"`) {
			return line
		}
	}
	return ""
}

// Node版には og:description のメタタグとして
// (1) property="og:description" を持つパターン
// (2) 持たないパターン
// の2種類の検索文字列が存在する(実際のビルド済みHTMLにはどちらか一方しか
// 含まれない想定だが、両方とも正しく置換できることを個別に確認する)。
func TestOgpRewrite_OgDescriptionWithoutPropertyAttribute(t *testing.T) {
	var baseURL string
	baseSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		html := `<!DOCTYPE html><html><head>
<meta data-n-head="1" data-hid="og:image" property="og:image" content="` + baseURL + `ogimage.png">
<meta data-n-head="1" data-hid="og:description" name="og:description" content="バグった時の神頼み。">
<meta data-n-head="1" data-hid="description" name="description" content="バグった時の神頼み。">
<meta data-n-head="1" data-hid="og:title" name="og:title" content="でばっぐ神社">
<meta data-n-head="1" data-hid="twitter:title" property="twitter:title" content="でばっぐ神社">
<meta data-n-head="1" data-hid="twitter:description" property="twitter:description" content="バグった時の神頼み。">
<meta data-n-head="1" data-hid="twitter:image" property="twitter:image" content="` + baseURL + `ogimage.png">
</head><body></body></html>`
		_, _ = w.Write([]byte(html))
	}))
	defer baseSrv.Close()

	baseURL = baseSrv.URL + "/"
	t.Setenv("FUNC_BASE_URL", baseURL)
	t.Setenv("OGP_PROJECT_ID", "d-shrine-dev")

	req := httptest.NewRequest(http.MethodGet, "/u/octocat", nil)
	rec := httptest.NewRecorder()
	ogpRewriteHandler(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body=%s)", rec.Code, rec.Body.String())
	}
	ogDescTag := extractMetaTag(rec.Body.String(), "og:description")
	if !strings.Contains(ogDescTag, "octocatの でばっぐのうりょくだ！") {
		t.Errorf("og:description (no property attr) not rewritten: %q", ogDescTag)
	}
}

// 共有リンクに付くトラッキングパラメータ(?fbclid=... 等)がユーザー名に
// 混入しないこと(パス部分のみからユーザー名を取り出すこと)を確認する。
func TestOgpRewrite_IgnoresQueryString(t *testing.T) {
	var baseURL string
	baseSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(sampleIndexHTML(baseURL)))
	}))
	defer baseSrv.Close()

	baseURL = baseSrv.URL + "/"
	t.Setenv("FUNC_BASE_URL", baseURL)
	t.Setenv("OGP_PROJECT_ID", "d-shrine-dev")

	req := httptest.NewRequest(http.MethodGet, "/u/octocat?fbclid=abc123", nil)
	rec := httptest.NewRecorder()
	ogpRewriteHandler(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body=%s)", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, "userOGPGo?user=octocat&") {
		t.Errorf("og:image user param should be octocat without query string; body=%s", body)
	}
	if strings.Contains(body, "fbclid") {
		t.Errorf("query string leaked into rewritten HTML; body=%s", body)
	}
	if !strings.Contains(body, "octocatの でばっぐのうりょくだ！") {
		t.Errorf("description not rewritten with clean username; body=%s", body)
	}
}

// パス由来のユーザー名がHTML属性・URLへエスケープされずに埋め込まれて
// HTML注入(XSS)にならないことを確認する。
func TestOgpRewrite_EscapesUsername(t *testing.T) {
	var baseURL string
	baseSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(sampleIndexHTML(baseURL)))
	}))
	defer baseSrv.Close()

	baseURL = baseSrv.URL + "/"
	t.Setenv("FUNC_BASE_URL", baseURL)
	t.Setenv("OGP_PROJECT_ID", "d-shrine-dev")

	evil := `x"><script>alert(1)</script>`
	req := httptest.NewRequest(http.MethodGet, "/u/"+url.PathEscape(evil), nil)
	rec := httptest.NewRecorder()
	ogpRewriteHandler(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body=%s)", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if strings.Contains(body, "<script>") {
		t.Errorf("unescaped username injected script tag; body=%s", body)
	}
	if !strings.Contains(body, "user="+url.QueryEscape(evil)) {
		t.Errorf("og:image user param should be query-escaped; body=%s", body)
	}
}

func TestOgpRewrite_PathMismatch(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/other/path", nil)
	rec := httptest.NewRecorder()
	ogpRewriteHandler(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
}

func TestOgpRewrite_BaseFetchFailure(t *testing.T) {
	t.Setenv("FUNC_BASE_URL", "http://127.0.0.1:1/unreachable")
	t.Setenv("OGP_PROJECT_ID", "d-shrine-dev")

	req := httptest.NewRequest(http.MethodGet, "/u/octocat", nil)
	rec := httptest.NewRecorder()
	ogpRewriteHandler(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
	if rec.Body.String() != "failed" {
		t.Errorf("body = %q, want failed", rec.Body.String())
	}
}
