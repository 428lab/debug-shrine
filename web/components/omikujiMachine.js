// おみくじ演出のからくり装置(matter-js)の構築モジュール。
//
// 描画(Render)を含まない構築部分だけを切り出し、Node でもヘッドレスに
// 「連鎖が最後(狐のセンサー)まで完走するか」を検証できるようにする。
//
// 演出の流れ(装置 v3):
//   鈴の緒を振る → 鈴が鳴り玉1が落下
//   → 斜面Aを右へ疾走、吊り絵馬をカランカランと揺らす
//   → 右壁のディフレクタで水車のポケットへ確実に落ちる(必通過)
//   → 玉の重みで水車が回り、玉1を下へ運んで放す
//   → 斜面Bを左へ長く転がり、左端から飛び出して
//     「ドミノ階段の最下段」の上半身に直撃
//   → ドミノが階段を左上へ上りながら連鎖(上方向の動き)
//   → 天辺のドミノが、左壁ぎわの台で待機中の玉2を突き落とす(リレー)
//   → 玉2は壁沿いの溝を落下 → 左下のウェッジで右向きに転向
//   → 浮き板の階段の下をくぐり、斜面Cを右端まで転がって
//   → 寝ている狐のおしりに直撃 → 狐が起きてビンを飛び移る(DOM側)
//
// 設計の要:
// - 水車はディフレクタ経由で必ずポケットに玉が乗る(掠めるだけだった v2 の反省)。
// - ドミノ階段は鏡像(右が低く左へ上る)。玉1は左向きに飛ぶので、そのまま
//   最下段の「上半身」に直撃できる(根元に当てると倒れず滑る)。ドミノは
//   density 0.005 / friction 0.05 が伝播の当たりパラメータ(単体スイープで
//   弱・中・強の突きすべてで5枚完走を確認済み)。
// - 玉1は最初の1枚を倒すだけのリレー構造。倒れた札が玉を止める v2 の問題は
//   構造的に発生しない。
// - 玉2は固定位置から静止スタートするため、以降(溝→ウェッジ→斜面C→狐)は
//   毎回ほぼ同一軌道で決定的。
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

  BALL: { spawnX: 243, spawnY: 72, r: 11, density: 0.005, restitution: 0.2, friction: 0.01, frictionAir: 0.0008 },

  // 斜面A(右下がりの長い坂)。玉1はここで加速しながら吊り絵馬をなぎ払う。
  RAMP_A: { x: 220, y: 262, w: 320, h: 12, angle: 0.24 },
  EMA: { xs: [270, 320, 370], w: 10, h: 36, hang: 58, density: 0.001 },

  // 回転バー。斜面Aから飛んだ玉1の落下経路上に水平で静止しており、
  // 玉が必ず当たって回す(静止角は決定論なので必中を座標で保証できる)。
  // 十字のポケット形は玉を抱えて止まることがあるため1本バーにしてある。
  WHEEL: { x: 430, y: 360, arm: 80, thick: 14, density: 0.0018, frictionAir: 0.008 },

  // 斜面B(左下がり)。玉1を左へ長く運び、左端から飛び出して
  // 階段最下段のドミノの上半身に直撃させる。
  RAMP_B: { x: 315, y: 485, w: 310, h: 12, angle: -0.22 },

  // ドミノ階段(鏡像・浮き板)。右端(x0)が最下段で、左へ上る。
  // 板を浮かせるのは、下の空間をリレー後の玉2の通り道にするため。
  STAIRS: { count: 5, x0: 152, runW: -22, topY0: 545, rise: 5, plateW: 22, plateH: 8 },
  // h はドミノ連鎖の成否マージンを決める。装置は絵馬・水車の拘束が常に
  // 微振動しており、儀式の長さ(=玉1投入までの経過ステップ数)によって連鎖の
  // 初期状態が毎回僅かに変わる。h=36 は上り階段の連鎖がぎりぎりで、儀式時間の
  // 掃引(0〜10秒×61点)で13%が途中停止した。h=40 なら同掃引121点で失敗0
  // (倒れたドミノが次の段へ届く余裕が増える)。
  DOMINO: { w: 7, h: 40, density: 0.005, friction: 0.05 },

  // リレーの玉2が待つ台(左壁ぎわ・水平)。スリープ(enableSleeping)により
  // 静止中の玉2はジッターで動かず、天辺のドミノに押されて目覚めた時だけ
  // 左端から壁沿いの溝へ転がり落ちる。
  RELAY_PERCH: { x: 38, y: 521, w: 24, h: 10, angle: 0 },
  // friction はあえて玉1(0.01)より低くする。0.01だと緩い斜面Cの途中で
  // 摩擦がスピンをかけ「滑り→転がり」に転換した瞬間、並進速度が回転に
  // 食われて速度2.5→0.8に急失速し、以降4秒近くノロノロ進んでテンポが
  // 悪かった(グリップ地点は決定論なので毎回同じ場所で失速する)。
  // 0.001ならグリップが斜面の終端より先に来ず、加速したまま狐へ届く
  // (0だと台の上でジッターを保持できず眠れなくなり、ドミノを待たずに
  // 滑り落ちてリレーが崩壊するためNG。Node実測: 鈴→狐 12.2s → 6.9s)。
  BALL2: { x: 30, y: 505, friction: 0.001 },

  // 玉1の受け皿。最下段のドミノを倒し終えた玉1をキャッチして舞台に残す
  // (玉1が下へ抜けて先に狐へ届いてしまうとリレーの意味が無くなる)。
  CATCH: { x: 170, y: 566, w: 44, h: 8, lipH: 16 },

  // 左下のウェッジ。溝を落ちてきた玉2を右向きへ転向して斜面Cへ送る。
  CORNER: { x: 16, y: 580, w: 36, h: 10, angle: 0.55 },
  // 斜面C(右下がりの長い坂)。玉2を右端の狐まで運ぶ。
  RAMP_C: { x: 237, y: 614, w: 430, h: 12, angle: 0.1 },

  // 狐の寝床(斜面Cの終端)。玉2が寝ている狐のおしりに直撃する。
  FOX_PLATFORM: { x: 452, y: 644, w: 56, h: 10 },
  FOX_SENSOR: { x: 443, y: 614, w: 64, h: 44 },

  BIN_TOP: 648,
  FLOOR_Y: 744,
};

