package ogpimage

import (
	"bytes"
	"image"
	"image/color"
	"math"
	"os"
	"path/filepath"
	"testing"
)

// syntheticAvatar はテスト用の擬似アバター(放射状グラデーションの矩形)を作る。
// 実アバターはGitHubから取得するため、ローカルQCでは合成画像で代用する。
func syntheticAvatar(size int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	cx, cy := float64(size)/2, float64(size)/2
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			dx, dy := float64(x)-cx, float64(y)-cy
			d := math.Hypot(dx, dy) / (float64(size) / 2)
			r := uint8(80 + 120*d)
			g := uint8(180 * (1 - d))
			b := uint8(200)
			img.Set(x, y, color.RGBA{R: r, G: g, B: b, A: 255})
		}
	}
	return img
}

func sampleParams() Params {
	return Params{
		DisplayName:  "でばっぐ 太郎",
		Avatar:       syntheticAvatar(460),
		Level:        42,
		Points:       12345,
		Total:        99999,
		HP:           120,
		Power:        85,
		Intelligence: 140,
		Defence:      60,
		Agility:      95,
	}
}

func TestRenderOutputDimensions(t *testing.T) {
	img, err := Render(sampleParams())
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	want := image.Rect(0, 0, outputWidth, outputHeight)
	if img.Bounds() != want {
		t.Fatalf("rendered bounds = %v, want %v (OG standard, cropped+resized)", img.Bounds(), want)
	}
}

func TestEncodeWebPMagic(t *testing.T) {
	data, err := EncodeWebP(sampleParams())
	if err != nil {
		t.Fatalf("EncodeWebP: %v", err)
	}
	if len(data) < 12 {
		t.Fatalf("webp too short: %d bytes", len(data))
	}
	// RIFF ヘッダ + "WEBP" フォーマットタグ。
	if !bytes.Equal(data[0:4], []byte("RIFF")) || !bytes.Equal(data[8:12], []byte("WEBP")) {
		t.Fatalf("not a webp: header=% x", data[0:12])
	}
}

func TestAxisAngleAndPoint(t *testing.T) {
	// 軸0は真上(画面座標で中心の真上=yが小さい方)。
	x, y := axisPoint(100, 100, 50, axisAngle(0))
	if math.Abs(x-100) > 1e-6 || math.Abs(y-50) > 1e-6 {
		t.Errorf("axis0 point = (%.3f,%.3f), want (100,50)", x, y)
	}
	// 5軸が72度刻みで一巡する。
	if got := axisAngle(5) - axisAngle(0); math.Abs(got-2*math.Pi) > 1e-9 {
		t.Errorf("full turn = %.6f, want 2π", got)
	}
}

// TestWriteQCArtifacts は OGP_QC_OUT が設定されているときだけ、目視確認用の
// サンプル画像(PNG/WebP)を testdata/ に書き出す(CIのアーティファクト化にも使う)。
func TestWriteQCArtifacts(t *testing.T) {
	outDir := os.Getenv("OGP_QC_OUT")
	if outDir == "" {
		t.Skip("OGP_QC_OUT not set; skipping artifact generation")
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	pngData, err := EncodePNG(sampleParams())
	if err != nil {
		t.Fatalf("EncodePNG: %v", err)
	}
	webpData, err := EncodeWebP(sampleParams())
	if err != nil {
		t.Fatalf("EncodeWebP: %v", err)
	}
	if err := os.WriteFile(filepath.Join(outDir, "sample_ogp.png"), pngData, 0o644); err != nil {
		t.Fatalf("write png: %v", err)
	}
	if err := os.WriteFile(filepath.Join(outDir, "sample_ogp.webp"), webpData, 0o644); err != nil {
		t.Fatalf("write webp: %v", err)
	}
	t.Logf("QC artifacts: png=%d bytes, webp=%d bytes -> %s", len(pngData), len(webpData), outDir)
}
