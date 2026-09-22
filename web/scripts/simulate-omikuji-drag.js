// おみくじ装置を「指でつまんで動かして放す」経路で検証する(賽銭落とし・だるま落とし)。
//
// 各装置の simulate-omikuji-*.js は ritual.dropAt()/pull() で位置を直接置くため、
// MouseConstraint を通らない。実機では、ドラッグ中に MouseConstraint が溜めた
// 拘束の衝撃(constraintImpulse)が放した瞬間に効き、だるまの木槌が一回転して
// 積みの上に乗ったり、賽銭が釘をすり抜けて飛んだりした。ここでは OmikujiScene と
// 同じ順序(Engine.update → ritual.step(!!mc.body) → 完了したら mc を外す)で、
// 偽のマウスを本物の MouseConstraint に渡して再現する。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/simulate-omikuji-drag.js
//
// 合否: つかめて、放すと儀式が完了し、狐に届くこと。賽銭は放した3ステップ後に
// 横木から大きく離れていないこと(ワープしない)も見る。

/* eslint-disable no-console */
const Matter = require("matter-js");
const saisen = require("../components/omikujiSaisen.js");
const daruma = require("../components/omikujiDaruma.js");

const STEPS_PER_SEC = 60;

function fakeMouse() {
  return {
    position: { x: 0, y: 0 },
    mousedownPosition: { x: 0, y: 0 },
    mouseupPosition: { x: 0, y: 0 },
    absolute: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    wheelDelta: 0,
    button: -1,
    sourceEvents: { mousemove: null, mousedown: null, mouseup: null, mousewheel: null },
  };
}

function seeded(seed) {
  let a = seed;
  return () => (a = (a * 16807) % 2147483647) / 2147483647;
}

// つかむ(from)→ to まで 10 ステップで動かす → 少し待つ → 放す → 結果
function dragRun(machine, grabBody, from, to, opts) {
  const built = machine.build(Matter, opts);
  const engine = built.engine;
  const ritual = machine.createRitual(Matter, built);
  const mouse = fakeMouse();
  const mc = Matter.MouseConstraint.create(engine, {
    mouse,
    collisionFilter: machine.grabFilter,
    constraint: { stiffness: 0.18 },
  });
  Matter.World.add(built.world, mc);

  let step = 0;
  let hit = null;
  let done = null;
  let settled = null;
  Matter.Events.on(engine, "collisionStart", (e) => {
    for (const p of e.pairs) {
      const l = [p.bodyA.label, p.bodyB.label];
      if (l.includes("fox-sensor") && l.some((x) => machine.wakeLabels.includes(x)) && hit === null) hit = step;
    }
  });
  const settle = machine.createSettleDetector(Matter, built);
  const tick = () => {
    Matter.Engine.update(engine, machine.GEO.FIXED_DELTA, 1);
    step++;
    if (done === null) {
      if (ritual.step(!!mc.body)) {
        done = step;
        Matter.World.remove(built.world, mc);
      }
    } else if (settled === null && settle.step()) {
      settled = step;
    }
  };

  for (let i = 0; i < 30; i++) tick();
  mouse.position = { ...from };
  mouse.button = 0;
  tick();
  tick();
  const grabbed = !!mc.body;
  for (let k = 1; k <= 10; k++) {
    mouse.position = { x: from.x + ((to.x - from.x) * k) / 10, y: from.y + ((to.y - from.y) * k) / 10 };
    tick();
  }
  for (let i = 0; i < 10; i++) tick();
  mouse.button = -1;
  tick();
  for (let i = 0; i < 3; i++) tick();
  const after3 = { x: grabBody(built).position.x, y: grabBody(built).position.y };
  while (step < STEPS_PER_SEC * 25 && hit === null && settled === null) tick();
  return {
    grabbed,
    done: done !== null,
    hitSec: hit === null ? null : (hit - done) / STEPS_PER_SEC,
    settledSec: settled === null ? null : (settled - done) / STEPS_PER_SEC,
    after3,
  };
}

function main() {
  let failures = 0;

  // 賽銭: 横木の上をつまみ、横・下・画面の外まで動かして放す
  {
    const R = saisen.GEO.RAIL;
    let n = 0;
    let ng = 0;
    let maxDrop = 0;
    for (let x = -200; x <= 680; x += 110) {
      for (const y of [0, R.y, 300, 500, 760]) {
        for (const seed of [1, 2, 3]) {
          const r = dragRun(saisen, (b) => b.coin, { x: R.startX, y: R.y }, { x, y }, { rnd: seeded(seed) });
          n++;
          // 放して3ステップ後の落下量。自由落下なら数px。ワープすると100px超
          const drop = r.after3.y - R.y;
          maxDrop = Math.max(maxDrop, drop);
          if (!r.grabbed || !r.done || r.hitSec === null || drop > 20) {
            ng++;
            console.log("  NG 賽銭", JSON.stringify({ to: { x, y }, seed, ...r }));
          }
        }
      }
    }
    console.log(`賽銭: ${n - ng}/${n} 到達 / 放した3ステップ後の最大落下 ${maxDrop.toFixed(1)}px`);
    failures += ng;
  }

  // だるま: 木槌の頭をつまみ、左右・上下・画面の外まで動かして放す。
  // 引きが minPullDeg 未満なら放しても発火しない(誤タップ防止)ので数えない。
  {
    const H = daruma.GEO.HAMMER;
    const from = { x: H.pivotX, y: daruma.GEO.SHELF.top - daruma.GEO.STACK.blockH / 2 };
    let n = 0;
    let ng = 0;
    for (let x = -100; x <= 400; x += 50) {
      for (const y of [0, 150, 300, 450, 600, 760]) {
        const r = dragRun(daruma, (b) => b.hammer, from, { x, y });
        if (!r.grabbed) {
          ng++;
          console.log("  NG だるま つかめない", x, y);
          continue;
        }
        if (!r.done) continue;
        n++;
        if (r.hitSec === null) {
          ng++;
          console.log("  NG だるま", JSON.stringify({ to: { x, y }, ...r }));
        }
      }
    }
    console.log(`だるま: ${n - ng}/${n} 到達(放しても発火しない引きは除く)`);
    failures += ng;
  }

  if (failures > 0) process.exitCode = 1;
}

main();
