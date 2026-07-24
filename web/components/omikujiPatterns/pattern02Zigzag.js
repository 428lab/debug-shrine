// パターン02「つづら折りの風鈴坂」。
//
// 演出の流れ:
//   鈴が鳴り玉1が落下
//   → 斜面A(左下がり)を左へ転がり、左端から飛び出して左壁へ
//   → 壁沿いに落ちて斜面B(右下がり)の左端に着地
//   → 斜面Bを右へ長く転がり、吊り風鈴を次々に鳴らしながら加速
//   → 右端から飛び出して回転バーを回し、下へ抜ける
//   → 斜面C(右下がり)に落ち、右端の狐のおしりに直撃
//
// 動く部品が回転バーと風鈴だけの「ほぼ静的」構成なので、軌道の再現性が
// 非常に高い。玉は1個で完結する(relayBall なし)。

const { FRAME, WOOD } = require("./frame.js");

const GEO = {
  // 斜面A(左下がり)。スポーンした玉を受け止めて左へ送る。
  RAMP_A: { x: 250, y: 200, w: 340, h: 12, angle: -0.2 },
  // 斜面B(右下がりの長い坂)。左壁沿いに落ちてきた玉を右へ運ぶ。
  RAMP_B: { x: 215, y: 390, w: 390, h: 12, angle: 0.22 },
  // 吊り風鈴(絵馬と同じ振り子構造)。斜面Bの上に吊るす。
  CHIME: { xs: [130, 200, 270], w: 10, h: 36, hang: 56, density: 0.001 },
  // 回転バー(自由回転)。斜面Bの右端から飛んだ玉の落下経路上。
  WHEEL: { x: 432, y: 500, arm: 72, thick: 14, density: 0.0018, frictionAir: 0.008 },
  // 斜面C(右下がり)。回転バーを抜けた玉を狐へ送る(パターン01と同じ)。
  RAMP_C: { x: 237, y: 614, w: 430, h: 12, angle: 0.1 },
};

// 吊り振り子(風鈴)を1本組む。ema と同じ剛結ロッド(#199)。
function buildChime(Matter, add, x, topY) {
  const { Bodies, Constraint } = Matter;
  const cy = topY + GEO.CHIME.hang + GEO.CHIME.h / 2;
  const plaque = Bodies.rectangle(x, cy, GEO.CHIME.w, GEO.CHIME.h, {
    density: GEO.CHIME.density,
    frictionAir: 0.02,
    label: "ema",
    chamfer: { radius: 3 },
    render: { fillStyle: "#e8ddc8" },
  });
  add(plaque);
  add(Constraint.create({
    pointA: { x, y: topY },
    bodyB: plaque,
    pointB: { x: 0, y: -GEO.CHIME.h / 2 },
    length: GEO.CHIME.hang,
    stiffness: 1,
    render: { strokeStyle: "#caa96a", lineWidth: 2 },
  }));
}

function build(Matter, { engine, world }) {
  const { World, Bodies, Body, Constraint, Events } = Matter;
  const add = (b) => World.add(world, b);

  // 斜面A・B・C
  add(Bodies.rectangle(GEO.RAMP_A.x, GEO.RAMP_A.y, GEO.RAMP_A.w, GEO.RAMP_A.h, { isStatic: true, angle: GEO.RAMP_A.angle, chamfer: { radius: 5 }, render: WOOD }));
  add(Bodies.rectangle(GEO.RAMP_B.x, GEO.RAMP_B.y, GEO.RAMP_B.w, GEO.RAMP_B.h, { isStatic: true, angle: GEO.RAMP_B.angle, chamfer: { radius: 5 }, render: WOOD }));
  add(Bodies.rectangle(GEO.RAMP_C.x, GEO.RAMP_C.y, GEO.RAMP_C.w, GEO.RAMP_C.h, { isStatic: true, angle: GEO.RAMP_C.angle, chamfer: { radius: 5 }, render: WOOD }));

  // 吊り風鈴(斜面Bの表面から吊り下げ位置を計算)
  const rampBSurfY = (x) => GEO.RAMP_B.y + Math.tan(GEO.RAMP_B.angle) * (x - GEO.RAMP_B.x) - GEO.RAMP_B.h / 2;
  for (const x of GEO.CHIME.xs) {
    const bottomY = rampBSurfY(x) - 4;
    buildChime(Matter, add, x, bottomY - GEO.CHIME.h - GEO.CHIME.hang);
  }

  // 回転バー(パターン01の水車と同じ作り: 剛結ピン+自重打ち消し+装飾軸)
  const wx = GEO.WHEEL.x;
  const wy = GEO.WHEEL.y;
  const wheel = Body.create({
    parts: [
      Bodies.rectangle(wx, wy, GEO.WHEEL.arm, GEO.WHEEL.thick, { chamfer: { radius: 6 }, render: { fillStyle: "#d9542e" } }),
      Bodies.rectangle(wx, wy, GEO.WHEEL.thick, 36, { chamfer: { radius: 6 }, render: { fillStyle: "#d9542e" } }),
    ],
    density: GEO.WHEEL.density,
    frictionAir: GEO.WHEEL.frictionAir,
    label: "wheel",
  });
  add(wheel);
  add(Constraint.create({ pointA: { x: wx, y: wy }, bodyB: wheel, pointB: { x: 0, y: 0 }, length: 0, stiffness: 1, render: { visible: false } }));
  Events.on(engine, "beforeUpdate", () => {
    if (!wheel.isSleeping) {
      wheel.force.y -= wheel.mass * engine.gravity.y * engine.gravity.scale;
    }
  });
  add(Bodies.circle(wx, wy, 6, { isStatic: true, collisionFilter: { mask: 0 }, render: { fillStyle: "#7a2a12" } }));

  return { relayBall: null };
}

module.exports = {
  id: "zigzag",
  name: "つづら折りの風鈴坂",
  build,
};
