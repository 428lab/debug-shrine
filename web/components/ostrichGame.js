// ミニゲーム「ダチョウ走」のルール(描画を含まない純関数)。
//
// Chrome の通信できない時の恐竜ゲームがベース。ダチョウが右へ走り続け、障害物を
// よけて進んだ距離と、拾った勾玉の点を競う。そこに Flappy Bird の要素を足している:
//   - 地面にいる時のタップ = ジャンプ。空中でのタップ = 羽ばたき(何度でも)。
//   - サボテン(地面): ジャンプでよける
//   - カラス: 低いものはジャンプで越え、高いものは走り抜ける(跳ぶと当たる)
//   - 鳥居: 上のすき間(大きな勾玉がある)を羽ばたいてくぐるか、下のすき間を走り抜ける
//   - 堀: 地面が長く途切れる。羽ばたき続けて越える(落ちたら終わり)
//   - 勾玉: ときどき浮かんでいる。色で点が違う。黄色は 7 秒間の無敵(当たった障害物を
//     壊す。カラスは当たる前に逃げる。堀には落ちる)
// 進むほど速く、ジャンプが短く鋭くなり、障害物の間隔が詰まり、鳥居のすき間が狭くなる
// (少しの操作ミスでも終わるようになる)。当たり判定は難しさで変えない。
//
// 設計の要:
// - 固定の刻み(STEP 秒)で進める。描画の間隔に左右されず、同じ乱数なら同じ展開になる
//   (検証スクリプトで自動操縦を走らせて、理不尽な配置が出ないことを確かめる)。
// - 描画に伝えたい出来事(勾玉を拾った、障害物を壊した等)は g.events に積む。描画側が
//   読んで消す。
// - 乱数は注入できる(rnd)。検証は scripts/test-ostrich-game.js。

const W = 640; // 論理の画面幅
const H = 400; // 論理の画面高さ
const GROUND = 350; // 地面の高さ(ダチョウの足の y)
const STEP = 1 / 120; // 1 刻みの秒数

const BIRD = { x: 110, w: 34, h: 58 }; // ダチョウ(当たり判定の元の大きさ)
// 重力とジャンプは難しさ(level)で変わる。難しくなるほど重力が強く、ジャンプが短く鋭く
// なる(滞空 0.70 秒 → 0.53 秒)。速くなるだけだと 1 回のジャンプで進む距離が伸びて、
// 単発の障害はかえって楽になる(タイミングの幅が広がる)ため。
const PHYS = {
  gravity: 2500,
  gravityMax: 3800,
  jumpV: -880, // 地面からのジャンプ(高さ ≈ 155)
  jumpVMax: -1000,
  flapV: -500, // 空中の羽ばたき(その時の速さをこれに置き換える = Flappy Bird)
  flapVMax: -600,
  maxFall: 900,
  maxFallMax: 1150,
  ceiling: 16, // これより上には行けない(頭を打って止まる)
};
const lerp = (a, b, f) => a + (b - a) * f;
function physAt(level) {
  return {
    gravity: lerp(PHYS.gravity, PHYS.gravityMax, level),
    jumpV: lerp(PHYS.jumpV, PHYS.jumpVMax, level),
    flapV: lerp(PHYS.flapV, PHYS.flapVMax, level),
    maxFall: lerp(PHYS.maxFall, PHYS.maxFallMax, level),
  };
}
// 走る速さ(px/s)。最初の 1 分ほどで大きく上がり、その後もゆっくり上がり続ける
const SPEED = { start: 330, rise: 560, tau: 55, creep: 0.8, max: 1000 };
const LEVEL_SECONDS = 150; // この秒数で難しさ(level)が最大の 1 になる
// 鳥居。上のすき間は level で狭くなる。下のすき間(pass)は走ったまま抜けられる高さ
const GATE = { w: 44, gapStart: 150, gapEnd: 110, gapMaxTop: 60, pass: 84, midMin: 26 };
const MOAT = { minDist: 2500 }; // 堀が出始める距離
const SCORE = { perPx: 0.1, smash: 15 }; // 10px で 1 点。無敵で壊すと +15
const INVINCIBLE_SECONDS = 7;

