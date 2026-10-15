---
# でばっぐ神社 デザイントークン(機械可読)
# 実体は web/assets/css/color.css / common.css / font.css。値を変えるときは
# 必ずCSS側と本ファイルの両方を更新すること。
colors:
  bg: "#15110d" # ページ背景(琥珀と同系の暖色の黒)
  band: "#1a1511" # 帯を残す所だけに使う面(旧 bg-dark の代替)
  text: "#ffffff"
  text-muted: "#9a9a9a"
  link: "#cccccc"
  surface: "#0d1117"
  surface-border: "#30363d"
  surface-raised: "rgba(255, 255, 255, 0.04)" # カード内タイル・カードヘッダー帯
  line-soft: "rgba(255, 255, 255, 0.08)" # ヘッダー/フッター/行区切りの薄い線
  line-strong: "rgba(255, 255, 255, 0.18)" # hover・ゴーストボタンの枠
  accent: "#e0a83c"
  accent-hover: "#c98f2a"
  accent-soft: "#ffcf6b"
  accent-tint: "rgba(255, 196, 120, 0.15)" # 選択状態の面(タブ・ピン選択行など)
  on-accent: "#1a1206" # 琥珀の上に載せる文字色
  danger: "#ff6b6b" # 注意喚起(エラー・警告)。暗い背景で読めるよう純赤より明るく
typography:
  font-family-sans: '"Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, system-ui, sans-serif'
  font-family-serif: '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif' # 口上(.quote)専用
  font-family-mono: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  webfont: "Zen Kaku Gothic New 400/500/700(Google Fonts。nuxt.config.js の head.link)"
  line-height:
    body: 1.7
    prose: 1.85   # about / 利用規約など長文(.prose)
    heading: 1.3
  h1:
    size: "2rem"   # 575.98px 以下は 1.6rem
    weight: 700
  section-title:
    size: "1.25rem"
    weight: 700
rounded:
  card: "0.5rem"     # card-shrine・セグメント切替など面の角丸
  icon: "50%"        # ユーザーアイコンは正円
  pill: null         # ピル型(999px)はこのサイトでは使わない
spacing:
  content-width: "600px" # 本文系の標準幅(.content-narrow)
  content-width-wide: "800px" # 一覧・結果系の幅(.content-wide)
background:
  image: "/background.png" # 63x72px の三角パターン
  size: "63px 72px"        # 原寸で repeat(画面幅依存の % 指定はしない)
components:
  card: ".card-shrine"
  card-tile: ".tile / .stat-tiles"
  section-title: ".section-title"
  primary-button: ".btn-accent"
  secondary-button: ".btn-ghost"
  icon-button: ".btn-icon"
  text-link: ".link-more"
  ranking-row: ".rank-row"
  header: ".site-header" # 半透明+blur の sticky(唯一の例外)
  accent-label: ".label-accent"
  segmented-control: ".ranking-seg / .seg-btn" # web/components/Ranking.vue
---

# でばっぐ神社 DESIGN.md

## Overview

でばっぐ神社のビジュアルは**「夜の神社 × 暖色」**。暗い和柄の背景の上に、
GitHubのダークUIに寄せたカード(`--color-surface: #0d1117`)を置き、
提灯・鈴の金に合わせた**琥珀のアクセント**(`--color-accent`)で
主要アクションと選択状態を示す。

- 実装の正: `web/assets/css/color.css`(トークン)・`common.css`(部品)・`font.css`
- UIはBootstrap 5ベース。ただし白背景既定の部品(card/list-group等)は
  必ずダークカード用クラス(`.card-shrine` 等)を併用する
- ステータス名はひらがな表記が公式(れべる・ぽいんと・せんとうりょく)

## Colors

