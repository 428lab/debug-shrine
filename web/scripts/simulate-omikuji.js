// おみくじからくり装置(omikujiMachine.js)のヘッドレス検証(#199)。
//
// 装置は「儀式の長さ(=玉1投入までの経過ステップ数)」だけで初期状態が決まる
// 決定論設計なので、その1次元を細かく掃引すれば実機で起こり得る軌道を
// 網羅的に再現できる。パラメータ調整(GEO)や物理修正の際は必ずここを回す。
//
// 使い方(web/ ディレクトリで実行。matter-js が require できること):
//   node scripts/simulate-omikuji.js --sweep 601             儀式0〜10秒を掃引
//   node scripts/simulate-omikuji.js --sweep 1801 --max-ritual 30   0〜30秒を1step刻みで掃引
//   node scripts/simulate-omikuji.js --jitter                無操作60秒の微振動(震え)を計測
//   node scripts/simulate-omikuji.js --sweep 601 --no-assist 連鎖アシスト無効で掃引
//   node scripts/simulate-omikuji.js --pattern billiard --sweep 601   特定パターンのみ
//
// 掃引・jitter とも全パターン(omikujiPatterns/index.js)に対して実行する。
//
// 検証項目:
//   - ドミノ5枚が全て倒れるか(倒れ残り = 連鎖の途中停止)
//   - 玉2が狐のセンサーに到達するか、到達までの秒数
//   - (--jitter)静止しているべき絵馬・水車・鈴の緒の振動振幅

/* eslint-disable no-console */
const Matter = require("matter-js");
const machine = require("../components/omikujiMachine.js");

const STEPS_PER_SEC = 1000 / machine.GEO.FIXED_DELTA;

function runOnce(opts) {
  const { warmupSteps, maxSeconds, assist, patternIndex } = opts;
  const built = machine.buildMachineWorld(Matter, { patternIndex });
  const engine = built.engine;

  if (assist && typeof machine.installChainAssist === "function") {
    machine.installChainAssist(Matter, engine);
  }

  let step = 0;
  let foxHitStep = null;
  Matter.Events.on(engine, "collisionStart", (e) => {
    for (const p of e.pairs) {
      const labels = [p.bodyA.label, p.bodyB.label];
      if (labels.includes("fox-sensor") && (labels.includes("ball") || labels.includes("ema"))) {
        if (foxHitStep === null) foxHitStep = step;
      }
    }
  });

  // 儀式パート(鈴の緒を振っている間)。装置には触れないので経過ステップのみ
  for (let i = 0; i < warmupSteps; i++) {
    Matter.Engine.update(engine, machine.GEO.FIXED_DELTA, 1);
    step++;
  }

  // OmikujiScene.onRing と同じ: 300ms 後に玉1を vx=0.35 で投入
  for (let i = 0; i < Math.round(0.3 * STEPS_PER_SEC); i++) {
    Matter.Engine.update(engine, machine.GEO.FIXED_DELTA, 1);
    step++;
  }
  machine.spawnBall(Matter, engine.world, 0.35);

  const maxSteps = step + Math.round(maxSeconds * STEPS_PER_SEC);
  while (step < maxSteps && foxHitStep === null) {
    Matter.Engine.update(engine, machine.GEO.FIXED_DELTA, 1);
    step++;
  }

  const dominoes = Matter.Composite.allBodies(engine.world).filter((b) => b.label === "domino");
  // 事前傾斜(-0.17)から転倒方向(左)へ大きく倒れていれば「倒れた」
  const fallen = dominoes.filter((d) => d.angle < -0.9).length;

  return {
    foxHitSec: foxHitStep === null ? null : (foxHitStep - warmupSteps) / STEPS_PER_SEC,
    dominoesFallen: fallen,
    dominoTotal: dominoes.length,
  };
}

