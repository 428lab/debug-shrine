# internal/ogpimage

ユーザーOGP画像(でばっぐのうりょくカード)を生成するパッケージ。
`userOGPGo`(`app/functions-go/userogp.go`)から利用する。Node版
(`app/functions/index.js` の `createOgp`、`canvas` + `chartjs-node-canvas`)相当の
カード合成を、外部プロセス依存なしのGoネイティブ実装として再現する。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `ogpimage.go` | 合成本体。座標定数・フォント/base読込・テキスト/アイコン描画・クロップ&縮小・WebP/PNGエンコード。 |
| `radar.go` | レーダーチャート描画(Chart.js の radar 設定に対応)。ピクセル指定で解像度非依存。 |
| `base.png` | ベースカード画像(2500×1313)。`go:embed` で同梱。 |
| `fonts/NotoSansJP-Regular.otf` | 日本語フォント。`go:embed` で同梱(OFL)。 |
| `ogpimage_test.go` | 出力寸法・WebPマジック・レーダー幾何の単体テスト＋QCサンプル生成。 |
| `testdata/` | QC用に生成したサンプルOGP(目視確認用の参照画像)。 |

## 描画パイプライン

1. `base.png`(2500×1313)を `gg.Context` に読み込む。
2. デザイン基準(Node版=2500×1313)の座標定数を `scale = baseW/2500` で比例させて、
   表示名・アイコン(円形クリップ)・ステータス・レーダーチャートを合成する。
3. **カード領域をOG比(1200:630)でクロップ**する。元画像は上下左右の暗い背景余白が
   広く、そのまま縮小するとカード=文字が小さくなるため、カード塗り(黒/青)の実測
   外接矩形に小マージンを付けた矩形を切り出す。
4. クロップ結果を**一度だけ**最終出力サイズ(1200×630)へ高品質縮小(CatmullRom)する。
   縮小前にクロップすることで、再拡大による画質劣化を避ける。
5. WebP(可逆VP8L)でエンコードして返す(`EncodeWebP`)。QC比較用に `EncodePNG` もある。

## 座標・定数のメンテナンス

- レイアウト座標はすべて Node版のデザイン基準(2500×1313)で `ogpimage.go` の定数として保持。
- クロップに使うカード外接矩形(`cardMinX/MaxX/MinY/MaxY`)は `base.png` から実測した値。
  **`base.png` を差し替えたら再計測して更新すること。**
- 出力サイズは `outputWidth`/`outputHeight`(1200×630)。`ogpRewrite` が注入する
  `og:image:width`/`:height` と一致させること。

## QC(画質確認)

`TestWriteQCArtifacts` は環境変数 `OGP_QC_OUT` が指すディレクトリにサンプルOGP
(PNG/WebP)を書き出す。ローカルでの生成例:

```bash
cd app/functions-go
OGP_QC_OUT="$PWD/internal/ogpimage/testdata" go test ./internal/ogpimage/ -run TestWriteQCArtifacts -v
```

CI(`.github/workflows/dev-deploy.yml`)でも同テストを実行し、生成物を
`actions/upload-artifact`(名前 `ogp-sample`)としてアップロードして目視確認できる。

## 依存

- `github.com/fogleman/gg` — 2D描画。
- `golang.org/x/image/draw` — 高品質リサイズ(CatmullRom)。
- `golang.org/x/image/font/opentype` — フォント読込。
- `github.com/HugoSmits86/nativewebp` — 純Goの可逆WebPエンコーダ(cgo不要)。
