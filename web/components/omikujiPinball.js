// おみくじ演出「サイバー弾き盤」のルールと物理(描画なし。Node でも動く)。
//
// 見せ方は OmikujiPinball.vue(three.js で 3D、発射したら玉の視点で追いかける)。
// ここは盤面の形・玉の動き・ギミックだけ。検証は scripts/simulate-omikuji-pinball.js。
//
// 流れ:
//   ready  : 右端のレーンの玉を下に引いて(pull)、放す(launch)
//   play   : 盤面で遊ぶ。フリッパーはタップで動く(結果は変わらない)。下の真ん中には
//            「結界」があって、落ちてきた玉を上へ打ち返す(遊んでいる間は落ちない)
//   finale : 結果が届いていて、遊んだ時間が PLAY_MIN を超えたら、結界が開き、
//            フリッパーが下がる。バンパーは弾かなくなり、重力が少し強くなる
//   route  : 真ん中の穴に落ちた玉は、盤の下のレールを走って本命のレア度の穴(ポート)へ
//   port   : ポートに入った。演出の締めは画面の側
//
// 抽選はサーバーが決める。玉がどう動いても、ポートへのレールは本命へしか分かれない。
//
// 座標: 盤面は x 0〜480(右がレーン)、y 0〜880(下が手前)。h は盤面からの高さ。
// 時間は秒、速さは px/秒。物理は 1/480 秒ずつ(速い玉が壁をすり抜けないように)。
//
// 物理は自前(玉 1 つと、動かない壁・円・回るフリッパーだけ)。matter-js のように
// 物体同士を全部解かなくてよく、フリッパーの面の速さを玉に正しく伝えられる。

const W = 480;
const H = 880;
const CX = 225; // 盤面(レーンを除く)の真ん中
const R = 10; // 玉の半径
const SUB = 1 / 480; // 物理の 1 歩
const G_PLAY = 1000; // 盤面の傾きによる重力(px/s²)
const G_FINALE = 1500;
const VMAX = 2300;
const PLAY_MIN = 10; // 遊ぶ時間(秒)。これと結果の両方がそろったら結界が開く
const FINALE_MAX = 7; // 結界が開いてから穴に落ちるまでの上限(過ぎたらレールで連れて行く)
const RESULT_WAIT_MAX = 25; // 発射から結果が届かないまま、ここまで待ったら諦める(画面側)

// レア度(ポートの並び。左から)
const TIERS = ["超吉", "大吉", "中吉", "小吉", "末吉", "凶", "大凶"];

// ---- 盤面の形 ----
const ARC = { cx: 245, cy: 260, r: 225, segs: 28 };
const LANE = { x: 450, wall: 430, outer: 470, top: 300, ballY: 812 };
const PLUNGER = { maxPull: 44, vMin: 1450, vMax: 2150 };
const FLIP = { L: 72, r0: 12, r1: 7, rest: 0.5, up: -0.42, speed: 24, e: 0.25 };
const FLIPPERS = [
  { side: "left", x: 140, y: 800 },
  { side: "right", x: 310, y: 800 },
];
const BUMPERS = [
  { x: 165, y: 200, r: 26 },
  { x: 285, y: 200, r: 26 },
  { x: 225, y: 288, r: 26 },
];
const POP = 950; // バンパーが弾く速さ
const SLING_KICK = 760;
const SAVE_KICK = 1350; // 結界が打ち返す速さ
const LANES = [
  { x: 187.5, label: "B" },
  { x: 232.5, label: "U" },
  { x: 277.5, label: "G" },
];
const DIVIDERS = [165, 210, 255, 300];
const DROPS = (() => {
  const a = { x: 300, y: 556 };
  const b = { x: 364, y: 522 };
  return [0, 0.5, 1].map((t, i) => {
    const cx = a.x + (b.x - a.x) * t;
    const cy = a.y + (b.y - a.y) * t;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    return { i, x: cx, y: cy, ax: cx - ux * 11, ay: cy - uy * 11, bx: cx + ux * 11, by: cy + uy * 11 };
  });
})();
const SPINNER = { ax: 92, ay: 338, bx: 140, by: 338 };
const MAGNET = { x: CX, y: 470, r: 30, hold: 1.0, cool: 6 };
const PORTAL = { x: 385, y: 430, r: 18, cool: 3 };
const RAMP_IN = { x0: 26, x1: 100, y0: 432, y1: 474 };
const LASERS = [
  { x0: 24, x1: 66, y: 640, side: "left" },
  { x0: 384, x1: 426, y: 640, side: "right" },
];
const CHUTE = { x0: 188, x1: 262 };
const DRAIN = { x0: CHUTE.x0, x1: CHUTE.x1, y: 872 };

