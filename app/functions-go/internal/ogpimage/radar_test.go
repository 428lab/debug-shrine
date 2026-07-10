package ogpimage

import "testing"

func TestChartPercentages(t *testing.T) {
	// バランス型(全能力同値): 全軸100% = 満点の五角形
	pct := chartPercentages(100, 100, 100, 100, 100)
	for i, v := range pct {
		if v != 100 {
			t.Errorf("balanced[%d] = %v, want 100", i, v)
		}
	}

	// 特化型: 最強のpowerが100%、他はpower比
	pct = chartPercentages(30, 60, 15, 6, 3)
	want := [5]float64{50, 100, 25, 10, 5}
	if pct != want {
		t.Errorf("specialized = %v, want %v", pct, want)
	}

	// 丸め: 1/3 ≈ 33%
	pct = chartPercentages(1, 3, 0, 0, 0)
	if pct[0] != 33 || pct[1] != 100 || pct[2] != 0 {
		t.Errorf("rounding = %v", pct)
	}

	// 全て0(未参拝): 全軸0
	pct = chartPercentages(0, 0, 0, 0, 0)
	if pct != [5]float64{} {
		t.Errorf("zero = %v, want all 0", pct)
	}
}
