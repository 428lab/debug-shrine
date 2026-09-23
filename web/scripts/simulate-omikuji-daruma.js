// おみくじ「だるま落とし」装置(omikujiDaruma.js)のヘッドレス検証。
//
// 木槌の引きの角度と、儀式までの待ち時間を掃引し、だるまの頭が狐のセンサーに
// 届くか、届くまでの秒数を計測する。GEO を調整したら必ずここを回す。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/simulate-omikuji-daruma.js            角度×待ち時間の格子を掃引
//   node scripts/simulate-omikuji-daruma.js --one 30   指定の角度を1回(経過を表示)
//   node scripts/simulate-omikuji-daruma.js --verbose  各点の結果を全部出す
//
// 合否: 放せて、頭が狐に届くこと。あわせて、儀式前に積みが勝手に動かないことを見る。

/* eslint-disable no-console */
const Matter = require("matter-js");
const machine = require("../components/omikujiDaruma.js");

const STEPS_PER_SEC = 1000 / machine.GEO.FIXED_DELTA;

function runOnce(deg, idleSec, maxSeconds, trace) {
  const built = machine.build(Matter);
  const engine = built.engine;
  const ritual = machine.createRitual(Matter, built);

  let step = 0;
  let hitStep = null;
  let early = null; // 頭以外が狐に触れた(起こさないが、記録だけする)
  Matter.Events.on(engine, "collisionStart", (e) => {
    for (const p of e.pairs) {
      const labels = [p.bodyA.label, p.bodyB.label];
      if (!labels.includes("fox-sensor")) continue;
      const other = labels[0] === "fox-sensor" ? labels[1] : labels[0];
      if (machine.wakeLabels.includes(other)) {
        if (hitStep === null) hitStep = step;
      } else if (early === null) early = other;
    }
  });

  for (let i = 0; i < idleSec * STEPS_PER_SEC; i++) {
    Matter.Engine.update(engine, machine.GEO.FIXED_DELTA, 1);
    ritual.step(false);
    step++;
  }
  const idleMove = Math.max(
    ...built.blocks.concat([built.head]).map((b, i) => {
      const y0 = machine.GEO.SHELF.top - machine.GEO.STACK.blockH * (i + 0.5);
      return i < built.blocks.length ? Math.abs(b.position.y - y0) : 0;
    })
  );

  ritual.pull(deg);
  const settle = machine.createSettleDetector(Matter, built);
  let launchStep = null;
  let settledStep = null;
  const maxSteps = step + Math.round(maxSeconds * STEPS_PER_SEC);
  while (step < maxSteps && hitStep === null && settledStep === null) {
    Matter.Engine.update(engine, machine.GEO.FIXED_DELTA, 1);
    step++;
    if (launchStep === null && ritual.step(false)) launchStep = step;
    if (launchStep !== null && settle.step()) settledStep = step;
    if (trace && step % 15 === 0) {
      const h = built.head.position;
      const bs = built.blocks.map((b) => `(${b.position.x.toFixed(0)},${b.position.y.toFixed(0)})`).join(" ");
      console.log(`t=${((step - launchStep) / STEPS_PER_SEC).toFixed(2)} θ=${(built.angleOf() * 57.3).toFixed(1)} 頭(${h.x.toFixed(0)},${h.y.toFixed(0)}) 胴 ${bs}`);
    }
  }
  const SH = machine.GEO.SHELF;
  const knocked = built.blocks.filter((b) => b.position.y > SH.top + 20).length;
  return {
    idleMove,
    launched: launchStep !== null,
    hitSec: hitStep === null ? null : (hitStep - launchStep) / STEPS_PER_SEC,
    settledSec: settledStep === null ? null : (settledStep - launchStep) / STEPS_PER_SEC,
    knocked,
    early,
    headX: Math.round(built.head.position.x),
    headY: Math.round(built.head.position.y),
  };
}

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const oneIdx = args.indexOf("--one");
  if (oneIdx >= 0) {
    console.log(runOnce(parseFloat(args[oneIdx + 1]), 1, 25, true));
    return;
  }
  const H = machine.GEO.HAMMER;
  const degs = [];
  for (let d = H.minPullDeg; d <= H.maxPullDeg; d += 6) degs.push(d);
  const idles = [0.5, 1, 3, 7];
  let total = 0;
  let fail = 0;
  let slowest = 0;
  let sum = 0;
  let maxIdle = 0;
  const failures = [];
  for (const deg of degs) {
    for (const idle of idles) {
      const r = runOnce(deg, idle, 25, false);
      total++;
      maxIdle = Math.max(maxIdle, r.idleMove);
      const ok = r.launched && r.hitSec !== null;
      if (ok) {
        slowest = Math.max(slowest, r.hitSec);
        sum += r.hitSec;
      } else {
        fail++;
        failures.push({ deg, idle, ...r });
      }
      if (verbose) {
        const outcome = ok ? `狐到達 ${r.hitSec.toFixed(1)}s` : r.settledSec !== null ? `未到達→静止 ${r.settledSec.toFixed(1)}s` : "未到達";
        console.log(`引き${String(deg).padStart(3)}° 待ち${idle}s → ${outcome} 抜けた胴 ${r.knocked}/4 頭(${r.headX},${r.headY})${r.early ? " 先着:" + r.early : ""}`);
      }
    }
  }
  const ok = total - fail;
  console.log(
    `掃引 ${total} 点: 失敗 ${fail} / 平均到達 ${(sum / Math.max(1, ok)).toFixed(1)}s / 最遅到達 ${slowest.toFixed(1)}s / 儀式前の積みのずれ最大 ${maxIdle.toFixed(2)}px`
  );
  for (const f of failures.slice(0, 20)) console.log("  NG", JSON.stringify(f));
  if (fail > 0 || maxIdle > 1) process.exitCode = 1;
}

main();
