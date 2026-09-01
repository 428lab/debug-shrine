// おみくじ「ピンボール」装置(omikujiPinball.js)のヘッドレス検証。
//
// 引きの強さ × 乱数シードを掃引し、放った玉が狐(中央の穴)に落ちるか、
// 落ちるまでの秒数を計測する。GEO を調整したら必ずここを回す。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/simulate-omikuji-pinball.js            引き × シードの格子を掃引
//   node scripts/simulate-omikuji-pinball.js --verbose  各点の結果を全部出す
//   node scripts/simulate-omikuji-pinball.js --seeds 30  シードを 1..30 に広げる
//   node scripts/simulate-omikuji-pinball.js --one 70 3 引き70・シード3 を1回
//   node scripts/simulate-omikuji-pinball.js --trace 70 3 玉の軌跡を 0.25s ごとに出す
//
// 合否: 放てて狐に届くこと。届かず静まった場合は、SETTLE_LIMIT_SEC 以内で
// かつ止まった場所が狐の穴の中のときだけ合格(棚止まりは失敗)。

/* eslint-disable no-console */
const Matter = require("matter-js");
const machine = require("../components/omikujiPinball.js");

const STEPS_PER_SEC = 1000 / machine.GEO.FIXED_DELTA;
const SETTLE_LIMIT_SEC = 8;

