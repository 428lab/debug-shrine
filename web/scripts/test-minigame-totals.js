// 神楽ビートの判定の数(曲・難易度ごと)が、サーバーの表と同じか確かめる。
// サーバー(app/functions-go/minigame.go)は、送られてきた判定の数がこの表と違う結果を
// ランキングに載せない。譜面(rhythmChart.js・曲)を変えたら、この検証が食い違いを教えるので、
// app/functions-go/minigame_rhythm_totals.json を直す。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/test-minigame-totals.js

/* eslint-disable no-console */
const assert = require("assert");
const path = require("path");
const { SONGS } = require("../components/rhythmSongs.js");
const Chart = require("../components/rhythmChart.js");
const totals = require(path.join(__dirname, "../../app/functions-go/minigame_rhythm_totals.json"));

let n = 0;
for (const s of SONGS) {
  const song = s.build();
  for (const level of Object.keys(Chart.LEVELS)) {
    const chart = Chart.buildChart(song, level);
    // RhythmGame.vue の st.total と同じ数え方(音符 + 長い音符の終わり)
    const total = chart.notes.length + chart.notes.filter((x) => x.end != null).length;
    assert.strictEqual(totals[s.id] && totals[s.id][level], total, `${s.id}/${level}: サーバーの表 ${totals[s.id] && totals[s.id][level]}、譜面 ${total}`);
    n++;
  }
}
assert.strictEqual(Object.keys(totals).length, SONGS.length, "サーバーの表に無い曲・余分な曲");
console.log(`ok: ${n} 譜面の判定の数がサーバーの表と同じ`);
