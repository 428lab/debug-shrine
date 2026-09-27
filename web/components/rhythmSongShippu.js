// リズムゲームの曲「疾風迅雷」(疾走する和ロック)。純関数。
//
// - 190 BPM、E マイナー。尺八(のような音)がメロディ、歪んだギターが刻む
// - ギターのリフは E と F がぶつかる和の響き(都節に近い E F A B C)
// - 構成: 尺八の独奏 → リフ → A メロ → B メロ → サビ → 間奏(リフ)→ 津軽三味線のソロ
//   → B メロ → 全音上げのサビ → サビの後半をもう一度 → 締め
//
// 検証は scripts/test-rhythm-songs.js。

const { m, chordRoot, compose, melody } = require("./rhythmSongKit");

const BPM = 190;

// ---- 尺八のメロディ([ステップ, 音, 長さ]) ----
const INTRO_MEL = [
  [[0, "E5", 6], [6, "G5", 2], [8, "A5", 8]],
  [[0, "B5", 4], [4, "A5", 2], [6, "G5", 2], [8, "E5", 8]],
  [[0, "B5", 2], [2, "D6", 2], [4, "E6", 8], [12, "D6", 2], [14, "B5", 2]],
  [[0, "E6", 12]],
];
const VERSE_MEL = [
  [[0, "B4", 2], [2, "E5", 2], [4, "G5", 2], [6, "F#5", 2], [8, "E5", 4], [12, "B4", 2], [14, "D5", 2]],
  [[0, "E5", 4], [4, "G5", 2], [6, "A5", 2], [8, "G5", 4], [12, "E5", 4]],
  [[0, "F#5", 2], [2, "A5", 2], [4, "D5", 2], [6, "E5", 2], [8, "F#5", 4], [12, "A5", 4]],
  [[0, "B5", 6], [6, "A5", 2], [8, "G5", 4], [12, "E5", 4]],
  [[0, "B4", 2], [2, "E5", 2], [4, "G5", 2], [6, "B5", 2], [8, "B5", 2], [10, "A5", 2], [12, "E5", 4]],
  [[0, "C6", 4], [4, "G5", 2], [6, "A5", 2], [8, "G5", 4], [12, "E5", 2], [14, "G5", 2]],
  [[0, "A5", 2], [2, "C6", 2], [4, "E6", 4], [8, "C6", 2], [10, "B5", 2], [12, "A5", 4]],
  [[0, "B5", 8], [8, "F#5", 2], [10, "A5", 2], [12, "D#5", 4]],
];
const PRE_MEL = [
  [[0, "E5", 4], [4, "A5", 4], [8, "C6", 4], [12, "A5", 4]],
  [[0, "F#5", 4], [4, "B5", 4], [8, "D6", 4], [12, "B5", 4]],
  [[0, "G5", 4], [4, "C6", 4], [8, "E6", 4], [12, "C6", 4]],
  [[0, "D6", 4], [4, "F#6", 8], [14, "A5", 2]],
];
// 2 回目の B メロは最後を A にして、全音上のサビへ
const PRE2_LAST = [[0, "C#6", 4], [4, "E6", 8], [14, "C#6", 2]];
const HOOK_MEL = [
  [[0, "E5", 2], [2, "G5", 2], [4, "C6", 3], [7, "B5", 1], [8, "G5", 2], [10, "A5", 2], [12, "G5", 4]],
  [[0, "A5", 2], [2, "F#5", 2], [4, "A5", 4], [8, "D6", 4], [12, "A5", 2], [14, "B5", 2]],
  [[0, "B5", 6], [6, "A5", 2], [8, "F#5", 4], [12, "D5", 2], [14, "F#5", 2]],
  [[0, "E5", 8], [8, "G5", 2], [10, "A5", 2], [12, "B5", 4]],
  [[0, "C6", 2], [2, "B5", 2], [4, "A5", 4], [8, "E5", 2], [10, "A5", 2], [12, "C6", 4]],
  [[0, "D6", 2], [2, "C6", 2], [4, "A5", 2], [6, "F#5", 2], [8, "A5", 4], [12, "D6", 4]],
  [[0, "B5", 2], [2, "D6", 2], [4, "G6", 6], [10, "F#6", 2], [12, "D6", 2], [14, "E6", 2]],
  [[0, "D#6", 8], [8, "F#6", 4], [12, "B5", 4]],
];
// 間奏で、リフに尺八が答える
const CALL_MEL = [[0, "E6", 4], [4, "D6", 2], [6, "B5", 2], [8, "E6", 8]];

