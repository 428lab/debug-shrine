// おみくじ演出「弾き玉」(3D。components/omikujiSlingshot.js)のヘッドレス検証。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/simulate-omikuji-slingshot.js
//
// 確かめること:
// - 放つ前は櫓が動かない(凍らせてある)。凍らせなくても、当てなければ自分では崩れない
// - 引きの向き × 強さ(105 通り)のどれでも、結果の木札が選ばれる(櫓の外を狙って外れた時も)
// - 櫓の正面を狙えば当たる
// - 当たってから結果の木札が選ばれるまでの秒数、崩れた部品の数
// - 当たった時に選ばれた木札は、崩れて動いたもの(どれも動かない・外れた時は一番上)
// - 部品が飛び散りすぎない・地面にめり込まない・数値が壊れない(NaN)

/* eslint-disable no-console */
const assert = require("assert");
const CANNON = require("cannon-es");
const S = require("../components/omikujiSlingshot");

// 1) 放つ前: 10 秒たっても動かない
{
  const g = S.build(CANNON);
  for (let i = 0; i < 600; i++) g.world.step(1 / 60);
  const maxMove = Math.max(...g.parts.map(S.moved));
  assert.ok(maxMove < 1e-6, `放つ前に櫓が動いた ${maxMove}`);
}
// 2) 凍らせなくても、自分では崩れない(当たった時に起きた部品が、ほかを道連れにしない)
{
  const g = S.build(CANNON);
  g.parts.forEach((p) => p.body.wakeUp());
  for (let i = 0; i < 240 * 6; i++) g.world.step(S.STEP);
  const maxMove = Math.max(...g.parts.map(S.moved));
  console.log(`起こしたまま 6 秒: 部品の最大移動 ${maxMove.toFixed(3)}m`);
  assert.ok(maxMove < 0.08, `当てていないのに櫓が崩れた ${maxMove}`);
}

// 3) 掃引
const rows = [];
for (const ax of [-1, -0.66, -0.33, 0, 0.33, 0.66, 1]) {
  for (const ay of [0, 0.25, 0.5, 0.75, 1]) {
    for (const power of [0.2, 0.6, 1]) {
      const g = S.build(CANNON);
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
      // 櫓の正面(x ±1.1・高さ 0.5〜5)を狙ったら当たる
      const tg = S.targetOf({ ax, ay, power });
      if (Math.abs(tg.x) < 1.1 && tg.y > 0.5 && tg.y < 5) assert.ok(!missed, `櫓の正面を狙ったのに外れた ax=${ax} ay=${ay} p=${power}`);
      assert.ok(g.chosen, `木札が選ばれない ax=${ax} ay=${ay} p=${power}`);
      for (const p of g.parts) {
        const b = p.body.position;
        assert.ok(Number.isFinite(b.x + b.y + b.z), "NaN");
        assert.ok(b.y > -0.3, `地面にめり込んだ ${p.kind} y=${b.y}`);
        far = Math.max(far, Math.hypot(b.x, b.z - S.TOWER.z));
      }
      const movedN = g.parts.filter((p) => S.moved(p) > 0.35).length;
      const chosenMoved = S.moved(g.chosen) > 0.35;
      rows.push({ missed, far, ax, ay, power, impact, reveal: g.t, settle: g.t - impact, movedN, chosenMoved, hits: g.hits });
    }
  }
}
// 4) 遅い端末(1 フレーム 0.05 秒。1 フレームの歩数の上限に当たる)でも当たって結果が選ばれる
for (const ay of [0.1, 0.4, 0.7]) {
  const g = S.build(CANNON);
  S.setAim(g, { ax: 0.2, ay, power: 0.7 });
  S.launch(g);
  for (let f = 0; f < 20 * 30 && g.phase !== "reveal"; f++) S.step(g, 0.05);
  assert.strictEqual(g.phase, "reveal", `遅い端末で結果が選ばれない ay=${ay}`);
  assert.ok(g.events.some((e) => e.type === "impact" && !e.missed), `遅い端末で外れた ay=${ay}`);
}
console.log("OK 遅い端末(20fps)でも当たって結果が選ばれる");

const pct = (arr, q) => arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * q))];
const hit = rows.filter((r) => !r.missed);
const settle = hit.map((r) => r.settle);
const movedN = hit.map((r) => r.movedN);
console.log(`OK ${rows.length} 通りすべて結果の木札が選ばれた(当たった ${hit.length}・外れた ${rows.length - hit.length})`);
console.log(`外れた時、選ぶまで 最大 ${Math.max(...rows.filter((r) => r.missed).map((r) => r.settle)).toFixed(1)}s`);
console.log(`当たるまで ${Math.min(...rows.map((r) => r.impact)).toFixed(2)}〜${Math.max(...rows.map((r) => r.impact)).toFixed(2)}s / 当たってから選ぶまで 中央 ${pct(settle, 0.5).toFixed(1)}s 最大 ${Math.max(...settle).toFixed(1)}s`);
console.log(`崩れた部品(52 個中): 最少 ${Math.min(...movedN)} / 中央 ${pct(movedN, 0.5)} / 最大 ${Math.max(...movedN)}`);
console.log(`一番遠くへ飛んだ部品: 中央 ${pct(rows.map((r) => r.far), 0.5).toFixed(1)}m 最大 ${Math.max(...rows.map((r) => r.far)).toFixed(1)}m`, rows.filter((r) => r.far > 15).map((r) => `${r.ax},${r.ay},${r.power}:${r.far.toFixed(0)}`).join(" "));
console.log(`当たった時に選ばれた木札が崩れて動いたもの: ${hit.filter((r) => r.chosenMoved).length}/${hit.length}`);
for (const ay of [0, 0.25, 0.5]) {
  const rs = hit.filter((r) => r.ay === ay);
  console.log(`  高さ ${ay}: 崩れた部品 平均 ${(rs.reduce((a, r) => a + r.movedN, 0) / rs.length).toFixed(1)}`);
}
