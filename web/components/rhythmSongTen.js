// リズムゲームの曲「天ノ調」(雅楽 × トランス)。純関数。
//
// - 128 BPM、E マイナー(ブレイクの最後だけ A メジャーで明るくして、ドロップへ)。進行は Em C G D
// - 笙(寄り添う音の束)がずっと鳴り、篳篥(ひちりき)がメロディ、琴が 16 分のアルペジオ
// - 四つ打ち・転がるベース・16 分で刻むシンセでトランスに。ブレイクで静かになり、
//   盛り上げてからドロップで解き放つ
// - 鞨鼓(かっこ)の、だんだん速くなる連打(もろ撥)と、鉦鼓(しょうこ)の金属音
//
// 検証は scripts/test-rhythm-songs.js。

const { m, chordRoot, compose, melody } = require("./rhythmSongKit");

const BPM = 128;

// ---- 篳篥 ----
const VERSE_MEL = [
  [[0, "E5", 8], [8, "B4", 4], [12, "D5", 4]],
  [[0, "C5", 8], [8, "E5", 4], [12, "G5", 4]],
  [[0, "D5", 8], [8, "B4", 4], [12, "G4", 4]],
  [[0, "A4", 12], [12, "D5", 4]],
  [[0, "B4", 4], [4, "E5", 4], [8, "G5", 8]],
  [[0, "E5", 8], [8, "G5", 4], [12, "E5", 4]],
  [[0, "D5", 4], [4, "G5", 4], [8, "B5", 8]],
  [[0, "A5", 12], [12, "F#5", 4]],
];
const BREAK_MEL = [
  [[0, "B5", 12], [12, "A5", 4]],
  [[0, "G5", 12], [12, "E5", 4]],
  [[0, "D5", 8], [8, "G5", 8]],
  [[0, "F#5", 16]],
  [[0, "B5", 8], [8, "G5", 4], [12, "A5", 4]],
  [[0, "G5", 8], [8, "E5", 8]],
  [[0, "D5", 4], [4, "G5", 4], [8, "B5", 8]],
  [[0, "A5", 16]],
];
const HOOK_MEL = [
  [[0, "B4", 4], [4, "E5", 4], [8, "G5", 4], [12, "F#5", 2], [14, "E5", 2]],
  [[0, "E5", 6], [6, "D5", 2], [8, "E5", 4], [12, "G5", 4]],
  [[0, "B5", 6], [6, "A5", 2], [8, "G5", 4], [12, "D5", 4]],
  [[0, "F#5", 8], [8, "A5", 4], [12, "F#5", 2], [14, "D5", 2]],
  [[0, "B4", 4], [4, "E5", 4], [8, "G5", 4], [12, "B5", 4]],
  [[0, "G5", 4], [4, "E5", 4], [8, "G5", 2], [10, "A5", 2], [12, "B5", 4]],
  [[0, "B5", 8], [8, "G5", 2], [10, "A5", 2], [12, "D5", 4]],
  [[0, "A5", 4], [4, "F#5", 4], [8, "D5", 8]],
];

// 琴のアルペジオ(和音の音を上下に行き来する)
const ARP = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 5, 3, 2, 1];
// トランスの刻み(16 分ごとの開け閉め)
const GATE = [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1];
// 鞨鼓のもろ撥(だんだん速く)
const MORORAI = [0, 5, 9, 11.5, 13, 14, 14.75, 15.25, 15.75];

const LOOP = ["Em", "C", "G", "D"];
const SECTIONS = [
  { name: "intro", label: "笙", bars: 4, chords: ["Em", "Em", "C", "D"] },
  { name: "verse", label: "篳篥", energy: 0.75, bars: 8, chords: LOOP.concat(LOOP) },
  { name: "break", label: "ブレイク", energy: 0.8, bars: 8, chords: LOOP.concat(["Em", "C", "G", "A"]) },
  { name: "pre", label: "盛り上げ", energy: 0.9, bars: 4, chords: ["C", "D", "C", "D"] },
  { name: "chorus", label: "ドロップ", bars: 8, chords: LOOP.concat(LOOP) },
  { name: "chorus2", label: "ドロップ 2", bars: 8, chords: LOOP.concat(LOOP) },
  { name: "outro", label: "締め", bars: 4, chords: ["Em", "C", "D", "Em"] },
];