// ---- ギターのリフ([ステップ, 根音, 長さ, ミュート]) ----
const RIFF_A = [[0, "E2", 2], [2, "E2", 1, 1], [3, "E2", 1, 1], [4, "G2", 2], [6, "E2", 2, 1], [8, "A2", 2], [10, "E2", 1, 1], [11, "E2", 1, 1], [12, "A#2", 2], [14, "B2", 2]];
const RIFF_B = [[0, "E2", 2], [2, "E2", 1, 1], [3, "E2", 1, 1], [4, "D3", 2], [6, "B2", 2], [8, "C3", 3], [11, "B2", 1], [12, "A2", 2], [14, "F2", 2]];

// ---- 津軽三味線のソロ(16 分で叩きつける)[ステップ, 音] ----
const SOLO = [
  [[0, "E5"], [1, "E5"], [2, "B4"], [3, "E5"], [4, "F5"], [5, "E5"], [6, "B4"], [7, "A4"], [8, "B4"], [10, "C5"], [11, "B4"], [12, "A4"], [13, "F4"], [14, "E4"], [15, "F4"]],
  [[0, "E4"], [2, "B4"], [3, "C5"], [4, "B4"], [6, "E5"], [7, "F5"], [8, "A5"], [9, "B5"], [10, "A5"], [11, "F5"], [12, "E5"], [14, "B4"], [15, "C5"]],
  [[0, "B4"], [1, "B4"], [2, "E5"], [3, "E5"], [4, "F5"], [5, "F5"], [6, "A5"], [7, "A5"], [8, "B5"], [9, "C6"], [10, "B5"], [11, "A5"], [12, "F5"], [13, "E5"], [14, "C5"], [15, "B4"]],
  [[0, "B4"], [4, "B4"], [6, "B4"], [8, "D#5"], [12, "F#5"]],
];

const HOOK_CHORDS = ["C", "D", "Bm", "Em", "Am", "D", "G", "B"];
const SECTIONS = [
  { name: "intro", label: "尺八", bars: 4, chords: ["Em", "Em", "Em", "Em"] },
  { name: "riff", label: "リフ", bars: 4, chords: ["Em", "Em", "Em", "Em"] },
  { name: "verse", label: "A メロ", energy: 0.75, bars: 8, chords: ["Em", "C", "D", "Em", "Em", "C", "Am", "B"] },
  { name: "pre", label: "B メロ", energy: 0.85, bars: 4, chords: ["Am", "Bm", "C", "D"] },
  { name: "chorus", label: "サビ", bars: 8, chords: HOOK_CHORDS },
  { name: "riff2", label: "間奏", bars: 4, chords: ["Em", "Em", "Em", "Em"] },
  { name: "solo", label: "津軽三味線", energy: 0.9, bars: 4, chords: ["Em", "Em", "Em", "B"] },
  { name: "pre2", label: "B メロ", energy: 0.85, bars: 4, chords: ["Am", "Bm", "C", "A"] },
  { name: "chorus2", label: "ラスサビ(転調)", bars: 8, chords: HOOK_CHORDS, key: 2 },
  { name: "chorus3", label: "もう一度", bars: 4, chords: HOOK_CHORDS.slice(4), key: 2 },
  { name: "outro", label: "締め", bars: 2, chords: ["Em", "Em"], key: 2 },
];

// ギターの根音は E2〜D#3 に収める
function gtrRoot(c) {
  let r = chordRoot(c.chord, 2) + c.key;
  while (r > m("D#3")) r -= 12;
  while (r < m("E2")) r += 12;
  return r;
}