// ---- レール(盤面を離れて走る道: ランプ・トンネル・ポートへの道) ----
// 3D の点 {x, y, h}。Catmull-Rom でなめらかにして、等間隔の点に分ける
function catmull(points, perSeg = 16) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), h: f(p0.h, p1.h, p2.h, p3.h) });
    }
  }
  out.push(Object.assign({}, points[n - 1]));
  return out;
}
function makeRail(points, opts) {
  const pts = catmull(points, (opts && opts.perSeg) || 16);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.h - a.h));
  }
  return { pts, cum, len: cum[cum.length - 1] };
}
// 道のり s の位置と向き
function railAt(rail, s) {
  const { pts, cum } = rail;
  if (s <= 0) return withDir(pts[0], pts[1], pts[0]);
  if (s >= rail.len) return withDir(pts[pts.length - 2], pts[pts.length - 1], pts[pts.length - 1]);
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= s) lo = m;
    else hi = m;
  }
  const a = pts[lo];
  const b = pts[hi];
  const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return withDir(a, b, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, h: a.h + (b.h - a.h) * t });
}
function withDir(a, b, p) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dh = b.h - a.h;
  const l = Math.hypot(dx, dy, dh) || 1;
  return { x: p.x, y: p.y, h: p.h, dx: dx / l, dy: dy / l, dh: dh / l };
}

// 左のランプ: 左の壁ぎわを駆け上がった玉を、宙の坂に乗せて左上を回し、バンパーの左へ降ろす
const RAMP = makeRail([
  { x: 56, y: 455, h: 0 },
  { x: 48, y: 380, h: 22 },
  { x: 42, y: 280, h: 52 },
  { x: 58, y: 170, h: 78 },
  { x: 110, y: 112, h: 86 },
  { x: 150, y: 138, h: 62 },
  { x: 128, y: 230, h: 22 },
  { x: 118, y: 268, h: 0 },
]);
// 右のトンネル(ワープ): 右の穴から盤の下へ潜り、天辺のレーンの下へ浮かび上がる
const TUNNEL = makeRail([
  { x: PORTAL.x, y: PORTAL.y, h: 0 },
  { x: PORTAL.x, y: PORTAL.y - 10, h: -40 },
  { x: 360, y: 330, h: -70 },
  { x: 300, y: 210, h: -80 },
  { x: CX, y: 160, h: -45 },
  { x: CX, y: 140, h: 0 },
]);

// ポートの位置(盤の下の部屋。左から TIERS の順)
const PORT_Y = 1040;
const PORT_H = -70;
const BUS_Y = 985;
const PORTS = TIERS.map((tier, i) => ({ tier, i, x: CX + (i - 3) * 62, y: PORT_Y, h: PORT_H }));

// 真ん中の穴(結界の下)から、本命のポートまでの道
function routeRail(target, from) {
  const p = PORTS[target];
  const pts = [];
  if (from) pts.push(from);
  pts.push({ x: CX, y: DRAIN.y - 4, h: 0 }, { x: CX, y: 905, h: -24 }, { x: CX, y: 955, h: PORT_H });
  if (p.x !== CX) {
    pts.push({ x: CX + Math.sign(p.x - CX) * 18, y: BUS_Y, h: PORT_H });
    pts.push({ x: p.x - Math.sign(p.x - CX) * 18, y: BUS_Y, h: PORT_H });
  } else {
    pts.push({ x: CX, y: BUS_Y, h: PORT_H });
  }
  pts.push({ x: p.x, y: PORT_Y - 22, h: PORT_H }, { x: p.x, y: PORT_Y, h: PORT_H - 6 }, { x: p.x, y: PORT_Y + 4, h: PORT_H - 70 });
  return makeRail(pts, { perSeg: 12 });
}

