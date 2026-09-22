// おみくじ演出「賽銭落とし」(パチンコ)の装置モジュール(matter-js)。
//
// 描画(Render)を含まない構築部分だけを切り出し、Node でもヘッドレスに
// 「落とした賽銭が狐まで届くか」を検証できるようにする
// (scripts/simulate-omikuji-saisen.js)。
//
// 演出の流れ:
//   天辺の横木に載った賽銭をつまんで左右に動かし、落としたい所で放す
//   → 賽銭が釘の林をカチカチ跳ねながら落ちる(途中の風車を回していく)
//   → 左下がりの床に受けられて、左端で寝ている狐まで転がる
//   → 狐が起きてビンを飛び移る(DOM側。OmikujiScene が担当)
//
// 設計の要:
// - 抽選の正しさはこの装置に依存しない(狐の最終着地は omikujiFox.js で制御)。
// - 操作は「どこから落とすか」を選ぶだけ。放した位置に関わらず、床の斜面が
//   必ず狐へ集める(落とし所で変わるのは道中の跳ね方だけ)。
// - 放すまで賽銭は横木の高さに固定し、重力も打ち消す(儀式中に勝手に落ちない)。
// - 釘の真上から落とすと、釘の頂点で賽銭が釣り合って止まり得る。釘の位置に
//   僅かな乱れ(rnd)を混ぜ、放す瞬間にも小さな横速度を与えて釣り合いを崩す。
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

  // 狐の寝床の床(上面の y)。
  GROUND_Y: 620,

  // 天辺の横木。賽銭は y に固定され、x は [minX, maxX] の範囲で動かせる。
  // 左右の端は画面の縁から離す(指が縁に当たって動かせない、を避ける)。
  RAIL: { y: 128, minX: 70, maxX: 410, startX: 240 },
  COIN: { r: 12, density: 0.004, restitution: 0.3, friction: 0.02, frictionAir: 0.002 },
  // 放す瞬間の横速度(釘の頂点での釣り合いを崩す)。
  DROP_KICK: 0.6,
  // それでも釘の林の中で止まったら(釘の頂点で釣り合った・風車と釘の間に
  // 挟まった。掃引630点中2点)、steps 続けて speed 未満なら横へ小突く。
  // 静止検知(45step)より先に効かせて、狐まで届かせる。
  UNSTICK: { speed: 0.12, steps: 20, kick: 1.6, belowY: 500 },

  // 釘の林。段ごとに半ピッチずらす。jitter は位置の乱れ(px)。
  PEGS: { edge: 42, top: 200, rows: 8, rowGap: 38, pitch: 52, r: 5, jitter: 3 },

  // 風車(一定速度で回り続ける十字)。自由回転にすると、45度で止まった十字の
  // 上のV字に賽銭が乗って釣り合い、止まってしまった(掃引126点中20点以上)。
  // 回し続ければ乗っても必ず振り落とされる。spin は rad/step。
  WINDMILL_SPIN: 0.05,
  WINDMILLS: [
    { x: 150, y: 280, arm: 30 },
    { x: 330, y: 360, arm: 30 },
  ],

  // 床。右の壁ぎわ(高い側)から左の寝床へ下る斜面。左端の高さは寝床の床
  // (GROUND_Y)と揃える(段差があると賽銭が引っかかる)。
  SLOPE: { rightY: 520, leftX: 118, leftY: 620 },

  // 狐の寝床(左端)と、おしりの当たり判定。
  FOX_X: 58,
  FOX_SENSOR: { x: 58, y: 590, w: 84, h: 58 },

  BIN_TOP: 648,
  FLOOR_Y: 744,
};

const FOX = {
  sleepLeft: (GEO.FOX_X / GEO.W) * 100,
  sleepBottom: ((GEO.H - GEO.GROUND_Y) / GEO.H) * 100,
  flip: -1, // 左向きに寝る(おしりを右=賽銭が転がってくる方へ向ける)
};

const HINT = {
  title: "賽銭をつまんで左右に動かし、放して落とそう",
  fallback: "うまく落とせないときはここをタップ",
  button: "賽銭を落とす",
};

const wakeLabels = ["coin"];
const grabFilter = { category: GEO.CAT_MOUSE, mask: GEO.CAT_GRAB };

// 詰まったら押す(7s)、それでも来なければ起こす(11s)、フェイルセーフ(20s)。
const TIMELINE = { nudgeMs: 7000, wakeMs: 11000, failsafeMs: 20000 };

