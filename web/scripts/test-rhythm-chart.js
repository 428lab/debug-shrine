// リズムゲームの譜面(components/rhythmChart.js)の検証。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/test-rhythm-chart.js
//
// 確かめること:
// - どの音符も、曲で実際に鳴っている音と同じ時刻にある(叩くと曲と合う)
// - 同じレーンの間隔と、長押しの間の空きが守られている
// - 同時に押すのは 2 本まで(長押しで押している指も数える)
// - 参拝 < 祈願 < 修行 の順に音符が多い。修行と祈願に長押しがある。密度が人の手で叩ける範囲
// - 判定と点数・評価の計算

/* eslint-disable no-console */
const assert = require("assert");
const S = require("../components/rhythmSong.js");
const C = require("../components/rhythmChart.js");

const song = S.buildSong();
const times = new Set(song.events.map((e) => e.t.toFixed(6)));
const res = {};
for (const level of Object.keys(C.LEVELS)) {
  const ch = C.buildChart(song, level);
  const n = ch.notes;
  assert.ok(n.length > 50, `${level}: 音符が少なすぎる`);
  const gap = C.LEVELS[level].minGap * song.step - 1e-6;
  const byLane = [[], [], []];
  for (const x of n) {
    assert.ok(times.has(x.t.toFixed(6)), `${level}: 曲に無い時刻の音符`);
    assert.ok(x.lane >= 0 && x.lane < 3);
    if (x.end != null) assert.ok(x.end > x.t, "長押しの終わりが先");
    byLane[x.lane].push(x);
  }
  for (const lane of byLane) {
    for (let i = 1; i < lane.length; i++) {
      const prevEnd = lane[i - 1].end != null ? lane[i - 1].end : lane[i - 1].t;
      assert.ok(lane[i].t >= prevEnd + gap, `${level}: 同じレーンが近すぎる (${lane[i].t.toFixed(2)} 秒)`);
    }
  }
  const at = new Map();
  for (const x of n) at.set(x.t.toFixed(6), (at.get(x.t.toFixed(6)) || 0) + 1);
  assert.ok(Math.max(...at.values()) <= 2, `${level}: 3 本同時押しがある`);
  // 長押しの途中に来る音符も、押している指と合わせて 2 本まで
  for (const x of n) {
    const holding = n.filter((h) => h.end != null && h.t < x.t - 1e-6 && h.end > x.t - 1e-6).length;
    assert.ok(at.get(x.t.toFixed(6)) + holding <= 2, `${level}: 長押しの途中で 3 本同時押しになる (${x.t.toFixed(2)} 秒)`);
  }
  // 1 秒あたりの最大の叩く数(1 秒の窓で)
  let maxRate = 0;
  for (let i = 0; i < n.length; i++) {
    let j = i;
    while (j < n.length && n[j].t < n[i].t + 1) j++;
    maxRate = Math.max(maxRate, j - i);
  }
  res[level] = { notes: n.length, holds: n.filter((x) => x.end != null).length, maxRate, perSec: n.length / song.duration };
}
assert.ok(res.normal.notes > res.easy.notes * 1.2, "祈願が参拝より十分に多くない");
assert.ok(res.hard.notes > res.normal.notes * 1.2, "修行が祈願より十分に多くない");
assert.ok(res.hard.holds > 5, "修行に長押しが無い");
assert.strictEqual(res.easy.holds, 0, "参拝に長押しがある");
assert.ok(res.easy.maxRate <= 8, `参拝が忙しすぎる(1 秒に ${res.easy.maxRate})`);
assert.ok(res.normal.maxRate <= 11, `祈願が忙しすぎる(1 秒に ${res.normal.maxRate})`);
assert.ok(res.hard.maxRate <= 16, `修行が忙しすぎる(1 秒に ${res.hard.maxRate})`);

// 判定
assert.strictEqual(C.judge(0), "kiwami");
assert.strictEqual(C.judge(-0.044), "kiwami");
assert.strictEqual(C.judge(0.08), "ryo");
assert.strictEqual(C.judge(-0.13), "ka");
assert.strictEqual(C.judge(0.2), null);
assert.strictEqual(C.scoreOf({ kiwami: 10 }, 10), 1000000);
assert.strictEqual(C.scoreOf({ kiwami: 5, fuka: 5 }, 10), 500000);
assert.strictEqual(C.rankOf(1000000), "大吉");
assert.strictEqual(C.rankOf(500000), "凶");

for (const [k, v] of Object.entries(res)) {
  console.log(`${C.LEVELS[k].label}: 音符 ${v.notes}(長押し ${v.holds})・平均 ${v.perSec.toFixed(1)} 個/秒・最大 ${v.maxRate} 個/秒`);
}
console.log("OK");
