// おみくじ演出「和風ピタゴラ」の組み立て(描画を含まない純関数)。
//
// 演出の流れ(OmikujiPitagora.vue):
//   鈴の緒を引く(ここでサーバーに抽選を頼む)
//   → 横長の装置を玉が駆け抜ける(2D。カメラが玉を追う)
//     絵馬ドミノ → 鳥居の螺旋 → 跳ね板で谷越え(スロー) → 鹿威し → 回転盤
//   → 回転盤の玉にカメラが飛び込み、玉の視点(3D)であみだくじを走る
//   → 結果の門をくぐり、太鼓が鳴って巻物が広がる
//
// 設計の要:
// - 物理エンジンは使わない。玉の位置も仕掛けの動きも、時間の関数として振り付ける
//   (毎回同じ動きになり、詰まらない)。
// - 抽選の正しさは演出に依存しない。レア度はサーバーが決め、あみだの横線は
//   「入る線が結果の門に着く」ように、玉の視点に入る前(結果が届いた後)に組み立てる
//   (組み立ては omikujiAmida.js の buildLadder)。視点に入った時点で全体が見えて
//   いるので、途中で形が変わることはない。結果が遅れたら回転盤で回って待つ。
// - 3D は自前の簡単な透視投影(レールは線だけなので、ライブラリは使わない)。
//
// 検証は scripts/test-omikuji-pitagora.js。

const { LANES, buildLadder } = require("./omikujiAmida");

// ---- 2D の装置(論理座標。横長の世界をカメラが横に追う) ----
const STAGE = { W: 480, H: 760, WORLD_W: 1900 };

// 区間の時刻(秒。rang からの経過)
const T = {
  railStart: 0.25, // 鈴から出た玉がレールに乗る
  railEnd: 1.1, // レールの終わり(絵馬の棚へ)
  ledgeEnd: 1.9, // 絵馬の棚の終わり(螺旋へ)
  spiralEnd: 3.7, // 螺旋の終わり
  boardHit: 4.0, // 跳ね板に着く
  launch: 4.12, // 跳ね板が玉を打ち上げる
  land: 5.8, // 鹿威しの筒に入る(谷越えはスロー)
  tipEnd: 6.15, // 筒が傾き切る
  spill: 6.25, // 玉が筒から出る
  kakon: 6.55, // 反対側が石を打つ(カコーン)
  tableIn: 7.0, // 回転盤に乗る
  minLap: 1.1, // 回転盤で最低これだけ回る
  dive: 0.8, // 玉に飛び込む長さ
};

const BELL = { x: 150, y: 190 }; // 描画は OmikujiPitagora.vue で 72 下げている
const RAIL = { x0: 178, y0: 258, x1: 520, y1: 372 };
const LEDGE = { x0: 520, x1: 840, y: 372 }; // 玉の中心の高さ
const EMA = { x0: 580, gap: 40, n: 6, baseY: 384 };
const SPIRAL = { cx: 900, r: 60, y0: 372, y1: 560, turns: 2.5 };
const BOARD = { x: 1090, y: 592 };
const ARC = { x0: 1090, y0: 592, apex: 360 }; // 終点は鹿威しの筒の口(下で設定)
const SHISHI = { pivotX: 1420, pivotY: 590, len: 150, cupX: 1490, cupY: 548 };
const TABLE = { cx: 1740, cy: 660, rx: 110, ry: 28 };
// 谷越えの着地点 = 待ち受ける鹿威しの筒の口(ずれると着地の瞬間に玉が飛ぶ)
{
  const a = (-18 * Math.PI) / 180;
  ARC.x1 = SHISHI.pivotX + SHISHI.len * 0.5 * Math.cos(a);
  ARC.y1 = SHISHI.pivotY - 40 + SHISHI.len * 0.5 * Math.sin(a) - 6;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, f) => a + (b - a) * f;
const easeIn = (f) => f * f;
const easeInOut = (f) => f * f * (3 - 2 * f);

// 絵馬 i が倒れ始める時刻(玉が手前に来た時)
function emaFallTime(i) {
  const x = EMA.x0 + i * EMA.gap - 14;
  return T.railEnd + ((x - LEDGE.x0) / (LEDGE.x1 - LEDGE.x0)) * (T.ledgeEnd - T.railEnd);
}

// 谷越えの時間の進み(真ん中ほど遅い = スロー)。0→1 を 0→1 に写す。
function slowMo(f) {
  // 速さ ∝ 1 - 0.7*sin(πf) を積分して正規化
  const g = (u) => u + (0.7 / Math.PI) * (Math.cos(Math.PI * u) - 1);
  return g(f) / g(1);
}

// 回転盤の上の位置(角度 a。0 で左端から入る)
function onTable(a) {
  return {
    x: TABLE.cx - TABLE.rx * Math.cos(a),
    y: TABLE.cy - 8 + TABLE.ry * Math.sin(a) * -1,
    s: 1 - 0.12 * Math.sin(a),
    behind: Math.sin(a) > 0,
  };
}

