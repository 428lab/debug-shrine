// パターン01「からくり水車とドミノ階段」(旧・装置v3)。
//
// 演出の流れ:
//   鈴が鳴り玉1が落下
//   → 斜面Aを右へ疾走、吊り絵馬をカランカランと揺らす
//   → 落下経路上の水車(回転バー)に必ず当たって回し、下へ抜ける
//   → 斜面Bを左へ長く転がり、左端から飛び出して
//     「ドミノ階段の最下段」の上半身に直撃
//   → ドミノが階段を左上へ上りながら連鎖
//   → 天辺のドミノが、左壁ぎわの台で待機中の玉2を突き落とす(リレー)
//   → 玉2は壁沿いの溝を落下 → 左下のウェッジで右向きに転向
//   → 斜面Cを右端まで転がって寝ている狐のおしりに直撃
//
// 設計の要・パラメータの根拠は各定数のコメントを参照(装置v3の
// チューニング履歴は PR #204 / Issue #199 に詳しい)。

const { FRAME, WOOD } = require("./frame.js");

const GEO = {
  // 斜面A(右下がりの長い坂)。玉1はここで加速しながら吊り絵馬をなぎ払う。
  RAMP_A: { x: 220, y: 262, w: 320, h: 12, angle: 0.24 },
  EMA: { xs: [270, 320, 370], w: 10, h: 36, hang: 58, density: 0.001 },

  // 回転バー。斜面Aから飛んだ玉1の落下経路上に水平で静止しており、
  // 玉が必ず当たって回す(静止角は決定論なので必中を座標で保証できる)。
  WHEEL: { x: 430, y: 360, arm: 80, thick: 14, density: 0.0018, frictionAir: 0.008 },

  // 斜面B(左下がり)。玉1を左へ長く運び、左端から飛び出して
  // 階段最下段のドミノの上半身に直撃させる。
  RAMP_B: { x: 315, y: 485, w: 310, h: 12, angle: -0.22 },

  // ドミノ階段(鏡像・浮き板)。右端(x0)が最下段で、左へ上る。
  // h=40 は儀式時間の掃引で失敗0を確認済みのマージン(h=36は13%停止)。
  STAIRS: { count: 5, x0: 152, runW: -22, topY0: 545, rise: 5, plateW: 22, plateH: 8 },
  DOMINO: { w: 7, h: 40, density: 0.005, friction: 0.05 },

  // リレーの玉2が待つ台(左壁ぎわ・水平)。
  RELAY_PERCH: { x: 38, y: 521, w: 24, h: 10, angle: 0 },
  // friction 0.001: 0.01だと斜面C途中のグリップで急失速しテンポが悪い。
  // 0だと台の上で眠れずリレーが崩壊する(詳細は装置v3のチューニング履歴)。
  BALL2: { x: 30, y: 505, friction: 0.001 },

  // 玉1の受け皿。最下段のドミノを倒し終えた玉1をキャッチして舞台に残す。
  CATCH: { x: 170, y: 566, w: 44, h: 8, lipH: 16 },

  // 左下のウェッジと斜面C(玉2を右端の狐まで運ぶ)
  CORNER: { x: 16, y: 580, w: 36, h: 10, angle: 0.55 },
  RAMP_C: { x: 237, y: 614, w: 430, h: 12, angle: 0.1 },
};

