// おみくじ演出「ピンボール」の装置モジュール(matter-js)。
//
// 描画(Render)を含まない構築部分だけを切り出し、Node でもヘッドレスに
// 「放った玉が狐まで落ちてくるか」を検証できるようにする
// (scripts/simulate-omikuji-pinball.js)。
//
// 演出の流れ:
//   右端のレーンにある御神玉(プランジャー)を下へ引いて、放す
//   → 玉がレーンを駆け上がり、天辺の弧で左へ折り返して盤面へ
//   → バンパーに当たるたびに弾き飛ばされ(ポップ)、盤面を跳ね回る
//   → 下のフリッパー形の受けに集められ、中央の穴で寝ている狐に落ちる
//   → 狐が起きてビンを飛び移る(DOM側。OmikujiScene が担当)
//
// 設計の要:
// - 抽選の正しさはこの装置に依存しない(狐の最終着地は omikujiFox.js で制御)。
// - バンパーは衝突した瞬間に玉を中心から外向きへ一定速度で弾く(ポップバンパー)。
//   反発係数で表現すると速度が発散したり減衰したりして安定しないため。
//   弾く向きに僅かな乱れ(rnd)を混ぜて、同じ引きでも毎回違う軌道になるようにする。
// - フリッパーは動かない(受けの形だけ)。動かすと操作を期待させるが、結果は
//   サーバーが決めているので操作の意味が無い。
// - 玉が盤面のどこかで止まったら(静止検知)、物音で狐が起きる。
//
// OmikujiScene から使う共通インターフェースは omikujiMachines.js を参照。

const GEO = {
  W: 480,
  H: 760,
  BIN_COUNT: 7,
  FIXED_DELTA: 1000 / 60,

  CAT_DEFAULT: 0x0001,
  CAT_GRAB: 0x0002,
  CAT_MOUSE: 0x0004,

  // 盤面の床(上面の y)。狐はここで寝る。
  GROUND_Y: 620,

  // プランジャーレーン(右端)。玉は LANE.x の上で上下だけ動く。
  LANE: { x: 458, wallX: 438, wallTop: 160, width: 36 },
  BALL: { r: 11, density: 0.004, restitution: 0.35, friction: 0.02, frictionAir: 0.0012 },
  // プランジャー(ゴム)。下へ引いて放す。
  // 射出速度は [minSpeed, maxSpeed] に収める。レーン上の弧の内面(y≈104)まで
  // 支点(540)から約 430px 登るには 15.5px/step 要る。弱い引きでも盤面へ出るよう
  // 下限を置き、速すぎて薄い壁(レーン壁 8px・弧 20px)を突き抜けないよう上限を置く。
  ELASTIC: { anchorY: 540, stiffness: 0.02, maxPull: 90, releaseMin: 14, minSpeed: 17, maxSpeed: 21 },

  // 天辺の弧(レーンの上端から左上へ)。静止セグメントで近似。
  // 右端(x = cx + r)が盤面の外(480超)に出るようにする。弧の端がレーンの中に
  // 残ると、登ってきた玉が端に下から当たって跳ね返り、盤面へ出られない。
  ARC: { cx: 240, cy: 230, r: 252, segs: 20, thick: 20 },

  // ポップバンパー(位置・半径)と、弾く速度。
  BUMPERS: [
    { x: 150, y: 300, r: 22 },
    { x: 290, y: 270, r: 22 },
    { x: 225, y: 390, r: 22 },
    { x: 355, y: 400, r: 18 },
    { x: 42, y: 182, r: 20 }, // 強く放った玉が弧を回りきって左壁に着く所
    { x: 78, y: 400, r: 18 },
    { x: 100, y: 240, r: 18 }, // 中くらいの引きで弧を離れ、左下へ斜めに落ちる道筋
  ],
  POP: { speed: 9, jitter: 0.35 }, // jitter: 弾く向きの乱れ(rad)

  // 左右の三角(スリングショット)。壁に張り付いた三角で、落ちてきた玉を中央へ
  // 押し戻す。壁との間に隙間を作らない(隙間に落ちた玉が斜面の上で詰まる)。
  // top: 壁に付く上端の y、reach: 壁から中央へ張り出す幅(下端は斜面の上に載る)。
  SLING: { top: 430, reach: 90 },

  // 床は中央の穴へ向かう2枚の斜面(フリッパー形の受け)。脇に抜け道を作らない
  // (薄い板だと、板の下や外側へ落ちた玉が床で止まって穴に入らなかった)。
  // 左右の壁ぎわ(高い側)の上面 y と、穴のふち(低い側)の上面 y、穴の幅。
  FUNNEL: { edgeY: 530, holeY: 606, gap: 88 },

  // 狐の寝床(中央の穴)と、おしりの当たり判定。
  FOX_X: 240,
  FOX_SENSOR: { x: 240, y: 592, w: 96, h: 54 },

  BIN_TOP: 648,
  FLOOR_Y: 744,
};

