// おみくじ演出「弾き玉」(3D)のルールと物理(描画なし。Node でも動く)。
//
// 見せ方は OmikujiSlingshot.vue(three.js)。物理は cannon-es(3D の剛体)で、
// 使う側が build(CANNON) に渡す(ブラウザではこの演出の時だけ読み込む)。
// 検証は scripts/simulate-omikuji-slingshot.js。
//
// 流れ:
//   aim    : Y 字の台の御神玉を引き絞る(引いた向きの逆へ飛ぶ。引いた向きと強さで狙う点が決まる)
//   flight : 放つ(rang)。玉は狙った点へ飛ぶ(放物線を解く)。櫓の外も狙えるので外れることもある
//   impact : 櫓に当たる。崩れが収まるまで待つ
//   reveal : 崩れ落ちた木札のうち、一番手前の 1 枚が浮き上がり、裏返ってレア度が出る。
//            外れて崩れなかった時は、てっぺんの木札が浮き上がる
//            (レア度はサーバーが決めたもの。物理がどう転んでも、外れても結果は正しい)
//
// 座標はメートル。x 右、y 上、z 手前(台は z = 0、櫓は奥の z = TOWER.z)。

const G = 9.82;
const STEP = 1 / 240; // 物理の 1 歩(飛んでいる速い玉が薄い木札をすり抜けないように細かく)
const STEP_AFTER = 1 / 120; // 当たった後(玉は遅くなっている。崩れの計算を軽くする)
const MAX_STEPS = 8; // 1 フレームに進める歩数の上限(遅い端末で重くなって、さらに遅れるのを止める)

const SLING = { x: 0, y: 1.55, z: 0 }; // 玉の定位置(ゴムの支点)
const BALL = { r: 0.28, mass: 7 };
const PULL = { max: 1.1 }; // 引き絞りの最大(見た目。m)
const TOWER = { z: -16, halfW: 1.5, halfD: 0.75, floors: 3, floorH: 1.45, beam: 0.1 };
// 狙える範囲(櫓の正面の面での x と y)。櫓(幅 ±1.5・高さ 5.7)より広く、外すこともできる
const AIM = { xMax: 3.2, yMin: 0.2, yMax: 7.4 };
const FLIGHT = { slow: 0.95, fast: 0.62 }; // 飛ぶ時間(秒)。弱い引き → 山なり、強い引き → まっすぐ
const SETTLE = { min: 2.4, max: 4.2, miss: 1.2 }; // 当たってから選ぶまで(秒)。待ちすぎると間延びする
const PART_VMAX = 7.5; // 櫓の部品の速さの上限(m/s)。カメラの目の前まで飛んでくると、画面が部品で埋まった

// レア度(色はポートと同じ並び)
const TIERS = ["超吉", "大吉", "中吉", "小吉", "末吉", "凶", "大凶"];

// 櫓の部品の形(半分の大きさ)と重さ
const PART = {
  pillar: { half: [0.12, 0.0, 0.12], mass: 2.2 }, // 高さは階の高さから
  beam: { half: [TOWER.halfW + 0.08, 0.1, 0.13], mass: 2.6 },
  plank: { half: [TOWER.halfW + 0.05, 0.05, TOWER.halfD + 0.05], mass: 2.0 },
  plaque: { half: [0.2, 0.36, 0.045], mass: 0.35 }, // 木札
  ema: { half: [0.24, 0.17, 0.07], mass: 0.5 }, // 絵馬
  ridge: { half: [TOWER.halfW + 0.3, 0.09, 0.14], mass: 1.6 },
};

