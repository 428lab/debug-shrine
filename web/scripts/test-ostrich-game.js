// ミニゲーム「ダチョウ走」のルール(components/ostrichGame.js)の検証。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/test-ostrich-game.js
//
// 確かめること:
// - 自動操縦(反応の遅れなし)なら、難しさが最大になった後まで走り切れる
//   (= よけようのない配置が出ていない)。鳥居は上のすき間をくぐる版と、下のすき間を
//   走り抜ける版の両方で確かめる。
// - 同じサボテンを跳び越せる「押してよいタイミングの幅」が、走った時間とともに狭くなる
//   (少しのミスで終わる難しさ)。ただし人に無理な狭さにはしない。
// - 堀は羽ばたかないと越えられない(跳ぶだけでは落ちる)
// - 黄色の勾玉で無敵になり、無敵の間は障害物に当たっても壊して進める
// - 何もしなければ最初のサボテンで終わる

/* eslint-disable no-console */
const SEEDS = Number(process.env.SEEDS) || 20;
const assert = require("assert");
const G = require("../components/ostrichGame.js");

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 自動操縦: 少し先まで「押す / 押さない」を試して、生き残れる押し方を選ぶ(先読み)。
// - delay: 反応の遅れ(秒)。押すと決めてから実際に押されるまでの時間
// - gate: "high" なら鳥居は上のすき間だけ、"low" なら下のすき間だけを通る(もう片方は
//   塞がっているものとして先読みする。両方とも通れることを別々に確かめるため)
const DECIDE = 0.05; // 判断の間隔(秒)
const HORIZON = 12; // 先読みの手数(DECIDE × HORIZON 秒先まで)

function cloneGame(g, gate) {
  const c = Object.assign({}, g);
  c.rnd = () => 0.5; // 先読み中に新しく置かれる障害物は遠いので影響しない
  c.obstacles = g.obstacles.map((o) => {
    const x = Object.assign({}, o);
    if (x.kind === "gate" && gate === "high") x.passTop = G.GROUND + 100; // 下を塞ぐ
    if (x.kind === "gate" && gate === "low") x.gapTop = x.gapBottom; // 上を塞ぐ
    return x;
  });
  c.items = [];
  c.events = [];
  return c;
}
function advance(c, sec) {
  const n = Math.round(sec / G.STEP);
  for (let i = 0; i < n && !c.over; i++) G.step(c);
}
// state から、押す時刻の予定 plan(相対秒)を守りつつ、depth 手先まで生き残れるか
function survives(c, depth, gate) {
  if (c.over) return false;
  if (depth === 0) return true;
  for (const pressNow of [false, true]) {
    const d = cloneGame(c, gate);
    if (pressNow) G.press(d);
    advance(d, DECIDE);
    if (survives(d, depth - 1, gate)) return true;
  }
  return false;
}
function makePilot(g, { delay = 0, jitter = 0, gate = null, seed = 1 } = {}) {
  const noise = seeded(seed * 7 + 3);
  const jitterSteps = Math.round(jitter / G.STEP);
  // 時刻の比較は刻みの数で行う(小数の誤差で判断の間隔がずれると、先読みの前提が崩れる)
  const decideSteps = Math.round(DECIDE / G.STEP);
  const delaySteps = Math.round(delay / G.STEP);
  let tick = 0;
  const queue = []; // 押す予定の刻み
  return () => {
    if (tick % decideSteps === 0) {
      // 予定済みの押しを反映した delay 後の状態から考える
      const c = cloneGame(g, gate);
      const q = queue.slice();
      for (let i = 0; i < delaySteps && !c.over; i++) {
        while (q.length && q[0] <= tick + i) {
          G.press(c);
          q.shift();
        }
        G.step(c);
      }
      // 押さずに生き残れるなら押さない。だめなら押す
      const wait = cloneGame(c, gate);
      advance(wait, DECIDE);
      if (!survives(wait, HORIZON - 1, gate)) {
        // 人の指のばらつき: 押す時刻が ±jitter ずれる(先読みでは補えない)
        const off = jitterSteps ? Math.round((noise() * 2 - 1) * jitterSteps) : 0;
        queue.push(tick + delaySteps + off);
        queue.sort((a, b) => a - b);
      }
    }
    while (queue.length && queue[0] <= tick) {
      G.press(g);
      queue.shift();
    }
    tick++;
  };
}

function run(seed, seconds, opts) {
  const g = G.newGame(seeded(seed));
  const pilot = makePilot(g, Object.assign({ seed }, opts));
  while (!g.over && g.t < seconds) {
    pilot();
    G.step(g);
  }
  return g;
}

