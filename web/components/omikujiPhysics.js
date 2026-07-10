// おみくじ抽選演出の物理ロジック(matter-js)。
//
// 描画(Render)を含まない純粋な物理部分だけをここに切り出し、ブラウザと Node の
// 両方で動くようにする(Node でヘッドレスに「着地の正しさ・全ビン到達性」を検証できる)。
//
// 設計の要:結果(レア度 tier)はサーバーが決める。この演出は「サーバーが決めた tier の
// ビンへ必ず着地させる」ため、決定論的プリシミュレーションで初期条件→着地ビンの対応表を
// 作り、本番はその初期条件で再生する(同一初期条件→同一軌道)。詳細は
// docs/backend.md / plan を参照。
//
// matter-js は乱数非依存で、固定タイムステップ(delta 一定・correction=1)なら決定論的。
// 物理パラメータはすべてここでハードコード固定する(端末差・非決定を排除)。

const Matter = require("matter-js");

// ---- 盤面の論理座標(固定)。描画時は CSS でスケールするが物理は常にこの寸法で回す ----
const GEO = {
  W: 480,
  H: 760,
  BIN_COUNT: 7,

  // 釘(千鳥格子)
  PEG_ROWS: 10,
  PEG_R: 6,
  PEG_TOP: 170, // 最初の釘行の y
  PEG_PITCH_Y: 46,
  PEG_PITCH_X: 60,
  PEG_MARGIN_X: 45, // 左右端から最初の釘までの余白

  // ボール
  BALL_R: 9,

  // 投入
  DROP_Y: 120,

  // ビン(底部)
  BIN_TOP: 640, // 仕切り板の上端
  FLOOR_Y: 748, // 底
  DIVIDER_W: 6,

  // 物理
  GRAVITY_Y: 1,
  GRAVITY_SCALE: 0.001,
  BALL_RESTITUTION: 0.35,
  BALL_FRICTION: 0.02,
  BALL_FRICTION_AIR: 0.008,
  PEG_RESTITUTION: 0.5,

  // シミュレーション
  FIXED_DELTA: 1000 / 60,
  MAX_STEPS: 1500, // 10〜15秒演出+余裕(≒25秒相当)まで許容
};

function binWidth() {
  return GEO.W / GEO.BIN_COUNT;
}

// ビン i の中心 x。
function binCenterX(i) {
  return (i + 0.5) * binWidth();
}

// x 座標から最も近いビン index(着地センサ未検出時のフォールバック)。
function binIndexByX(x) {
  let i = Math.floor(x / binWidth());
  if (i < 0) i = 0;
  if (i >= GEO.BIN_COUNT) i = GEO.BIN_COUNT - 1;
  return i;
}

// 盤面(釘・外壁・ビン仕切り・ビンセンサ・床)を組む純関数。
// プリシムと本番再生で同じものを使う。
function buildWorld() {
  const engine = Matter.Engine.create();
  engine.gravity.y = GEO.GRAVITY_Y;
  engine.gravity.scale = GEO.GRAVITY_SCALE;
  const world = engine.world;

  const bodies = [];

  // 釘(千鳥格子)。行ごとに半ピッチずらす。
  for (let r = 0; r < GEO.PEG_ROWS; r++) {
    const offset = (r % 2) * (GEO.PEG_PITCH_X / 2);
    const y = GEO.PEG_TOP + r * GEO.PEG_PITCH_Y;
    for (let x = GEO.PEG_MARGIN_X + offset; x <= GEO.W - GEO.PEG_MARGIN_X; x += GEO.PEG_PITCH_X) {
      bodies.push(
        Matter.Bodies.circle(x, y, GEO.PEG_R, {
          isStatic: true,
          restitution: GEO.PEG_RESTITUTION,
          friction: 0.02,
          label: "peg",
        })
      );
    }
  }

  // 外壁(左右)。斜めにして端のボールを内側へ戻しつつ端ビンにも入れる。
  bodies.push(
    Matter.Bodies.rectangle(-6, GEO.H / 2, 12, GEO.H, { isStatic: true, label: "wall" }),
    Matter.Bodies.rectangle(GEO.W + 6, GEO.H / 2, 12, GEO.H, { isStatic: true, label: "wall" })
  );

  // ビン仕切り(6枚)。底部だけに立て、入ったビンを確定させる。
  for (let i = 1; i < GEO.BIN_COUNT; i++) {
    const x = i * binWidth();
    const h = GEO.FLOOR_Y - GEO.BIN_TOP;
    bodies.push(
      Matter.Bodies.rectangle(x, GEO.BIN_TOP + h / 2, GEO.DIVIDER_W, h, {
        isStatic: true,
        chamfer: { radius: 2 },
        label: "divider",
      })
    );
  }

  // 床。
  bodies.push(
    Matter.Bodies.rectangle(GEO.W / 2, GEO.FLOOR_Y + 8, GEO.W, 16, { isStatic: true, label: "floor" })
  );

  // ビンセンサ(着地検出)。床の少し上に薄い矩形を置く。
  for (let i = 0; i < GEO.BIN_COUNT; i++) {
    bodies.push(
      Matter.Bodies.rectangle(binCenterX(i), GEO.FLOOR_Y - 6, binWidth() * 0.86, 10, {
        isStatic: true,
        isSensor: true,
        label: "bin-" + i,
      })
    );
  }

  Matter.World.add(world, bodies);
  return { engine, world };
}

