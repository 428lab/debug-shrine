// パターン「吊り橋の関所と二周目の道」。
//
// 演出の流れ:
//   鈴が鳴り玉A(大)が落下、本道(左下りの長い坂)を左へ走る
//   → 風鈴を鳴らし、道の途中の「関所」= 吊り橋へ。重い玉Aが乗ると
//     橋板が深く沈み、弱い側の紐が傾いて Aは下の縦穴へ滑り落ちる
//     (荷重が抜けた橋は紐の張力で自然に閉じ直る)
//   → Aはカタパルトの左腕パドルに直撃。右腕の端のカップにいた小玉Bが
//     大きく宙を舞う(Aは錘としてパドルのポケットに残る)
//   → Bは放物線を描いて本道の右半分に着地し、「二周目」として左へ走る
//   → 同じ風鈴をもう一度鳴らし、閉じ直った吊り橋を(軽いので)渡り切る
//   → 道の左端から落下し、赤十字スピナーとピンのピンボールゾーンを
//     跳ねながら抜けて、最下段の長い坂を右端まで疾走
//   → 寝ている狐のおしりに直撃
//
// 設計の要:
// - 吊り橋は紐2本のソフト拘束。沈下量は載った玉の重さに比例するため、
//   「重い玉は落ち、軽い玉は渡る」を機械だけで実現する(回転暴走しない)。
// - カタパルトは打ち上げ方向が自然に左上へドリフトするため、左下りの
//   本道なら着地点が右半分のどこであっても左へ転がって二周目が成立する
//   (着地精度に頑健)。
// - 射出は「カップ搭乗拘束」方式: Aの着弾で腕が数ステップで最高速に達し
//   接触では力が伝わらないため、Bを一時拘束で腕に乗せ、規定角で解放する。
//   解放時に最低速度を保証する(chainAssist と同じ「最低保証」の思想)。

const { FRAME, WOOD } = require("./frame.js");

const GEO = {
  // 本道(左下り)。関所の穴(gapL..gapR)を挟んで2枚に分割。
  ROAD: { angle: -0.17, h: 12, leftEnd: 88, gapL: 105, gapR: 165, rightEnd: 300, yAt: (x) => 250 - Math.tan(0.17) * (x - 275) },
  // 風鈴(Bの飛翔経路の空中に吊るす。一周目のAは触れず、
  // 二周目のBだけが宙で鳴らしていく)
  CHIME: { pivots: [ { x: 332, y: 55 }, { x: 370, y: 70 } ], w: 8, h: 26, hang: 88, density: 0.0004 },
  // 縦穴のガイド壁(橋から落ちたAをカタパルトのパドルへ導く)
  SHAFT: { leftX: 96, leftTopY: 316, rightX: 172, rightTopY: 306, bottomY: 470 },
  // カタパルト(長腕非対称型): 左腕パドルにAが直撃し、右腕端のカップから
  // 小玉Bが打ち上がる。releaseAngle は回転角(負方向)の解放しきい値。
  CATAPULT: { px: 250, py: 512, xL: 98, xR: 462, armH: 5, armDensity: 0.0003, paddleW: 40, cupX: 452, stopR: { x: 446, y: 530 }, catchBar: { x: 155, y: 560, w: 90 }, releaseAngle: 0.2, launchPos: { x: 444, y: 453 }, launchVx: -4.6, launchVy: -13.2, frictionAir: 0.002 },
  // 小玉B(玉Aより小さく・軽い。軽さが打ち上げ高度と関所通過の両方を稼ぐ)
  BALL_B: { x: 452, y: 492.5, r: 7.5, density: 0.0015, friction: 0.001, frictionAir: 0.0008 },
  // ピンボールゾーン(道の左端の先の落下路): 赤十字スピナー+ピン(木釘)。
  // どこへ跳ねても下の大坂に落ち、右端の狐へ収束する。
  CORNER_L: { x: 16, y: 330, w: 40, angle: 0.55 },
  SPINNER: { x: 58, y: 348, arm: 50, thick: 12, density: 0.0018, frictionAir: 0.008 },
  PINS: [ { x: 34, y: 432 }, { x: 60, y: 472 }, { x: 36, y: 510 } ],
  // 大坂(最下段)。ピンボールを抜けた玉を右端の狐まで運ぶ。
  RAMP_C: { x: 230, y: 610, w: 464, h: 12, angle: 0.14 },
};

