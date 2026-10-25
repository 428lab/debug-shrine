// おみくじ演出「だるま落とし」(3D)のルールと物理(描画なし。Node でも動く)。
//
// 見せ方は OmikujiDaruma.vue と darumaView.js(three.js)。物理は cannon-es(3D の剛体)で、
// 使う側が build(CANNON, opts) に渡す(ブラウザではこの演出の時だけ読み込む)。
// 検証は scripts/simulate-omikuji-daruma.js。
//
// 流れ:
//   ready  : 境内の台の上に、胴 5 段と頭のだるまが積んである
//   play   : タップするたびに木槌が一番下の段を横から打ち抜く(最初のタップで rang)。
//            上の段は真下に落ちて、次の一振りの高さに来る
//   reveal : 頭か胴のどれか 1 つにおみくじが潜んでいる。それを打つと中から紙のおみくじが
//            飛び出し、浮き上がって開くとレア度が出る(レア度はサーバーが決めたもの。
//            どれに潜ませるかは見せ方だけで、抽選の結果は変えない)
//
// 積みが崩れた時(ずれて傾いた・台から落ちた)も結果は出す: 潜んでいた段からおみくじが出る。
//
// 座標はメートル。x 右(打った段は右へ飛ぶ)、y 上、z 手前。台の真ん中が原点の上。

const G = 9.82;
const STEP = 1 / 180; // 物理の 1 歩(打った段は速いので細かく)
const MAX_STEPS = 10; // 1 フレームに進める歩数の上限(遅い端末で重くなり続けない)

const STAND = { y: 0.86, halfW: 0.62, halfD: 0.52, thick: 0.08 }; // 台(天板の上面が y)
const BLOCK = { r: 0.42, h: 0.26, mass: 1.0, count: 5 }; // 胴(見た目は円柱。当たりは四角)
const HEAD = { r: 0.44, h: 0.62, mass: 1.3 }; // 頭(見た目はだるま。当たりは四角)
const HIT_HALF = 0.88; // 当たりの四角の半分 = 半径 × これ(円柱に近い大きさ)
const SWING_S = 0.2; // タップから木槌が当たるまで
const HIT = { v: 9, vJitter: 0.6, z: 0.22, spin: 1.2, drag: 0.07 }; // 打ち抜く速さ(m/s)とぶれ・上の段が引きずられる速さ
// 当たりの組(打った段は、積み・台と当たらずに抜けていく。下の「打ち抜く」を参照)
const GROUP = { env: 1, stack: 2, out: 4 };
const SETTLE = { min: 0.42, v: 0.06 }; // 次を打てるまで(秒)と、止まったとみなす速さ
const NO_HOP = 0.1; // 積みに残っている段が上へ動ける速さの上限(m/s)
const FOUND_S = 0.22; // おみくじの段を打ってから、紙が出るまで
// 崩れたとみなすずれ・傾き(台の真ん中からの横のずれ m、上向きの成分)
const COLLAPSE = { shift: 0.28, up: 0.88 };

// レア度(色はほかの演出と同じ並び)
const TIERS = ["超吉", "大吉", "中吉", "小吉", "末吉", "凶", "大凶"];

// 積みの並び(下から)。{ kind, half: [x, y, z], mass, y(中心) }
function stackLayout() {
  const out = [];
  let y = STAND.y;
  for (let i = 0; i < BLOCK.count; i++) {
    out.push({ kind: "block", id: i, half: [BLOCK.r * HIT_HALF, BLOCK.h / 2, BLOCK.r * HIT_HALF], mass: BLOCK.mass, y: y + BLOCK.h / 2 });
    y += BLOCK.h;
  }
  out.push({ kind: "head", id: BLOCK.count, half: [HEAD.r * HIT_HALF, HEAD.h / 2, HEAD.r * HIT_HALF], mass: HEAD.mass, y: y + HEAD.h / 2 });
  return out;
}

