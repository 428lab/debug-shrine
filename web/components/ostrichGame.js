// ミニゲーム「ダチョウ走」のルール(描画を含まない純関数)。
//
// Chrome の通信できない時の恐竜ゲームがベース。ダチョウが右へ走り続け、障害物を
// よけて進んだ距離を競う。そこに Flappy Bird の要素を足している:
//   - 地面にいる時のタップ = ジャンプ。空中でのタップ = 羽ばたき(何度でも)。
//   - サボテン(地面): ジャンプでよける
//   - カラス: 低いものはジャンプで越え、高いものは走り抜ける(跳ぶと当たる)
//   - 鳥居の門: 上下の柱の間(すき間)を羽ばたいてくぐる。くぐるとボーナス
// 進むほど速くなる。
//
// 設計の要:
// - 固定の刻み(STEP 秒)で進める。描画の間隔に左右されず、同じ乱数なら同じ展開になる
//   (検証スクリプトで自動操縦を走らせて、理不尽な配置が出ないことを確かめる)。
// - 当たり判定は見た目より少し小さい(かすっただけで終わると理不尽に感じる)。
// - 乱数は注入できる(rnd)。検証は scripts/test-ostrich-game.js。

const W = 640; // 論理の画面幅
const H = 400; // 論理の画面高さ
const GROUND = 350; // 地面の高さ(ダチョウの足の y)
const STEP = 1 / 120; // 1 刻みの秒数

const BIRD = { x: 110, w: 34, h: 58 }; // ダチョウ(当たり判定の元の大きさ)
const PHYS = {
  gravity: 2500,
  jumpV: -880, // 地面からのジャンプ(高さ ≈ 155)
  flapV: -500, // 空中の羽ばたき(その時の速さをこれに置き換える = Flappy Bird)
  maxFall: 900,
  ceiling: 16, // これより上には行けない(頭を打って止まる)
};
const SPEED = { start: 330, accel: 9, max: 820 }; // 走る速さ(px/s)と、1 秒ごとの加速
const GATE = { w: 44, gap: 150, gapMinBottom: 90, gapMaxTop: 60 }; // 鳥居の門
const SCORE = { perPx: 0.1, gate: 20 }; // 10px で 1 点、門をくぐると +20

// スコアの称号(もう 1 回遊ぶ目標になる)
const TITLES = [
  { min: 0, name: "ひよこ" },
  { min: 100, name: "若鳥" },
  { min: 250, name: "駆け出しダチョウ" },
  { min: 500, name: "韋駄天見習い" },
  { min: 900, name: "韋駄天" },
  { min: 1500, name: "神速ダチョウ" },
  { min: 2500, name: "天翔るダチョウ" },
  { min: 4000, name: "ダチョウ神" },
];

function titleOf(score) {
  let t = TITLES[0];
  for (const x of TITLES) if (score >= x.min) t = x;
  return t.name;
}
function nextTitle(score) {
  for (const x of TITLES) if (score < x.min) return { name: x.name, need: x.min - score };
  return null;
}

function newGame(rnd) {
  return {
    rnd: rnd || Math.random,
    t: 0,
    dist: 0, // 走った距離(px)
    speed: SPEED.start,
    y: GROUND, // ダチョウの足の y
    vy: 0,
    onGround: true,
    flapT: -1, // 最後に羽ばたいた時刻(描画用)
    obstacles: [],
    nextAt: W + 200, // 次の障害物を置く距離(画面右端からの位置で管理)
    gates: 0,
    spawned: 0, // 置いた障害物の数
    score: 0,
    over: false,
  };
}

// タップ(ジャンプ / 羽ばたき)
function press(g) {
  if (g.over) return;
  if (g.onGround) {
    g.vy = PHYS.jumpV;
    g.onGround = false;
  } else {
    g.vy = PHYS.flapV;
    g.flapT = g.t;
  }
}

