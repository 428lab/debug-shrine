// レーダーチャート描画。Node版(userOGP)が chartjs-node-canvas で描いていた
// 5軸レーダーチャートを、外部プロセス(Chart.js)に依存せずGoネイティブで再現する。
//
// Chart.js の radar 設定(app/functions/index.js の chartconfig)に対応:
//   - 5軸(たいりょく/ちから/かしこさ/しゅびりょく/すばやさ)
//   - 値は合計比の割合(%)、min=0, max=50%, グリッドは10%刻み
//     (絶対値0-150から変更。ogpimage.go の radarMaxPercent 参照)
//   - グリッド/軸線/ラベル色 rgb(242,242,242)
//   - データ塗り rgba(0,168,228,0.6) / 枠線 rgb(0,117,159)
//   - 頂点マーカー非表示
//
// 座標系はピクセル(出力解像度)で受け取り、解像度非依存にしている
// (呼び出し側 ogpimage.Render が base 実寸から係数を掛けて渡す)。
package ogpimage

import (
	"math"

	"github.com/fogleman/gg"
	"golang.org/x/image/font"
)

// radarParams はレーダーチャート1枚を描くためのピクセル指定。
type radarParams struct {
	cx, cy     float64    // 中心座標(px)
	radius     float64    // maxValue に対応する半径(px)
	labelDist  float64    // 中心からラベル中心までの距離(px)
	values     [5]float64 // 各軸の値(0..maxValue)
	maxValue   float64    // 満点(現状は割合表示で50=50%)
	gridSteps  int        // 同心グリッドの分割数
	labels     [5]string
	gridWidth  float64 // グリッド/軸線の線幅(px)
	dataStroke float64 // データ枠線の線幅(px)
	labelFace  font.Face
}

// chartPercentages は5能力の絶対値を「合計に占める割合(%)」へ正規化する(純関数)。
// 合計0(未参拝)は全軸0のまま。Web側(dashboard / u/_userName)の割合化と
// 同じ式にすること(round(v/total*100))。
func chartPercentages(hp, power, intelligence, defence, agility int) [5]float64 {
	raw := [5]float64{float64(hp), float64(power), float64(intelligence), float64(defence), float64(agility)}
	total := 0.0
	for _, v := range raw {
		total += v
	}
	if total <= 0 {
		return [5]float64{}
	}
	var pct [5]float64
	for i, v := range raw {
		pct[i] = math.Round(v / total * 100)
	}
	return pct
}

// axisAngle は軸 i の角度(ラジアン)を返す。頂点は真上(12時)始まりで時計回り
// (Chart.js radar と同じ並び)。画面座標はyが下向きなので真上は -90度。
func axisAngle(i int) float64 {
	return -math.Pi/2 + float64(i)*(2*math.Pi/5)
}

// axisPoint は中心(cx,cy)から角度theta・距離rの点を返す。
func axisPoint(cx, cy, r, theta float64) (float64, float64) {
	return cx + r*math.Cos(theta), cy + r*math.Sin(theta)
}

// drawRadar は dc に対してレーダーチャートを描画する。
func drawRadar(dc *gg.Context, p radarParams) {
	// --- 同心グリッド(多角形リング) ---
	dc.SetRGB255(242, 242, 242)
	dc.SetLineWidth(p.gridWidth)
	for step := 1; step <= p.gridSteps; step++ {
		r := p.radius * float64(step) / float64(p.gridSteps)
		for i := 0; i < 5; i++ {
			x, y := axisPoint(p.cx, p.cy, r, axisAngle(i))
			if i == 0 {
				dc.MoveTo(x, y)
			} else {
				dc.LineTo(x, y)
			}
		}
		dc.ClosePath()
		dc.Stroke()
	}

	// --- 軸線(中心から各頂点) ---
	for i := 0; i < 5; i++ {
		x, y := axisPoint(p.cx, p.cy, p.radius, axisAngle(i))
		dc.MoveTo(p.cx, p.cy)
		dc.LineTo(x, y)
		dc.Stroke()
	}

	// --- データ多角形 ---
	for i := 0; i < 5; i++ {
		v := p.values[i]
		if v < 0 {
			v = 0
		}
		if v > p.maxValue {
			v = p.maxValue
		}
		r := p.radius * v / p.maxValue
		x, y := axisPoint(p.cx, p.cy, r, axisAngle(i))
		if i == 0 {
			dc.MoveTo(x, y)
		} else {
			dc.LineTo(x, y)
		}
	}
	dc.ClosePath()
	dc.SetRGBA255(0, 168, 228, 153) // rgba(0,168,228,0.6)
	dc.SetLineWidth(p.dataStroke)
	dc.SetStrokeStyle(gg.NewSolidPattern(rgb(0, 117, 159)))
	dc.FillPreserve()
	dc.Stroke()

	// --- ラベル ---
	if p.labelFace != nil {
		dc.SetFontFace(p.labelFace)
		dc.SetRGB255(242, 242, 242)
		for i := 0; i < 5; i++ {
			theta := axisAngle(i)
			x, y := axisPoint(p.cx, p.cy, p.labelDist, theta)
			// 左方向へ伸びる軸(すばやさ/しゅびりょく)のラベルはやや右寄せにして、
			// テキストが中心(レーダー)側に被らないよう外側(左)へ少しだけ逃がす。
			// 完全な右寄せ(1.0)だと左の青パネルに重なるため、控えめの0.7にする。
			// 右側/上下は従来どおり中央寄せ(右寄せにするとカード外へはみ出すため)。
			ax := 0.5
			if math.Cos(theta) < -0.3 {
				ax = 0.7
			}
			dc.DrawStringAnchored(p.labels[i], x, y, ax, 0.5)
		}
	}
}
