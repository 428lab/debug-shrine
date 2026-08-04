// おみくじのクールダウンをローカルに覚えておく。
//
// 次に引ける時刻は前回引いた瞬間に確定しているのに、どこにも保存していな
// かったため、「おみくじ」を開くたびに トークン取得 → omikujiGo(peek) の
// 往復を待たされ、そのあとで初めて「まだ引けない」と分かっていた。押してから
// 待たされた末に引けないと知らされるのが体感として一番つらい。
//
// 保存しておけば、ページは待たずにクールダウン表示から始められるし、
// ヘッダのリンクの文言も開く前に変えられる。サーバーの応答が正であることは
// 変わらない(ここに保存するのは表示を先に出すためだけ。実際に引けるかは
// 常にサーバーが決める)。
//
// 判定は storage を注入できる純関数にしてあり、Nodeで決定論的に検証できる
// (sanpaiSession.js と同じ流儀)。

// アカウントを切り替えたときに前の人の残り時間を見せないよう、キーに
// github_id を含める。
var STORAGE_PREFIX = "debug-shrine:omikuji-next-at:";

function storageKey(githubId) {
  return STORAGE_PREFIX + (githubId == null ? "" : String(githubId));
}

function defaultStorage() {
  // プライベートモード等で localStorage が使えない環境では諦める
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
}

// サーバーから残り秒を受け取ったときに呼ぶ。remainingSeconds が 0 以下
// (=引ける)なら記録を消す。
function saveOmikujiCooldown(githubId, remainingSeconds, now, storage) {
  storage = storage || defaultStorage();
  if (!storage) return;
  if (typeof remainingSeconds !== "number" || remainingSeconds <= 0) {
    clearOmikujiCooldown(githubId, storage);
    return;
  }
  try {
    storage.setItem(storageKey(githubId), String(now + remainingSeconds * 1000));
  } catch (e) {
    // 容量超過等。保存できなくても表示が遅くなるだけなので黙って続行
  }
}

// 残り秒を返す。引ける・不明・壊れたデータなら 0。
// 端末の時計は信用しきれないので、これはあくまで表示の先出し用。
function loadOmikujiRemaining(githubId, now, storage) {
  storage = storage || defaultStorage();
  if (!storage) return 0;
  var raw;
  try {
    raw = storage.getItem(storageKey(githubId));
  } catch (e) {
    return 0;
  }
  if (!raw) return 0;
  var nextAt = Number(raw);
  if (!isFinite(nextAt) || nextAt <= now) {
    clearOmikujiCooldown(githubId, storage);
    return 0;
  }
  // 端末の時計が大きくずれている場合に何時間も先を表示しないよう、
  // 最長のクールダウン(8時間)で頭打ちにする。
  var remaining = Math.ceil((nextAt - now) / 1000);
  return Math.min(remaining, 8 * 60 * 60);
}

function clearOmikujiCooldown(githubId, storage) {
  storage = storage || defaultStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey(githubId));
  } catch (e) {
    // noop
  }
}

module.exports = {
  STORAGE_PREFIX: STORAGE_PREFIX,
  storageKey: storageKey,
  saveOmikujiCooldown: saveOmikujiCooldown,
  loadOmikujiRemaining: loadOmikujiRemaining,
  clearOmikujiCooldown: clearOmikujiCooldown,
};
