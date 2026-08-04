// utils/omikujiCooldown.js の純関数テスト。
// 実行: node web/scripts/test-omikuji-cooldown.js
const assert = require("assert");
const m = require("../utils/omikujiCooldown");

function fakeStorage() {
  const map = {};
  return {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => {
      map[k] = v;
    },
    removeItem: (k) => {
      delete map[k];
    },
  };
}

const now = 1700000000000;
const result = { tier: "大吉", fortune: "ビルドが通る" };

// 保存した残り時間と結果が読める
let s = fakeStorage();
m.saveOmikujiState("428875", 3600, result, now, s);
let got = m.loadOmikujiState("428875", now, s);
assert.strictEqual(got.remainingSeconds, 3600);
assert.deepStrictEqual(got.result, result);

// 時間が進めば減る
assert.strictEqual(
  m.loadOmikujiState("428875", now + 600000, s).remainingSeconds,
  3000
);

// 過ぎたら0。ただし前回の結果は残す(「前回のおみくじ」を出せるように)
got = m.loadOmikujiState("428875", now + 3600001, s);
assert.strictEqual(got.remainingSeconds, 0);
assert.deepStrictEqual(got.result, result);

// 別ユーザーの記録は見えない
s = fakeStorage();
m.saveOmikujiState("428875", 3600, result, now, s);
assert.strictEqual(m.loadOmikujiState("99999", now, s), null);

// 引ける(0)として保存しても結果は残る
s = fakeStorage();
m.saveOmikujiState("428875", 0, result, now, s);
got = m.loadOmikujiState("428875", now, s);
assert.strictEqual(got.remainingSeconds, 0);
assert.deepStrictEqual(got.result, result);

// 何も無ければ null
assert.strictEqual(m.loadOmikujiState("428875", now, fakeStorage()), null);

// 壊れた値は捨てて null
s = fakeStorage();
s.setItem(m.storageKey("428875"), "ぐちゃぐちゃ");
assert.strictEqual(m.loadOmikujiState("428875", now, s), null);
assert.strictEqual(s.getItem(m.storageKey("428875")), null);

// 端末の時計が大きくずれていても8時間で頭打ち
s = fakeStorage();
s.setItem(
  m.storageKey("428875"),
  JSON.stringify({ nextAt: now + 999 * 3600 * 1000, result: null })
);
assert.strictEqual(
  m.loadOmikujiState("428875", now, s).remainingSeconds,
  m.MAX_COOLDOWN_SECONDS
);

// localStorage が使えなくても落ちない
assert.strictEqual(m.loadOmikujiState("428875", now, null), null);
assert.strictEqual(m.loadOmikujiRemaining("428875", now, null), 0);

// 表示用の整形
assert.strictEqual(m.formatOmikujiRemaining(2 * 3600 + 30 * 60), "2時間30分");
assert.strictEqual(m.formatOmikujiRemaining(45 * 60 + 5), "45分5秒");
assert.strictEqual(m.formatOmikujiRemaining(30), "30秒");
assert.strictEqual(m.formatOmikujiRemaining(-1), "0秒");

console.log("omikujiCooldown: 全て通過");