// 投入ボールを作る(dropX, 初速 vx)。
function makeBall(dropX, vx) {
  const b = Matter.Bodies.circle(dropX, GEO.DROP_Y, GEO.BALL_R, {
    restitution: GEO.BALL_RESTITUTION,
    friction: GEO.BALL_FRICTION,
    frictionAir: GEO.BALL_FRICTION_AIR,
    label: "ball",
  });
  Matter.Body.setVelocity(b, { x: vx, y: 0 });
  return b;
}

// 与えた初期条件(dropX, vx)でヘッドレスに走らせ、着地したビン index を返す。
// 決定論:固定 delta・correction=1。乱数なし。
function simulateToBin(dropX, vx) {
  const { engine, world } = buildWorld();
  const ball = makeBall(dropX, vx);
  Matter.World.add(world, ball);

  let bin = -1;
  Matter.Events.on(engine, "collisionStart", (evt) => {
    if (bin >= 0) return;
    for (const p of evt.pairs) {
      const labels = [p.bodyA.label, p.bodyB.label];
      if (!labels.includes("ball")) continue;
      const binLabel = labels.find((l) => l && l.indexOf("bin-") === 0);
      if (binLabel) {
        bin = parseInt(binLabel.slice(4), 10);
        return;
      }
    }
  });

  for (let s = 0; s < GEO.MAX_STEPS && bin < 0; s++) {
    Matter.Engine.update(engine, GEO.FIXED_DELTA, 1);
  }
  if (bin < 0) bin = binIndexByX(ball.position.x);

  // グローバル状態を持ち越さないよう破棄。
  Matter.World.clear(world, false);
  Matter.Engine.clear(engine);
  return bin;
}

// プリシム:初期条件(dropX × vx)を走査して binIndex→[初期条件...] の対応表を作る。
// options.dropSamples / options.vxs で粒度調整(低速端末向けに粗くできる)。
function buildDropMap(options) {
  options = options || {};
  // 既定は全ビン到達を保ちつつ軽め(≒0.7s。儀式スイング中に裏で走らせて待ちを隠す)。
  const dropSamples = options.dropSamples || 48;
  const vxs = options.vxs || [-3, -1, 0, 1, 3];
  const x0 = GEO.PEG_MARGIN_X - 10;
  const x1 = GEO.W - GEO.PEG_MARGIN_X + 10;

  const map = {};
  for (let i = 0; i < GEO.BIN_COUNT; i++) map[i] = [];

  for (let k = 0; k < dropSamples; k++) {
    const dropX = x0 + ((x1 - x0) * k) / (dropSamples - 1);
    for (const vx of vxs) {
      const bin = simulateToBin(dropX, vx);
      map[bin].push({ dropX, vx });
    }
  }
  return map;
}

module.exports = {
  GEO,
  binWidth,
  binCenterX,
  binIndexByX,
  buildWorld,
  makeBall,
  simulateToBin,
  buildDropMap,
};