// ---- 物理の世界 ----
// opts.rnd: 乱数(検証用に注入)。opts.secret: おみくじを潜ませる段(0〜5。5 が頭。省くと乱数)
function build(CANNON, opts) {
  const o = opts || {};
  const rnd = o.rnd || Math.random;
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) });
  world.allowSleep = true;
  world.solver.iterations = 20;
  // 打った段は積みと当たらずに抜けるので、段どうしの摩擦は落ちた時に滑らない強さにする
  // (弱いと、落ちて着いた時の横向きの当たりで積みが少しずつずれていった)
  world.defaultContactMaterial.friction = 0.6;
  world.defaultContactMaterial.restitution = 0;
  // 少し柔らかく(既定の硬さだと、落ちた積みが着いた時にめり込みの押し戻しで跳ね、横へずれた)
  world.defaultContactMaterial.contactEquationStiffness = 5e6;
  world.defaultContactMaterial.contactEquationRelaxation = 8;
  world.defaultContactMaterial.frictionEquationStiffness = 5e6;

  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), collisionFilterGroup: GROUP.env, collisionFilterMask: GROUP.stack | GROUP.out });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  const stand = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(STAND.halfW, STAND.thick / 2, STAND.halfD)),
    collisionFilterGroup: GROUP.env,
    collisionFilterMask: GROUP.stack,
  });
  stand.position.set(0, STAND.y - STAND.thick / 2, 0);
  world.addBody(stand);

  const pieces = stackLayout().map((p) => {
    const body = new CANNON.Body({
      mass: p.mass,
      shape: new CANNON.Box(new CANNON.Vec3(p.half[0], p.half[1], p.half[2])),
      position: new CANNON.Vec3(0, p.y, 0),
      linearDamping: 0.04,
      angularDamping: 0.1,
      collisionFilterGroup: GROUP.stack,
      collisionFilterMask: GROUP.env | GROUP.stack,
    });
    body.sleepSpeedLimit = 0.08;
    body.sleepTimeLimit = 0.25;
    // 打つまで凍らせておく(積んだだけで揺れたりしない)
    body.sleep();
    world.addBody(body);
    return Object.assign({}, p, { body, out: false, startY: p.y });
  });

  const count = pieces.length;
  let secret = o.secret;
  if (!(Number.isInteger(secret) && secret >= 0 && secret < count)) secret = Math.min(count - 1, Math.floor(rnd() * count));

  return {
    CANNON,
    world,
    rnd,
    pieces,
    stand,
    secret,
    phase: "ready", // ready | play | reveal
    t: 0, // 最初のタップからの物理の時間
    acc: 0,
    swing: null, // { at, id } 木槌が当たる時刻と、打つ段
    lastHitAt: -9,
    queued: false, // 振っている間にもう一度タップされた(止まったら打つ)
    hits: 0,
    found: null, // { id, at, pos } おみくじの段を打った(pos は打った瞬間の段の位置)
    collapsed: false,
    chosen: null, // おみくじが出る段
    events: [],
  };
}

function emit(g, type, data) {
  g.events.push(Object.assign({ type, t: g.t }, data || {}));
}

// 次に打つ段(一番下に残っている段)
function nextPiece(g) {
  return g.pieces.find((p) => !p.out) || null;
}

function moving(p) {
  const v = p.body.velocity;
  return v.x * v.x + v.y * v.y + v.z * v.z > SETTLE.v * SETTLE.v;
}

// 次を打てるか(振っていない・前の一振りから少したって、積みが止まっている)
function canHit(g) {
  if (g.phase === "ready") return true;
  if (g.phase !== "play" || g.swing) return false;
  if (g.t - g.lastHitAt < SETTLE.min) return false;
  return !g.pieces.some((p) => !p.out && moving(p));
}

// タップ。打てない時(まだ揺れている)は 1 回だけ覚えておき、止まったら打つ
function tap(g) {
  if (g.phase === "reveal") return false;
  if (!canHit(g)) {
    if (g.phase === "play") g.queued = true;
    return false;
  }
  const p = nextPiece(g);
  if (!p) return false;
  if (g.phase === "ready") {
    g.phase = "play";
    g.t = 0;
    emit(g, "start", {});
  }
  g.queued = false;
  g.swing = { at: g.t + SWING_S, id: p.id };
  emit(g, "swing", { id: p.id, at: g.swing.at });
  return true;
}

