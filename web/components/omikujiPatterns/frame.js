// おみくじ装置の共通フレーム(#200)。
//
// 全パターンで共通の外枠だけを組む: 外壁・床・鈴と鈴の緒(儀式UI)・
// 狐の寝床とセンサー・ビン仕切り。中間のからくりは omikujiPatterns/ の
// 各パターンモジュールが組む。
//
// 注意: BELL / FOX_PLATFORM / FOX_SENSOR / BIN まわりの座標は
// OmikujiScene.vue のDOM座標計算(狐スプライト・ビンラベル・波紋)と
// 対応しているため、パターン側で変更しないこと。

const FRAME = {
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

  BALL: { spawnX: 243, spawnY: 72, r: 11, density: 0.005, restitution: 0.2, friction: 0.01, frictionAir: 0.0008 },

  // 狐の寝床(右下)と、おしりの当たり判定(玉が直撃したら wake)
  FOX_PLATFORM: { x: 452, y: 644, w: 56, h: 10 },
  FOX_SENSOR: { x: 443, y: 614, w: 64, h: 44 },

  BIN_TOP: 648,
  FLOOR_Y: 744,
};

// 木の質感(パターン側でも使う共通スタイル)
const WOOD = { fillStyle: "#8a5a34" };

// フレーム一式を world に追加し、儀式UIが参照するボディを返す。
function buildFrame(Matter, world) {
  const { World, Bodies, Composites, Composite, Constraint } = Matter;
  const add = (b) => World.add(world, b);

  // 外壁・床
  add([
    Bodies.rectangle(-8, FRAME.H / 2, 16, FRAME.H, { isStatic: true, render: { fillStyle: "#3a3230" } }),
    Bodies.rectangle(FRAME.W + 8, FRAME.H / 2, 16, FRAME.H, { isStatic: true, render: { fillStyle: "#3a3230" } }),
    Bodies.rectangle(FRAME.W / 2, FRAME.FLOOR_Y + 8, FRAME.W, 16, { isStatic: true, render: { fillStyle: "#3a3230" } }),
  ]);

  // 鈴(飾り。玉1はここから落ちる)
  add(Bodies.circle(FRAME.BELL.x, FRAME.BELL.y, FRAME.BELL.r, { isStatic: true, label: "bell", render: { fillStyle: "#e8c86a" } }));
  add(Bodies.rectangle(FRAME.BELL.x, FRAME.BELL.y + 10, 10, 6, { isStatic: true, render: { fillStyle: "#8a6a2a" } }));

  // 鈴の緒(制約チェーン)。マウスでだけ掴める(装置や玉とは衝突しない)。
  const ropeFilter = { category: FRAME.CAT_ROPE, mask: FRAME.CAT_MOUSE };
  const ropeTopY = FRAME.BELL.y + FRAME.BELL.r + 4;
  const rope = Composites.stack(FRAME.BELL.x - FRAME.ROPE.segW / 2, ropeTopY, 1, FRAME.ROPE.segs, 0, 0, (x, y) =>
    Bodies.rectangle(x, y, FRAME.ROPE.segW, FRAME.ROPE.segH, {
      collisionFilter: ropeFilter,
      render: { fillStyle: "#b23a48" },
    })
  );
  // 拘束は stiffness 1(剛結)にする。1未満のソフト拘束は重力との釣り合いで
  // 残留速度が乗り続け、スリープできずに永久に微振動する(#199)。
  Composites.chain(rope, 0, 0.5, 0, -0.5, { stiffness: 1, length: 0, render: { strokeStyle: "#b23a48", lineWidth: 3 } });
  Composite.add(
    rope,
    Constraint.create({
      pointA: { x: FRAME.BELL.x, y: ropeTopY },
      bodyB: rope.bodies[0],
      pointB: { x: 0, y: -FRAME.ROPE.segH / 2 },
      stiffness: 1,
      length: 0,
      render: { strokeStyle: "#b23a48", lineWidth: 3 },
    })
  );
  const tassel = Bodies.circle(FRAME.BELL.x, ropeTopY + FRAME.ROPE.segs * FRAME.ROPE.segH + FRAME.ROPE.tasselR, FRAME.ROPE.tasselR, {
    collisionFilter: ropeFilter,
    density: 0.004,
    render: { fillStyle: "#e8c86a" },
  });
  Composite.add(rope, tassel);
  Composite.add(
    rope,
    Constraint.create({
      bodyA: rope.bodies[FRAME.ROPE.segs - 1],
      pointA: { x: 0, y: FRAME.ROPE.segH / 2 },
      bodyB: tassel,
      pointB: { x: 0, y: -FRAME.ROPE.tasselR },
      stiffness: 1,
      length: 0,
      render: { strokeStyle: "#b23a48", lineWidth: 3 },
    })
  );
  add(rope);

  // 狐の寝床(台)と、おしりの当たり判定
  add(Bodies.rectangle(FRAME.FOX_PLATFORM.x, FRAME.FOX_PLATFORM.y, FRAME.FOX_PLATFORM.w, FRAME.FOX_PLATFORM.h, { isStatic: true, chamfer: { radius: 4 }, render: WOOD }));
  add(Bodies.rectangle(FRAME.FOX_SENSOR.x, FRAME.FOX_SENSOR.y, FRAME.FOX_SENSOR.w, FRAME.FOX_SENSOR.h, {
    isStatic: true,
    isSensor: true,
    label: "fox-sensor",
    render: { visible: false },
  }));

  // ビン仕切り
  const bw = FRAME.W / FRAME.BIN_COUNT;
  for (let i = 1; i < FRAME.BIN_COUNT; i++) {
    add(Bodies.rectangle(i * bw, (FRAME.BIN_TOP + FRAME.FLOOR_Y) / 2, 6, FRAME.FLOOR_Y - FRAME.BIN_TOP, { isStatic: true, chamfer: { radius: 2 }, render: { fillStyle: "#8a6a3a" } }));
  }

  return { rope, tassel };
}

module.exports = { FRAME, WOOD, buildFrame };