- ページ背景: `--color-bg`(#15110d、琥珀と同系の暖色の黒)。三角パターン
  `/background.png`(63×72px)を**原寸で repeat** する。色は乗せず画像のまま使う。背景を `#000` や青黒にしない。パターンは消さない
- 帯が要る所だけ `--color-band`(#1a1511)。Bootstrap の `bg-dark` は使わない
- 面の上の 1 段上げ: `--color-surface-raised`(タイル・カードヘッダー帯)。
  線: `--color-line-soft`(ヘッダー/フッター/行区切り)/ `--color-line-strong`(hover・ゴーストボタンの枠)
- 文字: `--color-text`(#fff)/ 補足・非アクティブ: `--color-text-muted`(#9a9a9a)
- 面: `--color-surface`(#0d1117)+ 枠線 `--color-surface-border`(#30363d)
- アクセント(琥珀): ボタン面は `--color-accent`、hoverは `--color-accent-hover`、
  文字強調は `--color-accent-soft`。琥珀の上の文字は `#1a1206`(焦げ茶)
- 注意喚起(エラー・警告)は `--color-danger`(#ff6b6b)。読み飛ばされると困る
  ものは文字色だけでなく、同色のボーダー+薄いティントの面で囲って目立たせる
- 選択状態の面は琥珀の薄いティント `rgba(255,196,120,.15)`(タブのactive、
  ピン留め候補の選択行などで共通)
- SNSブランド色は `color.css` の `--color-x` 等を使う(独自の近似色を作らない)

## Typography

- 和文は Web フォント **Zen Kaku Gothic New**(Google Fonts から 400/500/700 を配信。
  JS に同梱すると初回ロードが重くなるため)。読み込み前・失敗時はヒラギノ / メイリオに落とす(font.css)
- 行間は 3 段: 本文 1.7 / 長文(`.prose`)1.85 / 見出し 1.3。見出しは `palt` + 字間 0.02em
- ページの h1 は 2rem(スマホ 1.6rem)、1 ページに 1 つ
- 口上・台詞(「殊勝なことじゃ…」等)は見出しではない。`.quote`(明朝・600)で `fs-3` まで
- 桁を揃えたい数字(ランキング・ステータス)は `font-variant-numeric: tabular-nums`(`.num`)
- **游ゴシック(游ゴシック体 / Yu Gothic / YuGothic)は使わない**。日本語表示が
  細く崩れるため、和文は Hiragino Kaku Gothic ProN(mac)/ メイリオ(Windows)に落とす
- セクション見出しは `.section-title`(1.25rem / 700)。前に置く FontAwesome アイコンは
  `--color-accent-soft`
- **絵文字は使わない**(機種依存でOS・ブラウザごとに見た目が変わるため)。
  既存の見出し等に残っている絵文字は置き換え対象(#183 で管理)
- 唯一の例外: **ユーザーが投稿する文字列テンプレ(参拝・おみくじの共有文言)の
  ⛩ のみ許可**(SNS投稿文の一部であり、UIの見た目ではないため)
- 強調ラベルは `.label-accent`(琥珀・letter-spacing 0.08em)

## Layout

- 幅は 3 段: `.content-narrow`(600px: おみくじ・about・規約・儀式)/
  `.content-wide`(800px: ランキング・ミニゲーム・参拝結果)/ `.container`(全幅: トップ・マイページ・公開プロフィール)
- ヘッダーとページ本文はどちらも `.container`(左端を揃える)
- 本文の最下端からフッターまでの 48px は `layouts/default.vue` で一括して取る
- ボタン・チップの並びは `d-flex flex-wrap gap-2`(個々に `me-2` を付けない)
- カード間の余白はBootstrapのユーティリティ(`mt-3` 等)で統一

## Elevation

- 影は使わない。面の区別は背景色(`--color-surface`)と1pxの枠線
  (`--color-surface-border`)で行う。hoverは `rgba(255,255,255,.06)` 程度の
  明度変化で示す
- 例外 1: **ヘッダー(`.site-header`)だけ**半透明(`rgba(13,17,23,.82)`)+
  `backdrop-filter: blur(10px)` の sticky。カード・フッター・モーダルには使わない
  (非対応ブラウザは `--color-surface` のベタ)
- 例外 2: 演出(おみくじ札・レベルアップ・拍手)の影・グローは残してよい

## Shapes

- **角丸はカードもコントロールも `0.5rem` で統一**(`.card-shrine` 基準)
- 例外: ユーザーアイコンは正円(`.rounded-icon`)
- **ピル型(角丸999px)は使わない**(#182でセグメント型に統一した経緯)

## Components

- **ダークカード** `.card-shrine`: 面+枠線+0.5rem。card-header は
  `rgba(255,255,255,.04)` の帯+太字(Ranking.vue の `.ranking-header` 参照)
- **ボタンは 4 種**(`.btn` の角丸 0.5rem・高さ 40px / lg 48px / sm 32px。
  フォーカスは琥珀の outline で、Bootstrap の青いリングは出さない)
  - 主 `.btn-accent`: 琥珀面+焦げ茶文字。参拝・おみくじ等の1画面1つの主ボタンに限る
  - 副 `.btn-ghost`: 薄い透過面(`--color-surface-raised`)+`--color-line-strong` の枠
  - アイコンのみ `.btn-icon`: 36×36。フッター SNS・共有。ブランド色はベタ塗りでなく
    アイコンの色で出す
  - 文字 `.link-more`: 「もっと詳しく ›」等。下線なし、hover で下線
  - `btn-outline-light` / `btn-outline-warning` / `btn-secondary` と、ブランド色ベタ塗りの
    ボタン(`bg-discord` 等)は使わない
- **タイル** `.tile`(`.stat-tiles` で並べる): カード内のステータス表示。箱の入れ子は
  `.card-shrine > .tile` の 1 段まで
- **ランキング行** `.rank-row`: 順位(固定幅・右寄せ)/ アイコン / 名前 / 値 / › の 5 列。
  1〜3 位の順位は `--color-accent-soft`、自分の行は琥珀ティント
- **セグメント切替**(Ranking.vue `.ranking-seg`): 結合ボタン。カードと同じ
  枠線・角丸0.5rem、activeは琥珀ティント+太字。タブ的な表示切替はこれを使う
- **アイコンはFontAwesome単色**(`fas fa-fw fa-*`)で文字色に追従させる。
  **絵文字は使わない**(機種依存の見た目になる。#182でタブの絵文字を
  fa-fist-raised / fa-coins に置換した経緯)。既存の残存箇所は #183 で置き換える
- **注意喚起** `.notice-danger`(common.css): 読み込み失敗・保存失敗・表示内容の
  食い違いなど、読み飛ばされると困る知らせ。赤字+同色ボーダー+薄い面+
  `fa-exclamation-triangle`。Bootstrapの `alert` は白背景なので使わない
- **進捗バー**: `.progress-bar` は琥珀
- **フォーム**: `.form-control` は `--color-surface` の面+枠線、フォーカスは琥珀の枠

## Do's and Don'ts

- ✅ 色・角丸は必ずトークン/既存クラスを参照する(`var(--color-*)`)
- ✅ 新しいUI部品を作る前に `common.css` と既存コンポーネントの流用を検討する
- ✅ 選択状態は「琥珀ティント面+文字色を text に昇格+太字」で表す
- ❌ ピル型(角丸999px)・影・グラデーションを持ち込まない
- ❌ 絵文字を使わない(機種依存。アイコンはFontAwesome単色を使う。残存箇所は #183。
  例外はユーザー投稿テンプレの ⛩ のみ)
- ❌ Bootstrap既定の白背景部品を素のまま使わない(ダークカード化する)
- ❌ 独自のグレー・金色をハードコードしない(トークンに無い色が必要になったら
  まず `color.css` にトークンを追加する)