function build(Matter, { engine, world }) {
  const { World, Bodies, Body, Constraint, Events } = Matter;
  const add = (b) => World.add(world, b);

  // 斜面A
  add(Bodies.rectangle(GEO.RAMP_A.x, GEO.RAMP_A.y, GEO.RAMP_A.w, GEO.RAMP_A.h, { isStatic: true, angle: GEO.RAMP_A.angle, chamfer: { radius: 5 }, render: WOOD }));

  // 吊り絵馬(振り子)。玉1が通るとカランカランと揺れる。
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
      // 剛結(1)にしないと吊り下げのソフト拘束が微振動し続ける(#199)
      stiffness: 1,
      render: { strokeStyle: "#caa96a", lineWidth: 2 },
    }));
  }

  // 回転翼(自由回転の1本バー+短い縦スタブの浅い十字)。
  // ポケットを持たないので玉を抱え込めない(深い十字は抱えて止まる)。
  const wx = GEO.WHEEL.x;
  const wy = GEO.WHEEL.y;
  const wheel = Body.create({
    parts: [
      Bodies.rectangle(wx, wy, GEO.WHEEL.arm, GEO.WHEEL.thick, { chamfer: { radius: 6 }, render: { fillStyle: "#d9542e" } }),
      Bodies.rectangle(wx, wy, GEO.WHEEL.thick, 38, { chamfer: { radius: 6 }, render: { fillStyle: "#d9542e" } }),
    ],
    density: GEO.WHEEL.density,
    frictionAir: GEO.WHEEL.frictionAir,
    label: "wheel",
  });
  // スリープを許可する(眠り=完全静止)。玉が当たれば衝突で目を覚まして回る。
  add(wheel);
  add(Constraint.create({ pointA: { x: wx, y: wy }, bodyB: wheel, pointB: { x: 0, y: 0 }, length: 0, stiffness: 1, render: { visible: false } }));
  // 水車は左右対称でCOM=軸のため、自重は回転に寄与しない。重力を掛けたままだと
  // 軸ピンが毎ステップ重力と押し合い、拘束インパルスがスリープを妨げて
  // ロッキングが永久に続く(#199)。自重だけ打ち消して静止させる。
  Events.on(engine, "beforeUpdate", () => {
    if (!wheel.isSleeping) {
      wheel.force.y -= wheel.mass * engine.gravity.y * engine.gravity.scale;
    }
  });
  // 軸キャップは装飾。バーと重なっているので衝突を切る(#199)
  add(Bodies.circle(wx, wy, 6, { isStatic: true, collisionFilter: { mask: 0 }, render: { fillStyle: "#7a2a12" } }));

  // 斜面B
  add(Bodies.rectangle(GEO.RAMP_B.x, GEO.RAMP_B.y, GEO.RAMP_B.w, GEO.RAMP_B.h, { isStatic: true, angle: GEO.RAMP_B.angle, chamfer: { radius: 5 }, render: WOOD }));

  // ドミノ階段(鏡像・浮き板)。倒れる方向(左)へ 0.17rad 予め傾けて置き、
  // スリープで凍結する。起こされた瞬間には転倒閾値の8割まで傾いているため、
  // 弱い伝播でも連鎖が完走する。
  const st = GEO.STAIRS;
  const LEAN = -0.17;
  for (let i = 0; i < st.count; i++) {
    const cx = st.x0 + i * st.runW;
    const topY = st.topY0 - i * st.rise;
    add(Bodies.rectangle(cx, topY + st.plateH / 2, st.plateW, st.plateH, { isStatic: true, chamfer: { radius: 2 }, render: { fillStyle: i % 2 ? "#7a5230" : "#8a5a34" } }));
    const d = Bodies.rectangle(
      cx - (GEO.DOMINO.h / 2) * Math.sin(0.17),
      topY - (GEO.DOMINO.h / 2) * Math.cos(0.17) - 1,
      GEO.DOMINO.w,
      GEO.DOMINO.h,
      {
        angle: LEAN,
        density: GEO.DOMINO.density,
        friction: GEO.DOMINO.friction,
        restitution: 0,
        label: "domino",
        render: { fillStyle: "#e8ddc8" },
      }
    );
    Matter.Sleeping.set(d, true);
    add(d);
  }

  // リレーの玉2が待つ台(水平)
  add(Bodies.rectangle(GEO.RELAY_PERCH.x, GEO.RELAY_PERCH.y, GEO.RELAY_PERCH.w, GEO.RELAY_PERCH.h, { isStatic: true, angle: GEO.RELAY_PERCH.angle, chamfer: { radius: 3 }, render: WOOD }));
  const relayBall = Bodies.circle(GEO.BALL2.x, GEO.BALL2.y, FRAME.BALL.r, {
    density: FRAME.BALL.density,
    restitution: FRAME.BALL.restitution,
    friction: GEO.BALL2.friction,
    frictionAir: FRAME.BALL.frictionAir,
    label: "ball",
    render: { fillStyle: "#f2c14e" },
  });
  add(relayBall);

  // 玉1の受け皿(基部+左右の縁)
  add(Bodies.rectangle(GEO.CATCH.x, GEO.CATCH.y, GEO.CATCH.w, GEO.CATCH.h, { isStatic: true, chamfer: { radius: 3 }, render: WOOD }));
  add(Bodies.rectangle(GEO.CATCH.x - GEO.CATCH.w / 2 + 3, GEO.CATCH.y - GEO.CATCH.lipH / 2 - GEO.CATCH.h / 2, 6, GEO.CATCH.lipH, { isStatic: true, chamfer: { radius: 2 }, render: WOOD }));
  add(Bodies.rectangle(GEO.CATCH.x + GEO.CATCH.w / 2 - 3, GEO.CATCH.y - GEO.CATCH.lipH / 2 - GEO.CATCH.h / 2, 6, GEO.CATCH.lipH, { isStatic: true, chamfer: { radius: 2 }, render: WOOD }));

  // 左下のウェッジと斜面C
  add(Bodies.rectangle(GEO.CORNER.x, GEO.CORNER.y, GEO.CORNER.w, GEO.CORNER.h, { isStatic: true, angle: GEO.CORNER.angle, chamfer: { radius: 4 }, render: WOOD }));
  add(Bodies.rectangle(GEO.RAMP_C.x, GEO.RAMP_C.y, GEO.RAMP_C.w, GEO.RAMP_C.h, { isStatic: true, angle: GEO.RAMP_C.angle, chamfer: { radius: 5 }, render: WOOD }));

  return { relayBall };
}

module.exports = {
  id: "karakuri",
  name: "からくり水車とドミノ階段",
  build,
};