// 装置一式を組む。Matter を引数に取るのは Node(require)とブラウザ(webpack
// import)の両対応のため。返り値の relayBall(玉2)はシーン側のフォールバック
// (詰まった時にそっと突く)に使う。
function buildMachineWorld(Matter) {
  const { Engine, World, Bodies, Body, Composites, Composite, Constraint, Events } = Matter;
  const engine = Engine.create({ enableSleeping: true });
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

  // 鈴(飾り。玉1はここから落ちる)
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
  // 拘束は stiffness 1(剛結)にする。1未満のソフト拘束は重力との釣り合いで
  // 残留速度が乗り続け、スリープできずに永久に微振動する(#199)。
  Composites.chain(rope, 0, 0.5, 0, -0.5, { stiffness: 1, length: 0, render: { strokeStyle: "#b23a48", lineWidth: 3 } });
  Composite.add(
    rope,
    Constraint.create({
      pointA: { x: GEO.BELL.x, y: ropeTopY },
      bodyB: rope.bodies[0],
      pointB: { x: 0, y: -GEO.ROPE.segH / 2 },
      stiffness: 1,
      length: 0,
      render: { strokeStyle: "#b23a48", lineWidth: 3 },
    })
  );
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
      stiffness: 1,
      length: 0,
      render: { strokeStyle: "#b23a48", lineWidth: 3 },
    })
  );
  add(rope);

  // 斜面A
  add(Bodies.rectangle(GEO.RAMP_A.x, GEO.RAMP_A.y, GEO.RAMP_A.w, GEO.RAMP_A.h, { isStatic: true, angle: GEO.RAMP_A.angle, chamfer: { radius: 5 }, render: wood }));

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
      // 剛結(1)にしないと吊り下げのソフト拘束が微振動し続け、絵馬が
      // 玉の通過前から震えてスリープもできない(#199)
      stiffness: 1,
      render: { strokeStyle: "#caa96a", lineWidth: 2 },
    }));
  }

  // 回転翼(自由回転の1本バー)。玉1が当たると回って玉を下へ流す。
  // 十字(ポケットあり)は玉を抱えたまま釣り合って止まることがあるため、
  // ポケットを持たない1本バーにして「必ず当たり、必ず通す」を両立する。
  const wx = GEO.WHEEL.x;
  const wy = GEO.WHEEL.y;
  // 横長バー+短い縦スタブの浅い十字。縦方向の迎え面を広げつつ、
  // ポケットが浅いので玉を抱え込めない(深い十字は抱えて止まる)。
  const wheel = Body.create({
    parts: [
      Bodies.rectangle(wx, wy, GEO.WHEEL.arm, GEO.WHEEL.thick, { chamfer: { radius: 6 }, render: { fillStyle: "#d9542e" } }),
      Bodies.rectangle(wx, wy, GEO.WHEEL.thick, 38, { chamfer: { radius: 6 }, render: { fillStyle: "#d9542e" } }),
    ],
    density: GEO.WHEEL.density,
    frictionAir: GEO.WHEEL.frictionAir,
    label: "wheel",
  });
  // スリープを許可する(眠り=完全静止)。眠らせないと軸まわりの解の
  // ノイズで常時±0.08rad前後ロッキングし続け、目に見えて震える(#199)。
  // 玉が当たれば衝突で目を覚まして回る(ドミノと同じ仕組み)。玉は1回の
  // 演出で1個しか通らないので、通過後にどの角度で眠っても支障はない。
  add(wheel);
  // 軸ピンも剛結(1)。0.9 だと軸が重力でたわみ、水車が常時±0.1rad
  // 前後で揺れ続ける(#199)
  add(Constraint.create({ pointA: { x: wx, y: wy }, bodyB: wheel, pointB: { x: 0, y: 0 }, length: 0, stiffness: 1, render: { visible: false } }));
  // 水車は左右対称でCOM=軸のため、自重は回転に寄与しない。それでも重力を
  // 掛けたままだと軸ピンが毎ステップ重力と押し合い、その拘束インパルスが
  // スリープを妨げて±0.08radのロッキングが永久に続く(#199)。自重だけ
  // 打ち消して静止→スリープさせる(玉の重みは玉自身の重力で伝わるので、
  // 「玉が乗ると回る」演出は変わらない)。
  Events.on(engine, "beforeUpdate", () => {
    if (!wheel.isSleeping) {
      wheel.force.y -= wheel.mass * engine.gravity.y * engine.gravity.scale;
    }
  });
  // 軸キャップは装飾。バーと重なっているので衝突を切らないと毎ステップ
  // 押し出し解決が走り、水車が永久にロッキングして眠れない(#199)
  add(Bodies.circle(wx, wy, 6, { isStatic: true, collisionFilter: { mask: 0 }, render: { fillStyle: "#7a2a12" } }));

  // 斜面B
  add(Bodies.rectangle(GEO.RAMP_B.x, GEO.RAMP_B.y, GEO.RAMP_B.w, GEO.RAMP_B.h, { isStatic: true, angle: GEO.RAMP_B.angle, chamfer: { radius: 5 }, render: wood }));

  // ドミノ階段(鏡像・浮き板)。右端が最下段で、左へ上る。
  // 各ドミノは倒れる方向(左)へ 0.15rad 予め傾けて置き、スリープで凍結する。
  // 触られるまで完全静止(儀式中の自壊・ずり落ちゼロ)、起こされた瞬間には
  // 転倒閾値(atan(w/h)≈0.19)の8割まで傾いているため、弱い伝播でも連鎖が
  // 完走する(垂直立てだと matter の接触減衰で3枚前後で止まる)。
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
  add(Bodies.rectangle(GEO.RELAY_PERCH.x, GEO.RELAY_PERCH.y, GEO.RELAY_PERCH.w, GEO.RELAY_PERCH.h, { isStatic: true, angle: GEO.RELAY_PERCH.angle, chamfer: { radius: 3 }, render: wood }));
  const relayBall = Bodies.circle(GEO.BALL2.x, GEO.BALL2.y, GEO.BALL.r, {
    density: GEO.BALL.density,
    restitution: GEO.BALL.restitution,
    friction: GEO.BALL2.friction,
    frictionAir: GEO.BALL.frictionAir,
    label: "ball",
    render: { fillStyle: "#f2c14e" },
  });
  add(relayBall);

  // 玉1の受け皿(基部+左右の縁)
  add(Bodies.rectangle(GEO.CATCH.x, GEO.CATCH.y, GEO.CATCH.w, GEO.CATCH.h, { isStatic: true, chamfer: { radius: 3 }, render: wood }));
  add(Bodies.rectangle(GEO.CATCH.x - GEO.CATCH.w / 2 + 3, GEO.CATCH.y - GEO.CATCH.lipH / 2 - GEO.CATCH.h / 2, 6, GEO.CATCH.lipH, { isStatic: true, chamfer: { radius: 2 }, render: wood }));
  add(Bodies.rectangle(GEO.CATCH.x + GEO.CATCH.w / 2 - 3, GEO.CATCH.y - GEO.CATCH.lipH / 2 - GEO.CATCH.h / 2, 6, GEO.CATCH.lipH, { isStatic: true, chamfer: { radius: 2 }, render: wood }));

  // 左下のウェッジと斜面C
  add(Bodies.rectangle(GEO.CORNER.x, GEO.CORNER.y, GEO.CORNER.w, GEO.CORNER.h, { isStatic: true, angle: GEO.CORNER.angle, chamfer: { radius: 4 }, render: wood }));
  add(Bodies.rectangle(GEO.RAMP_C.x, GEO.RAMP_C.y, GEO.RAMP_C.w, GEO.RAMP_C.h, { isStatic: true, angle: GEO.RAMP_C.angle, chamfer: { radius: 5 }, render: wood }));

  // 狐の寝床(台)と、おしりの当たり判定(玉2が直撃したら wake)
  add(Bodies.rectangle(GEO.FOX_PLATFORM.x, GEO.FOX_PLATFORM.y, GEO.FOX_PLATFORM.w, GEO.FOX_PLATFORM.h, { isStatic: true, chamfer: { radius: 4 }, render: wood }));
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

  return { engine, world, rope, tassel, relayBall };
}

