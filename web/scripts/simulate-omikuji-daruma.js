// おみくじ演出「だるま落とし」(3D。components/omikujiDaruma.js)のヘッドレス検証。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/simulate-omikuji-daruma.js            # 既定: シード 120 × 打ち方 3 通り
//   node scripts/simulate-omikuji-daruma.js --seeds 400
//
// 確かめること:
// - 打つ前は積みが動かない(凍らせてある)。凍らせなくても自分では崩れない
// - 打つたびに一番下の段だけが抜け、残りは真下に落ちて積みのまま(崩れない)
// - おみくじの段を打つと結果の段が選ばれる。どの段に潜ませても、打ち続ければ必ず出る
// - 打ち方(止まったらすぐ打つ・連打・のんびり)に関係なく出る。崩れた時(押して倒す)も出る
// - 積みのずれは 6cm 未満
// - 遅い端末(20fps)でも同じ
// - 数値が壊れない(NaN)・地面にめり込まない

/* eslint-disable no-console */
const assert = require("assert");
const CANNON = require("cannon-es");
const D = require("../components/omikujiDaruma");

const args = process.argv.slice(2);
const seeds = Number(args.includes("--seeds") ? args[args.indexOf("--seeds") + 1] : 120);

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1) 打つ前: 10 秒たっても動かない。起こしても自分では崩れない
{
  const g = D.build(CANNON, { rnd: mulberry(1) });
  for (let i = 0; i < 600; i++) g.world.step(1 / 60);
  for (const p of g.pieces) assert.ok(Math.abs(p.body.position.y - p.startY) < 1e-6, "打つ前に積みが動いた");
  g.pieces.forEach((p) => p.body.wakeUp());
  for (let i = 0; i < 180 * 6; i++) g.world.step(D.STEP);
  const drift = Math.max(...g.pieces.map((p) => Math.hypot(p.body.position.x, p.body.position.z, p.body.position.y - p.startY)));
  console.log(`起こしたまま 6 秒: 段の最大のずれ ${drift.toFixed(4)}m`);
  assert.ok(drift < 0.02, `打っていないのに積みが崩れた ${drift}`);
}

// 打ち方: 止まったらすぐ / 連打(0.1 秒ごと) / のんびり(1.2 秒ごと)
const STYLES = {
  eager: (g, t, st) => {
    if (D.canHit(g)) D.tap(g);
  },
  mash: (g, t, st) => {
    if (t - (st.last || -9) >= 0.1) {
      st.last = t;
      D.tap(g);
    }
  },
  slow: (g, t, st) => {
    if (t - (st.last || -9) >= 1.2 && D.canHit(g)) {
      st.last = t;
      D.tap(g);
    }
  },
};

function run(seed, style, dt) {
  const rnd = mulberry(seed * 7919 + style.length);
  const secret = seed % 6;
  const g = D.build(CANNON, { rnd, secret });
  const st = {};
  let t = 0;
  let collapse = false;
  let drift = 0;
  for (let f = 0; f < 60 / dt && g.phase !== "reveal"; f++) {
    STYLES[style](g, t, st);
    D.step(g, dt);
    t += dt;
    for (const e of g.events.splice(0)) {
      if (e.type === "collapse") collapse = true;
    }
    for (const p of g.pieces) {
      const b = p.body.position;
      assert.ok(Number.isFinite(b.x + b.y + b.z), "NaN");
      assert.ok(b.y > -0.2, `地面にめり込んだ y=${b.y}`);
    }
  }
  assert.strictEqual(g.phase, "reveal", `結果が出ない seed=${seed} ${style} hits=${g.hits} secret=${g.secret}`);
  assert.ok(g.chosen, "結果の段が無い");
  if (!collapse) {
    assert.strictEqual(g.chosen.id, g.secret, "潜ませた段と違う段から出た");
    // 打った数 = 潜ませた段まで(一番下から順に 1 段ずつ抜けた)
    assert.strictEqual(g.hits, g.secret + 1, `一度に 2 段抜けた・空振りした hits=${g.hits} secret=${g.secret}`);
    // 残りは積みのまま(真ん中からずれていない)
    for (const p of g.pieces) {
      if (p.out) continue;
      const b = p.body.position;
      drift = Math.max(drift, Math.hypot(b.x, b.z));
    }
    assert.ok(drift < DRIFT_MAX, `積みがずれた ${drift.toFixed(3)}m seed=${seed} ${style}`);
  }
  return { t, hits: g.hits, collapse, drift, secret: g.secret };
}

