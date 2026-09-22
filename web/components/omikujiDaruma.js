// おみくじ演出「だるま落とし」の装置モジュール(matter-js)。
//
// 描画(Render)を含まない構築部分だけを切り出し、Node でもヘッドレスに
// 「だるまの頭が狐まで転がってくるか」を検証できるようにする
// (scripts/simulate-omikuji-daruma.js)。
//
// 演出の流れ:
//   吊り下げの木槌をつまんで左へ引き、放す
//   → 木槌が振り子で往復し、棚の上のだるまの胴を一段ずつ右へ弾き飛ばす
//     (胴が抜けるたびに上の段が落ちてきて、次の一振りの高さに来る)
//   → 胴を全部抜くと、最後に頭が棚に落ちて、それも弾かれる
//   → 丸い頭は右下の床に落ち、左下がりの床を転がって、左端で寝ている狐へ
//   → 狐が起きてビンを飛び移る(DOM側。OmikujiScene が担当)
//
// 設計の要:
// - 抽選の正しさはこの装置に依存しない(狐の最終着地は omikujiFox.js で制御)。
// - 木槌の強さはユーザーの引きに依存させない。振り子が支点の真下を右向きに
//   通るたびに一定の角速度へ揃える(ポンプ)。引きが弱くても強くても毎回同じ
//   強さで打つので、胴だけが抜けて上の段が真下へ落ちる(強すぎると積みごと
//   崩れ、弱すぎると抜けない)。
// - 木槌は打った直後に止め具で跳ね返す。振り抜くと、落ちてくる上の段を
//   下からすくい上げて積みごと崩してしまう。
// - 狐を起こすのは頭だけ。四角い胴は床の摩擦で止まり(転がらない)、丸い頭
//   だけが床を転がって狐に届く。
// - 儀式中は積みをスリープで凍結し、触られるまで完全静止させる。
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

  // だるまを載せる棚(浮き棚)。上面の y と左右の端。
  SHELF: { top: 470, left: 262, right: 392, h: 12 },
  // 胴(下から順に)と頭。cx は積みの中心。
  STACK: {
    cx: 300,
    blockW: 62,
    blockH: 26,
    colors: ["#2e6fb2", "#3a9a5a", "#e0b84a", "#7a4ab2"],
    density: 0.002,
    // 棚の上ではよく滑らせる(打たれた段だけが素早く抜け、上の段を引きずらない)。
    // 床に落ちたら landedFriction に上げて、その場で止める(斜面を滑って
    // 頭の通り道に入らないように)。
    friction: 0.05,
    frictionStatic: 0.2,
    landedFriction: 0.9,
  },
  // roll: 胴を抜き終えて棚に落ちた頭を、左へ転がし出す速さ(px/step)
  HEAD: { r: 27, density: 0.002, friction: 0.2, restitution: 0.1, roll: 2.5 },

  // 木槌。支点から腕を垂らし、先に頭(横長)を付ける。静止時、頭の右端が
  // 最下段の胴の左端の少し手前に来る。
  HAMMER: {
    pivotX: 240,
    armLen: 190,
    armW: 6, // 腕(拘束の線)の太さ
    headW: 48,
    headH: 24,
    density: 0.01,
    maxPullDeg: 50, // 引ける角度の上限(左へ)
    minPullDeg: 8, // これ未満の引きは放しても振らない(誤タップ防止)
    swing: 0.09, // 真下を右向きに通る瞬間に揃える角速度(rad/step)
    stopDeg: 4, // 右へこれ以上振れたら止め具で跳ね返す
    bounce: 0.35, // 止め具での跳ね返りの割合
    parkDeg: 60, // 胴を抜き終えたら、ここまで引き上げて止める
  },

  // 床。右の壁ぎわ(高い側)から左の寝床へ下る斜面。左端の高さは寝床の床と揃える。
  SLOPE: { rightY: 566, leftX: 118, leftY: 620 },

  // 狐の寝床(左端)と、おしりの当たり判定。
  FOX_X: 58,
  FOX_SENSOR: { x: 58, y: 590, w: 84, h: 58 },

  BIN_TOP: 648,
  FLOOR_Y: 744,
};

const FOX = {
  sleepLeft: (GEO.FOX_X / GEO.W) * 100,
  sleepBottom: ((GEO.H - GEO.GROUND_Y) / GEO.H) * 100,
  flip: -1, // 左向きに寝る(おしりを右=頭が転がってくる方へ向ける)
};

const HINT = {
  title: "木槌をつまんで左へ引き、放してだるまを落とそう",
  fallback: "うまく振れないときはここをタップ",
  button: "木槌を振る",
};

