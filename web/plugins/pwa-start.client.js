// PWA(standalone表示)起動時に前回表示していたURLが復元される問題への対策(#197)。
//
// manifest の start_url は "/" だが、OSやブラウザは「最後に表示していたURL」で
// アプリを復元することがあり、おみくじ・参拝の途中画面から始まってしまう。
// セッション初回(=アプリの起動)かつ standalone 表示で、途中画面にいる場合
// だけトップへ戻す。タブ切替や同一セッション内の遷移では何もしない。
export default ({ app }) => {
  const isStandalone =
    (window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    // iOS Safari のホーム画面起動
    window.navigator.standalone === true;
  if (!isStandalone) return;

  const KEY = "debug-shrine:pwa-session-started";
  let started = null;
  try {
    // sessionStorage はアプリの再起動で消えるため「起動直後」の判定に使える
    started = sessionStorage.getItem(KEY);
    sessionStorage.setItem(KEY, "1");
  } catch (e) {
    return; // storage が使えない環境では何もしない
  }
  if (started) return;

  // 状態を持つ途中画面だけ start_url へ戻す(結果表示等は各画面が自力復元する)
  const MID_FLOW_PATHS = ["/omikuji", "/sanpai"];
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (MID_FLOW_PATHS.includes(path) && app.router) {
    app.router.replace("/");
  }
};