function survey(label, seeds, seconds, opts, offset = 0) {
  let ok = 0;
  const deaths = {};
  let kinds = {};
  let items = 0;
  for (let s = 1; s <= seeds; s++) {
    const g = run(s + offset, seconds, opts);
    items += g.taken;
    if (!g.over) ok++;
    else deaths[g.hit.kind] = (deaths[g.hit.kind] || 0) + 1;
    kinds = kinds; // eslint
  }
  const rate = ok / seeds;
  console.log(
    `${label}: ${seeds} 回 × ${seconds} 秒 走り切り ${(rate * 100).toFixed(1)}% / 終わった原因 ${JSON.stringify(deaths)} / 勾玉 平均 ${(items / seeds).toFixed(1)} 個`
  );
  return rate;
}

// 反応の遅れなし: 難しさが最大(150 秒)を過ぎても走り切れる = よけようのない配置が無い
const perfectHigh = survey("先読み(鳥居は上だけ)", SEEDS, 200, { gate: "high" });
const perfect = survey("先読み(鳥居は上下どちらでも)", SEEDS, 200, {}, 5000);
assert.ok(perfectHigh >= 0.95, "上のすき間をくぐれない鳥居がある");
assert.ok(perfect >= 0.95, "よけようのない配置がある");

// 鳥居の下のすき間は、地面を走ったままで抜けられる(難しさが最大でも)
{
  let gates = 0;
  for (let s = 1; s <= 40; s++) {
    const g = G.newGame(seeded(s + 30000));
    g.t = 200; // 難しさ最大
    g.level = 1;
    for (let i = 0; i < 400; i++) {
      g.nextAt = 0;
      g.dist = 1e5;
      g.obstacles = [];
      g.items = [];
      G.step(g); // 置くだけ(ダチョウは地面)
      const ob = g.obstacles.find((o) => o.kind === "gate");
      if (!ob) continue;
      gates++;
      const b = G.birdBox({ y: G.GROUND, level: 1 });
      assert.ok(b.y0 >= ob.passTop + 20, "下のすき間が低すぎる");
      assert.ok(ob.gapBottom - ob.gapTop >= G.BIRD.h + 40, "上のすき間が狭すぎる");
      assert.ok(ob.passTop - ob.gapBottom >= G.GATE.midMin - 1e-9, "真ん中の柱が細すぎる");
      assert.ok(ob.gapTop >= G.GATE.gapMaxTop - 1e-9, "上のすき間が高すぎる");
    }
  }
  assert.ok(gates > 100, "鳥居が出てこない");
}

// 難しさ: その時点で一番詰まった間隔で並んだ、一番高いサボテン 2 つ(3 本の塊)を、
// 1 つ目をちょうどいい時に跳んだうえで 2 つ目を跳び越せる「押してよいタイミングの幅」。
// 走った時間とともに狭くなる(= 少しの操作ミスでも終わるようになる)。
function pairGame(t) {
  const g = G.newGame(seeded(1));
  g.t = t;
  g.level = G.levelAt(t);
  g.speed = G.speedAt(t);
  g.nextAt = 1e9;
  g.itemAt = 1e9;
  const lv = g.level;
  const h = 38 + 28 + 24 * lv - 1;
  const w = 66;
  const x1 = G.BIRD.x + g.speed * 0.6;
  const gap = g.speed * 0.95 * (1 - 0.4 * lv); // 置く間隔の最小(前の端から次の端)
  g.obstacles = [
    { kind: "cactus", x: x1, w, h, y: G.GROUND - h },
    { kind: "cactus", x: x1 + gap, w, h, y: G.GROUND - h },
  ];
  return g;
}
// presses: 押す刻みの一覧。n 刻み進めて生き残るか(難しさは t に固定)
function tryPresses(t, presses, n) {
  const g = pairGame(t);
  for (let i = 0; i < n && !g.over; i++) {
    if (presses.includes(i)) G.press(g);
    g.t = t;
    G.step(g);
  }
  return !g.over;
}
function jumpWindow(t) {
  const g0 = pairGame(t);
  const pass1 = Math.ceil((g0.obstacles[0].x + g0.obstacles[0].w - (G.BIRD.x - G.BIRD.w / 2)) / (g0.speed * G.STEP)) + 1;
  const pass2 = Math.ceil((g0.obstacles[1].x + g0.obstacles[1].w - (G.BIRD.x - G.BIRD.w / 2)) / (g0.speed * G.STEP)) + 1;
  const ok1 = [];
  for (let k = 0; k < pass1; k++) if (tryPresses(t, [k], pass1)) ok1.push(k);
  const k1 = ok1[Math.floor(ok1.length / 2)]; // 1 つ目はちょうどいい時に跳ぶ
  let ok2 = 0;
  for (let k = k1 + 1; k < pass2; k++) if (tryPresses(t, [k1, k], pass2)) ok2++;
  return ok2 * G.STEP * 1000; // ms
}
const windows = [5, 60, 150, 240].map((t) => ({ t, ms: jumpWindow(t) }));
console.log("詰まったサボテン 2 つ目を跳べるタイミングの幅: " + windows.map((w) => `${w.t}秒 ${w.ms.toFixed(0)}ms`).join(" / "));
for (let i = 1; i < windows.length; i++) {
  assert.ok(windows[i].ms <= windows[i - 1].ms, "後半になってもタイミングの幅が狭くならない");
}
assert.ok(windows[windows.length - 1].ms < windows[0].ms * 0.6, "難しさの上がり方が小さい");
assert.ok(windows[windows.length - 1].ms >= 40, "後半のタイミングの幅が狭すぎる(人には無理)");

