// 参拝結果のローカル永続化(#198)。
//
// 儀式画面フラグ(ritual)は sanpai.vue のローカルstateのため、SWの自動リロード・
// PWA再起動・モバイルのタブ退避復帰などで再マウントされると、参拝直後でも
// 儀式画面に戻ってしまい、再度二拍手するとサーバー判定で expire になる。
// これを防ぐため、参拝成功の結果をlocalStorageに保存し、クールダウン内の
// 再マウントでは完了画面を復元する。
//
// 判定ロジックは storage を注入できる純関数にしてあり、Nodeで決定論的に
// 検証できる(sanpaiGrass.js と同じ流儀)。

var STORAGE_KEY = "debug-shrine:last-sanpai-result";

// サーバー(SANPAI_NEXT_TIME_SECONDS)の既定値と同じ。応答に next_time が
// 含まれない旧デプロイへのフォールバック。
var DEFAULT_NEXT_TIME_SECONDS = 60;

function defaultStorage() {
  // プライベートモード等で localStorage が使えない環境では保存を諦める
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
}

// 参拝成功時に呼ぶ。status は完了画面の表示に必要な値一式(プレーンオブジェクト)。
function saveSanpaiResult(status, nextTimeSeconds, now, storage) {
  storage = storage || defaultStorage();
  if (!storage) return;
  var record = {
    savedAt: now,
    nextTime:
      nextTimeSeconds != null ? nextTimeSeconds : DEFAULT_NEXT_TIME_SECONDS,
    status: status,
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch (e) {
    // 容量超過等。保存できなくても参拝自体は成立しているので黙って続行
  }
}

// マウント時に呼ぶ。クールダウン内なら保存した status を返し、
// 期限切れ・壊れたデータは削除して null を返す。
function loadRestorableSanpaiResult(now, storage) {
  storage = storage || defaultStorage();
  if (!storage) return null;
  var raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (e) {
    return null;
  }
  if (!raw) return null;
  var record;
  try {
    record = JSON.parse(raw);
  } catch (e) {
    clearSanpaiResult(storage);
    return null;
  }
  if (
    !record ||
    typeof record.savedAt !== "number" ||
    typeof record.nextTime !== "number" ||
    !record.status
  ) {
    clearSanpaiResult(storage);
    return null;
  }
  var expiresAt = record.savedAt + record.nextTime * 1000;
  // 端末時計が巻き戻っている場合(savedAt が未来)も復元せず捨てる
  if (now < record.savedAt || now >= expiresAt) {
    clearSanpaiResult(storage);
    return null;
  }
  return record.status;
}

function clearSanpaiResult(storage) {
  storage = storage || defaultStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch (e) {
    // noop
  }
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  DEFAULT_NEXT_TIME_SECONDS: DEFAULT_NEXT_TIME_SECONDS,
  saveSanpaiResult: saveSanpaiResult,
  loadRestorableSanpaiResult: loadRestorableSanpaiResult,
  clearSanpaiResult: clearSanpaiResult,
};