// ---- 当たりの形 ----
function seg(ax, ay, bx, by, r, kind, extra) {
  return Object.assign({ type: "seg", ax, ay, bx, by, r, kind, e: 0.45, active: true }, extra || {});
}
function buildShapes() {
  const s = [];
  // 外壁
  s.push(seg(20, ARC.cy, 20, 700, 6, "wall"));
  for (let k = 0; k < ARC.segs; k++) {
    const a0 = Math.PI + (Math.PI * k) / ARC.segs;
    const a1 = Math.PI + (Math.PI * (k + 1)) / ARC.segs;
    s.push(seg(ARC.cx + ARC.r * Math.cos(a0), ARC.cy + ARC.r * Math.sin(a0), ARC.cx + ARC.r * Math.cos(a1), ARC.cy + ARC.r * Math.sin(a1), 6, "wall", { arc: true }));
  }
  s.push(seg(LANE.outer, ARC.cy, LANE.outer, H, 6, "wall"));
  s.push(seg(20, H, LANE.outer, H, 6, "wall"));
  // レーンの仕切りと、出た後に閉じる蓋
  s.push(seg(LANE.wall, LANE.top, LANE.wall, H, 4, "wall", { laneWall: true }));
  s.push(seg(LANE.wall, LANE.top, LANE.outer, ARC.cy + 2, 4, "gate", { active: false }));
  // 下の受け(インレーンの外側)
  s.push(seg(20, 700, 128, 786, 5, "wall"));
  s.push(seg(LANE.wall, 700, 322, 786, 5, "wall"));
  // スリングショット(三角。斜めの辺が蹴る)
  const slings = [
    [
      [70, 610],
      [70, 700],
      [115, 725],
    ],
    [
      [380, 610],
      [380, 700],
      [335, 725],
    ],
  ];
  slings.forEach((p, i) => {
    s.push(seg(p[0][0], p[0][1], p[2][0], p[2][1], 4, "sling", { id: i, e: 0.5 }));
    s.push(seg(p[0][0], p[0][1], p[1][0], p[1][1], 4, "wall"));
    s.push(seg(p[1][0], p[1][1], p[2][0], p[2][1], 4, "wall"));
  });
  // 天辺のレーンの仕切り
  DIVIDERS.forEach((x) => s.push(seg(x, 70, x, 110, 4, "wall", { divider: true })));
  // バンパー
  BUMPERS.forEach((b, i) => s.push({ type: "circle", x: b.x, y: b.y, r: b.r, kind: "bumper", id: i, e: 0.5, active: true }));
  // ドロップターゲット
  DROPS.forEach((d) => s.push(seg(d.ax, d.ay, d.bx, d.by, 5, "drop", { id: d.i, e: 0.35 })));
  // フリッパーの下の斜面と、真ん中の穴への縦の道(シュート)。フリッパーの下に玉が
  // 潜り込まないように、フリッパーの休みの位置のすぐ下を斜面でふさぐ
  s.push(seg(140, 812, CHUTE.x0, 844, 4, "wall"));
  s.push(seg(CHUTE.x0, 844, CHUTE.x0, H, 4, "wall"));
  s.push(seg(2 * CX - 140, 812, CHUTE.x1, 844, 4, "wall"));
  s.push(seg(CHUTE.x1, 844, CHUTE.x1, H, 4, "wall"));
  // 結界(シュートの底の少し上。遊んでいる間だけ)
  s.push(seg(DRAIN.x0, DRAIN.y, DRAIN.x1, DRAIN.y, 3, "barrier", { e: 0.3 }));
  return s;
}

// ---- ゲーム ----
function newGame(opts) {
  const rnd = (opts && opts.rnd) || Math.random;
  const shapes = buildShapes();
  return {
    rnd,
    t: 0, // 発射からの時間
    phase: "ready",
    ball: { x: LANE.x, y: LANE.ballY, vx: 0, vy: 0, h: 0, mode: "plunger" },
    pull: 0,
    shapes,
    flippers: FLIPPERS.map((f) => ({ side: f.side, x: f.x, y: f.y, a: FLIP.rest, aPrev: FLIP.rest, w: 0, held: false })),
    drops: DROPS.map(() => true), // 立っているか
    dropsResetAt: null,
    lanes: LANES.map(() => false),
    hitAt: {}, // 当たりの間引き(同じものに続けて当たった時に 1 回に数える)
    magnetCoolUntil: 0,
    portalCoolUntil: 0,
    rampCoolUntil: 0,
    hold: null,
    rail: null,
    target: null,
    finaleAt: null,
    portAt: null,
    slowFor: 0, // 止まっていた時間
    combo: 0,
    events: [],
    stats: { bumper: 0, sling: 0, drop: 0, lane: 0, ramp: 0, portal: 0, magnet: 0, save: 0, spinner: 0, laser: 0, flipper: 0 },
  };
}