// 櫓の部品の並び(描画と物理で共有する)。{ kind, pos: [x,y,z], half: [..], mass, rotZ? }
function towerLayout() {
  const parts = [];
  const { z, halfW, halfD, floors, floorH } = TOWER;
  const px = halfW - 0.2;
  const pz = halfD - 0.15;
  let y = 0;
  for (let f = 0; f < floors; f++) {
    const h = floorH - f * 0.15; // 上の階ほど少し低く
    // 柱 4 本
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        parts.push({ kind: "pillar", pos: [sx * px, y + h / 2, z + sz * pz], half: [0.12, h / 2, 0.12], mass: PART.pillar.mass, floor: f });
      }
    }
    // 梁 2 本(前後)と床板
    const by = y + h + PART.beam.half[1];
    for (const sz of [-1, 1]) parts.push({ kind: "beam", pos: [0, by, z + sz * pz], half: PART.beam.half, mass: PART.beam.mass, floor: f });
    const py = by + PART.beam.half[1] + PART.plank.half[1];
    parts.push({ kind: "plank", pos: [0, py, z], half: PART.plank.half, mass: PART.plank.mass, floor: f });
    // 階の中に立てた木札(手前に 4 枚・奥に 3 枚)。その階の床(1 階は地面)に立てる
    const plaqueY = y + PART.plaque.half[1];
    for (let i = 0; i < 4; i++) {
      parts.push({ kind: "plaque", pos: [-0.75 + i * 0.5, plaqueY, z + pz - 0.28], half: PART.plaque.half, mass: PART.plaque.mass, floor: f });
    }
    for (let i = 0; i < 3; i++) {
      parts.push({ kind: "plaque", pos: [-0.5 + i * 0.5, plaqueY, z - pz + 0.3], half: PART.plaque.half, mass: PART.plaque.mass, floor: f });
    }
    // 絵馬は床板の上(次の階の床に載る形。最上階は屋根の下)
    y = py + PART.plank.half[1];
    for (const sx of [-1, 1]) {
      parts.push({ kind: "ema", pos: [sx * 0.95, y + PART.ema.half[1], z + 0.1], half: PART.ema.half, mass: PART.ema.mass, floor: f + 1 });
    }
  }
  // てっぺん: 棟木(絵馬の奥)と、その上の木札 3 枚
  const rz = z - 0.38;
  parts.push({ kind: "ridge", pos: [0, y + PART.ridge.half[1], rz], half: PART.ridge.half, mass: PART.ridge.mass, floor: floors });
  const ty = y + PART.ridge.half[1] * 2 + PART.plaque.half[1];
  for (let i = 0; i < 3; i++) parts.push({ kind: "plaque", pos: [-0.45 + i * 0.45, ty, rz], half: PART.plaque.half, mass: PART.plaque.mass, floor: floors });
  return parts.map((p, id) => Object.assign({ id }, p));
}

// 引き絞り(画面上のドラッグ px)→ 狙い。dx: 右が正、dy: 下が正
function aimFromDrag(dx, dy) {
  const len = Math.hypot(dx, dy);
  const power = Math.max(0, Math.min(1, len / 190));
  // 左へ引くと右へ、下へ引くと上へ(引いた向きの逆へ飛ぶ。スリングショットと同じ)
  const ax = Math.max(-1, Math.min(1, -dx / 140));
  // 真下へいっぱいに引く(強さ 1)と櫓のてっぺん辺り。それより上へ外すには、さらに大きく引く
  const ay = Math.max(0, Math.min(1, (dy + 40) / 310));
  return { power, ax, ay };
}

// 櫓のてっぺんの高さ
const TOWER_TOP = Math.max(...towerLayout().map((p) => p.pos[1] + p.half[1]));

// 狙った点が櫓の正面にあるか(外れる狙いなら、スローや当たりの演出をしない)
function aimsAtTower(target) {
  return !!target && Math.abs(target.x) < TOWER.halfW + BALL.r && target.y < TOWER_TOP + BALL.r;
}

// 狙い → 当たる点と飛ぶ時間
function targetOf(aim) {
  return {
    x: aim.ax * AIM.xMax,
    y: AIM.yMin + aim.ay * (AIM.yMax - AIM.yMin),
    z: TOWER.z + TOWER.halfD + 0.05,
    t: FLIGHT.slow + (FLIGHT.fast - FLIGHT.slow) * aim.power,
  };
}

