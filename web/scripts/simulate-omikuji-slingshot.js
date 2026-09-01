// おみくじ「弾き玉」装置(omikujiSlingshot.js)のヘッドレス検証。
//
// 引き絞りの方向と強さを掃引し、放った玉(または崩れた木札)が狐のセンサーに
// 届くか、届くまでの秒数を計測する。GEO を調整したら必ずここを回す。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/simulate-omikuji-slingshot.js            角度×強さの格子を掃引
//   node scripts/simulate-omikuji-slingshot.js --one -80 34   指定の引き(dx,dy)を1回
//   node scripts/simulate-omikuji-slingshot.js --verbose  各点の結果を全部出す
//
// 合否: 放てて、狐に届くか、届かなくても数秒(SETTLE_LIMIT_SEC)以内に静まること。
// 静まれば物音で狐が起きる(createSettleDetector)ので、演出としては完走扱い。
// 放てない・場外へ抜ける・いつまでも転がり続ける、が失敗。
const SETTLE_LIMIT_SEC = 8;

/* eslint-disable no-console */
const Matter = require("matter-js");
const machine = require("../components/omikujiSlingshot.js");

const STEPS_PER_SEC = 1000 / machine.GEO.FIXED_DELTA;

function runOnce(dx, dy, maxSeconds) {
  const built = machine.build(Matter);
  const engine = built.engine;
  const ritual = machine.createRitual(Matter, built);

  let step = 0;
  let hitStep = null;
  let hitBy = null;
  Matter.Events.on(engine, "collisionStart", (e) => {
    for (const p of e.pairs) {
      const labels = [p.bodyA.label, p.bodyB.label];
      if (!labels.includes("fox-sensor")) continue;
      const other = labels[0] === "fox-sensor" ? labels[1] : labels[0];
      if (machine.wakeLabels.includes(other) && hitStep === null) {
        hitStep = step;
        hitBy = other;
      }
    }
  });

  // 儀式前に少し置く(櫓が勝手に動かないことの確認も兼ねる)
  for (let i = 0; i < STEPS_PER_SEC; i++) {
    Matter.Engine.update(engine, machine.GEO.FIXED_DELTA, 1);
    step++;
  }
  const blocksBefore = Matter.Composite.allBodies(engine.world)
    .filter((b) => b.label === "block")
    .map((b) => ({ x: b.position.x, y: b.position.y }));

  // 引いて放す
  ritual.pull(dx, dy);
  const settle = machine.createSettleDetector(Matter, built);
  let launchStep = null;
  let settledStep = null;
  let speedAtLaunch = 0;
  const maxSteps = step + Math.round(maxSeconds * STEPS_PER_SEC);
  while (step < maxSteps && hitStep === null && settledStep === null) {
    if (launchStep === null && ritual.step(false)) {
      launchStep = step;
      speedAtLaunch = Math.hypot(built.ball.velocity.x, built.ball.velocity.y);
    }
    Matter.Engine.update(engine, machine.GEO.FIXED_DELTA, 1);
    step++;
    if (launchStep !== null && settle.step()) settledStep = step;
  }

  const blocks = Matter.Composite.allBodies(engine.world).filter((b) => b.label === "block");
  const moved = blocks.filter((b, i) => Math.hypot(b.position.x - blocksBefore[i].x, b.position.y - blocksBefore[i].y) > 6).length;

  return {
    launched: launchStep !== null,
    hitSec: hitStep === null ? null : (hitStep - (launchStep || 0)) / STEPS_PER_SEC,
    hitBy,
    settledSec: settledStep === null ? null : (settledStep - (launchStep || 0)) / STEPS_PER_SEC,
    blocksMoved: moved,
    blockTotal: blocks.length,
    ballX: Math.round(built.ball.position.x),
    ballY: Math.round(built.ball.position.y),
    speedAtLaunch: speedAtLaunch.toFixed(1),
  };
}

