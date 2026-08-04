const assert = require("assert");
const m = require("../utils/omikujiCooldown");

function fakeStorage() {
  const map = {};
  return {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => { map[k] = v; },
    removeItem: (k) => { delete map[k]; },
    _map: map,
  };
}

const now = 1_700_000_000_000;

// 保存した残り時間が読める
let s = fakeStorage();
m.saveOmikujiCooldown("428875", 3600, now, s);
assert.strictEqual(m.loadOmikujiRemaining("428875", now, s), 3600);
// 時間が進めば減る
assert.strictEqual(m.loadOmikujiRemaining("428875", now + 600_000, s), 3000);
// 過ぎたら0、記録も消える
assert.strictEqual(m.loadOmikujiRemaining("428875", now + 3_600_001, s), 0);
assert.strictEqual(s.getItem(m.storageKey("428875")), null);

// 別ユーザーの残り時間は見えない
s = fakeStorage();
m.saveOmikujiCooldown("428875", 3600, now, s);
assert.strictEqual(m.loadOmikujiRemaining("99999", now, s), 0);

// 引ける(0以下)を保存すると記録を消す
s = fakeStorage();
m.saveOmikujiCooldown("428875", 3600, now, s);
m.saveOmikujiCooldown("428875", 0, now, s);
assert.strictEqual(m.loadOmikujiRemaining("428875", now, s), 0);

// 壊れた値は0
s = fakeStorage();
s.setItem(m.storageKey("428875"), "ぐちゃぐちゃ");
assert.strictEqual(m.loadOmikujiRemaining("428875", now, s), 0);

// 端末の時計が大きくずれていても8時間で頭打ち
s = fakeStorage();
s.setItem(m.storageKey("428875"), String(now + 999 * 3600 * 1000));
assert.strictEqual(m.loadOmikujiRemaining("428875", now, s), 8 * 3600);

// localStorage が使えなくても落ちない
assert.strictEqual(m.loadOmikujiRemaining("428875", now, null), 0);

console.log("omikujiCooldown: 全て通過");