function perBar(c) {
  const { add, bar, b, n, last, STEP, BAR } = c;
  const chorus = n.startsWith("chorus");
  let root = chordRoot(c.chord, 2) + c.key;
  while (root > m("D#2")) root -= 12;
  // 笙: 根音・3 度・5 度に、2 度と 9 度を寄せた音の束(A4〜B5 あたり)
  let sr = chordRoot(c.chord, 4) + c.key;
  if (sr < m("A4")) sr += 12;
  if (sr > m("D5")) sr -= 12;
  const sho = (vel, att) => add(bar, 0, "sho", { midis: [sr, sr + 2, sr + c.tones[1], sr + 7, sr + 12], len: BAR + 0.25, vel, att });
  // 琴の和音(E4〜E6)
  const kr = chordRoot(c.chord, 4) + c.key;
  const kt = [kr, kr + 7, kr + 12, kr + 12 + c.tones[1], kr + 19, kr + 24];
  const koto = (vel, every = 1) => {
    for (let s = 0; s < 16; s += every) add(bar, s, "koto", { midi: kt[ARP[s]], len: STEP * 3, vel: s % 4 === 0 ? vel : vel * 0.75 });
  };
  const hats = (closed) => {
    for (const s of [2, 6, 10, 14]) add(bar, s, "openhat", { vel: 0.4 });
    if (closed) for (let s = 0; s < 16; s++) if (s % 2 === 1) add(bar, s, "hat", { vel: 0.22 });
  };

  if (n === "intro") {
    sho(0.5 + b * 0.12, b === 0 ? 1.2 : 0.2);
    add(bar, 0, "kane", { vel: 0.5 });
    if (b % 2 === 0) add(bar, 0, "taiko", { vel: b === 0 ? 0.8 : 1 });
    if (b % 2 === 1) for (const s of MORORAI) add(bar, s, "shime", { vel: 0.4 + s * 0.035, pitch: 520 });
    if (b >= 2) koto(0.35, 2);
    if (last) add(bar, 0, "riser", { len: BAR });
  }

  if (n === "verse") {
    sho(0.35, 0.2);
    koto(0.4);
    for (const s of [0, 4, 8, 12]) add(bar, s, "kick", { vel: 1 });
    for (const s of [4, 12]) add(bar, s, "clap", { vel: 0.55 });
    hats(false);
    for (const s of [2, 6, 10, 14]) add(bar, s, "bass", { midi: root + 12, len: STEP * 2, vel: 0.85 });
    melody(c, VERSE_MEL[b], "hichi", { vel: 0.8 });
    if (b === 0) add(bar, 0, "crash", { vel: 0.8 });
  }

  if (n === "break") {
    // 静かに: 笙を前に出して、篳篥を長く歌わせる
    sho(0.75, 0.25);
    koto(0.45, 2);
    melody(c, BREAK_MEL[b], "hichi", { vel: 0.85 });
    add(bar, 0, "kane", { vel: 0.45 });
    if (b % 2 === 0) add(bar, 0, "taiko", { vel: 0.9 });
    if (b === 3 || last) for (const s of MORORAI) add(bar, s, "shime", { vel: 0.4 + s * 0.035, pitch: 520 });
  }

  if (n === "pre") {
    // 盛り上げ: 琴を強く、シンセをだんだん明るく、スネアを詰めていく
    if (b === 0) add(bar, 0, "saw", { midis: [m("E4"), m("B4"), m("E5"), m("G5")], len: BAR * 4, vel: 0.55, pad: true, sweep: true });
    koto(0.55);
    sho(0.4, 0.2);
    for (const s of b >= 2 ? [0, 4, 8, 12] : [0, 8]) add(bar, s, "kick", { vel: 1 });
    for (const s of [2, 6, 10, 14]) add(bar, s, "bass", { midi: root + 12, len: STEP * 2, vel: 0.8 });
    const snares = b === 0 ? [0, 4, 8, 12] : b === 1 ? [0, 2, 4, 6, 8, 10, 12, 14] : b === 2 ? Array.from({ length: 16 }, (_, s) => s) : Array.from({ length: 12 }, (_, s) => s);
    snares.forEach((s) => add(bar, s, "snare", { vel: 0.35 + (0.6 * (b * 16 + s)) / 60 }));
    if (b === 2) add(bar, 0, "riser", { len: BAR * 1.75 });
  }

  if (chorus) {
    const midis = [sr - 12, sr - 12 + c.tones[1], sr - 5, sr];
    add(bar, 0, "saw", { midis, len: BAR, vel: 1, gate: GATE });
    sho(0.3, 0.2);
    koto(0.45);
    for (const s of [0, 4, 8, 12]) add(bar, s, "kick", { vel: 1 });
    for (const s of [4, 12]) {
      add(bar, s, "clap", { vel: 0.75 });
      add(bar, s, "snare", { vel: 0.5 });
    }
    hats(true);
    // 転がるベース(キックの場所だけ空ける)
    for (let s = 0; s < 16; s++) if (s % 4 !== 0) add(bar, s, "bass", { midi: root + 12, len: STEP, vel: s % 4 === 2 ? 0.9 : 0.7 });
    if (b === 0) add(bar, 0, "crash", { vel: 1 });
    if (b % 2 === 0) add(bar, 0, "taiko", { vel: 1 });
    if (b % 4 === 0) add(bar, 0, "suzu", { vel: 1 });
    melody(c, HOOK_MEL[b], "hichi", { vel: 0.95 });
    if (n === "chorus2") melody(c, HOOK_MEL[b], "vox", { vel: 0.55, vowel: b % 2 ? "o" : "a" });
    if (last) for (const s of [12, 13, 14, 15]) add(bar, s, "snare", { vel: 0.6 + (s - 12) * 0.1 });
  }

  if (n === "outro") {
    sho(0.7 - b * 0.1, 0.3);
    if (b === 0) {
      for (const inst of ["kick", "crash", "taiko", "suzu"]) add(bar, 0, inst, { vel: 1 });
      add(bar, 0, "hichi", { midi: m("E5") + c.key, len: BAR * 1.5, vel: 0.9 });
    }
    if (b < 3) koto(0.4 - b * 0.1, 2);
    if (last) {
      add(bar, 0, "kane", { vel: 0.6 });
      add(bar, 0, "taiko", { vel: 0.8 });
    }
  }
}

function buildSong() {
  return compose(BPM, SECTIONS, perBar);
}

module.exports = { BPM, SECTIONS, buildSong };