function buildWorld(Matter, opts) {
  const rnd = (opts && opts.rnd) || Math.random;
  const { Engine, World, Bodies, Body, Constraint, Events } = Matter;
  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.scale = 0.001;
  const world = engine.world;
  const add = (b) => World.add(world, b);

  const stone = { fillStyle: "#3a3230" };
  const wood = { fillStyle: "#8a5a34" };
  const brass = { fillStyle: "#c9b27a" };

  // 外壁・天井・床(厚め)
  const WALL = 60;
  add([
    Bodies.rectangle(GEO.W / 2, -WALL / 2, GEO.W + WALL * 2, WALL, { isStatic: true, render: stone }),
    Bodies.rectangle(-WALL / 2, GEO.H / 2, WALL, GEO.H + WALL * 2, { isStatic: true, render: stone }),
    Bodies.rectangle(GEO.W + WALL / 2, GEO.H / 2, WALL, GEO.H + WALL * 2, { isStatic: true, render: stone }),
    Bodies.rectangle(GEO.W / 2, GEO.FLOOR_Y + WALL / 2, GEO.W + WALL * 2, WALL, { isStatic: true, render: stone }),
  ]);

  // 天辺の横木(飾り。賽銭とは衝突しない)
  const R = GEO.RAIL;
  add(Bodies.rectangle((R.minX + R.maxX) / 2, R.y + GEO.COIN.r + 5, R.maxX - R.minX + 40, 6, {
    isStatic: true,
    collisionFilter: { mask: 0 },
    chamfer: { radius: 3 },
    render: wood,
  }));

  // 釘の林
  const P = GEO.PEGS;
  for (let row = 0; row < P.rows; row++) {
    const y = P.top + row * P.rowGap;
    const offset = row % 2 ? P.pitch / 2 : 0;
    // 壁ぎわの隙間は賽銭(直径24)が楽に通れる幅にする。ぎりぎりの幅
    // (壁〜釘で25px)だと、賽銭が壁と釘の間に挟まって止まった。
    for (let x = P.edge + offset; x <= GEO.W - P.edge; x += P.pitch) {
      const jx = (rnd() - 0.5) * 2 * P.jitter;
      const jy = (rnd() - 0.5) * 2 * P.jitter;
      add(Bodies.circle(x + jx, y + jy, P.r, { isStatic: true, restitution: 0.4, label: "peg", render: brass }));
    }
  }

  // 風車。中心を拘束した十字を、毎ステップ一定の角速度で回す(左右交互の向き)。
  const windmills = [];
  for (const w of GEO.WINDMILLS) {
    const a = Bodies.rectangle(w.x, w.y, w.arm * 2, 6, { render: { fillStyle: "#b23a48" } });
    const b = Bodies.rectangle(w.x, w.y, 6, w.arm * 2, { render: { fillStyle: "#b23a48" } });
    const mill = Body.create({ parts: [a, b], density: 0.004, frictionAir: 0, label: "windmill" });
    mill.sleepThreshold = Infinity;
    Body.setPosition(mill, { x: w.x, y: w.y });
    Body.setAngle(mill, Math.PI / 4);
    add(mill);
    add(Constraint.create({ pointA: { x: w.x, y: w.y }, bodyB: mill, length: 0, stiffness: 1, render: { visible: false } }));
    windmills.push(mill);
  }
  Events.on(engine, "beforeUpdate", () => {
    windmills.forEach((m, i) => Body.setAngularVelocity(m, (i % 2 ? -1 : 1) * GEO.WINDMILL_SPIN));
  });

  // 床の斜面(右の壁ぎわ → 左の寝床)。下は床まで詰める(下へ抜けられない)。
  const S = GEO.SLOPE;
  const slopePts = [
    { x: S.leftX, y: S.leftY },
    { x: GEO.W + 20, y: S.rightY },
    { x: GEO.W + 20, y: GEO.BIN_TOP },
    { x: S.leftX, y: GEO.BIN_TOP },
  ];
  const sc = Matter.Vertices.centre(slopePts);
  add(Bodies.fromVertices(sc.x, sc.y, [slopePts], {
    isStatic: true,
    friction: 0.02,
    label: "ground",
    render: { fillStyle: "#5a4a3a" },
  }));
  // 寝床の床(左端〜斜面の左端)
  add(Bodies.rectangle(S.leftX / 2 - 10, (GEO.GROUND_Y + GEO.BIN_TOP) / 2, S.leftX + 20, GEO.BIN_TOP - GEO.GROUND_Y, {
    isStatic: true,
    label: "ground",
    render: { fillStyle: "#5a4a3a" },
  }));

  // 賽銭(指でつまめる)
  const home = { x: R.startX, y: R.y };
  const coin = Bodies.circle(home.x, home.y, GEO.COIN.r, {
    density: GEO.COIN.density,
    restitution: GEO.COIN.restitution,
    friction: GEO.COIN.friction,
    frictionAir: GEO.COIN.frictionAir,
    label: "coin",
    collisionFilter: { category: GEO.CAT_GRAB, mask: GEO.CAT_DEFAULT | GEO.CAT_MOUSE },
    render: { fillStyle: "#e0b84a", strokeStyle: "#8a6a2a", lineWidth: 3 },
  });
  coin.sleepThreshold = Infinity;
  add(coin);

  // 落とすまでは自重を打ち消す(横木の上で浮かせておく)。案内文(画面上部)と重ならない高さに置く。
  const state = { dropped: false };
  Events.on(engine, "beforeUpdate", () => {
    if (!state.dropped) {
      coin.force.y -= coin.mass * engine.gravity.y * engine.gravity.scale;
    }
  });

  // 釘の林の中で止まったら小突く(GEO.UNSTICK)。
  const U = GEO.UNSTICK;
  let slow = 0;
  Events.on(engine, "beforeUpdate", () => {
    if (!state.dropped || coin.position.y > U.belowY) {
      slow = 0;
      return;
    }
    slow = Math.hypot(coin.velocity.x, coin.velocity.y) < U.speed ? slow + 1 : 0;
    if (slow >= U.steps) {
      slow = 0;
      Body.setVelocity(coin, { x: (rnd() < 0.5 ? -1 : 1) * U.kick, y: -0.5 });
    }
  });

  // 狐のおしりの当たり判定
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

  return { engine, world, coin, home, state, windmills, rnd };
}