function build(Matter, { engine, world }) {
  const { World, Bodies, Body, Constraint, Events, Sleeping, Composite } = Matter;
  const add = (b) => World.add(world, b);
  const roadY = GEO.ROAD.yAt;

  // 本道2枚(関所の穴を挟む)
  const seg = (x0, x1) => {
    const cx = (x0 + x1) / 2;
    // friction 0.001: 玉の摩擦グリップによる失速(装置v3の斜面C最適化と同じ)を防ぐ
    return Bodies.rectangle(cx, roadY(cx), x1 - x0, GEO.ROAD.h, { isStatic: true, friction: 0.001, angle: GEO.ROAD.angle, chamfer: { radius: 5 }, render: WOOD });
  };
  add(seg(GEO.ROAD.leftEnd, GEO.ROAD.gapL));
  add(seg(GEO.ROAD.gapR, GEO.ROAD.rightEnd));

  // 風鈴(剛結ロッドの振り子 #199)。Bの飛翔経路の空中に吊るす。
  for (const pv of GEO.CHIME.pivots) {
    const x = pv.x;
    const pivotY = pv.y;
    const cy = pivotY + GEO.CHIME.hang + GEO.CHIME.h / 2;
    const bellPlate = Bodies.rectangle(x, cy, GEO.CHIME.w, GEO.CHIME.h, {
      density: GEO.CHIME.density,
      frictionAir: 0.02,
      label: "ema",
      chamfer: { radius: 3 },
      render: { fillStyle: "#e8ddc8" },
    });
    add(bellPlate);
    add(Constraint.create({
      pointA: { x, y: pivotY },
      bodyB: bellPlate,
      pointB: { x: 0, y: -GEO.CHIME.h / 2 },
      length: GEO.CHIME.hang,
      stiffness: 1,
      render: { strokeStyle: "#caa96a", lineWidth: 2 },
    }));
    // 吊り拘束はファントム速度が乗り続けて自然にはスリープできず、
    // 微振動の位相が玉Bの貫通時の偏向を儀式時間依存にしてしまう。
    // ドミノと同じく建設時に凍結する(Bが触れた瞬間に目覚めて揺れる)。
    Sleeping.set(bellPlate, true);
  }

  // 関所 = 跳ね戸。最初の玉(A)が乗ると右端のヒンジで下へ開き、玉を
  // 縦穴へ落として閉じ直す。一度使われた後は二度と開かないため、
  // 二周目の玉Bは完全に静的で面一の戸を渡る(たわみ・段差が構造的に無い)。
  // 狐のホップと同じ「演出制御のアクター」方式: 戸は static ボディで、
  // 開閉は setAngle/setPosition のアニメーション。物理係の吊り橋は
  // ソフト拘束の微振動が儀式時間依存の挙動を生むため採用しない。
  const doorW = GEO.ROAD.gapR - GEO.ROAD.gapL + 4;
  const doorCx = (GEO.ROAD.gapL + GEO.ROAD.gapR) / 2;
  const hinge = { x: GEO.ROAD.gapR - 2, y: roadY(GEO.ROAD.gapR - 2) };
  const doorRest = { x: doorCx, y: roadY(doorCx), angle: GEO.ROAD.angle };
  const door = Bodies.rectangle(doorRest.x, doorRest.y, doorW, GEO.ROAD.h - 2, {
    isStatic: true,
    friction: 0.001,
    angle: doorRest.angle,
    chamfer: { radius: 3 },
    label: "bridge",
    render: { fillStyle: "#c9803f" },
  });
  add(door);
  const DOOR_OPEN_ANGLE = 1.15; // ヒンジ回りに下へ開く量
  let doorUsed = false;
  let doorPhase = "closed"; // closed | opening | open | closing | sealed
  let doorTimer = 0;
  const setDoorAngle = (delta) => {
    // ヒンジ(右端)回りの回転として位置と角度を同時に与える
    const cos = Math.cos(delta);
    const sin = Math.sin(delta);
    const dx = doorRest.x - hinge.x;
    const dy = doorRest.y - hinge.y;
    Body.setPosition(door, { x: hinge.x + dx * cos - dy * sin, y: hinge.y + dx * sin + dy * cos });
    Body.setAngle(door, doorRest.angle + delta);
  };
  Events.on(engine, "afterUpdate", () => {
    if (doorPhase === "closed" && !doorUsed) {
      // 戸の上に玉が乗ったら開く
      const balls = Composite.allBodies(world).filter((b) => b.label === "ball");
      for (const b of balls) {
        if (b.position.x > GEO.ROAD.gapL + 6 && b.position.x < GEO.ROAD.gapR - 4 && Math.abs(b.position.y - (roadY(b.position.x) - GEO.ROAD.h / 2 - 10)) < 14) {
          doorUsed = true;
          doorPhase = "opening";
          doorTimer = 0;
          break;
        }
      }
    } else if (doorPhase === "opening") {
      doorTimer++;
      setDoorAngle(DOOR_OPEN_ANGLE * Math.min(1, doorTimer / 14));
      if (doorTimer >= 14) { doorPhase = "open"; doorTimer = 0; }
    } else if (doorPhase === "open") {
      doorTimer++;
      if (doorTimer >= 50) { doorPhase = "closing"; doorTimer = 0; }
    } else if (doorPhase === "closing") {
      doorTimer++;
      setDoorAngle(DOOR_OPEN_ANGLE * Math.max(0, 1 - doorTimer / 20));
      if (doorTimer >= 20) { doorPhase = "sealed"; }
    }
  });

  // 縦穴ガイド壁
  add(Bodies.rectangle(GEO.SHAFT.leftX, (GEO.SHAFT.leftTopY + GEO.SHAFT.bottomY) / 2, 10, GEO.SHAFT.bottomY - GEO.SHAFT.leftTopY, { isStatic: true, chamfer: { radius: 4 }, render: WOOD }));
  add(Bodies.rectangle(GEO.SHAFT.rightX, (GEO.SHAFT.rightTopY + GEO.SHAFT.bottomY) / 2, 10, GEO.SHAFT.bottomY - GEO.SHAFT.rightTopY, { isStatic: true, chamfer: { radius: 4 }, render: WOOD }));

  // カタパルト(長腕非対称型・左腕パドル/右腕カップ)
  const cp = GEO.CATAPULT;
  const armW = cp.xR - cp.xL;
  const armCx = (cp.xL + cp.xR) / 2;
  const paddleCx = cp.xL + cp.paddleW / 2 + 2;
  const catapult = Body.create({
    parts: [
      // 長腕(軽くして慣性を抑え、Bへの速度伝達を最大化する)
      Bodies.rectangle(armCx, cp.py, armW, cp.armH, { density: cp.armDensity, chamfer: { radius: 3 }, render: { fillStyle: "#b06a2e" } }),
      // 左腕パドル(Aの着弾面+ポケット縁。Aは錘としてここに残る)
      Bodies.rectangle(paddleCx, cp.py - 2, cp.paddleW, cp.armH + 6, { density: 0.001, chamfer: { radius: 3 }, render: { fillStyle: "#d9542e" } }),
      Bodies.rectangle(paddleCx - cp.paddleW / 2 + 2, cp.py - 12, 5, 20, { density: 0.0005, chamfer: { radius: 2 }, render: { fillStyle: "#d9542e" } }),
      Bodies.rectangle(paddleCx + cp.paddleW / 2 - 2, cp.py - 14, 5, 24, { density: 0.0005, chamfer: { radius: 2 }, render: { fillStyle: "#d9542e" } }),
      // カップ縁は置かない: 保持は搭乗拘束が担い、縁があると解放後に
      // 振り続ける腕の縁がBに追突して打ち上げを殺す
    ],
    frictionAir: cp.frictionAir,
    label: "catapult",
  });
  Body.rotate(catapult, -0.04, { x: cp.px, y: cp.py }); // 右(カップ側)をわずかに下げて待機
  const restAngle = catapult.angle; // releaseAngle はここからの回転量で数える
  add(catapult);
  add(Constraint.create({ pointA: { x: cp.px, y: cp.py }, bodyB: catapult, pointB: { x: cp.px - catapult.position.x, y: cp.py - catapult.position.y }, length: 0, stiffness: 1, render: { visible: false } }));
  // 待機位置の支え(右)と、振り下ろした左腕を受け止めるキャッチバー。
  // 腕がバーに当たって急停止した勢いも射出に使われる。
  add(Bodies.circle(cp.stopR.x, cp.stopR.y, 5, { isStatic: true, render: { fillStyle: "#5a4228" } }));
  add(Bodies.rectangle(cp.catchBar.x, cp.catchBar.y, cp.catchBar.w, 10, { isStatic: true, chamfer: { radius: 4 }, render: WOOD }));

  // 小玉B(カップで眠って待つ)
  const ballB = Bodies.circle(GEO.BALL_B.x, GEO.BALL_B.y, GEO.BALL_B.r, {
    density: GEO.BALL_B.density,
    friction: GEO.BALL_B.friction,
    frictionAir: GEO.BALL_B.frictionAir,
    restitution: 0.25,
    label: "ball",
    render: { fillStyle: "#ffd97a" },
  });
  // 旅の途中(ピンボールや大坂)で眠って止まらないように。待機中の
  // 静止は下の Sleeping.set(ballB, true) の強制スリープが担う
  ballB.sleepThreshold = Infinity;
  add(ballB);

  // カップ搭乗拘束: Aが腕に着弾した瞬間、Bをカップ位置に一時拘束して
  // 腕と一緒に振り上げ、releaseAngle で解放して接線速度で射出する。
  // (腕は衝突で数ステップのうちに最高速へ達するため、接触だけでは
  //  Bに力が伝わる前にカップが動ききってしまう)
  let carryCord = null;
  let carried = false;
  Events.on(engine, "collisionStart", (e) => {
    if (carried) return;
    for (const pr of e.pairs) {
      for (const [self, other] of [[pr.bodyA, pr.bodyB], [pr.bodyB, pr.bodyA]]) {
        if ((self.parent || self) !== catapult) continue;
        if (other.label !== "ball" || other === ballB) continue;
        carried = true;
        Sleeping.set(ballB, false);
        const cos = Math.cos(catapult.angle);
        const sin = Math.sin(catapult.angle);
        const lx = ballB.position.x - catapult.position.x;
        const ly = ballB.position.y - catapult.position.y;
        carryCord = Constraint.create({
          bodyA: catapult,
          pointA: { x: lx * cos + ly * sin, y: -lx * sin + ly * cos },
          bodyB: ballB,
          pointB: { x: 0, y: 0 },
          length: 0,
          stiffness: 0.9,
          render: { visible: false },
        });
        World.add(world, carryCord);
        return;
      }
    }
  });
  Events.on(engine, "afterUpdate", () => {
    if (carryCord && catapult.angle < restAngle - GEO.CATAPULT.releaseAngle) {
      World.remove(world, carryCord);
      carryCord = null;
      // 射出正規化: 打ち上げベクトルを規定値に揃える。腕の回転はステップ
      // 単位でしか観測できず解放方向が±0.05radぶれるため、速さだけでなく
      // 方向も固定して放物線を毎回同じにする(chainAssist と同じ「保証」の
      // 思想。腕の振り・玉の持ち上げの見た目は物理のまま)
      Matter.Body.setPosition(ballB, GEO.CATAPULT.launchPos);
      Matter.Body.setVelocity(ballB, { x: GEO.CATAPULT.launchVx, y: GEO.CATAPULT.launchVy });
      Matter.Body.setAngularVelocity(ballB, 0); // スピンも消して着地挙動を毎回同一にする
    }
  });

  // 左壁ウェッジ: 道の左端から落ちた玉をスピナーへ寄せる
  add(Bodies.rectangle(GEO.CORNER_L.x, GEO.CORNER_L.y, GEO.CORNER_L.w, 10, { isStatic: true, angle: GEO.CORNER_L.angle, chamfer: { radius: 4 }, render: WOOD }));

  // ピンボールゾーン: 赤十字スピナー(パターン01の水車と同じ作り)+ピン
  const wx = GEO.SPINNER.x;
  const wy = GEO.SPINNER.y;
  const spinner = Body.create({
    parts: [
      Bodies.rectangle(wx, wy, GEO.SPINNER.arm, GEO.SPINNER.thick, { chamfer: { radius: 6 }, render: { fillStyle: "#d9542e" } }),
      Bodies.rectangle(wx, wy, GEO.SPINNER.thick, GEO.SPINNER.arm, { chamfer: { radius: 6 }, render: { fillStyle: "#d9542e" } }),
    ],
    density: GEO.SPINNER.density,
    frictionAir: GEO.SPINNER.frictionAir,
    label: "wheel",
  });
  add(spinner);
  add(Constraint.create({ pointA: { x: wx, y: wy }, bodyB: spinner, pointB: { x: 0, y: 0 }, length: 0, stiffness: 1, render: { visible: false } }));
  Events.on(engine, "beforeUpdate", () => {
    if (!spinner.isSleeping) {
      spinner.force.y -= spinner.mass * engine.gravity.y * engine.gravity.scale;
    }
  });
  add(Bodies.circle(wx, wy, 6, { isStatic: true, collisionFilter: { mask: 0 }, render: { fillStyle: "#7a2a12" } }));
  for (const pin of GEO.PINS) {
    add(Bodies.circle(pin.x, pin.y, 6, { isStatic: true, restitution: 0.9, render: { fillStyle: "#8a6a3a" } }));
  }

  // 大坂(最下段)
  // friction 0.001: 浅い勾配での転がりグリップ失速を防ぐ(装置v3の知見)
  add(Bodies.rectangle(GEO.RAMP_C.x, GEO.RAMP_C.y, GEO.RAMP_C.w, GEO.RAMP_C.h, { isStatic: true, friction: 0.001, angle: GEO.RAMP_C.angle, chamfer: { radius: 5 }, render: WOOD }));

  // カタパルト・Bは触られるまで完全静止(儀式中の自壊ゼロ)。
  // 吊り橋は紐の張力で保持されるためスリープ不要(すぐ静止する)。
  Sleeping.set(catapult, true);
  Sleeping.set(ballB, true);

  return { relayBall: ballB };
}

module.exports = {
  id: "sekisho",
  name: "吊り橋の関所と二周目の道",
  build,
  // 検証スクリプトからのパラメータ調整用
  GEO,
};
