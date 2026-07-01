// Package ogpimage はユーザーOGP画像(でばっぐのうりょくカード)を生成する。
//
// Node版(app/functions/index.js の createOgp)は canvas + chartjs-node-canvas で
// ベース画像に「表示名・アイコン・ステータス・レーダーチャート」を合成していた。
// 本パッケージはそれを外部プロセス依存なしのGoネイティブ実装として再現する。
//
// 設計方針:
//   - 座標はNode版のデザイン基準(2500x1313)をそのまま定数として保持し、
//     実際の base 画像の幅から scale = baseW/2500 を求めて全座標を比例縮小する。
//     これによりベース画像の解像度を変えてもレイアウトを1箇所で追従できる。
//   - ベースPNG(2500x1313)とフォント(Noto Sans JP)はバイナリに go:embed で同梱する。
//     Node版のように実行時にGCSからbase.pngをダウンロードする往復が不要になり
//     高速化する。
//   - レンダリングは base の元解像度(2500x1313)で行い、合成後に「カード領域」を
//     OG比(outputWidth:outputHeight)でクロップしてから最終出力サイズへ一度だけ
//     高品質縮小する。元画像には上下左右に暗い背景の余白が広く、そのまま縮小すると
//     カード=文字が小さくなってしまうため、余白を除去して相対的に大きく見せる
//     (元解像度でレンダリング→クロップ→縮小、の順にすることで再拡大による画質劣化を避ける)。
//   - 出力はWebP(可逆VP8L)。フラットなカード画像はPNGより大幅に小さくなる。
package ogpimage

import (
	"bytes"
	_ "embed"
	"fmt"
	"image"
	"image/color"
	_ "image/jpeg" // アバターJPEGのデコード用
	"image/png"
	"sync"

	"github.com/HugoSmits86/nativewebp"
	"github.com/fogleman/gg"
	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
)

//go:embed base.png
var basePNGData []byte

//go:embed fonts/NotoSansJP-Regular.otf
var notoSansJPData []byte

// デザイン基準(Node版 index.js の座標系。base.png=2500x1313 を前提にしていた)。
const (
	designWidth = 2500.0

	nameX        = 700.0
	nameY        = 310.0
	nameMaxRight = 1280.0 // fillText の maxWidth 引数(userPos.max)
	baseFontSize = 60.0   // fontStyle: 60px
	lineHeight   = 100.0  // fontStyle.lineHeight

	avatarX    = 680.0
	avatarY    = 431.0
	avatarSize = 215.0

	// ステータス3行。左パネル(青)のステータス行の右端は実測で design x≈1292、左端は624。
	// せんとうりょく等が大きい値(例: 99999)でも右端をはみ出さないよう、開始位置を
	// 左へ寄せ(680→640)、さらに上限幅ガードを設ける。
	// 「せんとうりょく：99999」=645px は縮小なしで収まり、6桁など上限を超える値のみ
	// canvasのfillText(maxWidth)と同様に横方向へ縮小する。
	statsX        = 640.0
	statsMaxWidth = 650.0 // 640 + 650 = 1290 ≦ パネル右端1292
	statsY        = 740.0

	// チャート(chartPost + chartWidth/Height=550)。中心はボックス中央。
	chartCenterX = 1325.0 + 550.0/2.0 // 1600
	chartCenterY = 300.0 + 550.0/2.0  // 575
	// レーダー半径とラベル距離はChart.jsの見た目に合わせて調整した値。
	// (Chart.jsはpointLabelsの領域を差し引いて描画半径を決めるため、
	//  550pxボックス内にラベルが収まるよう半径を抑えている)
	chartRadius    = 185.0
	chartLabelDist = 225.0
	labelFontSize  = 25.0

	gridLineWidth = 3.0
	dataStrokeW   = 2.0
	// グリッド(同心リング)の分割数。Chart.js の stepSize=10 相当は15本だが、
	// 蜘蛛の巣状で見づらいため約半分の8本に減らしている。
	radarGridSteps = 8

	// 最終出力サイズ(OGP標準)。クロップ後にこのサイズへ一度だけ縮小する。
	outputWidth  = 1200
	outputHeight = 630

	// カード(塗り=黒/青)の外接矩形。base.png(2500x1313)から実測した値
	// (black|blue 画素の bbox)。base.png を差し替えたら再計測して更新すること。
	cardMinX = 594.0
	cardMaxX = 1905.0
	cardMinY = 228.0
	cardMaxY = 1084.0
	// カードの丸角/枠を切り落とさないための余白(デザイン基準px)。
	cardMargin = 20.0
)

