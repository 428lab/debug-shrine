package gofunctions

import "testing"

func TestArchiveListCacheControl(t *testing.T) {
	// 空は一時的な状態。長く持たせると締めた後も空のまま居座る。
	if got := archiveListCacheControl(0); got != "public, max-age=30, s-maxage=30" {
		t.Errorf("空の一覧は短命であるべき: %q", got)
	}
	// 1件でもあれば、締め済みの内容は変わらないので長く持たせてよい。
	got := archiveListCacheControl(1)
	if got == archiveListCacheControl(0) {
		t.Errorf("件数があるときは長いキャッシュにするべき: %q", got)
	}
}

func TestArchiveDetailCacheControl(t *testing.T) {
	// 「まだ無い」は一時的な状態。長く持たせると、後から締めても
	// 共有キャッシュが丸一日 404 を返し続ける。
	if got := archiveDetailCacheControl(false); got != "public, max-age=30, s-maxage=30" {
		t.Errorf("未作成の期間は短命であるべき: %q", got)
	}
	if got := archiveDetailCacheControl(true); got == archiveDetailCacheControl(false) {
		t.Errorf("締め済みは長いキャッシュにするべき: %q", got)
	}
}
