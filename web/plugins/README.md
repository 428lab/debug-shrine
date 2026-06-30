# PLUGINS

**This directory is not required, you can delete it if you don't want to use it.**

This directory contains Javascript plugins that you want to run before mounting the root Vue.js application.

More information about the usage of this directory in [the documentation](https://nuxtjs.org/guide/plugins).

## プラグイン一覧

### `persistedstate.js`

`vuex-persistedstate` を使い、Vuex ストアを `localStorage`(キー: `debug-shrine`)へ永続化する。

### `sw-update.client.js`

新しい Service Worker(=新デプロイ)を検知したら自動でページをリロードする
クライアント専用プラグイン。スーパーリロードなしで更新を反映するための仕組み。

- `nuxt.config.js` の `pwa.workbox` で `skipWaiting` / `clientsClaim` を有効化しているため、
  新版 SW は見つかると即座に activate し、開いているタブの制御を奪う(`controllerchange` 発火)。
- 本プラグインはその `controllerchange` を検知してページを自動リロードする。
  初回インストール(以前 controller が無い状態)ではリロードしない。
- 開いたままのタブでも新デプロイを取りこぼさないよう、タブ復帰時(`focus`)と
  60 秒間隔で `registration.update()` を呼び新バージョンを確認する。
