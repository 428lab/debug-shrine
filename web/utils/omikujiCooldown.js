// おみくじの「次に引ける時刻」と「前回の結果」をローカルに覚えておく。
//
// 引けるかどうかは前回いつ引いたかだけで決まる。それは前回引いた瞬間に
// 確定しているのに、どこにも保存していなかったため、「おみくじ」を開くたびに
// トークン取得 → omikujiGo(peek) の往復を待たされ、そのあとで初めて
// 「まだ引けない」と分かっていた。押してから待たされた末に引けないと
// 知らされるのが体感として一番つらい。
//
// 前回の結果も一緒に持っておく。クールダウン中の「前回のおみくじ」は
// 通信を待たずにその場で出せる(サーバーにも omikuji_result があるので、
// 端末を変えれば peek の応答から復元される)。
//
// 保存するのは表示を先に出すためだけで、実際に引けるかは常にサーバーが
// 決める(端末の時計は書き換えられる)。
//
// 判定は storage を注入できる純関数にしてあり、Nodeで決定論的に検証できる
// (sanpaiSession.js と同じ流儀)。web/scripts/test-omikuji-cooldown.js 参照。

// アカウントを切り替えたときに前の人の結果や残り時間を見せないよう、
// キーに github_id を含める。
var STORAGE_PREFIX = "debug-shrine:omikuji:";

// クールダウンの最長(8時間)。端末の時計が大きくずれていても、これ以上の
// 残り時間は表示しない。
var MAX_COOLDOWN_SECONDS = 8 * 60 * 60;

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

// サーバーの応答を受け取ったときに呼ぶ。
// remainingSeconds が 0 以下なら「引ける」として記録する(結果は残す)。
function saveOmikujiState(githubId, remainingSeconds, result, now, storage) {
  storage = storage || defaultStorage();
  if (!storage) return;
  var seconds = typeof remainingSeconds === "number" ? remainingSeconds : 0;
  var record = {
    nextAt: seconds > 0 ? now + seconds * 1000 : 0,
    result: result || null,
  };
  try {
    storage.setItem(storageKey(githubId), JSON.stringify(record));
  } catch (e) {
    // 容量超過等。保存できなくても表示が遅くなるだけなので黙って続行
  }
}

// { remainingSeconds, result } を返す。何も無ければ null。
// remainingSeconds が 0 なら引ける(結果は前回のもの)。
function loadOmikujiState(githubId, now, storage) {
  storage = storage || defaultStorage();
  if (!storage) return null;
  var raw;
  try {
    raw = storage.getItem(storageKey(githubId));
  } catch (e) {
    return null;
  }
  if (!raw) return null;
  var record;
  try {
    record = JSON.parse(raw);
  } catch (e) {
    clearOmikujiState(githubId, storage);
    return null;
  }
  if (!record || typeof record.nextAt !== "number") {
    clearOmikujiState(githubId, storage);
    return null;
  }
  var remaining = 0;
  if (record.nextAt > now) {
    remaining = Math.min(
      Math.ceil((record.nextAt - now) / 1000),
      MAX_COOLDOWN_SECONDS
    );
  }
  return { remainingSeconds: remaining, result: record.result || null };
}

// 残り秒だけ欲しいとき(ヘッダやトップの文言切り替え)。
function loadOmikujiRemaining(githubId, now, storage) {
  var state = loadOmikujiState(githubId, now, storage);
  return state ? state.remainingSeconds : 0;
}

function clearOmikujiState(githubId, storage) {
  storage = storage || defaultStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey(githubId));
  } catch (e) {
    // noop
  }
}

// 残り秒を「2時間30分」「45分」「30秒」の形にする(表示専用の純関数)。
function formatOmikujiRemaining(seconds) {
  var s = Math.max(0, Math.floor(seconds));
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  if (h > 0) return h + "時間" + m + "分";
  if (m > 0) return m + "分" + (s % 60) + "秒";
  return s + "秒";
}

module.exports = {
  STORAGE_PREFIX: STORAGE_PREFIX,
  MAX_COOLDOWN_SECONDS: MAX_COOLDOWN_SECONDS,
  storageKey: storageKey,
  saveOmikujiState: saveOmikujiState,
  loadOmikujiState: loadOmikujiState,
  loadOmikujiRemaining: loadOmikujiRemaining,
  clearOmikujiState: clearOmikujiState,
  formatOmikujiRemaining: formatOmikujiRemaining,
};
