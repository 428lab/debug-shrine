// おみくじ「賽銭落とし」装置(omikujiSaisen.js)のヘッドレス検証。
//
// 落とす位置(横木の端から端まで)と乱数の種を掃引し、賽銭が狐のセンサーに
// 届くか、届くまでの秒数を計測する。GEO を調整したら必ずここを回す。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/simulate-omikuji-saisen.js            位置×種の格子を掃引
//   node scripts/simulate-omikuji-saisen.js --one 240 7   指定の位置・種を1回
//   node scripts/simulate-omikuji-saisen.js --verbose  各点の結果を全部出す
//
// 合否: 落とせて、狐に届くこと。届かず静止したら(釘の上で釣り合った等)失敗として数える
// (本番は静止検知で狐が起きるので完走はするが、ここでは「届く」ことを目標にする)。

/* eslint-disable no-console */
const Matter = require("matter-js");
const machine = require("../components/omikujiSaisen.js");

const STEPS_PER_SEC = 1000 / machine.GEO.FIXED_DELTA;

// 再現可能な乱数(mulberry32)
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

function runOnce(x, seed, maxSeconds) {
  const built = machine.build(Matter, { rnd: seeded(seed) });
  const engine = built.engine;
  const ritual = machine.createRitual(Matter, built);

  let step = 0;
  let hitStep = null;
  Matter.Events.on(engine, "collisionStart", (e) => {
    for (const p of e.pairs) {
      const labels = [p.bodyA.label, p.bodyB.label];
      if (!labels.includes("fox-sensor")) continue;
      const other = labels[0] === "fox-sensor" ? labels[1] : labels[0];
      if (machine.wakeLabels.includes(other) && hitStep === null) hitStep = step;
    }
  });

  // 儀式前に少し置く(賽銭が勝手に落ちないことの確認も兼ねる)
  for (let i = 0; i < STEPS_PER_SEC; i++) {
    Matter.Engine.update(engine, machine.GEO.FIXED_DELTA, 1);
    ritual.step(false);
    step++;
  }
  const drift = Math.hypot(built.coin.position.x - built.home.x, built.coin.position.y - built.home.y);

  ritual.dropAt(x);
  const settle = machine.createSettleDetector(Matter, built);
  let launchStep = null;
  let settledStep = null;
  const maxSteps = step + Math.round(maxSeconds * STEPS_PER_SEC);
  while (step < maxSteps && hitStep === null && settledStep === null) {
    Matter.Engine.update(engine, machine.GEO.FIXED_DELTA, 1);
    step++;
    if (launchStep === null && ritual.step(false)) launchStep = step;
    if (launchStep !== null && settle.step()) settledStep = step;
  }
  return {
    drift,
    launched: launchStep !== null,
    hitSec: hitStep === null ? null : (hitStep - launchStep) / STEPS_PER_SEC,
    settledSec: settledStep === null ? null : (settledStep - launchStep) / STEPS_PER_SEC,
    coinX: Math.round(built.coin.position.x),
    coinY: Math.round(built.coin.position.y),
  };
}

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const oneIdx = args.indexOf("--one");
  if (oneIdx >= 0) {
    console.log(runOnce(parseFloat(args[oneIdx + 1]), parseInt(args[oneIdx + 2] || "1", 10), 25));
    return;
  }
  const R = machine.GEO.RAIL;
  const xs = [];
  for (let x = R.minX; x <= R.maxX; x += 17) xs.push(x);
  const seeds = [1, 2, 3, 4, 5, 6];
  let total = 0;
  let fail = 0;
  let slowest = 0;
  let sum = 0;
  let maxDrift = 0;
  const failures = [];
  for (const x of xs) {
    for (const seed of seeds) {
      const r = runOnce(x, seed, 25);
      total++;
      maxDrift = Math.max(maxDrift, r.drift);
      const ok = r.launched && r.hitSec !== null;
      if (ok) {
        slowest = Math.max(slowest, r.hitSec);
        sum += r.hitSec;
      } else {
        fail++;
        failures.push({ x, seed, ...r });
      }
      if (verbose) {
        const outcome = ok ? `狐到達 ${r.hitSec.toFixed(1)}s` : r.settledSec !== null ? `未到達→静止 ${r.settledSec.toFixed(1)}s` : "未到達";
        console.log(`x=${String(x).padStart(3)} 種${seed} → ${outcome} 賽銭(${r.coinX},${r.coinY})`);
      }
    }
  }
  const ok = total - fail;
  console.log(
    `掃引 ${total} 点: 失敗 ${fail} / 平均到達 ${(sum / Math.max(1, ok)).toFixed(1)}s / 最遅到達 ${slowest.toFixed(1)}s / 儀式前のずれ最大 ${maxDrift.toFixed(2)}px`
  );
  for (const f of failures.slice(0, 20)) console.log("  NG", JSON.stringify(f));
  if (fail > 0 || maxDrift > 1) process.exitCode = 1;
}

main();
