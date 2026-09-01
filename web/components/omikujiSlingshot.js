// おみくじ演出「弾き玉」(スリングショット)の装置モジュール(matter-js)。
//
// 描画(Render)を含まない構築部分だけを切り出し、Node でもヘッドレスに
// 「放った玉(または崩れた木札)が狐まで届くか」を検証できるようにする
// (scripts/simulate-omikuji-slingshot.js)。
//
// 演出の流れ:
//   左のY字の台に載った御神玉を、指でつまんで引き絞り、放す
//   → 玉が放物線を描いて飛び、右の木札の櫓(やぐら)に直撃
//   → 櫓が崩れ、飛んだ木札か玉そのものが、右端で寝ている狐に当たる
//   → 狐が起きてビンを飛び移る(DOM側。OmikujiScene が担当)
//
// 設計の要:
// - 抽選の正しさはこの装置に依存しない(狐の最終着地は omikujiFox.js で制御)。
//   狙いが外れて何にも当たらなくても、タイムボックスで狐が起きる。
// - 儀式中に装置が勝手に動かない。櫓の木札は最初からスリープで凍結し、
//   触られるまで完全静止(鈴の緒装置で学んだ #199 の方針をそのまま踏襲)。
// - 玉はゴム(拘束)で台に繋がれており、放して台を通り過ぎた瞬間に切り離す。
//   引き絞りの距離は上限で頭打ちにする(強すぎる射出で画面外へ抜けないように)。
//
// OmikujiScene から使う共通インターフェース(omikujiMachines.js 参照):
//   id, GEO, FOX, HINT, wakeLabels, grabFilter, build, pulseAt,
//   createRitual, launchDefault, nudge

const GEO = {
  W: 480,
  H: 760,
  BIN_COUNT: 7,
  FIXED_DELTA: 1000 / 60,

  // collision categories(御神玉だけを指でつまめるようにする)
  CAT_DEFAULT: 0x0001,
  CAT_GRAB: 0x0002,
  CAT_MOUSE: 0x0004,

  // 地面(上面の y)。櫓も狐もこの上に置く。
  GROUND_Y: 620,

  // Y字の台。ANCHOR が玉の定位置(ゴムの支点)。
  SLING: { x: 72, anchorY: 440, forkTipY: 458, forkW: 30, postH: 160 },
  // 玉。ゴムの stiffness と密度の組み合わせで射出速度が決まる。
  BALL: { r: 12, density: 0.004, restitution: 0.3, friction: 0.05, frictionAir: 0.001 },
  // ゴム(拘束)。引き絞りは MAX_PULL で頭打ち。RELEASE_MIN 未満の引きは
  // 放しても射出せず、玉を台へ戻すだけ(誤タップで暴発しないように)。
  // stiffness 0.045 だと引き30で 12px/step、最大引きで 45px/step に達し、
  // 12px の玉が 16px の壁を突き抜けて場外へ落ちた(matter は連続衝突判定を
  // しない)。柔らかくした上で、切り離し時の速度に上限も掛ける。
  ELASTIC: { stiffness: 0.012, maxPull: 100, releaseMin: 18, maxSpeed: 15 },

  // 木札の櫓。x0 が左端の柱の中心。3層。
  TOWER: {
    x0: 318,
    cols: 3,
    colGap: 46,
    levels: 3,
    post: { w: 10, h: 52 },
    beam: { h: 10 },
    // 軽め・滑りやすめにして、当たれば気持ちよく崩れるように。
    density: 0.0015,
    friction: 0.3,
    restitution: 0.05,
  },

  // 狐の寝床(地面の右端)と、おしりの当たり判定。
  FOX_X: 446,
  FOX_SENSOR: { x: 446, y: 590, w: 66, h: 58 },

  BIN_TOP: 648,
  FLOOR_Y: 744,
};

// 狐の寝床(シーン内%)。OmikujiScene がDOMスプライトを置く位置。
const FOX = {
  sleepLeft: (GEO.FOX_X / GEO.W) * 100,
  sleepBottom: ((GEO.H - GEO.GROUND_Y) / GEO.H) * 100,
  flip: 1, // 右向きに寝る(おしりを左=玉の飛来方向に向ける)
};