const wakeLabels = ["daruma-head"];
const grabFilter = { category: GEO.CAT_MOUSE, mask: GEO.CAT_GRAB };

// 詰まったら押す、それでも来なければ起こす、フェイルセーフ。
const TIMELINE = { nudgeMs: 9000, wakeMs: 13000, failsafeMs: 20000 };

const DEG = Math.PI / 180;

// 支点の y(静止時に木槌の頭が最下段の胴の高さに来る)
function pivotY() {
  const bottomBlockCy = GEO.SHELF.top - GEO.STACK.blockH / 2;
  return bottomBlockCy - GEO.HAMMER.armLen;
}

function buildWorld(Matter) {
  const { Engine, World, Bodies, Body, Constraint, Events, Sleeping } = Matter;
  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.scale = 0.001;
  const world = engine.world;
  const add = (b) => World.add(world, b);

  const stone = { fillStyle: "#3a3230" };
  const wood = { fillStyle: "#8a5a34" };

  // 外壁・天井・床(厚め)
  const WALL = 60;
  add([
    Bodies.rectangle(GEO.W / 2, -WALL / 2, GEO.W + WALL * 2, WALL, { isStatic: true, render: stone }),
    Bodies.rectangle(-WALL / 2, GEO.H / 2, WALL, GEO.H + WALL * 2, { isStatic: true, render: stone }),
    Bodies.rectangle(GEO.W + WALL / 2, GEO.H / 2, WALL, GEO.H + WALL * 2, { isStatic: true, render: stone }),
    Bodies.rectangle(GEO.W / 2, GEO.FLOOR_Y + WALL / 2, GEO.W + WALL * 2, WALL, { isStatic: true, render: stone }),
  ]);

  // 棚
  const SH = GEO.SHELF;
  add(Bodies.rectangle((SH.left + SH.right) / 2, SH.top + SH.h / 2, SH.right - SH.left, SH.h, {
    isStatic: true,
    friction: 0.3,
    chamfer: { radius: 3 },
    label: "shelf",
    render: wood,
  }));

  // 床の斜面(右の壁ぎわ → 左の寝床)と寝床の床
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
    friction: 0.8,
    label: "ground",
    render: { fillStyle: "#5a4a3a" },
  }));
  add(Bodies.rectangle(S.leftX / 2 - 10, (GEO.GROUND_Y + GEO.BIN_TOP) / 2, S.leftX + 20, GEO.BIN_TOP - GEO.GROUND_Y, {
    isStatic: true,
    friction: 0.8,
    label: "ground",
    render: { fillStyle: "#5a4a3a" },
  }));

  // だるまの胴(下から)と頭。最初はスリープで凍結。
  const ST = GEO.STACK;
  const blocks = [];
  ST.colors.forEach((color, i) => {
    const b = Bodies.rectangle(ST.cx, SH.top - ST.blockH * (i + 0.5), ST.blockW, ST.blockH, {
      density: ST.density,
      friction: ST.friction,
      frictionStatic: ST.frictionStatic,
      chamfer: { radius: 4 },
      label: "daruma-block",
      render: { fillStyle: color },
    });
    Sleeping.set(b, true);
    add(b);
    blocks.push(b);
  });
  const headY = SH.top - ST.blockH * ST.colors.length - GEO.HEAD.r;
  const head = Bodies.circle(ST.cx, headY, GEO.HEAD.r, {
    density: GEO.HEAD.density,
    friction: GEO.HEAD.friction,
    restitution: GEO.HEAD.restitution,
    frictionAir: 0.002,
    label: "daruma-head",
    render: { fillStyle: "#c8322a", strokeStyle: "#f3ead8", lineWidth: 4 },
  });
  Sleeping.set(head, true);
  add(head);

  // 木槌。頭(横長の槌)だけを物体にして、支点から長さ armLen の拘束で吊る。
  // 腕は拘束の線として描く。腕と頭を複合体(parts)にして支点に拘束すると、
  // 傾けた状態から放した瞬間に角速度が発散して、木槌が高速で回り出した。
  // 単体+距離拘束なら安定する(頭の向きは毎ステップ振り子の角度に揃える)。
  const H = GEO.HAMMER;
  const pivot = { x: H.pivotX, y: pivotY() };
  const hammer = Bodies.rectangle(pivot.x, pivot.y + H.armLen, H.headW, H.headH, {
    density: H.density,
    frictionAir: 0.004,
    friction: 0.05,
    chamfer: { radius: 5 },
    label: "hammer",
    collisionFilter: { category: GEO.CAT_GRAB, mask: GEO.CAT_DEFAULT | GEO.CAT_MOUSE },
    render: { fillStyle: "#6b3f22" },
  });
  hammer.sleepThreshold = Infinity;
  add(hammer);
  add(Constraint.create({
    pointA: pivot,
    bodyB: hammer,
    length: H.armLen,
    stiffness: 1,
    render: { strokeStyle: "#8a5a34", lineWidth: H.armW },
  }));
  // 支点の飾り(当たらない)
  add(Bodies.circle(pivot.x, pivot.y, 6, { isStatic: true, collisionFilter: { mask: 0 }, render: { fillStyle: "#c9b27a" } }));

  // 振り子の角度(左へ引くと正)。支点 → 頭の向きから求める。
  const angleOf = () => Math.atan2(-(hammer.position.x - pivot.x), hammer.position.y - pivot.y);

  // 木槌を角度 θ・角速度 ω の振り子の状態にする(支点に対して矛盾のない位置と速度)。
  function setSwing(theta, omega) {
    const rx = -Math.sin(theta) * H.armLen;
    const ry = Math.cos(theta) * H.armLen;
    Body.setPosition(hammer, { x: pivot.x + rx, y: pivot.y + ry });
    Body.setVelocity(hammer, { x: -omega * ry, y: omega * rx });
    Body.setAngle(hammer, theta);
    Body.setAngularVelocity(hammer, omega);
  }

  // 頭の向きを腕に揃える(頭が腕の先で勝手に回らないように)。
  Events.on(engine, "beforeUpdate", () => {
    const th = angleOf();
    const r = { x: hammer.position.x - pivot.x, y: hammer.position.y - pivot.y };
    const omega = (r.x * hammer.velocity.y - r.y * hammer.velocity.x) / (H.armLen * H.armLen);
    Body.setAngle(hammer, th);
    Body.setAngularVelocity(hammer, omega);
  });

  // 放した後の振り子の制御(ポンプと止め具)と、胴を抜き終えた後の片付け。
  const state = { released: false, parked: false, rolled: false };
  let prevTheta = 0;
  const ST_ = GEO.STACK;
  // 胴が積みから外れたか(棚より下へ落ちた、または横へずれて頭を支えていない)
  const blockGone = (b) => b.position.y > SH.top || Math.abs(b.position.x - ST_.cx) > ST_.blockW * 0.8;
  // 木槌に右向きに打たれた胴(以後は自由に飛ぶ)。戻りの木槌に触れただけの
  // 胴まで解き放つと、左へ引きずられて頭の通り道(棚の左)に落ちた。
  const struck = new Set();
  Events.on(engine, "collisionStart", (e) => {
    if (hammer.velocity.x <= 0) return;
    for (const p of e.pairs) {
      const other = p.bodyA === hammer ? p.bodyB : p.bodyB === hammer ? p.bodyA : null;
      // 棚に接している最下段だけ。落ちてくる途中の上の段が木槌の上面に
      // 触れても解き放たない(戻る木槌に左へ引きずられる)。
      if (other && blocks.includes(other) && other.position.y > SH.top - GEO.STACK.blockH * 0.7) {
        struck.add(other);
      }
    }
  });
  let woke = false;
  Events.on(engine, "beforeUpdate", () => {
    if (!state.released) return;
    // 放したら積みを起こす。スリープのままだと、下の段が抜けても上の段が
    // 宙に浮いたまま落ちてこない(支えが消えてもスリープは解けない)。
    if (!woke) {
      woke = true;
      blocks.concat([head]).forEach((b) => {
        Sleeping.set(b, false);
        b.sleepThreshold = Infinity;
      });
    }
    // 棚から出た胴は止める(床の上でも、先に落ちた胴の上でも)
    blocks.forEach((b) => {
      const off = b.position.y > SH.top + SH.h || b.position.x > SH.right;
      if (struck.has(b) && off && b.friction !== ST_.landedFriction) {
        b.friction = ST_.landedFriction;
        b.frictionStatic = 1;
      }
    });
    const th = angleOf();
    const r = { x: hammer.position.x - pivot.x, y: hammer.position.y - pivot.y };
    const om = (r.x * hammer.velocity.y - r.y * hammer.velocity.x) / (H.armLen * H.armLen);

    // まだ打たれていない胴と頭は、積みの真上に留める(縦にだけ落ちる)。
    // 自由にすると、打たれた段に引きずられて積みが横へずれ、木槌の届かない
    // 所へ行ったり、木槌の静止位置に食い込んで振り子を止めたりした。
    // 丸い頭は平らな胴の上で釣り合いが中立なので、揺れで転がり落ちもする。
    const guided = blocks.filter((b) => !struck.has(b));
    if (!state.parked) guided.push(head);
    guided.forEach((b) => {
      Body.setPosition(b, { x: ST_.cx, y: b.position.y });
      Body.setVelocity(b, { x: 0, y: b.velocity.y });
      Body.setAngle(b, 0);
      Body.setAngularVelocity(b, 0);
    });

    // 胴を全部抜いたら木槌を左上へ引き上げる(頭は打たない)。
    if (!state.parked && blocks.every(blockGone)) state.parked = true;
    if (state.parked) {
      const target = H.parkDeg * DEG;
      setSwing(th + (target - th) * 0.08, 0);
      // 頭が棚に落ちて落ち着いたら、左へそっと転がす(棚の左端から落ち、
      // 床の斜面を狐まで転がる)。胴は右へ飛んで右の壁ぎわに溜まるので、
      // 左へ行く頭の道をふさがない。
      const sp = Math.hypot(head.velocity.x, head.velocity.y);
      if (!state.rolled && th > H.parkDeg * DEG * 0.7 && sp < 0.3 && head.position.y > SH.top - GEO.HEAD.r - 4) {
        state.rolled = true;
        Sleeping.set(head, false);
        Body.setVelocity(head, { x: -GEO.HEAD.roll, y: 0 });
        Body.setAngularVelocity(head, -GEO.HEAD.roll / GEO.HEAD.r);
      }
      prevTheta = angleOf();
      return;
    }

    // 真下を右向きに通る瞬間(θ が正 → 0 以下)に一定の強さへ揃える
    if (prevTheta > 0 && th <= 0 && om < 0) {
      setSwing(th, -H.swing);
    }
    // 右へ振り抜けたら止め具で跳ね返す(落ちてくる上の段を押さないように)
    if (th < -H.stopDeg * DEG && om < 0) {
      setSwing(-H.stopDeg * DEG, -om * H.bounce);
    }
    // 真下付近で止まりかけたら(胴に押し戻された等)、左へ送り出して振り直す
    if (Math.abs(th) < 3 * DEG && Math.abs(om) < 0.004) {
      setSwing(th, H.swing * 0.5);
    }
    prevTheta = angleOf();
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

  return { engine, world, hammer, pivot, blocks, head, state, angleOf, setSwing };
}

// 儀式(木槌を左へ引いて放す)。つまんでいる間は角度を [0, maxPull] に収め、
// 放した瞬間に振り子を解き放つ。
function createRitual(Matter, built) {
  const { state, angleOf, setSwing } = built;
  const H = GEO.HAMMER;
  let pulled = false;

  return {
    step(dragging) {
      if (state.released) return false;
      const th = angleOf();
      if (dragging) {
        const clamped = Math.min(H.maxPullDeg * DEG, Math.max(0, th));
        setSwing(clamped, 0);
        pulled = clamped >= H.minPullDeg * DEG;
        return false;
      }
      if (!pulled) {
        // 触られていない間は真下で静止させておく
        setSwing(0, 0);
        return false;
      }
      state.released = true;
      return true;
    },
    // ヘッドレス検証・フォールバック用: 角度 deg だけ引いた位置に置く
    pull(deg) {
      const clamped = Math.min(H.maxPullDeg, Math.max(0, deg));
      setSwing(clamped * DEG, 0);
      pulled = clamped >= H.minPullDeg;
    },
    launched: () => state.released,
  };
}

// 「うまく振れないとき」: 既定の角度まで引いて放す(完了は次の step)。
function fallbackRitual(Matter, built, ritual) {
  ritual.pull(35);
  return false;
}

function onRitualDone() {}

const SETTLE = { speed: 0.15, steps: 45 };

// 詰まったら頭を左へ転がす(棚の上に残った・胴に引っかかった等)。
function nudge(Matter, built) {
  const { head } = built;
  if (Math.hypot(head.velocity.x, head.velocity.y) >= SETTLE.speed) return;
  Matter.Sleeping.set(head, false);
  Matter.Body.setVelocity(head, { x: -4, y: -2 });
}

// 頭が止まったか(木槌は見ない)。胴を抜き終えるまでは数えない(抜いている
// 間、頭は積みの上で止まって見えるので)。抜き終えずに詰まった場合は
// TIMELINE の起こしで先へ進む。
function createSettleDetector(Matter, built) {
  const { head, state } = built;
  let quiet = 0;
  return {
    step() {
      if (!state.rolled) return false;
      const sp = Math.hypot(head.velocity.x, head.velocity.y);
      quiet = sp >= SETTLE.speed ? 0 : quiet + 1;
      return quiet >= SETTLE.steps;
    },
  };
}

// 波紋は木槌の頭(静止位置)に出す。
function pulseAt() {
  return { x: GEO.HAMMER.pivotX, y: pivotY() + GEO.HAMMER.armLen };
}

module.exports = {
  id: "daruma",
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