// 無操作のまま回し、静止しているべきボディの振動振幅を計測する。
// warmupSec 経過後の windowSec 間で、各ボディの位置/角度の最大変位を取る。
function measureJitter(warmupSec, windowSec, patternIndex) {
  const built = machine.buildMachineWorld(Matter, { patternIndex });
  const engine = built.engine;
  const bodies = Matter.Composite.allBodies(engine.world);
  const watch = [
    ...bodies.filter((b) => b.label === "ema").map((b, i) => ({ name: "ema" + i, b })),
    ...bodies.filter((b) => b.label === "wheel").map((b, i) => ({ name: "wheel" + (i || ""), b })),
    { name: "tassel", b: built.tassel },
  ];

  for (let i = 0; i < warmupSec * STEPS_PER_SEC; i++) {
    Matter.Engine.update(engine, machine.GEO.FIXED_DELTA, 1);
  }
  const base = watch.map((w) => ({ x: w.b.position.x, y: w.b.position.y, a: w.b.angle }));
  const amp = watch.map(() => ({ pos: 0, ang: 0 }));
  for (let i = 0; i < windowSec * STEPS_PER_SEC; i++) {
    Matter.Engine.update(engine, machine.GEO.FIXED_DELTA, 1);
    watch.forEach((w, k) => {
      const dx = w.b.position.x - base[k].x;
      const dy = w.b.position.y - base[k].y;
      amp[k].pos = Math.max(amp[k].pos, Math.hypot(dx, dy));
      amp[k].ang = Math.max(amp[k].ang, Math.abs(w.b.angle - base[k].a));
    });
  }
  watch.forEach((w, k) => {
    console.log(
      `${w.name.padEnd(7)} 変位 ${amp[k].pos.toFixed(4)}px / 角度 ${amp[k].ang.toFixed(5)}rad` +
        (w.b.isSleeping ? " (sleeping)" : "")
    );
  });
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const num = (name, def) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : def;
  };
  const str = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };

  const only = str("--pattern");
  const targets = machine.PATTERNS.map((p, i) => ({ ...p, index: i })).filter(
    (p) => !only || p.id === only
  );
  if (targets.length === 0) {
    console.error(`unknown pattern: ${only}`);
    process.exitCode = 1;
    return;
  }

  if (flag("--jitter")) {
    for (const p of targets) {
      console.log(`== [${p.id}] 無操作60秒後の5秒間の微振動(震え)==`);
      measureJitter(60, 5, p.index);
    }
    return;
  }

  const points = num("--sweep", 121);
  const assist = !flag("--no-assist");
  const maxWarmup = num("--max-ritual", 10) * STEPS_PER_SEC;
  let totalFail = 0;
  for (const p of targets) {
    let fail = 0;
    const failures = [];
    let slowest = 0;
    for (let i = 0; i < points; i++) {
      const warmupSteps = Math.round((i / Math.max(1, points - 1)) * maxWarmup);
      const r = runOnce({ warmupSteps, maxSeconds: 25, assist, patternIndex: p.index });
      const ok = r.foxHitSec !== null && r.dominoesFallen === r.dominoTotal;
      if (!ok) {
        fail++;
        failures.push({ warmupSteps, ...r });
      }
      if (r.foxHitSec !== null) slowest = Math.max(slowest, r.foxHitSec);
      if (points > 60 && i % 60 === 0) {
        process.stdout.write(`\r[${p.id}] ${i}/${points} (fail ${fail})   `);
      }
    }
    console.log(
      `\n[${p.id}] 掃引 ${points} 点: 失敗 ${fail} / 最遅到達 ${slowest.toFixed(1)}s (assist=${assist})`
    );
    for (const f of failures.slice(0, 10)) {
      console.log(
        `  warmup=${f.warmupSteps}step ドミノ ${f.dominoesFallen}/${f.dominoTotal} ` +
          `狐到達 ${f.foxHitSec === null ? "なし" : f.foxHitSec.toFixed(1) + "s"}`
      );
    }
    totalFail += fail;
  }
  process.exitCode = totalFail > 0 ? 1 : 0;
}

main();