// 決定論的な乱数(シードごとに同じ列)
function seeded(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function runOnce(pull, seed, maxSeconds) {
  const built = machine.build(Matter, { rnd: seeded(seed) });
  const engine = built.engine;
  const ritual = machine.createRitual(Matter, built);

  let step = 0;
  let hitStep = null;
  let bumps = 0;
  Matter.Events.on(engine, "collisionStart", (e) => {
    for (const p of e.pairs) {
      const labels = [p.bodyA.label, p.bodyB.label];
      if (labels.includes("bumper") && labels.includes("ball")) bumps++;
      if (labels.includes("fox-sensor") && labels.includes("ball") && hitStep === null) hitStep = step;
    }
  });

  for (let i = 0; i < STEPS_PER_SEC; i++) {
    Matter.Engine.update(engine, machine.GEO.FIXED_DELTA, 1);
    step++;
  }
  ritual.pull(pull);
  const settle = machine.createSettleDetector(Matter, built);
  let launchStep = null;
  let settledStep = null;
  let speedAtLaunch = 0;
  let maxSpeed = 0;
  const maxSteps = step + Math.round(maxSeconds * STEPS_PER_SEC);
  while (step < maxSteps && hitStep === null && settledStep === null) {
    if (launchStep === null && ritual.step(false)) {
      launchStep = step;
      speedAtLaunch = Math.hypot(built.ball.velocity.x, built.ball.velocity.y);
    }
    Matter.Engine.update(engine, machine.GEO.FIXED_DELTA, 1);
    step++;
    if (launchStep !== null) {
      maxSpeed = Math.max(maxSpeed, Math.hypot(built.ball.velocity.x, built.ball.velocity.y));
      if (settle.step()) settledStep = step;
    }
  }
  const b = built.ball.position;
  const escaped = b.x < -50 || b.x > machine.GEO.W + 50 || b.y < -50 || b.y > machine.GEO.H + 50;
  return {
    launched: launchStep !== null,
    hitSec: hitStep === null ? null : (hitStep - (launchStep || 0)) / STEPS_PER_SEC,
    settledSec: settledStep === null ? null : (settledStep - (launchStep || 0)) / STEPS_PER_SEC,
    bumps,
    escaped,
    ballX: Math.round(b.x),
    ballY: Math.round(b.y),
    speedAtLaunch: speedAtLaunch.toFixed(1),
    maxSpeed: maxSpeed.toFixed(1),
  };
}

function checkIdle(seconds) {
  const built = machine.build(Matter, { rnd: seeded(1) });
  for (let i = 0; i < seconds * STEPS_PER_SEC; i++) Matter.Engine.update(built.engine, machine.GEO.FIXED_DELTA, 1);
  const drift = Math.hypot(built.ball.position.x - built.anchor.x, built.ball.position.y - built.anchor.y);
  console.log(`無操作 ${seconds}s: 玉の支点からのずれ ${drift.toFixed(2)}px`);
  return drift < 3;
}

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const oneIdx = args.indexOf("--one");
  if (oneIdx >= 0) {
    console.log(runOnce(parseFloat(args[oneIdx + 1]), parseInt(args[oneIdx + 2] || "1", 10), 30));
    return;
  }
  // 軌跡ダンプ(バンパー配置の当たりをつける用): 放ってから 0.25s ごとの玉の位置
  const traceIdx = args.indexOf("--trace");
  if (traceIdx >= 0) {
    const pull = parseFloat(args[traceIdx + 1]);
    const seed = parseInt(args[traceIdx + 2] || "1", 10);
    const built = machine.build(Matter, { rnd: seeded(seed) });
    const ritual = machine.createRitual(Matter, built);
    for (let i = 0; i < STEPS_PER_SEC; i++) Matter.Engine.update(built.engine, machine.GEO.FIXED_DELTA, 1);
    ritual.pull(pull);
    let launched = false;
    const pts = [];
    for (let i = 0; i < 12 * STEPS_PER_SEC; i++) {
      if (!launched && ritual.step(false)) launched = true;
      Matter.Engine.update(built.engine, machine.GEO.FIXED_DELTA, 1);
      if (launched && i % Math.round(STEPS_PER_SEC / 4) === 0) {
        pts.push(`(${Math.round(built.ball.position.x)},${Math.round(built.ball.position.y)})`);
      }
    }
    console.log(pts.join(" "));
    return;
  }
  const idleOk = checkIdle(20);
  // --seeds N で乱数シードを 1..N に広げる(既定 6)。引きは releaseMin〜maxPull を刻む。
  const seedsIdx = args.indexOf("--seeds");
  const seedCount = seedsIdx >= 0 ? parseInt(args[seedsIdx + 1], 10) : 6;
  const pulls = [14, 20, 28, 35, 42, 50, 58, 65, 72, 80, 90];
  const seeds = Array.from({ length: seedCount }, (_, i) => i + 1);
  let fail = 0;
  let total = 0;
  let slowest = 0;
  let bumpTotal = 0;
  const failures = [];
  let settledNoHit = 0;
  const FS = machine.GEO.FOX_SENSOR;
  for (const pull of pulls) {
    for (const seed of seeds) {
      const r = runOnce(pull, seed, 30);
      total++;
      bumpTotal += r.bumps;
      // 狐に届かず静まった場合は、止まった場所が狐の穴の中でなければ失敗
      // (どこかの棚に載ったまま終わる演出は避ける)。
      const inHole = Math.abs(r.ballX - FS.x) <= FS.w / 2 && Math.abs(r.ballY - FS.y) <= FS.h / 2;
      if (r.hitSec === null && r.settledSec !== null) settledNoHit++;
      const ok = r.launched && !r.escaped && (r.hitSec !== null || (r.settledSec !== null && r.settledSec <= SETTLE_LIMIT_SEC && inHole));
      if (!ok) {
        fail++;
        failures.push({ pull, seed, ...r });
      } else if (r.hitSec !== null) slowest = Math.max(slowest, r.hitSec);
      if (verbose) {
        const outcome = r.hitSec !== null ? `狐到達 ${r.hitSec.toFixed(1)}s` : r.settledSec !== null ? `静止 ${r.settledSec.toFixed(1)}s` : "未到達";
        console.log(`引き${String(pull).padStart(3)} seed${seed} 射出${r.speedAtLaunch} 最高速${r.maxSpeed} バンパー${r.bumps}回 → ${outcome} 玉(${r.ballX},${r.ballY})${r.escaped ? " 場外!" : ""}`);
      }
    }
  }
  console.log(`掃引 ${total} 点: 失敗 ${fail} / 最遅到達 ${slowest.toFixed(1)}s / 平均バンパー ${(bumpTotal / total).toFixed(1)}回 / 無操作静止 ${idleOk ? "OK" : "NG"} / 届かず静止 ${settledNoHit}`);
  for (const f of failures.slice(0, 20)) {
    console.log(`  引き${f.pull} seed${f.seed}: 射出${f.speedAtLaunch} 最高速${f.maxSpeed} バンパー${f.bumps} 玉(${f.ballX},${f.ballY}) launched=${f.launched} 静止=${f.settledSec === null ? "なし" : f.settledSec.toFixed(1) + "s"}${f.escaped ? " 場外" : ""}`);
  }
  process.exitCode = fail > 0 || !idleOk ? 1 : 0;
}

main();