// 儀式中に櫓が勝手に崩れないこと(無操作で回して木札の変位を測る)
function checkIdle(seconds) {
  const built = machine.build(Matter);
  const blocks = Matter.Composite.allBodies(built.world).filter((b) => b.label === "block");
  const base = blocks.map((b) => ({ x: b.position.x, y: b.position.y, a: b.angle }));
  let maxPos = 0;
  let maxAng = 0;
  for (let i = 0; i < seconds * STEPS_PER_SEC; i++) {
    Matter.Engine.update(built.engine, machine.GEO.FIXED_DELTA, 1);
    blocks.forEach((b, k) => {
      maxPos = Math.max(maxPos, Math.hypot(b.position.x - base[k].x, b.position.y - base[k].y));
      maxAng = Math.max(maxAng, Math.abs(b.angle - base[k].a));
    });
  }
  const ballDrift = Math.hypot(built.ball.position.x - built.anchor.x, built.ball.position.y - built.anchor.y);
  console.log(`無操作 ${seconds}s: 木札の最大変位 ${maxPos.toFixed(3)}px / 角度 ${maxAng.toFixed(4)}rad, 玉の支点からのずれ ${ballDrift.toFixed(2)}px`);
  return maxPos < 1 && ballDrift < 3;
}

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const oneIdx = args.indexOf("--one");
  if (oneIdx >= 0) {
    const r = runOnce(parseFloat(args[oneIdx + 1]), parseFloat(args[oneIdx + 2]), 25);
    console.log(r);
    return;
  }

  const idleOk = checkIdle(20);

  // 引きの方向: 左下(右上へ飛ぶ)を中心に、水平〜急角度まで。強さ: 弱〜最大。
  const angles = [-10, 0, 10, 20, 30, 40, 50, 60, 70]; // 度。水平から下向きが正(右上へ飛ぶ)
  const pulls = [30, 50, 70, 90, 110];
  let fail = 0;
  let total = 0;
  let slowest = 0;
  const failures = [];
  for (const deg of angles) {
    for (const pull of pulls) {
      const rad = (deg * Math.PI) / 180;
      const dx = -Math.cos(rad) * pull;
      const dy = Math.sin(rad) * pull;
      const r = runOnce(dx, dy, 25);
      total++;
      const ok = r.launched && (r.hitSec !== null || (r.settledSec !== null && r.settledSec <= SETTLE_LIMIT_SEC));
      if (!ok) {
        fail++;
        failures.push({ deg, pull, ...r });
      } else {
        slowest = Math.max(slowest, r.hitSec);
      }
      if (verbose) {
        const outcome = ok
          ? `狐到達 ${r.hitSec.toFixed(1)}s (${r.hitBy})`
          : r.settledSec !== null
            ? `未到達→静止 ${r.settledSec.toFixed(1)}s`
            : "未到達";
        console.log(
          `角度${String(deg).padStart(3)}° 引き${String(pull).padStart(3)} ` +
            `射出${r.speedAtLaunch} → ${outcome} 木札 ${r.blocksMoved}/${r.blockTotal} 玉(${r.ballX},${r.ballY})`
        );
      }
    }
  }
  console.log(`掃引 ${total} 点: 失敗 ${fail} / 最遅到達 ${slowest.toFixed(1)}s / 無操作静止 ${idleOk ? "OK" : "NG"} (静止は ${SETTLE_LIMIT_SEC}s 以内なら合格)`);
  for (const f of failures.slice(0, 20)) {
    console.log(`  角度${f.deg}° 引き${f.pull}: 射出${f.speedAtLaunch} 木札 ${f.blocksMoved}/${f.blockTotal} 玉(${f.ballX},${f.ballY}) launched=${f.launched} 静止=${f.settledSec === null ? "なし" : f.settledSec.toFixed(1) + "s"}`);
  }
  process.exitCode = fail > 0 || !idleOk ? 1 : 0;
}

main();
