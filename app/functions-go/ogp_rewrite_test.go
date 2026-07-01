package gofunctions

import (
	"net/http"
	"net/http/httptest"
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
	if !strings.Contains(body, "userOGP?user=octocat") {
		t.Errorf("og:image should point to userOGP; body=%s", body)
	}
	if got := rec.Header().Get("Cache-Control"); got != "public, max-age=300, s-maxage=300" {
		t.Errorf("Cache-Control = %q, want public, max-age=300, s-maxage=300", got)
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