// ドミノ連鎖の確実始動(#199)。
// 事前傾斜+スリープ凍結のドミノでも、当たりが弱いと接触減衰で連鎖が
// 止まることが稀にある(実機はブラウザごとの浮動小数点差で掃引済み軌道から
// 僅かにずれる)。玉またはドミノに触られた立ち姿勢のドミノに、転倒方向(左)の
// 最低角速度を保証して連鎖を完走させる。すでに転倒閾値の8割まで傾いている
// ため、後押しは僅かで見た目は自然なまま。
const CHAIN_ASSIST = {
  MIN_TIP_ANGULAR_VELOCITY: -0.02,
  STANDING_ANGLE: -0.6, // これより起きていれば「まだ立っている」
};
function installChainAssist(Matter, engine) {
  Matter.Events.on(engine, "collisionStart", (e) => {
    for (const p of e.pairs) {
      for (const [self, other] of [[p.bodyA, p.bodyB], [p.bodyB, p.bodyA]]) {
        if (self.label !== "domino") continue;
        if (other.label !== "ball" && other.label !== "domino") continue;
        if (self.angle < CHAIN_ASSIST.STANDING_ANGLE) continue; // 倒れ済みは触らない
        Matter.Sleeping.set(self, false);
        if (self.angularVelocity > CHAIN_ASSIST.MIN_TIP_ANGULAR_VELOCITY) {
          Matter.Body.setAngularVelocity(self, CHAIN_ASSIST.MIN_TIP_ANGULAR_VELOCITY);
        }
      }
    }
  });
}

// 御神玉(玉1)を生成して投入する(鈴が鳴った時に呼ぶ)。
function spawnBall(Matter, world, vx) {
  const b = Matter.Bodies.circle(GEO.BALL.spawnX, GEO.BALL.spawnY, GEO.BALL.r, {
    density: GEO.BALL.density,
    restitution: GEO.BALL.restitution,
    friction: GEO.BALL.friction,
    frictionAir: GEO.BALL.frictionAir,
    label: "ball",
    render: { fillStyle: "#f2c14e" },
  });
  b.sleepThreshold = Infinity; // 道中で眠って止まらないように(玉2はスリープ可)
  Matter.Body.setVelocity(b, { x: typeof vx === "number" ? vx : 0.2, y: 0 });
  Matter.World.add(world, b);
  return b;
}

module.exports = { GEO, buildMachineWorld, spawnBall, installChainAssist };
