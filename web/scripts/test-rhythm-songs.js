// リズムゲームの曲の一覧(components/rhythmSongs.js)と、あとから足した曲の検証。
// 最初の曲「御神楽」の細かい検証は test-rhythm-song.js。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/test-rhythm-songs.js
//
// 確かめること:
// - どの曲も長さが 1 分〜1 分 35 秒、音は時刻順、時刻と音の高さが数になっている
// - 使っている楽器が rhythmAudio.js にある(書き間違えると鳴らない)
// - メロディの小節の頭と真ん中の音が、その小節のコードの音(濁らない)
// - 曲ごとの音階: 「祭ノ宵」のメロディは陽音階だけ、「疾風迅雷」のラスサビは全音上げ
// - 曲の id が重ならない(ハイスコアの保存に使う)

/* eslint-disable no-console */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { SONGS } = require("../components/rhythmSongs.js");
const { chord, m } = require("../components/rhythmSongKit.js");
const Shippu = require("../components/rhythmSongShippu.js");
const Matsuri = require("../components/rhythmSongMatsuri.js");
const Ten = require("../components/rhythmSongTen.js");

// rhythmAudio.js にある楽器の名前
const audioSrc = fs.readFileSync(path.join(__dirname, "../components/rhythmAudio.js"), "utf8");
const INSTS = new Set([...audioSrc.matchAll(/^ {4}(\w+)\(t, e\) \{/gm)].map((x) => x[1]));
assert.ok(INSTS.has("vox") && INSTS.has("chant") && INSTS.has("sho"), "楽器の一覧が読めていない");

assert.strictEqual(new Set(SONGS.map((s) => s.id)).size, SONGS.length, "曲の id が重なっている");

const MELODY = new Set(["vox", "shaku", "shino", "hichi"]);
const pc = (x) => ((x % 12) + 12) % 12;

function checkSong(def, defs) {
  const song = def.build();
  const ev = song.events;
  assert.ok(song.duration > 60 && song.duration < 95, `${def.title}: 長さ ${song.duration.toFixed(1)} 秒`);
  assert.strictEqual(song.bpm, def.bpm);
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    assert.ok(Number.isFinite(e.t) && e.t >= 0, `${def.title}: 時刻がおかしい`);
    if (i) assert.ok(ev[i - 1].t <= e.t, `${def.title}: 時刻順でない`);
    assert.ok(INSTS.has(e.inst), `${def.title}: 鳴らせない楽器 ${e.inst}`);
    if (e.midi != null) assert.ok(Number.isFinite(e.midi) && e.midi > 20 && e.midi < 110, `${def.title}: 音の高さ ${e.midi}`);
    if (e.vel != null) assert.ok(e.vel > 0 && e.vel <= 1.2, `${def.title}: 音の強さ ${e.vel}`);
  }
  // メロディの小節の頭・真ん中の音がコードの音か
  let checked = 0;
  const bad = [];
  if (defs) {
    for (const e of ev) {
      if (!MELODY.has(e.inst) || (e.step !== 0 && e.step !== 8)) continue;
      const sec = song.sections.filter((s) => e.bar >= s.startBar).pop();
      const def2 = defs.find((x) => x.name === sec.name);
      const name = def2.chords[e.bar - sec.startBar];
      // 独奏のイントロ(ドローンの上で自由に吹く)と締めは除く
      if (sec.name === "outro" || sec.name === "intro") continue;
      const ch = chord(name);
      const tones = ch.tones.map((x) => pc(ch.pc + x + sec.key));
      if (!tones.includes(pc(e.midi))) bad.push(`${def.title}: ${sec.label} ${e.bar - sec.startBar + 1} 小節目 ${e.step} のメロディ(${e.midi})が ${name} と濁る`);
      checked++;
    }
  }
  assert.deepStrictEqual(bad, []);
  return { song, checked };
}

const results = [];
for (const def of SONGS) {
  const defs = { shippu: Shippu.SECTIONS, matsuri: Matsuri.SECTIONS, ten: Ten.SECTIONS }[def.id];
  const r = checkSong(def, defs);
  results.push([def, r]);
}

// 「祭ノ宵」: メロディ(篠笛・ボーカル)は陽音階(G A B D E)だけ
{
  const song = Matsuri.buildSong();
  const YO = [m("G4"), m("A4"), m("B4"), m("D4"), m("E4")].map(pc);
  for (const e of song.events) if (MELODY.has(e.inst)) assert.ok(YO.includes(pc(e.midi)), `祭ノ宵: 陽音階でない音 ${e.midi}(${e.bar} 小節)`);
}
// 「疾風迅雷」: ラスサビはサビの全音上
{
  const song = Shippu.buildSong();
  const first = (name) => song.events.find((e) => e.inst === "shaku" && e.bar === song.sections.find((s) => s.name === name).startBar);
  assert.strictEqual(first("chorus2").midi - first("chorus").midi, 2, "疾風迅雷: ラスサビが全音上がっていない");
}
// 「天ノ調」: 篳篥は E マイナー(ブレイクの最後だけ C#)の音
{
  const song = Ten.buildSong();
  const MINOR = ["E4", "F#4", "G4", "A4", "B4", "C5", "D5"].map((x) => pc(m(x)));
  for (const e of song.events) {
    if (e.inst !== "hichi") continue;
    assert.ok(MINOR.includes(pc(e.midi)), `天ノ調: E マイナーでない音 ${e.midi}`);
  }
  assert.ok(song.events.some((e) => e.inst === "sho"), "天ノ調: 笙が無い");
}

for (const [def, r] of results) {
  const count = {};
  for (const e of r.song.events) count[e.inst] = (count[e.inst] || 0) + 1;
  console.log(`「${def.title}」${def.bpm} BPM・${r.song.duration.toFixed(1)} 秒・${r.song.bars} 小節・音 ${r.song.events.length} 個(メロディの頭 ${r.checked} 個を確認)`);
}
console.log("OK");