function emit(g, type, data) {
  g.events.push(Object.assign({ type, t: g.t }, data || {}));
}

// 結果(レア度)が届いた
function setTarget(g, tier) {
  const i = TIERS.indexOf(tier);
  if (i >= 0) g.target = i;
}

// 儀式: 引き具合(0〜1)
function setPull(g, u) {
  if (g.phase !== "ready") return;
  g.pull = Math.max(0, Math.min(1, u));
  g.ball.y = LANE.ballY + g.pull * PLUNGER.maxPull;
}

function launch(g) {
  if (g.phase !== "ready") return;
  const u = g.pull;
  g.phase = "play";
  g.t = 0;
  g.ball.mode = "table";
  g.ball.vx = 0;
  g.ball.vy = -(PLUNGER.vMin + (PLUNGER.vMax - PLUNGER.vMin) * u);
  g.pull = 0;
  emit(g, "launch", { power: u });
}

// フリッパーの線(根元と先)
function flipperEnds(f, a) {
  const dx = Math.cos(a) * FLIP.L * (f.side === "left" ? 1 : -1);
  const dy = Math.sin(a) * FLIP.L;
  return { ax: f.x, ay: f.y, bx: f.x + dx, by: f.y + dy };
}

// 線分 a-b に一番近い点(t は 0〜1)
function closest(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return { t, x: ax + dx * t, y: ay + dy * t };
}

function cooldown(g, key, sec) {
  const last = g.hitAt[key];
  if (last != null && g.t - last < sec) return false;
  g.hitAt[key] = g.t;
  return true;
}

// 面の速さ (svx, svy) を持つ面に、法線 n で当たった時の跳ね返り
function bounce(b, nx, ny, e, svx, svy) {
  const rvx = b.vx - svx;
  const rvy = b.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  let tx = rvx - vn * nx;
  let ty = rvy - vn * ny;
  tx *= 0.985;
  ty *= 0.985;
  b.vx = tx - e * vn * nx + svx;
  b.vy = ty - e * vn * ny + svy;
  return -vn;
}

function kick(g, b, nx, ny, speed, jitter) {
  const a = Math.atan2(ny, nx) + (g.rnd() - 0.5) * 2 * (jitter || 0);
  b.vx = Math.cos(a) * speed;
  b.vy = Math.sin(a) * speed;
}

// 結界の打ち返しは、ギミックのどれかを狙う(何もしなくても見せ場が回ってくるように)。
// 重力で曲がるので、放物線で届く向きを解く(低い方の弧)。届かなければ真上
const SAVE_AIMS = [
  { x: PORTAL.x, y: PORTAL.y, w: 0.3, name: "portal" },
  { x: 62, y: 440, w: 0.25, name: "ramp" },
  { x: MAGNET.x, y: MAGNET.y, w: 0.2, name: "magnet" },
  { x: 225, y: 300, w: 0.25, name: "bumper" },
];
function aimKick(g, b) {
  let r = g.rnd();
  let aim = SAVE_AIMS[SAVE_AIMS.length - 1];
  for (const a of SAVE_AIMS) {
    if ((r -= a.w) < 0) {
      aim = a;
      break;
    }
  }
  const v = SAVE_KICK;
  const gr = G_PLAY;
  const dx = aim.x - b.x;
  const up = b.y - aim.y; // 上が正
  const disc = v ** 4 - gr * (gr * dx * dx + 2 * up * v * v);
  if (Math.abs(dx) < 1 || disc < 0) {
    kick(g, b, 0, -1, v, 0.05);
    return;
  }
  // 水平からの仰角(低い方の弧)
  const th = Math.atan((v * v - Math.sqrt(disc)) / (gr * Math.abs(dx)));
  const jitter = (g.rnd() - 0.5) * 0.04;
  b.vx = Math.sign(dx) * Math.cos(th + jitter) * v;
  b.vy = -Math.sin(th + jitter) * v;
}