// Params は1枚のOGP画像を生成するための入力。
type Params struct {
	DisplayName string
	Avatar      image.Image // 円形クリップして描画。nilなら描画しない。
	Level       int
	Points      int
	Total       int
	// レーダー各軸の値(0..150)。
	HP           int
	Power        int
	Intelligence int
	Defence      int
	Agility      int
}

var (
	baseOnce  sync.Once
	baseImg   image.Image
	baseErr   error
	fontOnce  sync.Once
	fontSFNT  *opentype.Font
	fontErr   error
	faceCache sync.Map // float64(size) -> font.Face
)

func loadBase() (image.Image, error) {
	baseOnce.Do(func() {
		baseImg, baseErr = png.Decode(bytes.NewReader(basePNGData))
	})
	return baseImg, baseErr
}

func loadFont() (*opentype.Font, error) {
	fontOnce.Do(func() {
		fontSFNT, fontErr = opentype.Parse(notoSansJPData)
	})
	return fontSFNT, fontErr
}

// newFace はサイズ(px)ごとに font.Face を生成してキャッシュする。DPI=72なので
// opentype.FaceOptions.Size(pt) はそのままpxとして扱える。
func newFace(sizePx float64) (font.Face, error) {
	if f, ok := faceCache.Load(sizePx); ok {
		return f.(font.Face), nil
	}
	sfnt, err := loadFont()
	if err != nil {
		return nil, err
	}
	face, err := opentype.NewFace(sfnt, &opentype.FaceOptions{
		Size:    sizePx,
		DPI:     72,
		Hinting: font.HintingFull,
	})
	if err != nil {
		return nil, err
	}
	faceCache.Store(sizePx, face)
	return face, nil
}

func rgb(r, g, b uint8) color.Color { return color.RGBA{R: r, G: g, B: b, A: 255} }

// Render はカード画像を合成して image.Image を返す。
func Render(p Params) (image.Image, error) {
	base, err := loadBase()
	if err != nil {
		return nil, fmt.Errorf("load base: %w", err)
	}
	dc := gg.NewContextForImage(base)
	scale := float64(dc.Width()) / designWidth

	nameFace, err := newFace(baseFontSize * scale)
	if err != nil {
		return nil, fmt.Errorf("name face: %w", err)
	}
	labelFace, err := newFace(labelFontSize * scale)
	if err != nil {
		return nil, fmt.Errorf("label face: %w", err)
	}

	dc.SetColor(rgb(255, 255, 255))

	// 表示名(canvasのmaxWidth相当: はみ出す場合は横方向に縮小)
	drawTextTopScaled(dc, nameFace, p.DisplayName, nameX*scale, nameY*scale, (nameMaxRight-nameX)*scale)

	// アイコン(円形クリップ)
	if p.Avatar != nil {
		drawCircularAvatar(dc, p.Avatar, avatarX*scale, avatarY*scale, avatarSize*scale)
	}

	// ステータス(maxWidthなし)
	dc.SetColor(rgb(255, 255, 255))
	stats := []string{
		fmt.Sprintf("れべる：%d", p.Level),
		fmt.Sprintf("ポイント：%d", p.Points),
		fmt.Sprintf("せんとうりょく：%d", p.Total),
	}
	for i, line := range stats {
		drawTextTopScaled(dc, nameFace, line, statsX*scale, (statsY+lineHeight*float64(i))*scale, statsMaxWidth*scale)
	}

	// レーダーチャート
	drawRadar(dc, radarParams{
		cx:         chartCenterX * scale,
		cy:         chartCenterY * scale,
		radius:     chartRadius * scale,
		labelDist:  chartLabelDist * scale,
		values:     [5]float64{float64(p.HP), float64(p.Power), float64(p.Intelligence), float64(p.Defence), float64(p.Agility)},
		maxValue:   150,
		gridSteps:  radarGridSteps,
		labels:     [5]string{"たいりょく", "ちから", "かしこさ", "しゅびりょく", "すばやさ"},
		gridWidth:  gridLineWidth * scale,
		dataStroke: dataStrokeW * scale,
		labelFace:  labelFace,
	})

	return cropCardAndResize(dc.Image(), scale), nil
}

