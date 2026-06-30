# COMPONENTS

**This directory is not required, you can delete it if you don't want to use it.**

The components directory contains your Vue.js Components.

_Nuxt.js doesn't supercharge these components._

## 参拝結果の演出コンポーネント

`pages/sanpai.vue`（参拝結果）で使う、変化表示・演出系の再利用コンポーネント。

- `CountUp.vue` … 数値を `from`→`value` までアニメーションで増加表示する汎用コンポーネント。
  ポイント・戦闘力などに使用。props: `value` `from` `duration` `delay` `prefix` `suffix`。
- `LevelUpBanner.vue` … レベルアップ時に派手に表示するバナー。`from`/`to` を受け取り、
  レベルが上がった時だけ親側で `v-if` 表示する。
- `ShareText.vue` … SNS投稿用テキストを表示し、ワンクリックでクリップボードへコピーする。
  テキストエリアは編集可能。props: `text` `title`。

- `Loading.vue` … 解析中/読込中のフルスクリーン演出。ふわふわ浮く鳥居＋発光、
  舞い上がる光の粒、順に灯る提灯（進捗感）で構成。props: `message`（単一）、
  `messages`（配列を渡すと一定間隔で巡回表示。参拝の解析中に使用）、`interval`。