function collideTable(g) {
  const b = g.ball;
  const finale = g.phase === "finale";
  for (const s of g.shapes) {
    if (!s.active) continue;
    if (s.kind === "barrier" && finale) continue;
    if (s.kind === "drop" && !g.drops[s.id]) continue;
    let nx;
    let ny;
    let pen;
    if (s.type === "circle") {
      const dx = b.x - s.x;
      const dy = b.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d >= s.r + R) continue;
      nx = d ? dx / d : 0;
      ny = d ? dy / d : -1;
      pen = s.r + R - d;
    } else {
      const c = closest(b.x, b.y, s.ax, s.ay, s.bx, s.by);
      const dx = b.x - c.x;
      const dy = b.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d >= s.r + R) continue;
      nx = d ? dx / d : 0;
      ny = d ? dy / d : -1;
      pen = s.r + R - d;
    }
    b.x += nx * pen;
    b.y += ny * pen;
    const vn = -(b.vx * nx + b.vy * ny);
    if (s.kind === "bumper" && !finale) {
      kick(g, b, nx, ny, POP, 0.35);
      if (cooldown(g, "bumper" + s.id, 0.08)) {
        g.stats.bumper++;
        g.combo++;
        emit(g, "bumper", { id: s.id, x: s.x, y: s.y, combo: g.combo });
      }
    } else if (s.kind === "sling" && vn > 120 && !finale) {
      kick(g, b, nx, ny, SLING_KICK, 0.12);
      if (cooldown(g, "sling" + s.id, 0.1)) {
        g.stats.sling++;
        emit(g, "sling", { id: s.id, x: b.x, y: b.y });
      }
    } else if (s.kind === "barrier") {
      aimKick(g, b);
      if (cooldown(g, "barrier", 0.3)) {
        g.stats.save++;
        emit(g, "save", { x: b.x, y: b.y });
      }
    } else {
      bounce(b, nx, ny, s.e, 0, 0);
      if (s.kind === "drop" && vn > 150) {
        g.drops[s.id] = false;
        g.stats.drop++;
        emit(g, "drop", { id: s.id, x: s.x, y: s.y });
        if (g.drops.every((d) => !d)) {
          emit(g, "dropAll", {});
          g.dropsResetAt = g.t + 4;
        }
      } else if (vn > 500 && cooldown(g, "wall", 0.1)) {
        emit(g, "wall", { x: b.x, y: b.y, power: vn });
      }
    }
  }
  // フリッパー
  for (const f of g.flippers) {
    const e1 = flipperEnds(f, f.a);
    const c = closest(b.x, b.y, e1.ax, e1.ay, e1.bx, e1.by);
    const fr = FLIP.r0 + (FLIP.r1 - FLIP.r0) * c.t;
    const dx = b.x - c.x;
    const dy = b.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d >= fr + R) continue;
    const nx = d ? dx / d : 0;
    const ny = d ? dy / d : -1;
    b.x += nx * (fr + R - d);
    b.y += ny * (fr + R - d);
    // その点の面の速さ(前の歩の角度との差から)
    const e0 = flipperEnds(f, f.aPrev);
    const px = e0.ax + (e0.bx - e0.ax) * c.t;
    const py = e0.ay + (e0.by - e0.ay) * c.t;
    const svx = (c.x - px) / SUB;
    const svy = (c.y - py) / SUB;
    const hit = bounce(b, nx, ny, FLIP.e, svx, svy);
    if (f.w !== 0 && hit > 200 && cooldown(g, "flip" + f.side, 0.15)) {
      g.stats.flipper++;
      emit(g, "flipper", { side: f.side, x: b.x, y: b.y, power: hit });
    }
  }
}

