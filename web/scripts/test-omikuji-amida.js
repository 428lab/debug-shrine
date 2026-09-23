// おみくじ「隠しあみだくじ」の組み立て(components/omikujiAmida.js)の検証。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/test-omikuji-amida.js
//
// 確かめること:
// - どの線を選んでも、どの端を狙っても、必ず狙いの端に着く
// - 同じ段で隣り合う横線が無い(ふつうのあみだの規則)
// - 横線がちゃんとある(スカスカで一本道にならない)
// - 引き直しで決まらない場合の後始末(横へ運ぶ段)でも着く

/* eslint-disable no-console */
const assert = require("assert");
const { LANES, ROWS, buildLadder, endOf } = require("../components/omikujiAmida.js");

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkRows(rows) {
  for (const row of rows) {
    assert.strictEqual(row.length, LANES - 1);
    for (let c = 1; c < row.length; c++) {
      assert.ok(!(row[c] && row[c - 1]), "同じ段で隣り合う横線がある");
    }
  }
}

let n = 0;
let minRungs = Infinity;
let sumRungs = 0;
let sumCross = 0;
for (let seed = 1; seed <= 60; seed++) {
  for (let s = 0; s < LANES; s++) {
    for (let t = 0; t < LANES; t++) {
      const { rows, path } = buildLadder(s, t, { rnd: seeded(seed * 1000 + s * 10 + t) });
      checkRows(rows);
      assert.strictEqual(endOf(rows, s), t, `start=${s} target=${t} seed=${seed}`);
      assert.strictEqual(path[0], s);
      assert.strictEqual(path[path.length - 1], t);
      assert.strictEqual(path.length, rows.length + 1);
      const rungs = rows.reduce((a, r) => a + r.filter(Boolean).length, 0);
      minRungs = Math.min(minRungs, rungs);
      sumRungs += rungs;
      // 光が横へ渡る回数(演出の見どころ)
      for (let i = 1; i < path.length; i++) if (path[i] !== path[i - 1]) sumCross++;
      n++;
    }
  }
}

// 引き直しを使い切らせて、後始末(横へ運ぶ段)の経路も確かめる
{
  const never = () => 0.99; // 横線を1本も置かない乱数 → 端が変わらない
  for (let s = 0; s < LANES; s++) {
    for (let t = 0; t < LANES; t++) {
      const { rows } = buildLadder(s, t, { rnd: never });
      checkRows(rows);
      assert.strictEqual(endOf(rows, s), t, `fallback start=${s} target=${t}`);
    }
  }
}

assert.throws(() => buildLadder(-1, 0));
assert.throws(() => buildLadder(0, LANES));

console.log(
  `OK ${n} 通り: 全部狙いの端に着く / 横線 最少 ${minRungs}・平均 ${(sumRungs / n).toFixed(1)} 本(${ROWS} 段) / 光が横へ渡る平均 ${(sumCross / n).toFixed(1)} 回`
);