const FOX = {
  sleepLeft: (GEO.FOX_X / GEO.W) * 100,
  sleepBottom: ((GEO.H - GEO.GROUND_Y) / GEO.H) * 100,
  flip: -1, // 左向きに寝る(穴の真ん中でどちらでもよいが、鈴の緒と変える)
};

const HINT = {
  title: "右端の御神玉を下に引いて、放とう",
  fallback: "うまく放てないときはここをタップ",
  button: "玉を放つ",
};

const wakeLabels = ["ball"];
const grabFilter = { category: GEO.CAT_MOUSE, mask: GEO.CAT_GRAB };

// 詰まったら押す(8s)、それでも来なければ起こす(12s)、フェイルセーフ(20s)。
const TIMELINE = { nudgeMs: 8000, wakeMs: 12000, failsafeMs: 20000 };

function buildWorld(Matter, opts) {
  const rnd = (opts && opts.rnd) || Math.random;
  const { Engine, World, Bodies, Body, Constraint, Events } = Matter;
  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.scale = 0.001;
  const world = engine.world;
  const add = (b) => World.add(world, b);

  const wood = { fillStyle: "#8a5a34" };
  const stone = { fillStyle: "#3a3230" };
  const metal = { fillStyle: "#c9b27a" };

  // 外壁・天井・床(厚め。速い玉が突き抜けないように)
  const WALL = 60;
  add([
    Bodies.rectangle(GEO.W / 2, -WALL / 2, GEO.W + WALL * 2, WALL, { isStatic: true, render: stone }),
    Bodies.rectangle(-WALL / 2, GEO.H / 2, WALL, GEO.H + WALL * 2, { isStatic: true, render: stone }),
    Bodies.rectangle(GEO.W + WALL / 2, GEO.H / 2, WALL, GEO.H + WALL * 2, { isStatic: true, render: stone }),
    Bodies.rectangle(GEO.W / 2, GEO.FLOOR_Y + WALL / 2, GEO.W + WALL * 2, WALL, { isStatic: true, render: stone }),
  ]);

  // 床(上面 GROUND_Y〜BIN_TOP)。レーンの手前で切る。レーンは床より下まで続く
  // 井戸で、プランジャー(玉)はそこへ引き下げる(床が続いていると、引いた玉が
  // 床の下へ押し出されて戻ってこない)。
  const L = GEO.LANE;
  add(Bodies.rectangle(L.wallX / 2, (GEO.GROUND_Y + GEO.BIN_TOP) / 2, L.wallX, GEO.BIN_TOP - GEO.GROUND_Y, {
    isStatic: true,
    label: "ground",
    render: { fillStyle: "#5a4a3a" },
  }));

  // レーンの仕切り壁(左側)。上端から盤面へ抜ける口を開け、下は井戸の底まで。
  add(Bodies.rectangle(L.wallX, (L.wallTop + GEO.FLOOR_Y) / 2, 8, GEO.FLOOR_Y - L.wallTop, { isStatic: true, chamfer: { radius: 3 }, render: wood }));

  // レーンの蓋(一方通行)。玉が盤面へ出たら閉じて、跳ね返ってきた玉が
  // レーンに落ち戻らないようにする(井戸の底で止まると狐から遠く、時間もかかる)。
  const lid = Bodies.rectangle((L.wallX + GEO.W) / 2, L.wallTop - 6, GEO.W - L.wallX, 12, {
    isStatic: true,
    label: "lid",
    collisionFilter: { mask: 0 },
    render: { fillStyle: "#8a5a34", visible: false },
  });
  add(lid);

  // 天辺の弧。レーン上端の右上から左上へ、静止セグメントで近似する。
  const A = GEO.ARC;
  for (let i = 0; i < A.segs; i++) {
    const t0 = Math.PI + (i / A.segs) * Math.PI; // 左(π) → 右(2π)
    const t1 = Math.PI + ((i + 1) / A.segs) * Math.PI;
    const x0 = A.cx + A.r * Math.cos(t0);
    const y0 = A.cy + A.r * Math.sin(t0);
    const x1 = A.cx + A.r * Math.cos(t1);
    const y1 = A.cy + A.r * Math.sin(t1);
    const len = Math.hypot(x1 - x0, y1 - y0) + 2;
    add(Bodies.rectangle((x0 + x1) / 2, (y0 + y1) / 2, len, A.thick, {
      isStatic: true,
      angle: Math.atan2(y1 - y0, x1 - x0),
      render: wood,
    }));
  }

  // ポップバンパー
  for (const b of GEO.BUMPERS) {
    add(Bodies.circle(b.x, b.y, b.r, { isStatic: true, label: "bumper", render: { fillStyle: "#d9542e" } }));
    add(Bodies.circle(b.x, b.y, b.r * 0.45, { isStatic: true, collisionFilter: { mask: 0 }, render: metal }));
  }

  // 中央の穴へ向かう2枚の斜面。上面が (壁, edgeY)→(穴のふち, holeY) を通る台形で、
  // 下は床まで詰める(下や外側へ抜けられない)。右の斜面はレーン壁の手前で止める。
  // レーンに食い込むと、井戸に引き下げた玉が斜面の上で止まって放てなくなる。
  const F = GEO.FUNNEL;
  const half = F.gap / 2;
  const slab = (pts) => {
    const c = Matter.Vertices.centre(pts);
    return Bodies.fromVertices(c.x, c.y, [pts], { isStatic: true, label: "flipper", render: metal });
  };
  add(slab([
    { x: -20, y: F.edgeY },
    { x: GEO.W / 2 - half, y: F.holeY },
    { x: GEO.W / 2 - half, y: GEO.GROUND_Y },
    { x: -20, y: GEO.GROUND_Y },
  ]));
  add(slab([
    { x: GEO.W / 2 + half, y: F.holeY },
    { x: L.wallX, y: F.edgeY },
    { x: L.wallX, y: GEO.GROUND_Y },
    { x: GEO.W / 2 + half, y: GEO.GROUND_Y },
  ]));

  // 左右の三角(スリングショット)。下の頂点を斜面の上面に載せ、壁側は床まで詰める。
  const S = GEO.SLING;
  const runL = GEO.W / 2 - half + 20; // 左斜面の上面: (-20,edgeY)→(W/2-half,holeY)
  const yOnL = (x) => F.edgeY + ((x + 20) / runL) * (F.holeY - F.edgeY);
  const runR = L.wallX - (GEO.W / 2 + half); // 右斜面の上面: (wallX,edgeY)→(W/2+half,holeY)
  const yOnR = (x) => F.edgeY + ((L.wallX - x) / runR) * (F.holeY - F.edgeY);
  const slingOpts = { isStatic: true, label: "sling", restitution: 0.6, render: { fillStyle: "#b23a48" } };
  const sling = (pts) => {
    const c = Matter.Vertices.centre(pts);
    return Bodies.fromVertices(c.x, c.y, [pts], slingOpts);
  };
  add(sling([
    { x: -20, y: S.top },
    { x: S.reach, y: yOnL(S.reach) },
    { x: -20, y: GEO.GROUND_Y },
  ]));
  add(sling([
    { x: L.wallX, y: S.top },
    { x: L.wallX, y: GEO.GROUND_Y },
    { x: L.wallX - S.reach, y: yOnR(L.wallX - S.reach) },
  ]));

  // 御神玉(プランジャー)。レーンの中で指でつまめる。
  const anchor = { x: L.x, y: GEO.ELASTIC.anchorY };
  const ball = Bodies.circle(anchor.x, anchor.y, GEO.BALL.r, {
    density: GEO.BALL.density,
    restitution: GEO.BALL.restitution,
    friction: GEO.BALL.friction,
    frictionAir: GEO.BALL.frictionAir,
    label: "ball",
    collisionFilter: { category: GEO.CAT_GRAB, mask: GEO.CAT_DEFAULT | GEO.CAT_MOUSE },
    render: { fillStyle: "#f2c14e" },
  });
  ball.sleepThreshold = Infinity;
  add(ball);

  const elastic = Constraint.create({
    pointA: anchor,
    bodyB: ball,
    stiffness: GEO.ELASTIC.stiffness,
    length: 0,
    render: { strokeStyle: "#b23a48", lineWidth: 4 },
  });
  add(elastic);
  // 繋がっている間は自重を打ち消す(柔らかいゴムがたわんで眠れないのを防ぐ)。
  Events.on(engine, "beforeUpdate", () => {
    if (elastic.bodyB === ball) {
      ball.force.y -= ball.mass * engine.gravity.y * engine.gravity.scale;
    }
  });

  // 玉がレーンの仕切りより左(盤面)へ出たら蓋を閉じる。
  Events.on(engine, "beforeUpdate", () => {
    if (lid.collisionFilter.mask === 0 && ball.position.x < L.wallX - GEO.BALL.r) {
      lid.collisionFilter.mask = 0xffffffff;
      lid.render.visible = true;
    }
  });

  // ポップバンパー: 当たった瞬間、中心から外向きへ一定速度で弾く。
  Events.on(engine, "collisionStart", (e) => {
    for (const p of e.pairs) {
      let bumper = null;
      if (p.bodyA.label === "bumper" && p.bodyB === ball) bumper = p.bodyA;
      else if (p.bodyB.label === "bumper" && p.bodyA === ball) bumper = p.bodyB;
      if (!bumper) continue;
      const dx = ball.position.x - bumper.position.x;
      const dy = ball.position.y - bumper.position.y;
      const base = Math.atan2(dy, dx) + (rnd() - 0.5) * 2 * GEO.POP.jitter;
      Body.setVelocity(ball, { x: Math.cos(base) * GEO.POP.speed, y: Math.sin(base) * GEO.POP.speed });
    }
  });

  // 狐のおしりの当たり判定(中央の穴)
  add(Bodies.rectangle(GEO.FOX_SENSOR.x, GEO.FOX_SENSOR.y, GEO.FOX_SENSOR.w, GEO.FOX_SENSOR.h, {
    isStatic: true,
    isSensor: true,
    label: "fox-sensor",
    render: { visible: false },
  }));

  // ビン仕切り
  const bw = GEO.W / GEO.BIN_COUNT;
  for (let i = 1; i < GEO.BIN_COUNT; i++) {
    add(Bodies.rectangle(i * bw, (GEO.BIN_TOP + GEO.FLOOR_Y) / 2, 6, GEO.FLOOR_Y - GEO.BIN_TOP, { isStatic: true, chamfer: { radius: 2 }, render: { fillStyle: "#8a6a3a" } }));
  }

  return { engine, world, ball, elastic, anchor, lid };
}

