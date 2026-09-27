// リズムゲームの曲(components/rhythmSong.js)の検証。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/test-rhythm-song.js
//
// 確かめること:
// - 音が時刻順に並び、曲の長さが 1 分〜1 分半に収まる
// - どの音も楽器の出せる音域にある
// - ボーカルチョップの拍頭の音が、その小節のコードの音か、キーの音階の音(外れた音で
//   濁らない)。三味線は都節の音だけを使う
// - ラスサビは半音上がっている

/* eslint-disable no-console */
const assert = require("assert");
const S = require("../components/rhythmSong.js");

const song = S.buildSong();
const ev = song.events;
for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t, "時刻順に並んでいない");
assert.ok(song.duration > 60 && song.duration < 95, `曲の長さ ${song.duration.toFixed(1)} 秒`);

const RANGE = {
  vox: [S.m("A4"), S.m("F6")],
  shamisen: [S.m("A4"), S.m("E6")],
  koto: [S.m("A3"), S.m("F6")],
  bass: [S.m("E1"), S.m("E3")],
  piano: [S.m("C4"), S.m("F6")],
  fue: [S.m("C5"), S.m("F6")],
};
for (const e of ev) {
  if (RANGE[e.inst]) {
    const [lo, hi] = RANGE[e.inst];
    assert.ok(e.midi >= lo && e.midi <= hi, `${e.inst} の音域外 ${e.midi} (小節 ${e.bar})`);
  }
  if (e.midis) for (const x of e.midis) assert.ok(x >= S.m("C3") && x <= S.m("E5"), `和音の音域外 ${x} (小節 ${e.bar})`);
  assert.ok(Number.isFinite(e.t) && e.t >= 0);
}

// ボーカルチョップの拍頭の音がコードかキーの音階に入っている
const secOf = (bar) => {
  let s = null;
  for (const x of S.SECTIONS) {
    const start = song.sections.find((y) => y.name === x.name).startBar;
    if (bar >= start && bar < start + x.bars) s = { def: x, idx: bar - start };
  }
  return s;
};
const D_MINOR = [2, 4, 5, 7, 9, 10, 0, 1]; // D E F G A B♭ C と、A のコードの C#
let checked = 0;
for (const e of ev.filter((x) => x.inst === "vox")) {
  const { def, idx } = secOf(e.bar);
  const key = def.key || 0;
  const pc = (((e.midi - key) % 12) + 12) % 12;
  assert.ok(D_MINOR.includes(pc), `キーの外の音 ${e.midi} (小節 ${e.bar})`);
  if (e.step % 4 === 0) {
    const ch = S.CHORDS[def.chords[idx]];
    const rootPc = S.m(ch.root + "4") % 12;
    const tones = ch.tones.map((x) => (rootPc + x) % 12);
    const ok = tones.includes(pc) || [2, 5, 7, 9, 10, 0].includes(pc); // 和音の音か、テンション程度
    assert.ok(ok, `拍頭の音がコードと合わない ${e.midi} (小節 ${e.bar})`);
    checked++;
  }
}
const MIYAKO = [2, 3, 7, 9, 10]; // D E♭ G A B♭
for (const e of ev.filter((x) => x.inst === "shamisen")) {
  const { def } = secOf(e.bar);
  const pc = (((e.midi - (def.key || 0)) % 12) + 12) % 12;
  assert.ok(MIYAKO.includes(pc), `三味線が都節の外の音 ${e.midi}`);
}

// ラスサビは半音上
const hook1 = ev.find((x) => x.inst === "vox" && x.bar === song.sections.find((s) => s.name === "chorus").startBar);
const hook3 = ev.find((x) => x.inst === "vox" && x.bar === song.sections.find((s) => s.name === "chorus3").startBar);
assert.strictEqual(hook3.midi - hook1.midi, 1, "ラスサビが半音上がっていない");

const counts = {};
for (const e of ev) counts[e.inst] = (counts[e.inst] || 0) + 1;
console.log(`OK 曲 ${song.duration.toFixed(1)} 秒・${song.bars} 小節・音 ${ev.length} 個(拍頭の歌 ${checked} 個を確認)`);
console.log("  " + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" / "));