const HINT = {
  title: "御神玉をつまんで引き絞り、放って櫓を崩そう",
  fallback: "うまく放てないときはここをタップ",
  button: "玉を放つ",
};

// これらのラベルが fox-sensor に触れたら狐が起きる。
const wakeLabels = ["ball", "block"];

// 指でつまめるのは御神玉だけ。
const grabFilter = { category: GEO.CAT_MOUSE, mask: GEO.CAT_GRAB };

function buildWorld(Matter) {
  const { Engine, World, Bodies, Constraint, Sleeping } = Matter;
  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.scale = 0.001;
  const world = engine.world;
  const add = (b) => World.add(world, b);

  const wood = { fillStyle: "#8a5a34" };
  const stone = { fillStyle: "#3a3230" };

  // 外壁・天井・床・地面。天井が無いと強く放った玉が上へ抜けて場外に落ちる。
  // 壁は厚め(速い玉が突き抜けないように。matter は連続衝突判定をしない)。
  const WALL = 60;
  add([
    Bodies.rectangle(GEO.W / 2, -WALL / 2, GEO.W + WALL * 2, WALL, { isStatic: true, render: stone }),
    Bodies.rectangle(-WALL / 2, GEO.H / 2, WALL, GEO.H + WALL * 2, { isStatic: true, render: stone }),
    Bodies.rectangle(GEO.W + WALL / 2, GEO.H / 2, WALL, GEO.H + WALL * 2, { isStatic: true, render: stone }),
    Bodies.rectangle(GEO.W / 2, GEO.FLOOR_Y + WALL / 2, GEO.W + WALL * 2, WALL, { isStatic: true, render: stone }),
    // 地面(上面 GROUND_Y〜BIN_TOP)。玉も木札もここで止まる。
    Bodies.rectangle(GEO.W / 2, (GEO.GROUND_Y + GEO.BIN_TOP) / 2, GEO.W, GEO.BIN_TOP - GEO.GROUND_Y, {
      isStatic: true,
      friction: 0.6,
      label: "ground",
      render: { fillStyle: "#5a4a3a" },
    }),
  ]);

  // Y字の台(柱と二又)。装飾なので玉と衝突しない(玉は台の間を抜けて飛ぶ)。
  const s = GEO.SLING;
  const deco = { isStatic: true, collisionFilter: { mask: 0 }, render: wood };
  add(Bodies.rectangle(s.x, GEO.GROUND_Y - s.postH / 2, 12, s.postH, { ...deco, chamfer: { radius: 3 } }));
  add(Bodies.rectangle(s.x - s.forkW / 2, s.forkTipY + 12, 8, 40, { ...deco, angle: 0.25, chamfer: { radius: 3 } }));
  add(Bodies.rectangle(s.x + s.forkW / 2, s.forkTipY + 12, 8, 40, { ...deco, angle: -0.25, chamfer: { radius: 3 } }));

  // 御神玉(指でつまめる)。
  const anchor = { x: s.x, y: s.anchorY };
  const ball = Bodies.circle(anchor.x, anchor.y, GEO.BALL.r, {
    density: GEO.BALL.density,
    restitution: GEO.BALL.restitution,
    friction: GEO.BALL.friction,
    frictionAir: GEO.BALL.frictionAir,
    label: "ball",
    collisionFilter: { category: GEO.CAT_GRAB, mask: GEO.CAT_DEFAULT | GEO.CAT_MOUSE },
    render: { fillStyle: "#f2c14e" },
  });
  ball.sleepThreshold = Infinity; // 道中で眠って止まらないように
  add(ball);

  // ゴム(玉を台の支点に繋ぐ)。放して支点を通り過ぎたら createRitual が切り離す。
  const elastic = Constraint.create({
    pointA: anchor,
    bodyB: ball,
    stiffness: GEO.ELASTIC.stiffness,
    length: 0,
    render: { strokeStyle: "#b23a48", lineWidth: 3 },
  });
  add(elastic);
  // ゴムに繋がっている間は玉の自重を打ち消す。柔らかいゴム(stiffness 0.012)は
  // 重力で 3px ほどたわみ、玉が支点から下がったまま微振動して眠れない。
  // 切り離した後は普通に重力が掛かる(放物線はそのまま)。
  Matter.Events.on(engine, "beforeUpdate", () => {
    if (elastic.bodyB === ball) {
      ball.force.y -= ball.mass * engine.gravity.y * engine.gravity.scale;
    }
  });

  // 木札の櫓。柱(縦)と梁(横)を層ごとに積む。最初はスリープで凍結。
  const t = GEO.TOWER;
  const blockOpts = {
    density: t.density,
    friction: t.friction,
    restitution: t.restitution,
    label: "block",
  };
  const levelH = t.post.h + t.beam.h;
  const beamW = t.colGap * (t.cols - 1) + t.post.w + 8;
  for (let lv = 0; lv < t.levels; lv++) {
    const baseY = GEO.GROUND_Y - lv * levelH;
    for (let c = 0; c < t.cols; c++) {
      const x = t.x0 + c * t.colGap;
      const post = Bodies.rectangle(x, baseY - t.post.h / 2, t.post.w, t.post.h, {
        ...blockOpts,
        chamfer: { radius: 2 },
        render: { fillStyle: c % 2 ? "#d9c9a8" : "#e8ddc8" },
      });
      Sleeping.set(post, true);
      add(post);
    }
    const beamX = t.x0 + (t.colGap * (t.cols - 1)) / 2;
    const beam = Bodies.rectangle(beamX, baseY - t.post.h - t.beam.h / 2, beamW, t.beam.h, {
      ...blockOpts,
      chamfer: { radius: 2 },
      render: wood,
    });
    Sleeping.set(beam, true);
    add(beam);
  }

  // 狐のおしりの当たり判定(寝床は地面そのもの)。
  add(Bodies.rectangle(GEO.FOX_SENSOR.x, GEO.FOX_SENSOR.y, GEO.FOX_SENSOR.w, GEO.FOX_SENSOR.h, {
    isStatic: true,
    isSensor: true,
    label: "fox-sensor",
    render: { visible: false },
  }));

  // ビン仕切り(見た目を鈴の緒装置と揃える)
  const bw = GEO.W / GEO.BIN_COUNT;
  for (let i = 1; i < GEO.BIN_COUNT; i++) {
    add(Bodies.rectangle(i * bw, (GEO.BIN_TOP + GEO.FLOOR_Y) / 2, 6, GEO.FLOOR_Y - GEO.BIN_TOP, { isStatic: true, chamfer: { radius: 2 }, render: { fillStyle: "#8a6a3a" } }));
  }

  return { engine, world, ball, elastic, anchor };
}

