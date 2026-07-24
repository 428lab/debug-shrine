// パターン03「玉突きリレー」。
//
// 演出の流れ:
//   鈴が鳴り玉1が落下
//   → 斜面A(右下がり)を右へ疾走、吊り絵馬を鳴らしながら加速
//   → 右端から飛び出し、台で待つ玉2に「玉突き」で直撃(ビリヤード)
//   → 玉2は右下へ弾き飛ばされ、右壁で跳ねて落下
//   → 右下のウェッジで左向きに転向し、斜面B(左下がり)を左へ長く転がる
//   → 左下のウェッジで右向きに転向し、斜面Cを右端まで転がって
//   → 寝ている狐のおしりに直撃
//   (玉1も玉突き後に同じ道を追いかけ、二玉の行列で狐へ向かう)
//
// 玉2は固定位置から静止スタートするため、弾かれた後の旅路は毎回ほぼ
// 同一軌道で決定的。玉1の当たりの強さだけが儀式時間の影響を受けるが、
// 玉突きは「触れれば動く」ので連鎖の成立自体は頑健。

const { FRAME, WOOD } = require("./frame.js");

const GEO = {
  // 斜面A(右下がり)。玉1を加速させて玉2へぶつける。
  RAMP_A: { x: 205, y: 240, w: 370, h: 12, angle: 0.22 },
  EMA: { xs: [250, 310], w: 10, h: 36, hang: 58, density: 0.001 },
  // 玉2が待つ台。玉1の飛翔経路に対し接触法線が右下約40°になる位置
  // (=スクエアな玉突きになる位置)に置いてある。壁との間に十分な
  // 落下幅を確保し、弾かれた玉2は台に触れず飛んで壁で跳ねる。
  RELAY_PERCH: { x: 436, y: 319, w: 26, h: 10 },
  BALL2: { x: 436, y: 303, friction: 0.001 },
  // 右下のウェッジ: 右壁沿いに落ちた玉2を左向きへ転向する。
  CORNER_R: { x: 462, y: 470, w: 40, h: 10, angle: -0.55 },
  // 斜面B(左下がりの長い坂)。玉2を左端まで運ぶ。
  RAMP_B: { x: 250, y: 520, w: 420, h: 12, angle: -0.16 },
  // 左下のウェッジと斜面C(パターン01と同じ配置)
  CORNER_L: { x: 16, y: 580, w: 36, h: 10, angle: 0.55 },
  RAMP_C: { x: 237, y: 614, w: 430, h: 12, angle: 0.1 },
};

function build(Matter, { world }) {
  const { World, Bodies, Constraint } = Matter;
  const add = (b) => World.add(world, b);

  // 斜面A
  add(Bodies.rectangle(GEO.RAMP_A.x, GEO.RAMP_A.y, GEO.RAMP_A.w, GEO.RAMP_A.h, { isStatic: true, angle: GEO.RAMP_A.angle, chamfer: { radius: 5 }, render: WOOD }));

  // 吊り絵馬(パターン01と同じ剛結ロッドの振り子)
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
      stiffness: 1,
      render: { strokeStyle: "#caa96a", lineWidth: 2 },
    }));
  }

  // 玉2の台と玉2
  add(Bodies.rectangle(GEO.RELAY_PERCH.x, GEO.RELAY_PERCH.y, GEO.RELAY_PERCH.w, GEO.RELAY_PERCH.h, { isStatic: true, chamfer: { radius: 3 }, render: WOOD }));
  const relayBall = Bodies.circle(GEO.BALL2.x, GEO.BALL2.y, FRAME.BALL.r, {
    density: FRAME.BALL.density,
    restitution: FRAME.BALL.restitution,
    friction: GEO.BALL2.friction,
    frictionAir: FRAME.BALL.frictionAir,
    label: "ball",
    render: { fillStyle: "#f2c14e" },
  });
  add(relayBall);

  // 右下のウェッジ → 斜面B → 左下のウェッジ → 斜面C
  add(Bodies.rectangle(GEO.CORNER_R.x, GEO.CORNER_R.y, GEO.CORNER_R.w, GEO.CORNER_R.h, { isStatic: true, angle: GEO.CORNER_R.angle, chamfer: { radius: 4 }, render: WOOD }));
  add(Bodies.rectangle(GEO.RAMP_B.x, GEO.RAMP_B.y, GEO.RAMP_B.w, GEO.RAMP_B.h, { isStatic: true, angle: GEO.RAMP_B.angle, chamfer: { radius: 5 }, render: WOOD }));
  add(Bodies.rectangle(GEO.CORNER_L.x, GEO.CORNER_L.y, GEO.CORNER_L.w, GEO.CORNER_L.h, { isStatic: true, angle: GEO.CORNER_L.angle, chamfer: { radius: 4 }, render: WOOD }));
  add(Bodies.rectangle(GEO.RAMP_C.x, GEO.RAMP_C.y, GEO.RAMP_C.w, GEO.RAMP_C.h, { isStatic: true, angle: GEO.RAMP_C.angle, chamfer: { radius: 5 }, render: WOOD }));

  return { relayBall };
}

module.exports = {
  id: "billiard",
  name: "玉突きリレー",
  build,
};