// 儀式(横木の上で賽銭を動かして放す)。つまんでいる間は横木の高さに固定し、
// 放した瞬間に落とす。
function createRitual(Matter, built) {
  const { coin, home, state, rnd } = built;
  const { Body, Sleeping } = Matter;
  const R = GEO.RAIL;
  let grabbed = false;

  function hold(x) {
    const cx = Math.min(R.maxX, Math.max(R.minX, x));
    Body.setPosition(coin, { x: cx, y: home.y });
    Body.setVelocity(coin, { x: 0, y: 0 });
    Body.setAngularVelocity(coin, 0);
  }

  function drop() {
    state.dropped = true;
    Sleeping.set(coin, false);
    Body.setVelocity(coin, { x: (rnd() - 0.5) * 2 * GEO.DROP_KICK, y: 0 });
  }

  return {
    step(dragging) {
      if (state.dropped) return false;
      if (dragging) {
        grabbed = true;
        hold(coin.position.x);
        return false;
      }
      if (!grabbed) {
        // 触られていない間も横木の上に留める(ぶつかられて流されないように)
        hold(coin.position.x);
        return false;
      }
      drop();
      return true;
    },
    // ヘッドレス検証・フォールバック用: x の位置へ動かして放す
    dropAt(x) {
      hold(x);
      grabbed = true;
    },
    launched: () => state.dropped,
  };
}

// 「うまく落とせないとき」: 少しずらした所から落とす(完了は次の step)。
function fallbackRitual(Matter, built, ritual) {
  ritual.dropAt(GEO.RAIL.startX + (built.rnd() - 0.5) * 120);
  return false;
}

function onRitualDone() {}

const SETTLE = { speed: 0.15, steps: 45 };

// 詰まったら賽銭を小突く(釘の上で釣り合って止まった等)。動いている間は触らない。
function nudge(Matter, built) {
  const { coin } = built;
  if (Math.hypot(coin.velocity.x, coin.velocity.y) >= SETTLE.speed) return;
  Matter.Sleeping.set(coin, false);
  Matter.Body.setVelocity(coin, { x: -3, y: 2 });
}

function createSettleDetector(Matter, built) {
  const { coin } = built;
  let quiet = 0;
  return {
    step() {
      const moving = Math.hypot(coin.velocity.x, coin.velocity.y) >= SETTLE.speed;
      quiet = moving ? 0 : quiet + 1;
      return quiet >= SETTLE.steps;
    },
  };
}

// 波紋は放した位置に出す。演出なし(reduced motion)では built が空。
function pulseAt(built) {
  if (built && built.coin && built.state && built.state.dropped) {
    return { x: built.coin.position.x, y: GEO.RAIL.y };
  }
  return { x: GEO.RAIL.startX, y: GEO.RAIL.y };
}

module.exports = {
  id: "saisen",
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