// 障害物を1つ置く。種類と、その次までの間隔は速さに合わせる(速いほど間隔を広く)。
function spawn(g) {
  const r = g.rnd;
  const x = W + 40;
  // 次までの間隔は秒で決める(距離 = 速さ × 秒)。ジャンプの滞空(約 0.7 秒)の後、着地して
  // から次に跳ぶまでの余裕が、どの速さでも残るようにする(距離で決めると、最高速で
  // 着地した直前に次のサボテンが来て、人の反応では間に合わなかった)
  const sec = (a, b) => g.speed * (a + r() * (b - a));
  const level = Math.min(1, (g.speed - SPEED.start) / (SPEED.max - SPEED.start));
  const roll = r();
  let ob;
  let after; // 置いた後、次までに空ける距離
  if (g.dist > 1500 && roll < 0.2 + 0.1 * level) {
    // 鳥居の門。すき間の下端は地面から gapMinBottom 以上(走ったままでは通れない)
    const bottomMax = GROUND - GATE.gapMinBottom;
    const bottomMin = GATE.gapMaxTop + GATE.gap;
    const gapBottom = bottomMin + r() * (bottomMax - bottomMin);
    ob = { kind: "gate", x, w: GATE.w, gapTop: gapBottom - GATE.gap, gapBottom, passed: false };
    // 門の後は着地して体勢を整える分を多めに空ける
    after = sec(1.2, 1.7);
  } else if (g.dist > 800 && roll < 0.42 + 0.08 * level) {
    // カラス。低い(跳んで越える)か、高い(走り抜ける)か
    const low = r() < 0.5;
    const h = 26;
    const y = low ? GROUND - 30 - h : GROUND - BIRD.h - 34 - h; // 高い方は頭の上を通る
    ob = { kind: "crow", x, w: 40, y, h, low };
    after = sec(1.0, 1.6);
  } else {
    // サボテン。1〜3 本の塊
    const n = 1 + Math.floor(r() * (level > 0.4 ? 3 : 2));
    const w = 18 * n + 6 * (n - 1);
    const h = 38 + Math.floor(r() * 28);
    ob = { kind: "cactus", x, w, h, y: GROUND - h };
    after = sec(0.95, 1.5);
  }
  g.obstacles.push(ob);
  g.spawned += 1;
  g.nextAt = after;
}

// 当たり判定の箱(見た目より少し小さくする)
function birdBox(g) {
  const m = 6;
  return { x0: BIRD.x - BIRD.w / 2 + m, x1: BIRD.x + BIRD.w / 2 - m, y0: g.y - BIRD.h + m, y1: g.y - 3 };
}
function hits(g, ob) {
  const b = birdBox(g);
  const m = 4;
  if (b.x1 < ob.x + m || b.x0 > ob.x + ob.w - m) return false;
  if (ob.kind === "gate") return b.y0 < ob.gapTop || b.y1 > ob.gapBottom;
  const y0 = ob.y + m;
  const y1 = ob.y + ob.h - (ob.kind === "cactus" ? 0 : m);
  return b.y1 > y0 && b.y0 < y1;
}

// 1 刻み進める
function step(g) {
  if (g.over) return;
  const dt = STEP;
  g.t += dt;
  g.speed = Math.min(SPEED.max, g.speed + SPEED.accel * dt);
  const dx = g.speed * dt;
  g.dist += dx;

  // ダチョウ
  if (!g.onGround) {
    g.vy = Math.min(PHYS.maxFall, g.vy + PHYS.gravity * dt);
    g.y += g.vy * dt;
    if (g.y - BIRD.h < PHYS.ceiling) {
      g.y = PHYS.ceiling + BIRD.h;
      g.vy = Math.max(0, g.vy);
    }
    if (g.y >= GROUND) {
      g.y = GROUND;
      g.vy = 0;
      g.onGround = true;
    }
  }

  // 障害物
  for (const ob of g.obstacles) ob.x -= dx;
  while (g.obstacles.length && g.obstacles[0].x + g.obstacles[0].w < -20) g.obstacles.shift();
  g.nextAt -= dx;
  if (g.nextAt <= 0) spawn(g);

  for (const ob of g.obstacles) {
    if (hits(g, ob)) {
      g.over = true;
      g.hit = ob;
      break;
    }
    if (ob.kind === "gate" && !ob.passed && ob.x + ob.w < BIRD.x - BIRD.w / 2) {
      ob.passed = true;
      g.gates += 1;
    }
  }
  g.score = Math.floor(g.dist * SCORE.perPx) + g.gates * SCORE.gate;
}

module.exports = {
  W,
  H,
  GROUND,
  STEP,
  BIRD,
  PHYS,
  SPEED,
  GATE,
  TITLES,
  titleOf,
  nextTitle,
  newGame,
  press,
  step,
  birdBox,
  hits,
};
