package gofunctions

import (
	"testing"
	"time"
)

func TestFormatLastSanpai(t *testing.T) {
	// last_sanpai 未設定(ゼロ値)の場合は未参拝の文言を返す
	// (Node版が undefined.toDate() でクラッシュしていたケースの修正)。
	if got := formatLastSanpai(time.Time{}); got != "参拝していないようです" {
		t.Errorf("formatLastSanpai(zero) = %q, want %q", got, "参拝していないようです")
	}

	// 設定済みの場合は UTC の "YYYY年MM月DD日 HH:mm" 形式で返す。
	ts := time.Date(2024, 2, 3, 4, 5, 6, 0, time.UTC)
	if got := formatLastSanpai(ts); got != "2024年02月03日 04:05" {
		t.Errorf("formatLastSanpai(%v) = %q, want %q", ts, got, "2024年02月03日 04:05")
	}
}
