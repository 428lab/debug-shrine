// 新しい Service Worker(=新デプロイ)を検知したら自動でページをリロードする。
//
// sw 側は skipWaiting / clientsClaim が有効なので、新版が見つかると即座に
// activate して開いているタブの制御を奪う(controllerchange が発火する)。
// ここではその切替を検知して自動リロードし、さらに開いたままのタブでも
// 新デプロイを検知できるよう定期的に update() を呼ぶ。
export default () => {
  if (!("serviceWorker" in navigator)) return;

  // プラグイン起動時点で既に SW に制御されているか。
  // 初回インストール(制御なし→あり)ではリロード不要なため区別する。
  // 初回インストール後は制御下に入るので true に更新する(固定のままだと、
  // 初回訪問のタブでは以降の新デプロイでも一切リロードされなくなる)。
  let hasController = !!navigator.serviceWorker.controller;

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hasController) {
      // 初回インストールによる制御開始。リロードは不要だが、次回以降の
      // controllerchange は新デプロイによる切替なのでリロード対象にする。
      hasController = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.ready.then((registration) => {
    const checkForUpdate = () => {
      registration.update().catch(() => {});
    };
    // タブ復帰時と一定間隔で新バージョンを確認する
    window.addEventListener("focus", checkForUpdate);
    setInterval(checkForUpdate, 60 * 1000);
  });
};
