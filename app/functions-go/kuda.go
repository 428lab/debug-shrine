// kuda(乱数の管)クライアント。
//
// 428lab/kuda は ANU の量子真空ゆらぎと自宅ガイガーカウンター(放射性崩壊)の
// 物理エントロピーをプールし、GET /drop で1バイトずつ払い出すAPI。
// おみくじの抽選をこの物理乱数で行う(docs/backend.md「おみくじの物理乱数化」)。
//
// kudaの原則に合わせたクライアント側の約束:
//   - 引いた値の拒否(rejection sampling)はしない。値→確率の写像はスケーリングのみ。
//   - プール枯渇(503)や停止時に疑似乱数へフォールバックしない。呼び出し元が
//     「引けない」を表現する(omikuji の no_entropy)。
//   - レスポンスは no-store。こちらでもキャッシュ・再利用しない。
package gofunctions

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// kudaBaseURL は kuda API のベースURL。環境変数 KUDA_BASE_URL で上書き可能で、
// テストでは httptest サーバーに差し替える(初期化は resolveKudaBaseURL 参照)。
var kudaBaseURL = resolveKudaBaseURL()

func resolveKudaBaseURL() string {
	if v := os.Getenv("KUDA_BASE_URL"); v != "" {
		return v
	}
	return "https://kuda.kojiran.workers.dev"
}

var kudaHTTPClient = &http.Client{}

// kudaFetchTimeout は /drop 一式の取得に許す時間。おみくじは演出中に呼ばれる
// ため多少待てるが、Workersが応答しない場合に抽選を長く塞がないよう短めにする。
const kudaFetchTimeout = 4 * time.Second

// kudaDrop は GET /drop のレスポンス。
type kudaDrop struct {
	Value         int    `json:"value"`    // 0-255
	DropSeq       int64  `json:"drop_seq"`
	PoolSeq       int64  `json:"pool_seq"`
	Batch         string `json:"batch"` // 出自ラベル(anu#… / home#…)
	DrawnAt       string `json:"drawn_at"`
	PoolRemaining int64  `json:"pool_remaining"`
}

// fetchKudaBytes は /drop を並列に n 回呼び、n バイトの物理乱数を取得する。
// 1つでも失敗(503含む)したら全体を error にする。取得済みバイトは kuda 側で
// 消費済み(不可逆)だが、抽選に使わず捨てるだけなので公平性には影響しない。
func fetchKudaBytes(ctx context.Context, n int) ([]kudaDrop, error) {
	ctx, cancel := context.WithTimeout(ctx, kudaFetchTimeout)
	defer cancel()

	type result struct {
		idx  int
		drop kudaDrop
		err  error
	}
	ch := make(chan result, n)
	for i := 0; i < n; i++ {
		go func(idx int) {
			drop, err := fetchKudaDrop(ctx)
			ch <- result{idx: idx, drop: drop, err: err}
		}(i)
	}

	drops := make([]kudaDrop, n)
	for i := 0; i < n; i++ {
		res := <-ch
		if res.err != nil {
			return nil, res.err
		}
		drops[res.idx] = res.drop
	}
	return drops, nil
}

func fetchKudaDrop(ctx context.Context) (kudaDrop, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, kudaBaseURL+"/drop", nil)
	if err != nil {
		return kudaDrop{}, err
	}
	req.Header.Set("User-Agent", "debug-shrine-omikujiGo")

	resp, err := kudaHTTPClient.Do(req)
	if err != nil {
		return kudaDrop{}, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return kudaDrop{}, err
	}
	if resp.StatusCode != http.StatusOK {
		// 503 = プール枯渇。それ以外も「物理乱数が用意できない」として同じ扱い。
		return kudaDrop{}, fmt.Errorf("kuda /drop: status %d: %s", resp.StatusCode, string(body))
	}
	var drop kudaDrop
	if err := json.Unmarshal(body, &drop); err != nil {
		return kudaDrop{}, err
	}
	if drop.Value < 0 || drop.Value > 255 {
		return kudaDrop{}, fmt.Errorf("kuda /drop: value out of range: %d", drop.Value)
	}
	return drop, nil
}

// bytesToUnitFloat は2バイトを r∈[0,1) に写像する(純関数)。
// 65536段階なので tier 重み(合計100)に対する量子化誤差は無視できる。
func bytesToUnitFloat(hi, lo int) float64 {
	return float64(hi*256+lo) / 65536.0
}

// byteToUnitFloat は1バイトを r∈[0,1) に写像する(純関数)。
// 文言プール(レア度ごと15件)の選択用途には256段階で十分。
func byteToUnitFloat(b int) float64 {
	return float64(b) / 256.0
}

// dedupBatches は drops の出自ラベルを順序を保って重複除去する。
func dedupBatches(drops []kudaDrop) []string {
	seen := map[string]bool{}
	batches := make([]string, 0, len(drops))
	for _, d := range drops {
		if d.Batch == "" || seen[d.Batch] {
			continue
		}
		seen[d.Batch] = true
		batches = append(batches, d.Batch)
	}
	return batches
}