// 儀式(プランジャーを下へ引いて放す)。引きはレーンに沿った縦方向だけに正規化する。
function createRitual(Matter, built) {
  const { ball, elastic, anchor, world } = built;
  const { Body, Sleeping } = Matter;
  let pulled = false;
  let launched = false;

  function clampPull() {
    let dy = ball.position.y - anchor.y;
    if (dy < 0) dy = 0;
    if (dy > GEO.ELASTIC.maxPull) dy = GEO.ELASTIC.maxPull;
    Body.setPosition(ball, { x: anchor.x, y: anchor.y + dy });
    Body.setVelocity(ball, { x: 0, y: 0 });
    return dy;
  }

  function detach() {
    const v = ball.velocity;
    const sp = Math.hypot(v.x, v.y) || 1;
    const target = Math.min(GEO.ELASTIC.maxSpeed, Math.max(GEO.ELASTIC.minSpeed, sp));
    if (target !== sp) {
      const k = target / sp;
      Body.setVelocity(ball, { x: v.x * k, y: v.y * k });
    }
    Matter.Composite.remove(world, elastic);
    elastic.bodyB = null; // 自重の打ち消しを止める
    launched = true;
  }

  return {
    step(dragging) {
      if (launched) return false;
      if (dragging) {
        Sleeping.set(ball, false);
        pulled = clampPull() >= GEO.ELASTIC.releaseMin;
        return false;
      }
      if (!pulled) return false;
      // 放してゴムに引かれ、支点を上へ通り過ぎた瞬間に切り離す
      if (ball.position.y <= anchor.y) {
        detach();
        return true;
      }
      return false;
    },
    pull(dy) {
      Sleeping.set(ball, false);
      Body.setPosition(ball, { x: anchor.x, y: anchor.y + dy });
      Body.setVelocity(ball, { x: 0, y: 0 });
      pulled = clampPull() >= GEO.ELASTIC.releaseMin;
    },
    launched: () => launched,
  };
}