// センサー(通り抜けで起きること)
function sensors(g, px, py) {
  const b = g.ball;
  const finale = g.phase === "finale";
  // 天辺のレーン(上から下へ通ったら点く)
  if (py < 100 && b.y >= 100) {
    LANES.forEach((l, i) => {
      if (Math.abs(b.x - l.x) < 20 && !g.lanes[i]) {
        g.lanes[i] = true;
        g.stats.lane++;
        emit(g, "lane", { id: i, label: l.label });
        if (g.lanes.every(Boolean)) {
          emit(g, "laneAll", {});
          g.lanes = g.lanes.map(() => false);
        }
      }
    });
  }
  // スピナー(横棒を通り抜けた)
  if ((py - SPINNER.ay) * (b.y - SPINNER.ay) < 0 && b.x > SPINNER.ax && b.x < SPINNER.bx) {
    g.stats.spinner++;
    emit(g, "spinner", { speed: Math.abs(b.vy) });
  }
  // インレーンのレーザー
  LASERS.forEach((l) => {
    if ((py - l.y) * (b.y - l.y) < 0 && b.x > l.x0 && b.x < l.x1 && cooldown(g, "laser" + l.side, 0.5)) {
      g.stats.laser++;
      emit(g, "laser", { side: l.side });
    }
  });
  if (finale) return;
  // ランプ(左の壁ぎわを上へ駆け上がった玉)
  if (b.x > RAMP_IN.x0 && b.x < RAMP_IN.x1 && b.y > RAMP_IN.y0 && b.y < RAMP_IN.y1 && b.vy < -250 && g.t > g.rampCoolUntil) {
    startRail(g, RAMP, "ramp", Math.max(650, Math.min(1100, Math.hypot(b.vx, b.vy))));
    g.stats.ramp++;
    emit(g, "rampIn", {});
    return;
  }
  // ワープの穴
  if (Math.hypot(b.x - PORTAL.x, b.y - PORTAL.y) < PORTAL.r && g.t > g.portalCoolUntil) {
    startRail(g, TUNNEL, "tunnel", 900);
    g.stats.portal++;
    emit(g, "portalIn", {});
    return;
  }
  // 磁力の輪
  if (Math.hypot(b.x - MAGNET.x, b.y - MAGNET.y) < MAGNET.r && g.t > g.magnetCoolUntil) {
    g.hold = { at: g.t, x0: b.x, y0: b.y };
    b.mode = "hold";
    g.stats.magnet++;
    emit(g, "magnet", {});
  }
}

function startRail(g, rail, kind, speed) {
  const b = g.ball;
  g.rail = { rail, kind, s: 0, speed };
  b.mode = "rail";
  b.vx = 0;
  b.vy = 0;
}

function endRail(g) {
  const b = g.ball;
  const r = g.rail;
  const p = railAt(r.rail, r.rail.len);
  b.x = p.x;
  b.y = p.y;
  b.h = 0;
  const l = Math.hypot(p.dx, p.dy) || 1;
  b.vx = (p.dx / l) * r.speed;
  b.vy = (p.dy / l) * r.speed;
  b.mode = "table";
  g.rail = null;
  if (r.kind === "ramp") {
    g.rampCoolUntil = g.t + 2;
    emit(g, "rampOut", {});
  } else if (r.kind === "tunnel") {
    g.portalCoolUntil = g.t + PORTAL.cool;
    b.vx = (g.rnd() - 0.5) * 200;
    b.vy = 520;
    emit(g, "portalOut", { x: b.x, y: b.y });
  }
}

function stepFlippers(g, input) {
  for (const f of g.flippers) {
    f.aPrev = f.a;
    const held = g.phase === "play" && !!(input && input[f.side]);
    if (held && !f.held) emit(g, "flipperUp", { side: f.side });
    f.held = held;
    const target = held ? FLIP.up : FLIP.rest;
    const da = target - f.a;
    const max = FLIP.speed * SUB;
    if (Math.abs(da) <= max) {
      f.a = target;
      f.w = 0;
    } else {
      f.a += Math.sign(da) * max;
      f.w = Math.sign(da) * FLIP.speed;
    }
  }
}