// cropCardAndResize は合成済み画像(base元解像度)から、カード領域をOG比で切り出し、
// 最終出力サイズ(outputWidth×outputHeight)へ一度だけ高品質縮小する。
func cropCardAndResize(src image.Image, scale float64) image.Image {
	// デザイン基準でのクロップ矩形(OG比を保ちつつカード全体を含む最小矩形)。
	boxL := cardMinX - cardMargin
	boxR := cardMaxX + cardMargin
	boxT := cardMinY - cardMargin
	boxB := cardMaxY + cardMargin
	boxW := boxR - boxL
	boxH := boxB - boxT
	cx := (boxL + boxR) / 2
	cy := (boxT + boxB) / 2

	ratio := float64(outputWidth) / float64(outputHeight)
	cropH := boxH
	if w := boxW / ratio; w > cropH {
		cropH = w
	}
	cropW := cropH * ratio

	// 実ピクセルへ換算し、中心を合わせつつ画像内へクランプ。
	sw := float64(src.Bounds().Dx())
	sh := float64(src.Bounds().Dy())
	cwp := cropW * scale
	chp := cropH * scale
	if cwp > sw {
		cwp = sw
	}
	if chp > sh {
		chp = sh
	}
	x0 := cx*scale - cwp/2
	y0 := cy*scale - chp/2
	if x0 < 0 {
		x0 = 0
	}
	if y0 < 0 {
		y0 = 0
	}
	if x0+cwp > sw {
		x0 = sw - cwp
	}
	if y0+chp > sh {
		y0 = sh - chp
	}
	rect := image.Rect(int(x0+0.5), int(y0+0.5), int(x0+cwp+0.5), int(y0+chp+0.5)).Add(src.Bounds().Min)

	sub := image.Image(src)
	if si, ok := src.(interface {
		SubImage(r image.Rectangle) image.Image
	}); ok {
		sub = si.SubImage(rect)
	}

	out := image.NewRGBA(image.Rect(0, 0, outputWidth, outputHeight))
	xdraw.CatmullRom.Scale(out, out.Bounds(), sub, sub.Bounds(), xdraw.Over, nil)
	return out
}

// drawTextTopScaled は「上揃え(textBaseline=top)」でテキストを描く。maxWidth>0 かつ
// テキスト幅がそれを超える場合は、canvasのfillText(maxWidth)と同様に横方向へ縮小する。
func drawTextTopScaled(dc *gg.Context, face font.Face, text string, x, y, maxWidth float64) {
	dc.SetFontFace(face)
	ascent := float64(face.Metrics().Ascent) / 64.0
	w, _ := dc.MeasureString(text)
	sx := 1.0
	if maxWidth > 0 && w > maxWidth {
		sx = maxWidth / w
	}
	dc.Push()
	dc.Translate(x, y+ascent)
	if sx != 1.0 {
		dc.Scale(sx, 1)
	}
	dc.DrawString(text, 0, 0)
	dc.Pop()
}

// drawCircularAvatar はアバターを size×size に縮小し、半径 size/2*0.9 の円でクリップして描く
// (Node版 userIconCanvas の ri = width/2*0.9 と同じ)。
func drawCircularAvatar(dc *gg.Context, avatar image.Image, x, y, size float64) {
	iSize := int(size + 0.5)
	scaled := image.NewRGBA(image.Rect(0, 0, iSize, iSize))
	xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), avatar, avatar.Bounds(), xdraw.Over, nil)

	dc.Push()
	dc.DrawCircle(x+size/2, y+size/2, size/2*0.9)
	dc.Clip()
	dc.DrawImage(scaled, int(x+0.5), int(y+0.5))
	dc.ResetClip()
	dc.Pop()
}

// EncodeWebP は Render 結果を可逆WebP(VP8L)としてエンコードする。
func EncodeWebP(p Params) ([]byte, error) {
	img, err := Render(p)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := nativewebp.Encode(&buf, img, nil); err != nil {
		return nil, fmt.Errorf("encode webp: %w", err)
	}
	return buf.Bytes(), nil
}

// EncodePNG は Render 結果をPNGとしてエンコードする(主にQC/比較用)。
func EncodePNG(p Params) ([]byte, error) {
	img, err := Render(p)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, fmt.Errorf("encode png: %w", err)
	}
	return buf.Bytes(), nil
}