function fallbackRitual(Matter, built, ritual) {
  ritual.pull(70);
  return false;
}

function onRitualDone() {}

// 詰まったら玉を下へ落とす(バンパーの上で止まった等)。
function nudge(Matter, built) {
  const { ball } = built;
  Matter.Sleeping.set(ball, false);
  Matter.Body.setVelocity(ball, { x: (Math.random() - 0.5) * 4, y: 6 });
}

const SETTLE = { speed: 0.15, steps: 45 };
function createSettleDetector(Matter, built) {
  const { ball } = built;
  let quiet = 0;
  return {
    step() {
      const moving = Math.hypot(ball.velocity.x, ball.velocity.y) >= SETTLE.speed;
      quiet = moving ? 0 : quiet + 1;
      return quiet >= SETTLE.steps;
    },
  };
}

function pulseAt(built) {
  const a = (built && built.anchor) || { x: GEO.LANE.x, y: GEO.ELASTIC.anchorY };
  return { x: a.x, y: a.y };
}

module.exports = {
  id: "pinball",
  GEO,
  FOX,
  HINT,
  TIMELINE,
  wakeLabels,
  grabFilter,
  build: buildWorld,
  createRitual,
  createSettleDetector,
  fallbackRitual,
  onRitualDone,
  nudge,
  pulseAt,
};
