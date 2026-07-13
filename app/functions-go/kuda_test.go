package gofunctions

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// kudaMock はテスト用のkudaモックサーバー。kudaBaseURL を差し替え、
// テスト終了時に元へ戻す。
type kudaMock struct {
	Calls    int64 // /drop が呼ばれた回数
	Depleted bool  // true にすると503(プール枯渇)を返す
	server   *httptest.Server
}

func mockKuda(t *testing.T) *kudaMock {
	t.Helper()
	m := &kudaMock{}
	m.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/drop" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		n := atomic.AddInt64(&m.Calls, 1)
		if m.Depleted {
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprint(w, `{"error":"pool depleted"}`)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(kudaDrop{
			Value:   int((n * 37) % 256), // 呼び出しごとに変わる決定的な値
			DropSeq: n,
			PoolSeq: 1000 + n,
			Batch:   "anu#test-batch",
		})
	}))
	orig := kudaBaseURL
	kudaBaseURL = m.server.URL
	t.Cleanup(func() {
		kudaBaseURL = orig
		m.server.Close()
	})
	return m
}

func TestBytesToUnitFloat(t *testing.T) {
	for _, tc := range []struct {
		hi, lo int
		want   float64
	}{
		{0, 0, 0},
		{128, 0, 0.5},
		{255, 255, 65535.0 / 65536.0},
	} {
		if got := bytesToUnitFloat(tc.hi, tc.lo); got != tc.want {
			t.Errorf("bytesToUnitFloat(%d,%d) = %v, want %v", tc.hi, tc.lo, got, tc.want)
		}
	}
	if got := byteToUnitFloat(255); got >= 1 || got != 255.0/256.0 {
		t.Errorf("byteToUnitFloat(255) = %v", got)
	}
	// r<1 が保証されるので drawTierByValue / pickEntryByValue の範囲内に収まる
	if tier := drawTierByValue(bytesToUnitFloat(255, 255)); tier != TierDaikyo {
		t.Errorf("max bytes → tier %q, want %q (末尾レア度)", tier, TierDaikyo)
	}
}

func TestDedupBatches(t *testing.T) {
	drops := []kudaDrop{
		{Batch: "anu#a"}, {Batch: "home#b"}, {Batch: "anu#a"}, {Batch: ""},
	}
	got := dedupBatches(drops)
	if len(got) != 2 || got[0] != "anu#a" || got[1] != "home#b" {
		t.Errorf("dedupBatches = %v", got)
	}
}

func TestFetchKudaBytes(t *testing.T) {
	m := mockKuda(t)
	drops, err := fetchKudaBytes(context.Background(), 3)
	if err != nil {
		t.Fatalf("fetchKudaBytes: %v", err)
	}
	if len(drops) != 3 || m.Calls != 3 {
		t.Fatalf("drops=%d calls=%d, want 3/3", len(drops), m.Calls)
	}
	for _, d := range drops {
		if d.Value < 0 || d.Value > 255 || d.Batch == "" {
			t.Errorf("bad drop: %+v", d)
		}
	}

	// 枯渇時はエラー
	m.Depleted = true
	if _, err := fetchKudaBytes(context.Background(), 3); err == nil {
		t.Error("depleted pool should return error")
	}
}

func TestFetchKudaBytes_Unreachable(t *testing.T) {
	orig := kudaBaseURL
	kudaBaseURL = "http://127.0.0.1:1" // 接続不能
	t.Cleanup(func() { kudaBaseURL = orig })

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if _, err := fetchKudaBytes(ctx, 3); err == nil {
		t.Error("unreachable kuda should return error")
	}
}