// 堀は羽ばたかないと越えられない: 堀の手前で跳ぶだけの操縦は落ちる
{
  let fell = 0;
  let met = 0;
  for (let s = 1; s <= 200 && met < 30; s++) {
    const g = G.newGame(seeded(s + 20000));
    const pilot = makePilot(g, {});
    while (!g.over && g.t < 120) {
      const ob = g.obstacles.find((o) => o.x + o.w > G.BIRD.x - G.BIRD.w / 2);
      if (ob && ob.kind === "moat") {
        met++;
        // 堀の手前で1回跳ぶだけ(無敵なら水の上を走れるので、無敵と勾玉は消しておく)
        g.invUntil = 0;
        g.items = [];
        g.itemAt = 1e9;
        while (!g.over && ob.x > G.BIRD.x + 20) G.step(g);
        if (!g.onGround) {
          // 空中から堀に入った回は数えない(地面から1回跳ぶだけ、を試したい)
          met--;
          break;
        }
        G.press(g);
        while (!g.over && ob.x + ob.w > G.BIRD.x - 20) G.step(g);
        if (g.over && g.hit.kind === "moat") fell++;
        break;
      }
      pilot();
      G.step(g);
    }
  }
  assert.ok(met >= 10, "堀が出てこない");
  assert.strictEqual(fell, met, "跳ぶだけで越えられる堀がある");
  console.log(`堀: 跳ぶだけでは ${met} 回中 ${fell} 回とも落ちる`);
}

// 黄色の勾玉で無敵 → 障害物に当たっても壊して進む
{
  const g = G.newGame(seeded(3));
  g.items.push({ x: G.BIRD.x, y: G.GROUND - 30, r: 11, color: "yellow", pts: 10, invincible: true, big: false });
  G.step(g);
  assert.ok(G.invincible(g), "黄色の勾玉で無敵にならない");
  // 何もしないで 6 秒走る(サボテンに当たっても壊れる)
  while (!g.over && g.t < 6) G.step(g);
  assert.ok(!g.over, "無敵なのに終わった");
  assert.ok(g.smashed + g.events.filter((e) => e.type === "flee").length > 0, "無敵で何も壊していない");
  // 無敵が切れた後は当たると終わる
  while (!g.over && g.t < 30) G.step(g);
  assert.ok(g.over, "無敵が切れない");
}

// 何もしなければ最初のサボテンで終わる
{
  const g = G.newGame(seeded(7));
  while (!g.over && g.t < 30) G.step(g);
  assert.ok(g.over, "何もしないのに終わらない");
}

// 難しさ: 速さは上がり続け、当たり判定の甘さは減る
assert.ok(G.speedAt(120) > G.speedAt(60) && G.speedAt(200) > G.speedAt(120), "速さが途中で止まる");
{
  const a = G.newGame();
  const b = G.newGame();
  b.level = 1;
  const wa = G.birdBox(a).x1 - G.birdBox(a).x0;
  const wb = G.birdBox(b).x1 - G.birdBox(b).x0;
  assert.ok(wb > wa, "難しくなっても当たり判定が変わらない");
}

// 称号
assert.strictEqual(G.titleOf(0), "ひよこ");
assert.strictEqual(G.titleOf(149), "ひよこ");
assert.strictEqual(G.titleOf(150), "若鳥");
assert.deepStrictEqual(G.nextTitle(100), { name: "若鳥", need: 50 });
assert.strictEqual(G.nextTitle(99999), null);

console.log("OK");
