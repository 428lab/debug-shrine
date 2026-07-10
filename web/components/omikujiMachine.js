// おみくじ演出のからくり装置(matter-js)の構築モジュール。
//
// 描画(Render)を含まない構築部分だけを切り出し、Node でもヘッドレスに
// 「玉が全ギミックを通って狐(センサー)に届くか」を検証できるようにする。
//
// 演出の流れ(すべてこの装置の上で起きる):
//   鈴の緒を振る → 鈴が鳴り御神玉が落ちる
//   → 斜面Aを右へ転がり、吊るされた絵馬をカランカランと揺らしながら駆け抜ける
//   → 玉も水車に落ち、玉の重みで水車が回る(触れると動く仕掛け)
//   → 斜面Bを左へ転がり、バンパーでポーンと上へ跳ねて折り返す
//   → 斜面Cを右へ転がり、右下で寝ている狐のおしりに直撃
//   → 狐が目を覚まし、ビンの上を飛び移る(狐は DOM スプライト側)
//
// 設計の要:
// - 最終段は「玉が狐に直撃」。全初期条件で玉の飛行経路が同じ帯を通ることを
//   Node で検証済みで、当たり判定をその帯に置くので連鎖の完走が安定する。
// - 中段の仕掛けは「吊り絵馬(振り子)」。玉に押されて揺れるだけで道を塞がず、
//   立ちドミノのように倒れて玉を止めることがない。
// - 抽選の正しさはこの装置に依存しない(狐の最終着地は omikujiFox.js で制御)。
//   装置が万一詰まってもタイムボックスで先に進む。

const GEO = {
  W: 480,
  H: 760,
  BIN_COUNT: 7,
  FIXED_DELTA: 1000 / 60,

  // collision categories(鈴の緒だけをマウスで掴めるようにする)
  CAT_DEFAULT: 0x0001,
  CAT_ROPE: 0x0002,
  CAT_MOUSE: 0x0004,

  BELL: { x: 240, y: 36, r: 17 },
  ROPE: { segs: 7, segW: 7, segH: 16, tasselR: 13 },

  BALL: { spawnX: 243, spawnY: 72, r: 11, density: 0.005, restitution: 0.2, friction: 0.01, frictionAir: 0.002 },

  // 斜面A(1本の長い坂)。玉はここで加速しながら吊り絵馬をなぎ払う。
  RAMP_A: { x: 270, y: 265, w: 380, h: 12, angle: 0.24 },
  // 吊り絵馬(振り子)。玉が通るとカランカランと揺れる。立ちドミノと違い
  // 倒れて道を塞ぐことがないため、連鎖が詰まらない。
  EMA: { xs: [330, 385, 440], w: 10, h: 36, hang: 58, density: 0.001 },

  // 水車(自由回転)。レッジの端から落ちる玉・ドミノで回る。
  // 腕が右壁からはみ出さない大きさにし、玉の落下点の左に置いてトルクを得る。
  WHEEL: { x: 420, y: 392, arm: 100, thick: 14, density: 0.0018, frictionAir: 0.02 },

  // 斜面B(左下がり)。水車から落ちた玉を受けて左へ運ぶ。
  RAMP_B: { x: 345, y: 482, w: 270, h: 12, angle: -0.13 },

  // バンパー(よく弾む)。斜面Bを下ってきた玉をポーンと上へ跳ね上げ、
  // 「下るだけ」の単調さを打破しつつ、折り返しの谷で玉が失速するのを防ぐ。
  BUMPER: { x: 195, y: 532, r: 13, restitution: 1.05 },
  // 斜面C(右下がり)。バンパーで跳ねた玉を受けて右へ折り返す。
  RAMP_C: { x: 170, y: 575, w: 280, h: 12, angle: 0.2 },

  // 狐の寝床(右下の台)。斜面Cから飛び出した玉が、寝ている狐のおしりに直撃。
  FOX_PLATFORM: { x: 365, y: 625, w: 110, h: 10 },
  FOX_LIP: { x: 415, y: 606, w: 8, h: 24 }, // 玉が右へ抜けないための縁
  FOX_SENSOR: { x: 340, y: 603, w: 60, h: 38 },

  BIN_TOP: 648,
  FLOOR_Y: 744,
};

