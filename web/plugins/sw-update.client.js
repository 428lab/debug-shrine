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
  const hadController = !!navigator.serviceWorker.controller;

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadController) return;
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