// 2) 崩れた時: 積みを横から押して倒すと、潜ませた段からおみくじが出る
for (const secret of [2, 5]) {
  const g = D.build(CANNON, { rnd: mulberry(3), secret });
  D.tap(g);
  for (let f = 0; f < 60; f++) D.step(g, 1 / 60);
  for (const p of g.pieces) {
    if (p.out) continue;
    p.body.wakeUp();
    p.body.velocity.set(0, 0, 2.5 + p.id);
  }
  let collapse = false;
  for (let f = 0; f < 600 && g.phase !== "reveal"; f++) {
    D.step(g, 1 / 60);
    if (g.events.splice(0).some((e) => e.type === "collapse")) collapse = true;
  }
  assert.ok(collapse && g.phase === "reveal", `崩れたのに結果が出ない secret=${secret}`);
  assert.strictEqual(g.chosen.id, secret, "崩れた時は潜ませた段から出る");
}
console.log("OK 崩れた時も、潜ませた段からおみくじが出る");

// 3) 潜ませる段の指定がおかしくても(文字・小数・範囲外)、乱数で選び直して必ず出る
for (const secret of ["2", 2.5, -1, 9, null]) {
  const g = D.build(CANNON, { rnd: mulberry(5), secret });
  assert.ok(Number.isInteger(g.secret) && g.secret >= 0 && g.secret < g.pieces.length, `潜ませる段 ${g.secret}`);
  for (let f = 0; f < 60 * 20 && g.phase !== "reveal"; f++) {
    if (D.canHit(g)) D.tap(g);
    D.step(g, 1 / 60);
  }
  assert.strictEqual(g.phase, "reveal", `指定 ${secret} で結果が出ない`);
}
console.log("OK 潜ませる段の指定がおかしくても出る");

const DRIFT_MAX = 0.06; // 積みのずれの上限(m)。胴の半径 0.42 に対して見た目で崩れかけに見えない程度
const rows = [];
for (let s = 1; s <= seeds; s++) {
  for (const style of Object.keys(STYLES)) rows.push(Object.assign({ style }, run(s, style, 1 / 60)));
}
// 遅い端末
const slow = [];
for (let s = 1; s <= 30; s++) slow.push(run(s, "eager", 0.05));

const pct = (arr, q) => arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * q))];
const collapses = rows.filter((r) => r.collapse);
console.log(`OK ${rows.length} 回すべて結果が出た(崩れた ${collapses.length} 回)`);
for (const style of Object.keys(STYLES)) {
  const rs = rows.filter((r) => r.style === style);
  console.log(`  ${style.padEnd(5)} 結果まで 中央 ${pct(rs.map((r) => r.t), 0.5).toFixed(1)}s 最大 ${Math.max(...rs.map((r) => r.t)).toFixed(1)}s / 崩れた ${rs.filter((r) => r.collapse).length}`);
}
console.log(`積みの最大のずれ: ${Math.max(...rows.map((r) => r.drift)).toFixed(3)}m`);
console.log(`遅い端末(20fps): ${slow.length} 回すべて結果が出た(崩れた ${slow.filter((r) => r.collapse).length} 回)`);
assert.ok(collapses.length <= rows.length * 0.02, `崩れすぎ ${collapses.length}/${rows.length}`);