// 装置一式を組む。Matter を引数に取るのは Node(require)とブラウザ(webpack
// import)の両対応のため。
function buildMachineWorld(Matter) {
  const { Engine, World, Bodies, Body, Composites, Composite, Constraint } = Matter;
  const engine = Engine.create();
  engine.gravity.scale = 0.001;
  const world = engine.world;
  const add = (b) => World.add(world, b);

  const wood = { fillStyle: "#8a5a34" };

  // 外壁・床
  add([
    Bodies.rectangle(-8, GEO.H / 2, 16, GEO.H, { isStatic: true, render: { fillStyle: "#3a3230" } }),
    Bodies.rectangle(GEO.W + 8, GEO.H / 2, 16, GEO.H, { isStatic: true, render: { fillStyle: "#3a3230" } }),
    Bodies.rectangle(GEO.W / 2, GEO.FLOOR_Y + 8, GEO.W, 16, { isStatic: true, render: { fillStyle: "#3a3230" } }),
  ]);

  // 鈴(飾り。玉はここから落ちる)
  add(Bodies.circle(GEO.BELL.x, GEO.BELL.y, GEO.BELL.r, { isStatic: true, label: "bell", render: { fillStyle: "#e8c86a" } }));
  add(Bodies.rectangle(GEO.BELL.x, GEO.BELL.y + 10, 10, 6, { isStatic: true, render: { fillStyle: "#8a6a2a" } }));

  // 鈴の緒(制約チェーン)。マウスでだけ掴める(装置や玉とは衝突しない)。
  const ropeFilter = { category: GEO.CAT_ROPE, mask: GEO.CAT_MOUSE };
  const ropeTopY = GEO.BELL.y + GEO.BELL.r + 4;
  const rope = Composites.stack(GEO.BELL.x - GEO.ROPE.segW / 2, ropeTopY, 1, GEO.ROPE.segs, 0, 0, (x, y) =>
    Bodies.rectangle(x, y, GEO.ROPE.segW, GEO.ROPE.segH, {
      collisionFilter: ropeFilter,
      render: { fillStyle: "#b23a48" },
    })
  );
  Composites.chain(rope, 0, 0.5, 0, -0.5, { stiffness: 0.9, length: 0, render: { strokeStyle: "#b23a48", lineWidth: 3 } });
  Composite.add(
    rope,
    Constraint.create({
      pointA: { x: GEO.BELL.x, y: ropeTopY },
      bodyB: rope.bodies[0],
      pointB: { x: 0, y: -GEO.ROPE.segH / 2 },
      stiffness: 0.95,
      length: 0,
      render: { strokeStyle: "#b23a48", lineWidth: 3 },
    })
  );
  // 先端の房(掴む対象。大きめにして掴みやすく)
  const tassel = Bodies.circle(GEO.BELL.x, ropeTopY + GEO.ROPE.segs * GEO.ROPE.segH + GEO.ROPE.tasselR, GEO.ROPE.tasselR, {
    collisionFilter: ropeFilter,
    density: 0.004,
    render: { fillStyle: "#e8c86a" },
  });
  Composite.add(rope, tassel);
  Composite.add(
    rope,
    Constraint.create({
      bodyA: rope.bodies[GEO.ROPE.segs - 1],
      pointA: { x: 0, y: GEO.ROPE.segH / 2 },
      bodyB: tassel,
      pointB: { x: 0, y: -GEO.ROPE.tasselR },
      stiffness: 0.95,
      length: 0,
      render: { strokeStyle: "#b23a48", lineWidth: 3 },
    })
  );
  add(rope);

  // 斜面A(右下がり)
  add(Bodies.rectangle(GEO.RAMP_A.x, GEO.RAMP_A.y, GEO.RAMP_A.w, GEO.RAMP_A.h, { isStatic: true, angle: GEO.RAMP_A.angle, chamfer: { radius: 5 }, render: wood }));

  // 吊り絵馬(振り子)。斜面Aの上に吊るす。下端は路面から数px浮かせ、
  // 玉(r11)が必ず当たって揺らしていくようにする。
  const rampSurfY = (x) => GEO.RAMP_A.y + Math.tan(GEO.RAMP_A.angle) * (x - GEO.RAMP_A.x) - GEO.RAMP_A.h / 2;
  for (const x of GEO.EMA.xs) {
    const bottomY = rampSurfY(x) - 4;
    const cy = bottomY - GEO.EMA.h / 2;
    const pivotY = cy - GEO.EMA.h / 2 - GEO.EMA.hang;
    const plaque = Bodies.rectangle(x, cy, GEO.EMA.w, GEO.EMA.h, {
      density: GEO.EMA.density,
      frictionAir: 0.02,
      label: "ema",
      chamfer: { radius: 3 },
      render: { fillStyle: "#e8ddc8" },
    });
    add(plaque);
    add(Constraint.create({
      pointA: { x, y: pivotY },
      bodyB: plaque,
      pointB: { x: 0, y: -GEO.EMA.h / 2 },
      length: GEO.EMA.hang,
      stiffness: 0.9,
      render: { strokeStyle: "#caa96a", lineWidth: 2 },
    }));
  }

  // 水車(自由回転。玉やドミノの重みで回る)
  const wheel = Body.create({
    parts: [
      Bodies.rectangle(0, 0, GEO.WHEEL.arm, GEO.WHEEL.thick, { render: { fillStyle: "#d9542e" } }),
      Bodies.rectangle(0, 0, GEO.WHEEL.thick, GEO.WHEEL.arm, { render: { fillStyle: "#d9542e" } }),
    ],
    density: GEO.WHEEL.density,
    frictionAir: GEO.WHEEL.frictionAir,
    label: "wheel",
    render: { fillStyle: "#d9542e" },
  });
  Body.setPosition(wheel, { x: GEO.WHEEL.x, y: GEO.WHEEL.y });
  Body.setAngle(wheel, Math.PI / 4);
  add(wheel);
  add(Constraint.create({ pointA: { x: GEO.WHEEL.x, y: GEO.WHEEL.y }, bodyB: wheel, pointB: { x: 0, y: 0 }, length: 0, stiffness: 0.9, render: { visible: false } }));
  add(Bodies.circle(GEO.WHEEL.x, GEO.WHEEL.y, 6, { isStatic: true, render: { fillStyle: "#7a2a12" } }));

  // 斜面B(左下がり)
  add(Bodies.rectangle(GEO.RAMP_B.x, GEO.RAMP_B.y, GEO.RAMP_B.w, GEO.RAMP_B.h, { isStatic: true, angle: GEO.RAMP_B.angle, chamfer: { radius: 5 }, render: wood }));

  // バンパー(弾む)
  add(Bodies.circle(GEO.BUMPER.x, GEO.BUMPER.y, GEO.BUMPER.r, { isStatic: true, restitution: GEO.BUMPER.restitution, label: "bumper", render: { fillStyle: "#4ecdc4" } }));
  // 斜面C(右下がり・折り返し)
  add(Bodies.rectangle(GEO.RAMP_C.x, GEO.RAMP_C.y, GEO.RAMP_C.w, GEO.RAMP_C.h, { isStatic: true, angle: GEO.RAMP_C.angle, chamfer: { radius: 5 }, render: wood }));

  // 狐の寝床(台)と縁
  add(Bodies.rectangle(GEO.FOX_PLATFORM.x, GEO.FOX_PLATFORM.y, GEO.FOX_PLATFORM.w, GEO.FOX_PLATFORM.h, { isStatic: true, chamfer: { radius: 4 }, render: wood }));
  add(Bodies.rectangle(GEO.FOX_LIP.x, GEO.FOX_LIP.y, GEO.FOX_LIP.w, GEO.FOX_LIP.h, { isStatic: true, chamfer: { radius: 3 }, render: wood }));
  // 狐のおしりの当たり判定(玉が直撃したら wake)
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

  return { engine, world, rope, tassel };
}

// 御神玉を生成して投入する(鈴が鳴った時に呼ぶ)。
function spawnBall(Matter, world, vx) {
  const b = Matter.Bodies.circle(GEO.BALL.spawnX, GEO.BALL.spawnY, GEO.BALL.r, {
    density: GEO.BALL.density,
    restitution: GEO.BALL.restitution,
    friction: GEO.BALL.friction,
    frictionAir: GEO.BALL.frictionAir,
    label: "ball",
    render: { fillStyle: "#f2c14e" },
  });
  Matter.Body.setVelocity(b, { x: typeof vx === "number" ? vx : 0.4, y: 0 });
  Matter.World.add(world, b);
  return b;
}

module.exports = { GEO, buildMachineWorld, spawnBall };
