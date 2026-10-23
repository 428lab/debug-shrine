// おみくじ演出「弾き玉」(3D。components/omikujiSlingshot.js)のヘッドレス検証。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/simulate-omikuji-slingshot.js
//
// 確かめること:
// - 放つ前は櫓が動かない(凍らせてある)。凍らせなくても、当てなければ自分では崩れない
// - 引きの向き × 強さ(75 通り)のどれでも、玉は櫓に当たる(外れない)
// - 当たってから結果の木札が選ばれるまでの秒数、崩れた部品の数
// - 選ばれた木札は、崩れて動いたもの(どれも動かない時だけ一番上)
// - 部品が飛び散りすぎない・地面にめり込まない・数値が壊れない(NaN)

/* eslint-disable no-console */
const assert = require("assert");
const CANNON = require("cannon-es");
const S = require("../components/omikujiSlingshot");

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

// 1) 放つ前: 10 秒たっても動かない
{
  const g = S.build(CANNON, { rnd: mulberry(1) });
  for (let i = 0; i < 600; i++) g.world.step(1 / 60);
  const maxMove = Math.max(...g.parts.map(S.moved));
  assert.ok(maxMove < 1e-6, `放つ前に櫓が動いた ${maxMove}`);
}
// 2) 凍らせなくても、自分では崩れない(当たった時に起きた部品が、ほかを道連れにしない)
{
  const g = S.build(CANNON, { rnd: mulberry(2) });
  g.parts.forEach((p) => p.body.wakeUp());
  for (let i = 0; i < 240 * 6; i++) g.world.step(S.STEP);
  const maxMove = Math.max(...g.parts.map(S.moved));
  console.log(`起こしたまま 6 秒: 部品の最大移動 ${maxMove.toFixed(3)}m`);
  assert.ok(maxMove < 0.08, `当てていないのに櫓が崩れた ${maxMove}`);
}

// 3) 掃引
const rows = [];
for (const ax of [-1, -0.5, 0, 0.5, 1]) {
  for (const ay of [0, 0.25, 0.5, 0.75, 1]) {
    for (const power of [0.2, 0.6, 1]) {
      const g = S.build(CANNON, { rnd: mulberry(Math.round((ax + 2) * 100 + ay * 10 + power * 1000)) });
      S.setAim(g, { ax, ay, power });
      S.launch(g);
      let impact = null;
      let missed = false;
      let far = 0;
      for (let f = 0; f < 60 * 12 && g.phase !== "reveal"; f++) {
        S.step(g, 1 / 60);
        for (const e of g.events.splice(0)) {
          if (e.type === "impact") {
            impact = e.t;
            missed = !!e.missed;
          }
        }
      }
      assert.strictEqual(g.phase, "reveal", `結果が選ばれない ax=${ax} ay=${ay} p=${power}`);
      assert.ok(!missed, `外れた ax=${ax} ay=${ay} p=${power}`);
      for (const p of g.parts) {
        const b = p.body.position;
        assert.ok(Number.isFinite(b.x + b.y + b.z), "NaN");
        assert.ok(b.y > -0.3, `地面にめり込んだ ${p.kind} y=${b.y}`);
        far = Math.max(far, Math.hypot(b.x, b.z - S.TOWER.z));
      }
      const movedN = g.parts.filter((p) => S.moved(p) > 0.35).length;
      const chosenMoved = S.moved(g.chosen) > 0.35;
      rows.push({ far, ax, ay, power, impact, reveal: g.t, settle: g.t - impact, movedN, chosenMoved, hits: g.hits });
    }
  }
}
const pct = (arr, q) => arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * q))];
const settle = rows.map((r) => r.settle);
const movedN = rows.map((r) => r.movedN);
console.log(`OK ${rows.length} 通りすべて櫓に当たり、結果の木札が選ばれた`);
console.log(`当たるまで ${Math.min(...rows.map((r) => r.impact)).toFixed(2)}〜${Math.max(...rows.map((r) => r.impact)).toFixed(2)}s / 当たってから選ぶまで 中央 ${pct(settle, 0.5).toFixed(1)}s 最大 ${Math.max(...settle).toFixed(1)}s`);
console.log(`崩れた部品(52 個中): 最少 ${Math.min(...movedN)} / 中央 ${pct(movedN, 0.5)} / 最大 ${Math.max(...movedN)}`);
console.log(`一番遠くへ飛んだ部品: 中央 ${pct(rows.map((r) => r.far), 0.5).toFixed(1)}m 最大 ${Math.max(...rows.map((r) => r.far)).toFixed(1)}m`, rows.filter((r) => r.far > 15).map((r) => `${r.ax},${r.ay},${r.power}:${r.far.toFixed(0)}`).join(" "));
console.log(`選ばれた木札が崩れて動いたもの: ${rows.filter((r) => r.chosenMoved).length}/${rows.length}`);
for (const ay of [0, 0.5, 1]) {
  const rs = rows.filter((r) => r.ay === ay);
  console.log(`  高さ ${ay}: 崩れた部品 平均 ${(rs.reduce((a, r) => a + r.movedN, 0) / rs.length).toFixed(1)}`);
}