// 1 歩(SUB 秒)
function substep(g, input) {
  const b = g.ball;
  g.t += SUB;
  stepFlippers(g, input);
  if (b.mode === "rail") {
    const r = g.rail;
    // 坂の上りは少し遅く、下りは速く(見た目の重さ)
    const p = railAt(r.rail, r.s);
    const sp = r.kind === "route" ? r.speed : r.speed * (1 - 0.35 * p.dh);
    r.s += sp * SUB;
    const q = railAt(r.rail, r.s);
    b.x = q.x;
    b.y = q.y;
    b.h = q.h;
    if (r.s >= r.rail.len) {
      if (r.kind === "route") {
        b.mode = "gone";
        g.rail = null;
        g.phase = "port";
        g.portAt = g.t;
        emit(g, "port", { tier: TIERS[g.target], i: g.target });
      } else {
        endRail(g);
      }
    }
    return;
  }
  if (b.mode === "hold") {
    const u = (g.t - g.hold.at) / MAGNET.hold;
    const k = Math.min(1, u * 3);
    const ang = u * Math.PI * 6;
    const rr = 10 * (1 - u);
    b.x = g.hold.x0 + (MAGNET.x + Math.cos(ang) * rr - g.hold.x0) * k;
    b.y = g.hold.y0 + (MAGNET.y + Math.sin(ang) * rr - g.hold.y0) * k;
    if (u >= 1 || g.phase === "finale") {
      b.mode = "table";
      g.hold = null;
      g.magnetCoolUntil = g.t + MAGNET.cool;
      const a = -Math.PI * (0.18 + 0.64 * g.rnd());
      b.vx = Math.cos(a) * 1050;
      b.vy = Math.sin(a) * 1050;
      emit(g, "magnetRelease", { x: b.x, y: b.y });
    }
    return;
  }
  if (b.mode !== "table") return;
  const px = b.x;
  const py = b.y;
  b.vy += (g.phase === "finale" ? G_FINALE : G_PLAY) * SUB;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > VMAX) {
    b.vx *= VMAX / sp;
    b.vy *= VMAX / sp;
  }
  b.x += b.vx * SUB;
  b.y += b.vy * SUB;
  collideTable(g);
  sensors(g, px, py);
  if (b.mode !== "table") return;
  // レーンを出たら蓋を閉じる
  const gate = g.shapes.find((s) => s.kind === "gate");
  if (!gate.active && b.x < LANE.wall - 4 && b.y < LANE.top - 20) gate.active = true;
  // 穴に落ちた(結界が開いている時だけ)
  if (g.phase === "finale" && b.y > 852 && b.x > DRAIN.x0 && b.x < DRAIN.x1) {
    g.phase = "route";
    startRail(g, routeRail(g.target, { x: b.x, y: b.y, h: 0 }), "route", 520);
    emit(g, "drain", {});
  }
}

// 1 フレーム(dt 秒)。input: { left, right }
function step(g, dt, input) {
  if (g.phase === "ready" || g.phase === "done") return;
  const n = Math.max(1, Math.round(Math.min(dt, 0.05) / SUB));
  for (let i = 0; i < n; i++) {
    substep(g, input);
    if (g.phase === "port") break;
  }
  const b = g.ball;
  // ドロップターゲットを立て直す
  if (g.dropsResetAt != null && g.t >= g.dropsResetAt) {
    g.drops = g.drops.map(() => true);
    g.dropsResetAt = null;
    emit(g, "dropReset", {});
  }
  // 結界を開く
  if (g.phase === "play" && g.target != null && g.t >= PLAY_MIN) {
    g.phase = "finale";
    g.finaleAt = g.t;
    emit(g, "finale", {});
  }
  // 結界が開いてから落ちてこない(上の方で跳ね回っている)なら、レールで連れて行く
  if (g.phase === "finale" && b.mode === "table" && g.t - g.finaleAt > FINALE_MAX) {
    g.phase = "route";
    startRail(g, routeRail(g.target, { x: b.x, y: b.y, h: 0 }), "route", 620);
    emit(g, "drain", { forced: true });
  }
  // 止まっていたら小突く(フリッパーで抱えている時は除く)
  if (b.mode === "table") {
    const sp = Math.hypot(b.vx, b.vy);
    const cradled = g.flippers.some((f) => f.held && Math.hypot(b.x - f.x, b.y - f.y) < FLIP.L + 20);
    g.slowFor = sp < 40 && !cradled ? g.slowFor + dt : 0;
    if (g.slowFor > 1.2) {
      g.slowFor = 0;
      kick(g, b, 0, -1, 700, 0.6);
      emit(g, "nudge", {});
    }
  }
}

module.exports = {
  W,
  H,
  CX,
  R,
  SUB,
  TIERS,
  PLAY_MIN,
  FINALE_MAX,
  RESULT_WAIT_MAX,
  ARC,
  LANE,
  PLUNGER,
  FLIP,
  FLIPPERS,
  BUMPERS,
  LANES,
  DIVIDERS,
  DROPS,
  SPINNER,
  MAGNET,
  PORTAL,
  RAMP,
  TUNNEL,
  RAMP_IN,
  LASERS,
  DRAIN,
  CHUTE,
  PORTS,
  PORT_Y,
  PORT_H,
  BUS_Y,
  makeRail,
  railAt,
  routeRail,
  flipperEnds,
  newGame,
  setTarget,
  setPull,
  launch,
  step,
};