// 儀式(引き絞って放す)の監視。毎ステップ step() を呼び、放った瞬間に true を返す。
//
// isDragging(): 指が玉をつまんでいるか(シーン側が MouseConstraint から判定)。
// ヘッドレス検証では pull(dx,dy) → release() で同じ経路を通せる。
function createRitual(Matter, built) {
  const { ball, elastic, anchor, world } = built;
  const { Body, Sleeping } = Matter;
  let pulled = false;
  let launched = false;

  function clampPull() {
    const dx = ball.position.x - anchor.x;
    const dy = ball.position.y - anchor.y;
    const d = Math.hypot(dx, dy);
    if (d > GEO.ELASTIC.maxPull) {
      const k = GEO.ELASTIC.maxPull / d;
      Body.setPosition(ball, { x: anchor.x + dx * k, y: anchor.y + dy * k });
      Body.setVelocity(ball, { x: 0, y: 0 });
    }
    return Math.min(d, GEO.ELASTIC.maxPull);
  }

  function detach() {
    // 速度の上限(突き抜け防止)。
    const v = ball.velocity;
    const sp = Math.hypot(v.x, v.y);
    if (sp > GEO.ELASTIC.maxSpeed) {
      const k = GEO.ELASTIC.maxSpeed / sp;
      Body.setVelocity(ball, { x: v.x * k, y: v.y * k });
    }
    // ゴムを世界から外す(以降は自由飛行)。bodyB を null にして残す手もあるが、
    // 拘束が描画に残ったり、点と点の空拘束が毎ステップ解かれたりするので外す。
    Matter.Composite.remove(world, elastic);
    launched = true;
  }

  // 放した瞬間の「引いた向き」(支点→玉の単位ベクトル)。玉がこの向きの
  // 反対側へ支点を通り過ぎた瞬間(=ゴムが伸び切って一番速い瞬間)に切り離す。
  // 「x が支点より右」のような固定条件だと、垂直気味の引きで永久に切り離せず
  // ぶら下がったままになる。
  let pullDir = null;
  function rememberPull() {
    const dx = ball.position.x - anchor.x;
    const dy = ball.position.y - anchor.y;
    const d = Math.hypot(dx, dy) || 1;
    pullDir = { x: dx / d, y: dy / d };
  }

  return {
    // dragging: この瞬間に玉がつままれているか
    step(dragging) {
      if (launched) return false;
      if (dragging) {
        Sleeping.set(ball, false);
        if (clampPull() >= GEO.ELASTIC.releaseMin) {
          pulled = true;
          rememberPull();
        } else {
          pulled = false;
        }
        return false;
      }
      if (!pulled || !pullDir) return false;
      const along = (ball.position.x - anchor.x) * pullDir.x + (ball.position.y - anchor.y) * pullDir.y;
      if (along <= 0) {
        detach();
        return true;
      }
      return false;
    },
    // ヘッドレス検証・フォールバック用: 支点から (dx,dy) だけ引いた位置に置く
    pull(dx, dy) {
      Sleeping.set(ball, false);
      Body.setPosition(ball, { x: anchor.x + dx, y: anchor.y + dy });
      Body.setVelocity(ball, { x: 0, y: 0 });
      if (clampPull() >= GEO.ELASTIC.releaseMin) {
        pulled = true;
        rememberPull();
      }
    },
    launched: () => launched,
  };
}