function perBar(c) {
  const { add, bar, b, n, last, STEP, BAR } = c;
  const chorus = n.startsWith("chorus");
  const root = gtrRoot(c);
  const gtr = (s, len, props = {}) => add(bar, s, "gtr", Object.assign({ midi: root, len: STEP * len, vel: 0.9 }, props));
  const bass = (s, len, midi = root - 12, vel = 0.9) => add(bar, s, "bass", { midi, len: STEP * len, vel });

  // --- イントロ: 尺八の独奏 → 太鼓とギターが入って駆け込む ---
  if (n === "intro") {
    melody(c, INTRO_MEL[b], "shaku", { vel: 0.85 });
    add(bar, 0, "taiko", { vel: b < 2 ? 0.8 : 1 });
    if (b === 0) gtr(0, 32, { vel: 0.45 });
    if (b >= 2) {
      for (let s = 0; s < 16; s += 2) gtr(s, 2, { mute: true, vel: 0.5 + (0.4 * ((b - 2) * 16 + s)) / 32 });
      add(bar, 0, "kick", { vel: 1 });
      add(bar, 8, "kick", { vel: 1 });
    }
    if (b === 2) for (const s of [4, 12]) add(bar, s, "snare", { vel: 0.8 });
    if (b === 3) {
      for (let s = 0; s < 16; s += s < 8 ? 2 : 1) add(bar, s, "snare", { vel: 0.45 + (0.55 * s) / 15 });
      add(bar, 0, "riser", { len: BAR });
    }
  }

  // --- リフ ---
  if (n === "riff" || n === "riff2") {
    const riff = b % 2 === 0 ? RIFF_A : RIFF_B;
    for (const [s, name, l, mute] of riff) {
      add(bar, s, "gtr", { midi: m(name), len: STEP * l, vel: mute ? 0.75 : 1, mute: !!mute, riff: true });
      bass(s, l, m(name) - 12, 0.85);
    }
    for (const s of [0, 6, 8, 14]) add(bar, s, "kick", { vel: 1 });
    for (const s of [4, 12]) add(bar, s, "snare", { vel: 0.9 });
    for (let s = 0; s < 16; s += 2) add(bar, s, "hat", { vel: s % 4 === 0 ? 0.45 : 0.3 });
    if (b === 0) add(bar, 0, "crash", { vel: 1 });
    if (b % 2 === 0) add(bar, 0, "taiko", { vel: 0.9 });
    if (n === "riff2" && b % 2 === 1) melody(c, CALL_MEL, "shaku", { vel: 0.8 });
    if (n === "riff2" && last) add(bar, 0, "riser", { len: BAR });
  }

  // --- A メロ: ブリッジミュートの刻み ---
  if (n === "verse") {
    for (let s = 0; s < 16; s += 2) gtr(s, 2, { mute: true, vel: s % 8 === 0 ? 0.9 : 0.7 });
    for (let s = 0; s < 16; s += 2) bass(s, 2);
    for (const s of [0, 8, 10]) add(bar, s, "kick", { vel: 1 });
    for (const s of [4, 12]) add(bar, s, "snare", { vel: 0.85 });
    for (let s = 0; s < 16; s += 2) add(bar, s, "hat", { vel: s % 4 === 0 ? 0.45 : 0.3 });
    melody(c, VERSE_MEL[b], "shaku", { vel: 0.8 });
  }

  // --- B メロ: 伸ばすコードで持ち上げる ---
  if (n === "pre" || n === "pre2") {
    gtr(0, 8, { vel: 0.8 });
    gtr(8, last ? 4 : 8, { vel: 0.85 });
    for (let s = 0; s < (last ? 12 : 16); s += 4) bass(s, 4);
    let base = chordRoot(c.chord, 4) + c.key;
    if (base > m("F4")) base -= 12;
    add(bar, 0, "saw", { midis: c.tones.map((x) => base + x).concat([base + 12]), len: BAR, vel: 0.35 + b * 0.08, pad: true });
    if (!last) {
      for (const s of [0, 8]) add(bar, s, "kick", { vel: 1 });
      for (const s of [4, 12]) add(bar, s, "snare", { vel: 0.85 });
      for (let s = 0; s < 16; s += 2) add(bar, s, "hat", { vel: 0.35 });
    } else {
      // 最後の小節: 16 分の連打で詰めて、最後の拍は空ける(サビ前のため)
      for (let s = 0; s < 12; s++) add(bar, s, "snare", { vel: 0.5 + s / 24 });
      add(bar, 0, "kick", { vel: 1 });
      add(bar, 0, "riser", { len: BAR * 0.75 });
    }
    const mel = n === "pre2" && last ? PRE2_LAST : PRE_MEL[b];
    melody(c, mel, "shaku", { vel: 0.85 });
  }

  // --- 津軽三味線のソロ ---
  if (n === "solo") {
    for (const [s, name] of SOLO[b]) add(bar, s, "shamisen", { midi: m(name), len: STEP * 2, vel: s % 4 === 0 ? 1 : 0.8 });
    if (!last) {
      for (const s of [0, 8]) add(bar, s, "kick", { vel: 1 });
      for (const s of [4, 12]) add(bar, s, "snare", { vel: 0.7 });
      for (let s = 0; s < 16; s++) add(bar, s, "hat", { vel: s % 4 === 0 ? 0.35 : 0.2 });
      for (const s of [0, 4, 8, 12]) gtr(s, 1, { mute: true, vel: 0.5 });
      for (const s of [0, 8]) bass(s, 6, root - 12, 0.7);
    } else {
      // 決め: 全員で同じところを叩く
      for (const s of [0, 4, 6, 8, 12]) {
        add(bar, s, "kick", { vel: 1 });
        add(bar, s, "taiko", { vel: 1 });
        gtr(s, 2, { vel: 1 });
        bass(s, 2);
      }
      add(bar, 0, "crash", { vel: 1 });
    }
  }

  // --- サビ ---
  if (chorus) {
    for (const [s, l] of [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]]) gtr(s, l, { vel: 1 });
    for (let s = 0; s < 16; s += 2) bass(s, 2, root - 12 + (s % 4 === 2 ? 12 : 0), 0.95);
    for (const s of [0, 6, 8, 10]) add(bar, s, "kick", { vel: 1 });
    for (const s of [4, 12]) add(bar, s, "snare", { vel: 0.95 });
    for (let s = 0; s < 16; s += 2) add(bar, s, "openhat", { vel: s % 4 === 0 ? 0.35 : 0.25 });
    if (b % 4 === 0) add(bar, 0, "crash", { vel: 1 });
    if (b % 2 === 0) add(bar, 0, "taiko", { vel: 1 });
    if (b % 4 === 0) add(bar, 0, "suzu", { vel: 1 });
    if (last) for (const s of [13, 14, 15]) add(bar, s, "snare", { vel: 0.75 + (s - 13) * 0.1 });
    let base = chordRoot(c.chord, 4) + c.key;
    if (base > m("F4")) base -= 12;
    add(bar, 0, "saw", { midis: c.tones.map((x) => base + x).concat([base + 12]), len: BAR, vel: 0.45, pad: true });
    const hook = n === "chorus3" ? HOOK_MEL[b + 4] : HOOK_MEL[b];
    melody(c, hook, "shaku", { vel: 0.95 });
  }

  // --- 締め ---
  if (n === "outro" && b === 0) {
    for (const inst of ["kick", "crash", "taiko", "suzu"]) add(bar, 0, inst, { vel: 1 });
    gtr(0, 24, { vel: 1 });
    bass(0, 16);
    add(bar, 0, "shaku", { midi: m("E6") + c.key, len: STEP * 20, vel: 0.9 });
  }
}

function buildSong() {
  return compose(BPM, SECTIONS, perBar);
}

module.exports = { BPM, SECTIONS, buildSong };
