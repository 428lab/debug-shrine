// 新しい Service Worker(=新デプロイ)を検知したら自動でページをリロードする。
//
// sw 側は skipWaiting / clientsClaim が有効なので、新版が見つかると即座に
// activate して開いているタブの制御を奪う(controllerchange が発火する)。
// ここではその切替を検知して自動リロードし、さらに開いたままのタブでも
// 新デプロイを検知できるよう定期的に update() を呼ぶ。
//
// ただし参拝の儀式〜参拝API実行中にリロードすると儀式画面からやり直しになり、
// 再拍手→expire の原因になる(#198)。画面側が window.$swReloadGuard.blocked を
// 立てている間はリロードを保留し、ブロック解除後の画面遷移時に実施する。
export default ({ app }) => {
  if (!("serviceWorker" in navigator)) return;

  // 「今リロードされると困る」画面(参拝の儀式中など)が blocked を立てるガード
  const guard = { blocked: false, pending: false };
  window.$swReloadGuard = guard;

  // プラグイン起動時点で既に SW に制御されているか。
  // 初回インストール(制御なし→あり)ではリロード不要なため区別する。
  // 初回インストール後は制御下に入るので true に更新する(固定のままだと、
  // 初回訪問のタブでは以降の新デプロイでも一切リロードされなくなる)。
  let hasController = !!navigator.serviceWorker.controller;

  let reloading = false;
  const reload = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hasController) {
      // 初回インストールによる制御開始。リロードは不要だが、次回以降の
      // controllerchange は新デプロイによる切替なのでリロード対象にする。
      hasController = true;
      return;
    }
    if (guard.blocked) {
      guard.pending = true;
      return;
    }
    reload();
  });

  // 保留したリロードは画面遷移後に実施(表示中の儀式・結果を突然消さない)
  if (app.router) {
    app.router.afterEach(() => {
      if (guard.pending && !guard.blocked) {
        guard.pending = false;
        reload();
      }
    });
  }

  navigator.serviceWorker.ready.then((registration) => {
    const checkForUpdate = () => {
      registration.update().catch(() => {});
    };
    // タブ復帰時と一定間隔で新バージョンを確認する
    window.addEventListener("focus", checkForUpdate);
    setInterval(checkForUpdate, 60 * 1000);
  });
};
