// おみくじ「和風ピタゴラ」の組み立て(components/omikujiPitagora.js)の検証。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/test-omikuji-pitagora.js
//
// 確かめること:
// - 玉の視点のあみだは、どの線から入っても、どの門を狙っても、必ず狙いの門に着く
// - 道のりは縦(前へ)と横(隣の線へ)だけで、途切れず、門の手前まで前へ進む
// - 2D の区間で玉の位置が途切れずにつながる(区間の境目で飛ばない)
// - 投影: カメラの後ろの点は描かない。前の点は画面の中に来る

/* eslint-disable no-console */
const assert = require("assert");
const P = require("../components/omikujiPitagora.js");

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

// ---- 3D のあみだ ----
let n = 0;
let minLen = Infinity;
let maxLen = 0;
let turns = 0;
for (let seed = 1; seed <= 40; seed++) {
  for (let s = 0; s < P.LANES; s++) {
    for (let t = 0; t < P.LANES; t++) {
      const route = P.buildRoute(s, t, { rnd: seeded(seed * 100 + s * 10 + t) });
      const c = route.corners;
      assert.strictEqual(c[0].x, P.laneX(s));
      assert.strictEqual(c[c.length - 1].x, P.laneX(t), `start=${s} target=${t} seed=${seed}`);
      assert.strictEqual(c[c.length - 1].z, route.zEnd);
      for (let i = 1; i < c.length; i++) {
        const dx = c[i].x - c[i - 1].x;
        const dz = c[i].z - c[i - 1].z;
        assert.ok(dx === 0 || dz === 0, "斜めの区間がある");
        assert.ok(dz >= 0, "後ろへ戻る区間がある");
      }
      const end = P.sampleRoute(route, 1e9);
      assert.ok(Math.abs(end.x - P.laneX(t)) < 1e-9 && Math.abs(end.z - route.zEnd) < 1e-9);
      // 細かい折れ線が途切れない
      const pts = route.samples.pts;
      for (let i = 1; i < pts.length; i++) {
        assert.ok(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) < P.POV.rowGap + 0.01 + route.zEnd);
      }
      minLen = Math.min(minLen, route.samples.total);
      maxLen = Math.max(maxLen, route.samples.total);
      turns += (c.length - 2) / 2;
      n++;
    }
  }
}

// ---- 2D の区間の境目で玉が飛ばない ----
let maxJump = 0;
let prev = P.ball2D(0, 0);
for (let t = 0.01; t <= P.T.tableIn + 0.5; t += 0.01) {
  const a = t > P.T.tableIn ? (t - P.T.tableIn) * 5 : 0;
  const b = P.ball2D(t, a);
  maxJump = Math.max(maxJump, Math.hypot(b.x - prev.x, b.y - prev.y));
  prev = b;
}
assert.ok(maxJump < 40, `2D の玉が ${maxJump.toFixed(1)}px 飛んだ`);

// ---- 投影 ----
const cam = { x: 0, y: 1.6, z: -3, yaw: 0, pitch: 0.2, f: 400, cx: 200, cy: 300 };
assert.strictEqual(P.project(cam, { x: 0, y: 0, z: -10 }), null);
const p = P.project(cam, { x: 0, y: 0, z: 20 });
assert.ok(p && p.x === 200 && p.y > 0 && p.y < 800);
const seg = P.projectSegment(cam, { x: 1, y: 0, z: -20 }, { x: 1, y: 0, z: 20 });
assert.ok(seg && seg[0].z >= 0.3);

const secs = (d) => (d / P.POV.speed).toFixed(1);
console.log(
  `OK あみだ ${n} 通り: 全部狙いの門に着く / 道のり ${minLen.toFixed(0)}〜${maxLen.toFixed(0)}(${secs(minLen)}〜${secs(maxLen)}秒) / 曲がる回数 平均 ${(turns / n).toFixed(1)} / 2D の最大移動 ${maxJump.toFixed(1)}px/10ms`
);