// 玉の位置(引き絞り中)。指と同じ向きに動き、最大 PULL.max まで手前へ下がる
// (ax は飛ぶ向き = 指の逆なので、横は -ax の向きへずらす)
function pulledPos(aim) {
  const k = PULL.max * aim.power;
  return { x: SLING.x - aim.ax * 0.45 * k, y: SLING.y - aim.ay * 0.55 * k - 0.15 * k, z: SLING.z + k };
}

// 放つ速さ(狙った点へ、時間 t で届く放物線)
function launchVelocity(from, target) {
  const t = target.t;
  return {
    x: (target.x - from.x) / t,
    y: (target.y - from.y) / t + 0.5 * G * t,
    z: (target.z - from.z) / t,
  };
}

// 予測の軌道(点の列。描画の目安)
function trajectory(aim, n) {
  const from = pulledPos(aim);
  const target = targetOf(aim);
  const v = launchVelocity(from, target);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (target.t * i) / n;
    pts.push({ x: from.x + v.x * t, y: from.y + v.y * t - 0.5 * G * t * t, z: from.z + v.z * t });
  }
  return pts;
}

// ---- 物理の世界 ----
function build(CANNON) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) });
  world.allowSleep = true;
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.broadphase.axisIndex = 1; // 櫓は縦に積んであるので、縦の軸で並べる方が速い
  world.solver.iterations = 10;
  world.defaultContactMaterial.friction = 0.5;
  world.defaultContactMaterial.restitution = 0.15;

  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);

  const layout = towerLayout();
  const parts = layout.map((p) => {
    const body = new CANNON.Body({
      mass: p.mass,
      shape: new CANNON.Box(new CANNON.Vec3(p.half[0], p.half[1], p.half[2])),
      position: new CANNON.Vec3(p.pos[0], p.pos[1], p.pos[2]),
      linearDamping: 0.05,
      angularDamping: 0.08,
    });
    body.sleepSpeedLimit = 0.2;
    body.sleepTimeLimit = 0.3;
    // 当たるまで凍らせておく(積んだだけの櫓が勝手に揺れたり崩れたりしない)
    body.sleep();
    world.addBody(body);
    return Object.assign({}, p, { body, start: p.pos.slice() });
  });

  const ball = new CANNON.Body({
    mass: BALL.mass,
    shape: new CANNON.Sphere(BALL.r),
    position: new CANNON.Vec3(SLING.x, SLING.y, SLING.z),
    type: CANNON.Body.KINEMATIC, // 放つまでは台に載ったまま
    linearDamping: 0.01,
  });
  ball.allowSleep = false;
  world.addBody(ball);

  const g = {
    CANNON,
    world,
    parts,
    ball,
    phase: "aim", // aim | flight | impact | reveal
    aim: { power: 0, ax: 0, ay: 0.5 },
    t: 0, // 放ってからの物理の時間
    acc: 0,
    impactAt: null,
    missed: false,
    chosen: null,
    events: [],
    hits: 0,
  };
  ball.addEventListener("collide", (e) => {
    if (e.body === ground) {
      if (g.phase === "flight") emit(g, "ground", {});
      return;
    }
    const part = parts.find((p) => p.body === e.body);
    if (!part) return;
    g.hits++;
    if (g.impactAt == null) {
      g.impactAt = g.t;
      g.phase = "impact";
      emit(g, "impact", { id: part.id, kind: part.kind });
    }
  });
  return g;
}

function emit(g, type, data) {
  g.events.push(Object.assign({ type, t: g.t }, data || {}));
}

function setAim(g, aim) {
  if (g.phase !== "aim") return;
  g.aim = aim;
  const p = pulledPos(aim);
  g.ball.position.set(p.x, p.y, p.z);
}

