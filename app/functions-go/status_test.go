package gofunctions

import (
	"testing"
	"time"

	"github.com/428lab/debug-shrine/functions-go/internal/performance"
)

func TestStatusCacheIsCurrent(t *testing.T) {
	// status 未設定(nil)は常に「非現行」＝要再計算。
	if statusCacheIsCurrent(nil, performance.StatusLogicVersion) {
		t.Error("nil status should not be current")
	}
	// 旧キャッシュ(status_version フィールドが無く 0 として読まれる)は非現行。
	if statusCacheIsCurrent(&firestoreStatus{}, 0) {
		t.Error("status with version 0 (old cache) should not be current")
	}
	// 現行バージョンと一致するキャッシュは現行(再計算不要)。
	if !statusCacheIsCurrent(&firestoreStatus{}, performance.StatusLogicVersion) {
		t.Error("status at current version should be current")
	}
	// 将来バージョン(現行より新しい)は現行以上とみなし再計算しない。
	if !statusCacheIsCurrent(&firestoreStatus{}, performance.StatusLogicVersion+1) {
		t.Error("status at a newer version should be treated as current")
	}
}

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
