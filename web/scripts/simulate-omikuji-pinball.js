// おみくじ演出「サイバー弾き盤」(components/omikujiPinball.js)のヘッドレス検証。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/simulate-omikuji-pinball.js            # 既定: 引き 6 段階 × 操作 4 通り × レア度 7 × シード 3
//   node scripts/simulate-omikuji-pinball.js --seeds 10
//   node scripts/simulate-omikuji-pinball.js --trace    # 1 本だけ玉の軌跡を出す
//
// 確かめること:
// - どの強さで放っても、レーンを出て盤面に入る
// - 玉が盤面の外へ出ない・壁にめり込まない
// - 操作(なし・でたらめ・玉が来たら打つ・押しっぱなし)に関係なく、本命のポートに入る
// - 結果が届いてから、かかる時間(結界が開くまで + 落ちるまで + レール)
// - ギミック(バンパー・ランプ・ワープ・磁力・ドロップ・レーン)がそれなりに起きる
// - 放つ前は何も動かない

/* eslint-disable no-console */
const assert = require("assert");
const P = require("../components/omikujiPinball");

const args = process.argv.slice(2);
const seeds = Number((args[args.indexOf("--seeds") + 1] || "").match(/^\d+$/) ? args[args.indexOf("--seeds") + 1] : 3);
const trace = args.includes("--trace");

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

const POLICIES = {
  none: () => ({ left: false, right: false }),
  random: (g, rnd, st) => {
    if (rnd() < 0.02) st.l = !st.l;
    if (rnd() < 0.02) st.r = !st.r;
    return { left: st.l, right: st.r };
  },
  smart: (g) => {
    const b = g.ball;
    const near = b.y > 700 && b.vy > 0;
    return { left: near && b.x < P.CX + 10, right: near && b.x > P.CX - 10 };
  },
  hold: () => ({ left: true, right: true }),
};

// 壁へのめり込み(当たりの形の内側に玉の中心がどれだけ入っているか)
function penetration(g) {
  const b = g.ball;
  let worst = 0;
  for (const s of g.shapes) {
    if (!s.active) continue;
    if (s.kind === "barrier" && g.phase !== "play") continue;
    if (s.kind === "drop" && !g.drops[s.id]) continue;
    let d;
    if (s.type === "circle") d = Math.hypot(b.x - s.x, b.y - s.y) - s.r;
    else {
      const dx = s.bx - s.ax;
      const dy = s.by - s.ay;
      const t = Math.max(0, Math.min(1, ((b.x - s.ax) * dx + (b.y - s.ay) * dy) / (dx * dx + dy * dy)));
      d = Math.hypot(b.x - (s.ax + dx * t), b.y - (s.ay + dy * t)) - s.r;
    }
    worst = Math.max(worst, P.R - d);
  }
  return worst;
}

function run(pull, policy, tierIndex, seed, opts) {
  const rnd = mulberry(seed * 7919 + Math.round(pull * 100) * 31 + tierIndex);
  const g = P.newGame({ rnd });
  // 放つ前は動かない
  const before = JSON.stringify(g.ball);
  P.step(g, 1 / 60, {});
  assert.strictEqual(JSON.stringify(g.ball), before, "放つ前に玉が動いた");
  P.setPull(g, pull);
  P.launch(g);
  const st = {};
  const dt = 1 / 60;
  let left = null;
  let worstPen = 0;
  let maxV = 0;
  const path = [];
  const ev = {};
  for (let frame = 0; frame < 60 * 40; frame++) {
    if (g.t > 1 && g.target == null) P.setTarget(g, P.TIERS[tierIndex]);
    P.step(g, dt, POLICIES[policy](g, rnd, st));
    for (const e of g.events.splice(0)) ev[e.type] = (ev[e.type] || 0) + 1;
    const b = g.ball;
    if (b.mode === "table") {
      if (b.x < 14 || b.x > 476 || b.y < 28 || b.y > 876) throw new Error(`盤面の外: ${JSON.stringify(b)} t=${g.t.toFixed(2)}`);
      worstPen = Math.max(worstPen, penetration(g));
      maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
      if (left == null && b.x < P.LANE.wall - 4 && b.y < P.LANE.top) left = g.t;
      // 蓋が閉じた後にレーンに戻っていない
      const gate = g.shapes.find((s) => s.kind === "gate");
      if (gate.active && b.x > P.LANE.wall + 2 && b.y > P.LANE.top + 20) throw new Error(`レーンに落ち戻った t=${g.t.toFixed(2)}`);
    }
    if (opts && opts.trace && frame % 6 === 0) path.push(`${g.t.toFixed(2)} ${b.mode} ${b.x.toFixed(0)},${b.y.toFixed(0)} h${b.h.toFixed(0)} ${g.phase}`);
    if (g.phase === "port") break;
  }
  if (opts && opts.trace) console.log(path.join("\n"));
  assert.ok(left != null, `レーンを出なかった pull=${pull}`);
  assert.strictEqual(g.phase, "port", `ポートに着かなかった pull=${pull} ${policy} tier=${tierIndex} seed=${seed} phase=${g.phase} t=${g.t.toFixed(1)}`);
  assert.strictEqual(g.target, tierIndex);
  return { t: g.t, finaleAt: g.finaleAt, worstPen, maxV, ev, left, stats: g.stats };
}