// 時刻 t(rang からの秒)の玉の位置。tableAngle は回転盤に乗ってからの角度。
function ball2D(t, tableAngle) {
  if (t < T.railStart) {
    const f = clamp(t / T.railStart, 0, 1);
    return { x: lerp(BELL.x + 12, RAIL.x0, f), y: lerp(BELL.y + 40, RAIL.y0, easeIn(f)), s: 1 };
  }
  if (t < T.railEnd) {
    const f = easeIn((t - T.railStart) / (T.railEnd - T.railStart));
    return { x: lerp(RAIL.x0, RAIL.x1, f), y: lerp(RAIL.y0, RAIL.y1, f), s: 1 };
  }
  if (t < T.ledgeEnd) {
    const f = (t - T.railEnd) / (T.ledgeEnd - T.railEnd);
    return { x: lerp(LEDGE.x0, LEDGE.x1, f), y: LEDGE.y, s: 1 };
  }
  if (t < T.spiralEnd) {
    const f = (t - T.ledgeEnd) / (T.spiralEnd - T.ledgeEnd);
    const th = f * SPIRAL.turns * 2 * Math.PI;
    return {
      x: SPIRAL.cx - SPIRAL.r * Math.cos(th),
      y: lerp(SPIRAL.y0, SPIRAL.y1, f),
      s: 1 + 0.18 * Math.sin(th),
      behind: Math.sin(th) < 0,
    };
  }
  if (t < T.boardHit) {
    const f = easeIn((t - T.spiralEnd) / (T.boardHit - T.spiralEnd));
    return { x: lerp(SPIRAL.cx + SPIRAL.r, BOARD.x, f), y: lerp(SPIRAL.y1, BOARD.y, f), s: 1 };
  }
  if (t < T.launch) return { x: BOARD.x, y: BOARD.y + 6, s: 1 };
  if (t < T.land) {
    const f = slowMo((t - T.launch) / (T.land - T.launch));
    // 放物線(始点・頂点・終点を通る)
    const x = lerp(ARC.x0, ARC.x1, f);
    const base = lerp(ARC.y0, ARC.y1, f);
    const lift = 4 * f * (1 - f) * (Math.min(ARC.y0, ARC.y1) - ARC.apex);
    return { x, y: base - lift, s: 1, slow: true };
  }
  if (t < T.spill) {
    // 筒の中(筒と一緒に下がる)
    const a = shishiAngle(t);
    const p = shishiCup(a);
    return { x: p.x, y: p.y - 6, s: 1 };
  }
  if (t < T.tableIn) {
    const f = (t - T.spill) / (T.tableIn - T.spill);
    const p = shishiCup(shishiAngle(T.spill));
    const e = onTable(0);
    return { x: lerp(p.x + 8, e.x, f), y: lerp(p.y, e.y, easeIn(f)), s: 1 };
  }
  return onTable(tableAngle || 0);
}

// 鹿威しの傾き(度。正で筒の口が下がる)
function shishiAngle(t) {
  if (t < T.land) return -18;
  if (t < T.tipEnd) return lerp(-18, 28, easeIn((t - T.land) / (T.tipEnd - T.land)));
  if (t < T.kakon) return lerp(28, -24, easeIn((t - T.tipEnd) / (T.kakon - T.tipEnd)));
  if (t < T.kakon + 0.3) return lerp(-24, -18, (t - T.kakon) / 0.3);
  return -18;
}
function shishiCup(angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return {
    x: SHISHI.pivotX + SHISHI.len * 0.5 * Math.cos(a),
    y: SHISHI.pivotY - 40 + SHISHI.len * 0.5 * Math.sin(a),
  };
}

// 跳ね板のたわみ(px)
function boardDip(t) {
  if (t < T.boardHit || t > T.launch + 0.35) return 0;
  if (t < T.launch) return 8 * ((t - T.boardHit) / (T.launch - T.boardHit));
  return 8 * Math.cos(((t - T.launch) / 0.35) * Math.PI * 1.5) * (1 - (t - T.launch) / 0.35);
}

// 絵馬 i の傾き(度)
function emaAngle(i, t) {
  const t0 = emaFallTime(i);
  if (t < t0) return 0;
  return 72 * easeIn(clamp((t - t0) / 0.28, 0, 1));
}

// カメラの左端(世界座標)。玉を画面の中央やや左に置く。
function cameraX(ballX) {
  return clamp(ballX - STAGE.W * 0.45, 0, STAGE.WORLD_W - STAGE.W);
}

// ---- 3D のあみだ(玉の視点) ----
const POV = {
  laneGap: 6,
  rowGap: 7.5,
  rows: 10,
  lead: 10, // 最初の横線までの直線
  tail: 12, // 最後の横線から門まで
  fillet: 1.6, // 曲がり角の丸み
  speed: 21, // 1秒あたりの距離
};

const laneX = (lane) => (lane - (LANES - 1) / 2) * POV.laneGap;

