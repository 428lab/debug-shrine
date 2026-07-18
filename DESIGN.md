---
# でばっぐ神社 デザイントークン(機械可読)
# 実体は web/assets/css/color.css / common.css / font.css。値を変えるときは
# 必ずCSS側と本ファイルの両方を更新すること。
colors:
  text: "#ffffff"
  text-muted: "#9a9a9a"
  link: "#cccccc"
  surface: "#0d1117"
  surface-border: "#30363d"
  accent: "#e0a83c"
  accent-hover: "#c98f2a"
  accent-soft: "#ffcf6b"
  accent-tint: "rgba(255, 196, 120, 0.15)" # 選択状態の面(タブ・ピン選択行など)
  on-accent: "#1a1206" # 琥珀の上に載せる文字色
typography:
  font-family-sans: '"Helvetica Neue", Helvetica, Arial, "Hiragino Kaku Gothic ProN", Meiryo, sans-serif'
  font-family-mono: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  line-height: 1.75
  section-title:
    size: "1.35rem"
    weight: 700
rounded:
  card: "0.5rem"     # card-shrine・セグメント切替など面の角丸
  icon: "50%"        # ユーザーアイコンは正円
  pill: null         # ピル型(999px)はこのサイトでは使わない
spacing:
  content-width: "600px" # 本文系の標準幅(.content-narrow)
components:
  card: ".card-shrine"
  section-title: ".section-title"
  primary-button: ".btn-accent"
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

- 文字: `--color-text`(#fff)/ 補足・非アクティブ: `--color-text-muted`(#9a9a9a)
- 面: `--color-surface`(#0d1117)+ 枠線 `--color-surface-border`(#30363d)
- アクセント(琥珀): ボタン面は `--color-accent`、hoverは `--color-accent-hover`、
  文字強調は `--color-accent-soft`。琥珀の上の文字は `#1a1206`(焦げ茶)
- 選択状態の面は琥珀の薄いティント `rgba(255,196,120,.15)`(タブのactive、
  ピン留め候補の選択行などで共通)
- SNSブランド色は `color.css` の `--color-x` 等を使う(独自の近似色を作らない)

## Typography

- 和文ゴシック中心のシステムフォントスタック(font.css)。`line-height: 1.75`
- **游ゴシック(游ゴシック体 / Yu Gothic / YuGothic)は使わない**。日本語表示が
  細く崩れるため、和文は Hiragino Kaku Gothic ProN(mac)/ メイリオ(Windows)に落とす
- セクション見出しは `.section-title`(1.35rem / 700)
- **絵文字は使わない**(機種依存でOS・ブラウザごとに見た目が変わるため)。
  既存の見出し等に残っている絵文字は置き換え対象(#183 で管理)
- 唯一の例外: **ユーザーが投稿する文字列テンプレ(参拝・おみくじの共有文言)の
  ⛩ のみ許可**(SNS投稿文の一部であり、UIの見た目ではないため)
- 強調ラベルは `.label-accent`(琥珀・letter-spacing 0.08em)

## Layout

- 本文系コンテンツは `.content-narrow`(max-width 600px・中央寄せ)
- カード間の余白はBootstrapのユーティリティ(`mt-3` 等)で統一

## Elevation

- 影は使わない。面の区別は背景色(`--color-surface`)と1pxの枠線
  (`--color-surface-border`)で行う。hoverは `rgba(255,255,255,.06)` 程度の
  明度変化で示す

## Shapes

- **角丸はカードもコントロールも `0.5rem` で統一**(`.card-shrine` 基準)
- 例外: ユーザーアイコンは正円(`.rounded-icon`)
- **ピル型(角丸999px)は使わない**(#182でセグメント型に統一した経緯)

## Components

- **ダークカード** `.card-shrine`: 面+枠線+0.5rem。card-header は
  `rgba(255,255,255,.04)` の帯+太字(Ranking.vue の `.ranking-header` 参照)
- **主要アクション** `.btn-accent`: 琥珀面+焦げ茶文字。参拝・おみくじ等の
  1画面1つの主ボタンに限る。汎用ボタンは `btn-outline-light` 等Bootstrap標準
- **セグメント切替**(Ranking.vue `.ranking-seg`): 結合ボタン。カードと同じ
  枠線・角丸0.5rem、activeは琥珀ティント+太字。タブ的な表示切替はこれを使う
- **アイコンはFontAwesome単色**(`fas fa-fw fa-*`)で文字色に追従させる。
  **絵文字は使わない**(機種依存の見た目になる。#182でタブの絵文字を
  fa-fist-raised / fa-coins に置換した経緯)。既存の残存箇所は #183 で置き換える
- **進捗バー**: `.progress-bar` は琥珀

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
