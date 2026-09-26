// ミニゲーム「ダチョウ走」のルール(components/ostrichGame.js)の検証。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/test-ostrich-game.js
//
// 確かめること:
// - 単純な自動操縦でも、たいていは最高速度に達した後まで走り切れる
//   (= よけようのない配置が出ていない)。人は自動操縦より下手なので、ここで
//   落ちる配置は人にとって理不尽になる。
// - 人の反応の遅れ(60ms)を入れた自動操縦でも、たいていは走り切れる
// - 障害物どうしが、ジャンプして着地し、次に跳ぶまでの時間より近くに置かれない
// - 門のすき間は、走ったままでは通れず、羽ばたけば届く高さにある
// - 何もしなければ最初のサボテンで終わる(判定が効いている)

/* eslint-disable no-console */
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

// 単純な自動操縦: 目の前の障害物だけを見る。press を返す関数を渡すと、押すのを遅らせられる
function autopilot(g, press = G.press) {
  const front = G.BIRD.x + G.BIRD.w / 2;
  const ob = g.obstacles.find((o) => o.x + o.w > G.BIRD.x - G.BIRD.w / 2);
  if (!ob) return;
  const d = ob.x - front;
  if (ob.kind === "gate") {
    const target = ob.gapBottom - 30; // 足をすき間の下端より少し上に
    if (g.onGround) {
      if (d < g.speed * 0.75) press(g);
    } else if (g.y > target && g.vy > -150) {
      press(g);
    }
    return;
  }
  if (ob.kind === "crow" && !ob.low) return; // 高いカラスは走り抜ける
  if (g.onGround && d < g.speed * 0.12 + 6 && d > -10) press(g);
}

const SECONDS = 90;
const SEEDS = 300;
let survived = 0;
const deaths = {};
let minGap = Infinity;
let gates = 0;
let maxScore = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const g = G.newGame(seeded(seed));
  while (!g.over && g.t < SECONDS) {
    autopilot(g);
    const before = g.spawned;
    G.step(g);
    if (g.spawned > before && g.obstacles.length >= 2) {
      // 新しく置いた障害物と、1つ前の障害物の間隔(秒)
      const last = g.obstacles[g.obstacles.length - 1];
      const prev = g.obstacles[g.obstacles.length - 2];
      minGap = Math.min(minGap, (last.x - (prev.x + prev.w)) / g.speed);
    }
    for (const ob of g.obstacles) {
      if (ob.kind === "gate") {
        assert.ok(ob.gapBottom <= G.GROUND - G.GATE.gapMinBottom + 1e-9, "門のすき間が低すぎる");
        assert.ok(ob.gapTop >= G.GATE.gapMaxTop - 1e-9, "門のすき間が高すぎる");
        assert.ok(ob.gapBottom - ob.gapTop >= G.BIRD.h + 60, "門のすき間が狭すぎる");
      }
    }
  }
  gates += g.gates;
  maxScore = Math.max(maxScore, g.score);
  if (!g.over) survived++;
  else deaths[g.hit.kind] = (deaths[g.hit.kind] || 0) + 1;
}

// 何もしなければ最初のサボテンで終わる
{
  const g = G.newGame(seeded(7));
  while (!g.over && g.t < 30) G.step(g);
  assert.ok(g.over, "何もしないのに終わらない");
}

// 称号
assert.strictEqual(G.titleOf(0), "ひよこ");
assert.strictEqual(G.titleOf(99), "ひよこ");
assert.strictEqual(G.titleOf(100), "若鳥");
assert.deepStrictEqual(G.nextTitle(80), { name: "若鳥", need: 20 });
assert.strictEqual(G.nextTitle(99999), null);

// 人の反応の遅れを入れた自動操縦: 押そうと決めてから DELAY 秒後に押す。遅れを見込んで、
// その時の位置を先読みして判断する(人も慣れると先読みする)。
const DELAY = 0.06;
let survivedLate = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const g = G.newGame(seeded(seed + 10000));
  let pendingAt = -1;
  while (!g.over && g.t < SECONDS) {
    const front = G.BIRD.x + G.BIRD.w / 2;
    const ob = g.obstacles.find((o) => o.x + o.w > G.BIRD.x - G.BIRD.w / 2);
    if (ob && pendingAt < 0) {
      const d = ob.x - g.speed * DELAY - front;
      if (ob.kind === "gate") {
        if (g.onGround) {
          if (d < g.speed * 0.75) pendingAt = g.t + DELAY;
        } else if (g.y + g.vy * DELAY > ob.gapBottom - 30 && g.vy > -150) {
          pendingAt = g.t + DELAY;
        }
      } else if (!(ob.kind === "crow" && !ob.low)) {
        if (g.onGround && d < g.speed * 0.12 + 6 && d > -10) pendingAt = g.t + DELAY;
      }
    }
    if (pendingAt >= 0 && g.t >= pendingAt) {
      G.press(g);
      pendingAt = -1;
    }
    G.step(g);
  }
  if (!g.over) survivedLate++;
}

const rate = survived / SEEDS;
const rateLate = survivedLate / SEEDS;
console.log(
  `自動操縦 ${SEEDS} 回 × ${SECONDS} 秒: 走り切り ${(rate * 100).toFixed(1)}% / 終わった原因 ${JSON.stringify(deaths)} / ` +
    `門 平均 ${(gates / SEEDS).toFixed(1)} 回 / 最高 ${maxScore} 点 / 障害物の最小間隔 ${minGap.toFixed(2)} 秒`
);
console.log(`反応を ${DELAY * 1000}ms 遅らせた自動操縦: 走り切り ${(rateLate * 100).toFixed(1)}%`);
assert.ok(rateLate >= 0.95, `反応が少し遅いと走り切れない配置が多い(${(rateLate * 100).toFixed(1)}%)`);
assert.ok(rate >= 0.97, `自動操縦が走り切れない配置が多い(${(rate * 100).toFixed(1)}%)`);
assert.ok(minGap >= 0.75, `障害物が近すぎる(${minGap.toFixed(2)} 秒)`);
console.log("OK");