// 入る線 start から結果の門 target へのあみだと、玉の道のり(曲がり角の点)を組む。
function buildRoute(start, target, opts) {
  const rows = POV.rows;
  const ladder = buildLadder(start, target, { rows, rnd: opts && opts.rnd });
  const { path } = ladder;
  const pts = [{ x: laneX(start), z: 0 }];
  ladder.rows.forEach((row, r) => {
    if (path[r + 1] !== path[r]) {
      const z = POV.lead + r * POV.rowGap;
      pts.push({ x: laneX(path[r]), z });
      pts.push({ x: laneX(path[r + 1]), z });
    }
  });
  const zEnd = POV.lead + (ladder.rows.length - 1) * POV.rowGap + POV.tail;
  pts.push({ x: laneX(path[path.length - 1]), z: zEnd });
  return { ladder, corners: pts, zEnd, rows: ladder.rows.length, samples: roundCorners(pts) };
}

// 角を丸めた細かい折れ線と、先頭からの距離の表
function roundCorners(pts) {
  const out = [pts[0]];
  const f = POV.fillet;
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1];
    const B = pts[i];
    const C = pts[i + 1];
    const d1 = norm(B.x - A.x, B.z - A.z);
    const d2 = norm(C.x - B.x, C.z - B.z);
    const p1 = { x: B.x - d1.x * f, z: B.z - d1.z * f };
    const p2 = { x: B.x + d2.x * f, z: B.z + d2.z * f };
    out.push(p1);
    for (let k = 1; k < 8; k++) {
      const u = k / 8;
      out.push({
        x: (1 - u) * (1 - u) * p1.x + 2 * u * (1 - u) * B.x + u * u * p2.x,
        z: (1 - u) * (1 - u) * p1.z + 2 * u * (1 - u) * B.z + u * u * p2.z,
      });
    }
    out.push(p2);
  }
  out.push(pts[pts.length - 1]);
  const len = [0];
  for (let i = 1; i < out.length; i++) {
    len.push(len[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z));
  }
  return { pts: out, len, total: len[len.length - 1] };
}

function norm(x, z) {
  const d = Math.hypot(x, z) || 1;
  return { x: x / d, z: z / d };
}

// 道のりの距離 s の位置と向き(向きは単位ベクトル)
function sampleRoute(route, s) {
  const { pts, len, total } = route.samples;
  const d = clamp(s, 0, total);
  let lo = 0;
  let hi = len.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (len[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = len[hi] - len[lo] || 1;
  const f = (d - len[lo]) / seg;
  const dir = norm(pts[hi].x - pts[lo].x, pts[hi].z - pts[lo].z);
  return { x: lerp(pts[lo].x, pts[hi].x, f), z: lerp(pts[lo].z, pts[hi].z, f), dir };
}

// 透視投影。cam = { x, y, z, yaw, pitch, f, cx, cy }。見えなければ null。
function project(cam, p) {
  const dx = p.x - cam.x;
  const dy = p.y - cam.y;
  const dz = p.z - cam.z;
  const sy = Math.sin(cam.yaw);
  const cy = Math.cos(cam.yaw);
  const x1 = dx * cy - dz * sy;
  const z1 = dx * sy + dz * cy;
  const sp = Math.sin(cam.pitch);
  const cp = Math.cos(cam.pitch);
  const z2 = z1 * cp - dy * sp;
  const y2 = dy * cp + z1 * sp;
  if (z2 < 0.3) return null;
  return { x: cam.cx + (cam.f * x1) / z2, y: cam.cy - (cam.f * y2) / z2, z: z2 };
}

// 線分を手前(カメラの後ろ)で切ってから投影する
function projectSegment(cam, a, b) {
  const depth = (p) => {
    const dx = p.x - cam.x;
    const dy = p.y - cam.y;
    const dz = p.z - cam.z;
    const z1 = dx * Math.sin(cam.yaw) + dz * Math.cos(cam.yaw);
    return z1 * Math.cos(cam.pitch) - dy * Math.sin(cam.pitch);
  };
  const near = 0.35;
  let A = a;
  let B = b;
  const da = depth(A);
  const db = depth(B);
  if (da < near && db < near) return null;
  if (da < near || db < near) {
    const f = (near - da) / (db - da);
    const C = { x: lerp(A.x, B.x, f), y: lerp(A.y, B.y, f), z: lerp(A.z, B.z, f) };
    if (da < near) A = C;
    else B = C;
  }
  const pa = project(cam, A);
  const pb = project(cam, B);
  return pa && pb ? [pa, pb] : null;
}

module.exports = {
  STAGE,
  T,
  BELL,
  RAIL,
  LEDGE,
  EMA,
  SPIRAL,
  BOARD,
  ARC,
  SHISHI,
  TABLE,
  POV,
  LANES,
  ball2D,
  onTable,
  emaAngle,
  shishiAngle,
  shishiCup,
  boardDip,
  cameraX,
  laneX,
  buildRoute,
  sampleRoute,
  project,
  projectSegment,
};