// 勾玉の色と点。weight は出やすさ。黄色は無敵(点は少し)
const MAGATAMA = [
  { color: "white", pts: 5, weight: 40 },
  { color: "blue", pts: 10, weight: 25 },
  { color: "green", pts: 20, weight: 15 },
  { color: "red", pts: 50, weight: 8 },
  { color: "purple", pts: 100, weight: 4 },
  { color: "yellow", pts: 10, weight: 6, invincible: true },
];
const BIG_MAGATAMA_MULT = 3; // 鳥居の大きな勾玉は 3 倍

// スコアの称号(もう 1 回遊ぶ目標になる)
const TITLES = [
  { min: 0, name: "ひよこ" },
  { min: 150, name: "若鳥" },
  { min: 400, name: "駆け出しダチョウ" },
  { min: 800, name: "韋駄天見習い" },
  { min: 1400, name: "韋駄天" },
  { min: 2200, name: "神速ダチョウ" },
  { min: 3500, name: "天翔るダチョウ" },
  { min: 5500, name: "ダチョウ神" },
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

function levelAt(t) {
  return Math.min(1, t / LEVEL_SECONDS);
}
function speedAt(t) {
  const v = SPEED.start + SPEED.rise * (1 - Math.exp(-t / SPEED.tau)) + SPEED.creep * t;
  return Math.min(SPEED.max, v);
}

function newGame(rnd) {
  return {
    rnd: rnd || Math.random,
    t: 0,
    dist: 0, // 走った距離(px)
    speed: SPEED.start,
    level: 0,
    y: GROUND, // ダチョウの足の y
    vy: 0,
    onGround: true,
    flapT: -1, // 最後に羽ばたいた時刻(描画用)
    obstacles: [],
    items: [], // 勾玉
    nextAt: W + 200, // 次の障害物までの距離
    itemAt: W * 1.5, // 次の勾玉までの距離
    spawned: 0, // 置いた障害物の数
    bonus: 0, // 勾玉や壊した障害物の点
    taken: 0, // 拾った勾玉の数
    smashed: 0, // 無敵で壊した障害物の数
    invUntil: 0, // この時刻まで無敵
    events: [], // 描画に伝える出来事
    score: 0,
    over: false,
  };
}

function invincible(g) {
  return g.t < g.invUntil;
}

// タップ(ジャンプ / 羽ばたき)
function press(g) {
  if (g.over) return;
  const ph = physAt(g.level);
  if (g.onGround) {
    g.vy = ph.jumpV;
    g.onGround = false;
  } else {
    g.vy = ph.flapV;
    g.flapT = g.t;
  }
}

function pickMagatama(r) {
  const total = MAGATAMA.reduce((a, m) => a + m.weight, 0);
  let x = r() * total;
  for (const m of MAGATAMA) {
    x -= m.weight;
    if (x < 0) return m;
  }
  return MAGATAMA[0];
}

// 障害物を1つ置く。次までの間隔は秒で決める(距離 = 速さ × 秒)。ジャンプの滞空
// (約 0.7 秒)の後、着地してから次に跳ぶまでの余裕がどの速さでも残るようにする。
// 難しくなるほど間隔は詰まり、余裕は少なくなる。
function spawn(g) {
  const r = g.rnd;
  const x = W + 40;
  const lv = g.level;
  const tight = 1 - 0.4 * lv; // 間隔の縮み(最大で 40% 詰まる)
  const sec = (a, b) => g.speed * tight * (a + r() * (b - a));
  const roll = r();
  let ob;
  let after;
  if (g.dist > MOAT.minDist && roll < 0.12 + 0.08 * lv) {
    // 堀。羽ばたき続けないと越えられない長さ(難しくなるほど長い)
    // 最短でもジャンプの滞空(最大 0.7 秒)より十分長く、跳ぶだけでは越えられない
    const w = g.speed * (1.05 + r() * 0.5 + 0.6 * lv);
    ob = { kind: "moat", x, w };
    after = sec(1.0, 1.5);
  } else if (g.dist > 1500 && roll < 0.34 + 0.08 * lv) {
    // 鳥居。上のすき間(大きな勾玉)は羽ばたいてくぐる。下のすき間は走り抜けられる
    const gap = GATE.gapStart + (GATE.gapEnd - GATE.gapStart) * lv;
    const bottomMax = GROUND - GATE.pass - GATE.midMin;
    const bottomMin = GATE.gapMaxTop + gap;
    const gapBottom = bottomMin + r() * (bottomMax - bottomMin);
    const passTop = GROUND - GATE.pass;
    ob = { kind: "gate", x, w: GATE.w, gapTop: gapBottom - gap, gapBottom, passTop };
    const m = pickMagatama(r);
    g.items.push({
      x: x + GATE.w / 2,
      y: gapBottom - gap / 2,
      r: 17,
      color: m.color,
      pts: m.pts * BIG_MAGATAMA_MULT,
      invincible: !!m.invincible,
      big: true,
    });
    after = sec(1.2, 1.7);
  } else if (g.dist > 800 && roll < 0.56 + 0.08 * lv) {
    // カラス。低い(跳んで越える)か、高い(走り抜ける)か
    const low = r() < 0.5;
    const h = 26;
    const y = low ? GROUND - 30 - h : GROUND - BIRD.h - 34 - h;
    ob = { kind: "crow", x, w: 40, y, h, low, vy: 0 };
    after = sec(1.0, 1.6);
  } else {
    // サボテン。1〜3 本の塊(難しくなるほど高く、太く)
    const n = 1 + Math.floor(r() * (lv > 0.3 ? 3 : 2));
    const w = 18 * n + 6 * (n - 1);
    const h = 38 + Math.floor(r() * (28 + 24 * lv));
    ob = { kind: "cactus", x, w, h, y: GROUND - h };
    after = sec(0.95, 1.5);
  }
  g.obstacles.push(ob);
  g.spawned += 1;
  // 次は、この障害物の右端から after だけ空ける(幅の長い堀の上に次が置かれないように)
  g.nextAt = ob.w + after;
}

// ときどき浮かぶ勾玉。障害物と重ならない所に置く(重なるなら少し後にずらす)
function spawnItem(g) {
  const r = g.rnd;
  const x = W + 40;
  const busy = g.obstacles.some((o) => o.x - 70 < x && x < o.x + o.w + 70);
  if (busy) {
    g.itemAt = 60;
    return;
  }
  const m = pickMagatama(r);
  const low = r() < 0.4;
  const y = low ? GROUND - 30 : 110 + r() * (GROUND - 110 - 110);
  g.items.push({ x, y, r: 11, color: m.color, pts: m.pts, invincible: !!m.invincible, big: false });
  g.itemAt = g.speed * (1.6 + r() * 2.6);
}

// 当たり判定の箱。見た目より少し小さい(かすっただけで終わると理不尽)。
// 難しさで変えない(同じ当たり方で結果が変わるのはおかしい)
function birdBox(g) {
  const m = 6;
  return { x0: BIRD.x - BIRD.w / 2 + m, x1: BIRD.x + BIRD.w / 2 - m, y0: g.y - BIRD.h + m, y1: g.y - 3 };
}
function hits(g, ob) {
  if (ob.broken || ob.fleeing || ob.kind === "moat") return false;
  const b = birdBox(g);
  const m = 4;
  if (b.x1 < ob.x + m || b.x0 > ob.x + ob.w - m) return false;
  if (ob.kind === "gate") {
    // 上の柱、または真ん中の柱(上のすき間と下のすき間の間)に当たる
    return b.y0 < ob.gapTop || (b.y1 > ob.gapBottom && b.y0 < ob.passTop);
  }
  const y0 = ob.y + m;
  const y1 = ob.y + ob.h - (ob.kind === "cactus" ? 0 : m);
  return b.y1 > y0 && b.y0 < y1;
}
// ダチョウの足元が堀の上か
function overMoat(g) {
  return g.obstacles.some(
    (o) => o.kind === "moat" && BIRD.x - 6 > o.x && BIRD.x + 6 < o.x + o.w
  );
}

// 1 刻み進める
function step(g) {
  if (g.over) return;
  const dt = STEP;
  g.t += dt;
  g.level = levelAt(g.t);
  g.speed = speedAt(g.t);
  const dx = g.speed * dt;
  g.dist += dx;
  const inv = invincible(g);

  // ダチョウ
  if (!g.onGround) {
    const ph = physAt(g.level);
    g.vy = Math.min(ph.maxFall, g.vy + ph.gravity * dt);
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
  // 堀に落ちる(無敵でも落ちる。無敵で壊せるのは障害物だけ)
  if (g.onGround && overMoat(g)) {
    g.over = true;
    g.hit = g.obstacles.find(
      (o) => o.kind === "moat" && BIRD.x - 6 > o.x && BIRD.x + 6 < o.x + o.w
    );
    return;
  }

  // 障害物と勾玉を流す
  for (const ob of g.obstacles) {
    ob.x -= dx;
    if (ob.fleeing) {
      // 逃げるカラスは上へ飛び去る
      ob.vy -= 1400 * dt;
      ob.y += ob.vy * dt;
      ob.x += 260 * dt;
    }
  }
  // 画面の外に出たものを消す(逃げたカラスは流れが遅く順番が入れ替わるので filter で)
  g.obstacles = g.obstacles.filter(
    (o) => o.x + o.w > -40 && !(o.fleeing && o.y + o.h < -40) // 逃げたカラスは空の上に消えたら消す
  );
  for (const it of g.items) it.x -= dx;
  g.items = g.items.filter((it) => !it.taken && it.x > -40);
  g.nextAt -= dx;
  if (g.nextAt <= 0) spawn(g);
  g.itemAt -= dx;
  if (g.itemAt <= 0) spawnItem(g);

  // 勾玉を拾う
  const b = birdBox(g);
  for (const it of g.items) {
    const cx = Math.max(b.x0, Math.min(it.x, b.x1));
    const cy = Math.max(b.y0, Math.min(it.y, b.y1));
    if ((it.x - cx) ** 2 + (it.y - cy) ** 2 < it.r * it.r) {
      it.taken = true;
      g.bonus += it.pts;
      g.taken += 1;
      if (it.invincible) g.invUntil = g.t + INVINCIBLE_SECONDS;
      g.events.push({ type: "item", x: it.x, y: it.y, color: it.color, pts: it.pts, big: it.big, invincible: it.invincible });
    }
  }

  // 障害物に当たる(無敵なら壊す。カラスは当たる前に逃げる)
  const inv2 = invincible(g);
  for (const ob of g.obstacles) {
    if (inv2 && ob.kind === "crow" && !ob.fleeing && ob.x - BIRD.x < 200 && ob.x + ob.w > BIRD.x - 20) {
      ob.fleeing = true;
      ob.vy = -200;
      g.events.push({ type: "flee", x: ob.x + ob.w / 2, y: ob.y });
      continue;
    }
    if (hits(g, ob)) {
      if (inv2) {
        ob.broken = true;
        g.smashed += 1;
        g.bonus += SCORE.smash;
        g.events.push({ type: "smash", kind: ob.kind, x: ob.x + ob.w / 2, y: g.y - BIRD.h / 2, pts: SCORE.smash });
      } else {
        g.over = true;
        g.hit = ob;
        break;
      }
    }
  }
  g.score = Math.floor(g.dist * SCORE.perPx) + g.bonus;
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
  MAGATAMA,
  INVINCIBLE_SECONDS,
  TITLES,
  titleOf,
  nextTitle,
  levelAt,
  physAt,
  speedAt,
  newGame,
  press,
  step,
  invincible,
  birdBox,
  hits,
  overMoat,
};