if (trace) {
  run(0.6, "smart", 2, 1, { trace: true });
  process.exit(0);
}

const pulls = [0, 0.2, 0.4, 0.6, 0.8, 1];
const rows = [];
const totals = {};
let n = 0;
for (const pull of pulls) {
  for (const policy of Object.keys(POLICIES)) {
    for (let tier = 0; tier < P.TIERS.length; tier++) {
      for (let s = 1; s <= seeds; s++) {
        const r = run(pull, policy, tier, s);
        rows.push(Object.assign({ pull, policy, tier }, r));
        for (const [k, v] of Object.entries(r.ev)) totals[k] = (totals[k] || 0) + v;
        n++;
      }
    }
  }
}
const pct = (arr, q) => arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * q))];
const ts = rows.map((r) => r.t);
const drainAfter = rows.map((r) => r.t - r.finaleAt);
const pen = Math.max(...rows.map((r) => r.worstPen));
const leftMax = Math.max(...rows.map((r) => r.left));
console.log(`OK ${n} 本すべて本命のポートへ`);
console.log(`ポートまで(発射から): 中央 ${pct(ts, 0.5).toFixed(1)}s / 90% ${pct(ts, 0.9).toFixed(1)}s / 最大 ${Math.max(...ts).toFixed(1)}s`);
console.log(`結界が開いてからポートまで: 中央 ${pct(drainAfter, 0.5).toFixed(1)}s / 最大 ${Math.max(...drainAfter).toFixed(1)}s`);
console.log(`レーンを出るまで: 最大 ${leftMax.toFixed(2)}s / 壁へのめり込み 最大 ${pen.toFixed(1)}px / 最高速 ${Math.max(...rows.map((r) => r.maxV)).toFixed(0)}px/s`);
const per = (k) => ((totals[k] || 0) / n).toFixed(2);
console.log(
  `1 本あたり: バンパー ${per("bumper")} スリング ${per("sling")} ランプ ${per("rampIn")} ワープ ${per("portalIn")} 磁力 ${per("magnet")} ` +
    `ドロップ ${per("drop")} レーン ${per("lane")} スピナー ${per("spinner")} 結界 ${per("save")} 小突き ${per("nudge")} 強制レール ${rows.filter((r) => r.ev.drain && r.t - r.finaleAt > P.FINALE_MAX - 0.1).length}`
);
for (const policy of Object.keys(POLICIES)) {
  const rs = rows.filter((r) => r.policy === policy);
  const f = (k) => (rs.reduce((a, r) => a + (r.ev[k] || 0), 0) / rs.length).toFixed(2);
  console.log(`  ${policy.padEnd(6)} バンパー ${f("bumper")} ランプ ${f("rampIn")} ワープ ${f("portalIn")} 磁力 ${f("magnet")} ドロップ ${f("drop")} フリッパー ${f("flipper")}`);
}
assert.ok(pen < 4, `壁にめり込みすぎ ${pen}`);