function launch(g) {
  if (g.phase !== "aim") return;
  const { CANNON } = g;
  const from = pulledPos(g.aim);
  const target = targetOf(g.aim);
  const v = launchVelocity(from, target);
  g.ball.type = CANNON.Body.DYNAMIC;
  g.ball.mass = BALL.mass;
  g.ball.updateMassProperties();
  g.ball.position.set(from.x, from.y, from.z);
  g.ball.velocity.set(v.x, v.y, v.z);
  g.ball.angularVelocity.set(-8, 0, 0);
  g.ball.wakeUp();
  g.phase = "flight";
  g.t = 0;
  g.target = target;
  emit(g, "launch", { power: g.aim.power });
}

// 部品がどれだけ動いたか
function moved(p) {
  const b = p.body.position;
  return Math.hypot(b.x - p.start[0], b.y - p.start[1], b.z - p.start[2]);
}

// 結果にする木札を選ぶ: 崩れて動いた木札のうち一番手前(z が大きい)。どれも動いていなければ一番上
function choosePlaque(g) {
  const plaques = g.parts.filter((p) => p.kind === "plaque");
  const fell = plaques.filter((p) => moved(p) > 0.35);
  if (fell.length) return fell.reduce((a, b) => (b.body.position.z > a.body.position.z ? b : a));
  return plaques.reduce((a, b) => (b.body.position.y > a.body.position.y ? b : a));
}

// 崩れが収まったか(動いている部品が無い)
function settled(g) {
  for (const p of g.parts) {
    const v = p.body.velocity;
    if (p.body.sleepState !== g.CANNON.Body.SLEEPING && v.x * v.x + v.y * v.y + v.z * v.z > 0.04) return false;
  }
  return true;
}

// dt 秒(スローモーションは呼ぶ側で dt を縮める)
function step(g, dt) {
  if (g.phase === "aim" || g.phase === "reveal") return;
  g.acc += Math.min(dt, 0.05);
  let n = 0;
  for (;;) {
    const h = g.phase === "flight" ? STEP : STEP_AFTER;
    if (g.acc < h) break;
    if (++n > MAX_STEPS) {
      g.acc = 0; // 追いつけない分は捨てる(ゆっくりになるだけで、重くなり続けない)
      break;
    }
    g.acc -= h;
    g.world.step(h);
    g.t += h;
    // 軽い木札は重い玉に弾かれると 50m 先まで飛んで画面から消えた。崩れの見栄えのため速さに上限
    for (const p of g.parts) {
      const v = p.body.velocity;
      const s2 = v.x * v.x + v.y * v.y + v.z * v.z;
      if (s2 > PART_VMAX * PART_VMAX) v.scale(PART_VMAX / Math.sqrt(s2), v);
    }
  }
  // 外れた(櫓に触れずに後ろへ抜けた・いつまでも当たらない)→ 当たったことにして進める
  // (崩れないので、てっぺんの木札が結果になる)
  const passed = g.ball.position.z < TOWER.z - TOWER.halfD - 1.5;
  if (g.phase === "flight" && (passed || g.t > (g.target ? g.target.t : 1) + 1.2)) {
    g.missed = true;
    g.impactAt = g.t;
    g.phase = "impact";
    emit(g, "impact", { missed: true });
  }
  if (g.phase === "impact") {
    const since = g.t - g.impactAt;
    // 外れた時は崩れを待たない(何も崩れていない櫓を眺める間を作らない)
    if (g.missed ? since > SETTLE.miss : (since > SETTLE.min && settled(g)) || since > SETTLE.max) {
      g.chosen = choosePlaque(g);
      g.phase = "reveal";
      emit(g, "reveal", { id: g.chosen.id });
    }
  }
}

module.exports = {
  G,
  STEP,
  STEP_AFTER,
  SLING,
  BALL,
  PULL,
  TOWER,
  TOWER_TOP,
  AIM,
  FLIGHT,
  SETTLE,
  TIERS,
  PART,
  towerLayout,
  aimFromDrag,
  targetOf,
  aimsAtTower,
  pulledPos,
  launchVelocity,
  trajectory,
  build,
  setAim,
  launch,
  step,
  moved,
  choosePlaque,
};