// 放った後、玉も木札も動きが収まったか(狙いが外れて何にも当たらなかった時に、
// 物音で狐が目を覚ますきっかけにする)。フォールバックのタイマーを待たずに
// 数秒で先へ進めるための判定。
const SETTLE = { speed: 0.15, steps: 45 }; // 全員 0.15px/step 未満が 45step(0.75s)続いたら静止
function createSettleDetector(Matter, built) {
  const { ball } = built;
  const blocks = Matter.Composite.allBodies(built.world).filter((b) => b.label === "block");
  let quiet = 0;
  return {
    step() {
      let moving = Math.hypot(ball.velocity.x, ball.velocity.y) >= SETTLE.speed;
      if (!moving) {
        for (const b of blocks) {
          if (!b.isSleeping && Math.hypot(b.velocity.x, b.velocity.y) >= SETTLE.speed) {
            moving = true;
            break;
          }
        }
      }
      quiet = moving ? 0 : quiet + 1;
      return quiet >= SETTLE.steps;
    },
  };
}

// シーン側のフォールバック時刻(ms)。鈴の緒装置より短い(旅が短いので)。
const TIMELINE = { nudgeMs: 6000, wakeMs: 9000, failsafeMs: 20000 };

// 「うまく放てないとき」のフォールバック。櫓に確実に当たる既定の引きで放つ。
// 実際の切り離しは以降の step で起きるので、その場では完了しない(false)。
function fallbackRitual(Matter, built, ritual) {
  ritual.pull(-80, 34); // 左下へ引く = 右上へ飛ぶ
  return false;
}

// 儀式完了時に装置側でやることは無い(放った時点で玉は自由飛行)。
function onRitualDone() {}

// 詰まった時のフォールバック(玉が何にも当たらず止まった等)。
// 玉を狐の方へそっと転がす。
function nudge(Matter, built) {
  const { ball } = built;
  Matter.Sleeping.set(ball, false);
  Matter.Body.setVelocity(ball, { x: 5, y: -4 });
}

// 儀式完了時の波紋の位置(射出点)。演出なし(reduced motion)では世界を組まないので
// built が空でも答えられるようにしておく。
function pulseAt(built) {
  const a = (built && built.anchor) || { x: GEO.SLING.x, y: GEO.SLING.anchorY };
  return { x: a.x, y: a.y };
}

module.exports = {
  id: "slingshot",
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
