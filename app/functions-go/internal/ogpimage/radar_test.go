package ogpimage

import "testing"

func TestChartPercentages(t *testing.T) {
	// バランス型: 各20%
	pct := chartPercentages(100, 100, 100, 100, 100)
	for i, v := range pct {
		if v != 20 {
			t.Errorf("balanced[%d] = %v, want 20", i, v)
		}
	}

	// 特化型: power が過半を占める
	pct = chartPercentages(10, 60, 10, 10, 10)
	want := [5]float64{10, 60, 10, 10, 10}
	if pct != want {
		t.Errorf("specialized = %v, want %v", pct, want)
	}

	// 丸め: 1/3 ≈ 33%
	pct = chartPercentages(1, 1, 1, 0, 0)
	if pct[0] != 33 || pct[3] != 0 {
		t.Errorf("rounding = %v", pct)
	}

	// 合計0(未参拝): 全軸0
	pct = chartPercentages(0, 0, 0, 0, 0)
	if pct != [5]float64{} {
		t.Errorf("zero total = %v, want all 0", pct)
	}
}
