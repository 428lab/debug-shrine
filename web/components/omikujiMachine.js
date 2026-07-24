// おみくじ演出のからくり装置(matter-js)の構築モジュール。
//
// 描画(Render)を含まない構築部分だけを切り出し、Node でもヘッドレスに
// 「連鎖が最後(狐のセンサー)まで完走するか」を検証できるようにする。
//
// #200 で装置を複数パターン化した:
// - 共通フレーム(外壁・鈴と鈴の緒・狐・ビン)は omikujiPatterns/frame.js
// - 中間のからくりは omikujiPatterns/ の各パターンモジュール
// - buildMachineWorld はパターン未指定なら毎回ランダムに選ぶ
//   (ヘッドレス検証は patternIndex を明示して決定論的に回す)

const { FRAME, buildFrame } = require("./omikujiPatterns/frame.js");
const { PATTERNS } = require("./omikujiPatterns/index.js");

// 後方互換: シーン・検証スクリプトは GEO のフレーム項目
// (W/H/BELL/BIN_COUNT/FIXED_DELTA/CAT_*)を参照する。
const GEO = FRAME;

// 装置一式を組む。Matter を引数に取るのは Node(require)とブラウザ(webpack
// import)の両対応のため。opts.patternIndex を省略するとランダムに選ぶ。
// 返り値の relayBall はシーン側のフォールバック(詰まった時にそっと突く)に
// 使う(リレー玉の無いパターンでは null)。
function buildMachineWorld(Matter, opts) {
  const { Engine } = Matter;
  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.scale = 0.001;
  const world = engine.world;

  const index =
    opts && typeof opts.patternIndex === "number"
      ? opts.patternIndex
      : Math.floor(Math.random() * PATTERNS.length);
  const pattern = PATTERNS[index];

  const { rope, tassel } = buildFrame(Matter, world);
  const { relayBall } = pattern.build(Matter, { engine, world });

  return { engine, world, rope, tassel, relayBall, pattern, patternIndex: index };
}

// ドミノ連鎖の確実始動(#199)。
// 事前傾斜+スリープ凍結のドミノでも、当たりが弱いと接触減衰で連鎖が
// 止まることが稀にある(実機はブラウザごとの浮動小数点差で掃引済み軌道から
// 僅かにずれる)。玉またはドミノに触られた立ち姿勢のドミノに、転倒方向(左)の
// 最低角速度を保証して連鎖を完走させる。ドミノを持たないパターンでは
// 何もしない(label が一致しないため)。
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
  const b = Matter.Bodies.circle(FRAME.BALL.spawnX, FRAME.BALL.spawnY, FRAME.BALL.r, {
    density: FRAME.BALL.density,
    restitution: FRAME.BALL.restitution,
    friction: FRAME.BALL.friction,
    frictionAir: FRAME.BALL.frictionAir,
    label: "ball",
    render: { fillStyle: "#f2c14e" },
  });
  b.sleepThreshold = Infinity; // 道中で眠って止まらないように(リレー玉はスリープ可)
  Matter.Body.setVelocity(b, { x: typeof vx === "number" ? vx : 0.2, y: 0 });
  Matter.World.add(world, b);
  return b;
}

module.exports = { GEO, PATTERNS, buildMachineWorld, spawnBall, installChainAssist };