// 木槌が当たる: 一番下の段を右へ打ち抜く(少しぶれる)。
// 四角どうしをぴったり積むと、横へ滑らせた時に角の当たりが横向きに出て、打った段が
// その場で止まった(上の段ごと動かない)。打った段は積み・台とは当たらないようにして
// 抜けさせる(地面と、先に抜けた段とは当たる)。上の段は少しだけ右へ引きずられる。
function strike(g, id) {
  const p = g.pieces[id];
  const { rnd } = g;
  p.out = true;
  g.hits++;
  g.lastHitAt = g.t;
  g.pieces.forEach((q) => q.body.wakeUp());
  p.body.collisionFilterGroup = GROUP.out;
  p.body.collisionFilterMask = GROUP.env | GROUP.out;
  const v = HIT.v + (rnd() * 2 - 1) * HIT.vJitter;
  p.body.velocity.set(v, 0.6, (rnd() * 2 - 1) * HIT.z);
  p.body.angularVelocity.set(0, (rnd() * 2 - 1) * HIT.spin, -2 - rnd() * 2);
  const above = g.pieces[id + 1];
  if (above) above.body.velocity.x += HIT.drag * rnd();
  emit(g, "hit", { id, kind: p.kind, secret: id === g.secret });
  if (id === g.secret) {
    const b = p.body.position;
    g.found = { id, at: g.t, pos: { x: b.x, y: b.y, z: b.z } };
    emit(g, "found", { id });
  }
}

// 崩れたか(残っている段が、台の真ん中から大きくずれた・傾いた・台から落ちた)
function collapsed(g) {
  return g.pieces.some((p) => {
    if (p.out) return false;
    const b = p.body;
    if (Math.hypot(b.position.x, b.position.z) > COLLAPSE.shift) return true;
    if (b.position.y < STAND.y - 0.05) return true;
    // 上向きの軸の y 成分(傾き)
    const q = b.quaternion;
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    return upY < COLLAPSE.up;
  });
}

// dt 秒(スローモーションは呼ぶ側で dt を縮める)
function step(g, dt) {
  if (g.phase === "ready") return;
  g.acc += Math.min(dt, 0.05);
  let n = 0;
  while (g.acc >= STEP) {
    if (++n > MAX_STEPS) {
      g.acc = 0; // 追いつけない分は捨てる(ゆっくりになるだけで、重くなり続けない)
      break;
    }
    g.acc -= STEP;
    if (g.swing && g.t >= g.swing.at) {
      const id = g.swing.id;
      g.swing = null;
      strike(g, id);
    }
    g.world.step(STEP);
    g.t += STEP;
    // 積みに残っている段は跳ねさせない(落ちて着いた時の押し戻しで頭が浮き、積みがずれた)
    for (const p of g.pieces) {
      if (!p.out && p.body.velocity.y > NO_HOP) p.body.velocity.y = NO_HOP;
    }
  }
  if (g.phase !== "play") return;
  if (g.found && g.t - g.found.at >= FOUND_S) {
    g.chosen = g.pieces[g.found.id];
    g.phase = "reveal";
    emit(g, "reveal", { id: g.chosen.id });
    return;
  }
  if (!g.found && !g.swing && g.t - g.lastHitAt > 0.15 && collapsed(g)) {
    // 崩れた: 潜んでいた段からおみくじを出す(どこに転がっていても)
    g.collapsed = true;
    g.chosen = g.pieces[g.secret];
    g.phase = "reveal";
    emit(g, "collapse", {});
    emit(g, "reveal", { id: g.chosen.id });
    return;
  }
  if (g.queued && canHit(g)) tap(g);
  // 念のため: 全部打ち抜いたのに出ていない(潜ませる段がおかしい等)→ 最後の段から出す
  if (g.phase === "play" && !g.found && !g.swing && !nextPiece(g)) {
    g.chosen = g.pieces[g.pieces.length - 1];
    g.phase = "reveal";
    emit(g, "reveal", { id: g.chosen.id });
  }
}

module.exports = {
  G,
  STEP,
  STAND,
  BLOCK,
  HEAD,
  HIT,
  SWING_S,
  SETTLE,
  FOUND_S,
  COLLAPSE,
  TIERS,
  stackLayout,
  build,
  tap,
  canHit,
  nextPiece,
  step,
  collapsed,
};
