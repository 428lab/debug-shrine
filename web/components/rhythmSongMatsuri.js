// リズムゲームの曲「祭ノ宵」(お祭りの EDM)。純関数。
//
// - 140 BPM、G メジャー。メロディは陽音階(G A B D E、4 度と 7 度を使わない)で明るく
// - 篠笛・締太鼓・当たり鉦(チャンチキ)のお囃子に、四つ打ちとシンセを重ねる
// - 「ア・ヨイ!」「ソーレ!」「セーノ!」「ワッショイ!」の掛け声(合成した声)
// - 構成: 篠笛 → お囃子の A メロ → 盛り上げ → ドロップ → 祭囃子のブレイク → 盛り上げ
//   → ドロップ(篠笛の対旋律つき)→ 締め
//
// 検証は scripts/test-rhythm-songs.js。

const { m, chordRoot, compose, melody } = require("./rhythmSongKit");

const BPM = 140;

// ---- 篠笛 ----
const INTRO_MEL = [
  [[0, "D6", 8], [8, "E6", 2], [10, "D6", 2], [12, "B5", 4]],
  [[0, "D6", 4], [4, "G6", 8], [12, "E6", 4]],
  [[0, "D6", 2], [2, "E6", 2], [4, "G6", 2], [6, "A6", 2], [8, "B6", 8]],
  [[0, "G6", 8]],
];
const VERSE_MEL = [
  [[0, "D6", 4], [4, "B5", 2], [6, "D6", 2], [8, "G6", 4], [12, "E6", 4]],
  [[0, "E6", 2], [2, "G6", 2], [4, "E6", 2], [6, "D6", 2], [8, "E6", 8]],
  [[0, "D6", 2], [2, "E6", 2], [4, "D6", 2], [6, "B5", 2], [8, "A5", 4], [12, "B5", 2], [14, "A5", 2]],
  [[0, "G5", 8], [8, "B5", 2], [10, "A5", 2], [12, "D6", 4]],
  [[0, "E6", 4], [4, "G6", 4], [8, "E6", 2], [10, "D6", 2], [12, "B5", 4]],
  [[0, "E6", 2], [2, "D6", 2], [4, "E6", 2], [6, "G6", 2], [8, "E6", 4], [12, "G6", 4]],
  [[0, "A6", 6], [6, "G6", 2], [8, "D6", 2], [10, "E6", 2], [12, "A5", 4]],
  [[0, "D6", 8]],
];
const BREAK_MEL = [
  null,
  null,
  [[0, "G6", 2], [2, "E6", 2], [4, "D6", 2], [6, "E6", 2], [8, "G6", 4], [12, "A6", 4]],
  [[0, "A6", 4], [4, "B6", 2], [6, "A6", 2], [8, "D6", 2], [10, "E6", 2], [12, "D6", 4]],
];

// ---- ボーカルチョップ ----
const BUILD_MEL = [
  [[0, "E5", 4], [4, "G5", 4], [8, "E5", 4], [12, "G5", 4]],
  [[0, "A5", 4], [4, "D5", 4], [8, "A5", 4]],
  [[0, "B5", 4], [4, "G5", 4], [8, "B5", 4], [12, "D6", 4]],
  [[0, "D6", 8], [8, "B5", 4]],
  [[0, "E5", 2], [2, "G5", 2], [4, "A5", 2], [6, "G5", 2], [8, "E5", 2], [10, "G5", 2], [12, "A5", 2], [14, "B5", 2]],
  [[0, "A5", 2], [2, "B5", 2], [4, "D6", 2], [6, "B5", 2], [8, "A5", 2], [10, "B5", 2]],
  [[0, "B5", 2], [2, "D6", 2], [4, "E6", 2], [6, "G6", 2], [8, "E6", 8]],
  [[0, "D6", 8]],
];
const HOOK_A = [[0, "E5", 2], [2, "G5", 2], [4, "G5", 2], [6, "A5", 2], [8, "G5", 3], [11, "E5", 1], [12, "G5", 4]];
const HOOK_MEL = [
  HOOK_A,
  [[0, "A5", 2], [2, "B5", 2], [4, "A5", 2], [6, "G5", 2], [8, "D5", 4], [12, "A5", 2], [14, "B5", 2]],
  [[0, "D6", 3], [3, "B5", 3], [6, "G5", 2], [8, "B5", 2], [10, "D6", 2], [12, "E6", 2], [14, "D6", 2]],
  [[0, "B5", 6], [6, "A5", 2], [8, "G5", 4], [12, "E5", 4]],
  HOOK_A,
  [[0, "A5", 2], [2, "B5", 2], [4, "D6", 2], [6, "B5", 2], [8, "A5", 2], [10, "G5", 2], [12, "A5", 4]],
  [[0, "B5", 2], [2, "D6", 2], [4, "E6", 2], [6, "D6", 2], [8, "B5", 2], [10, "A5", 2], [12, "G5", 4]],
  [[0, "G5", 8]],
];
const VOWELS = "aoaieaouaiaoea";

// ---- 掛け声([ステップ, 音節, 音, 長さ]) ----
const AYOI = [[10, "a", "E4", 2], [12, "yo", "D4", 1], [13, "i", "D4", 3]];
const SORE = [[12, "so", "D4", 2], [14, "re", "B3", 2]];
const SENO = [[8, "se", "E4", 3], [12, "no", "D4", 3]];
const WASSHOI = [[0, "wa", "D4", 2], [2, "sho", "D4", 1], [3, "i", "E4", 3], [8, "wa", "D4", 2], [10, "sho", "D4", 1], [11, "i", "E4", 3]];

const HOOK_CHORDS = ["C", "D", "G", "Em", "C", "D", "G", "G"];
const SECTIONS = [
  { name: "intro", label: "篠笛", bars: 4, chords: ["G", "G", "G", "G"] },
  { name: "verse", label: "お囃子", energy: 0.75, bars: 8, chords: ["G", "C", "D", "G", "Em", "C", "D", "D"] },
  { name: "pre", label: "盛り上げ", energy: 0.85, bars: 8, chords: ["C", "D", "Em", "G", "C", "D", "Em", "D"] },
  { name: "chorus", label: "ドロップ", bars: 8, chords: HOOK_CHORDS },
  { name: "break", label: "祭囃子", bars: 4, chords: ["G", "G", "G", "D"] },
  { name: "pre2", label: "盛り上げ", energy: 0.85, bars: 4, chords: ["C", "D", "Em", "D"] },
  { name: "chorus2", label: "ドロップ 2", bars: 8, chords: HOOK_CHORDS },
  { name: "outro", label: "締め", bars: 2, chords: ["G", "G"] },
];

function chants(c, list) {
  for (const [s, syl, name, l] of list) c.add(c.bar, s, "chant", { syl, midi: m(name), len: c.STEP * l, vel: 0.9 });
}
// チャンチキ: 拍ごとに「チャン・チキ」
function kane(c, vel = 1) {
  for (const q of [0, 4, 8, 12]) {
    c.add(c.bar, q, "kane", { vel: 0.7 * vel });
    c.add(c.bar, q + 2, "kane", { vel: 0.45 * vel, damp: true });
    c.add(c.bar, q + 3, "kane", { vel: 0.4 * vel, damp: true });
  }
}
// 締太鼓の「ドン・ドコ」
function shimeDoko(c, vel = 1) {
  for (const s of [0, 3, 4, 6, 8, 11, 12, 14]) c.add(c.bar, s, "shime", { vel: (s % 4 === 0 ? 0.9 : 0.6) * vel });
}

function perBar(c) {
  const { add, bar, b, n, last, STEP, BAR } = c;
  const chorus = n.startsWith("chorus");
  let root = chordRoot(c.chord, 2) + c.key;
  while (root > m("D#2")) root -= 12;
  let base = chordRoot(c.chord, 4) + c.key;
  if (base > m("F4")) base -= 12;
  const midis = c.tones.map((x) => base + x).concat([base + 12]);

  if (n === "intro") {
    melody(c, INTRO_MEL[b], "shino", { vel: 0.85, orn: true });
    if (b % 2 === 0) add(bar, 0, "taiko", { vel: 0.9 });
    if (b >= 1) kane(c, 0.4 + b * 0.2);
    if (b === 3) {
      for (let s = 0; s < 10; s++) add(bar, s, "shime", { vel: 0.4 + s * 0.06 });
      chants(c, AYOI);
    }
  }

  if (n === "verse") {
    melody(c, VERSE_MEL[b], "shino", { vel: 0.8, orn: true });
    if (last) chants(c, SORE);
    add(bar, 0, "taiko", { vel: 0.9 });
    for (const s of [0, 8]) add(bar, s, "kick", { vel: 0.9 });
    shimeDoko(c);
    kane(c, 0.8);
    for (const s of [2, 6, 10, 14]) add(bar, s, "bass", { midi: root + 12, len: STEP * 2, vel: 0.8 });
  }

  if (n === "pre" || n === "pre2") {
    const i = n === "pre2" ? b + 4 : b;
    melody(c, BUILD_MEL[i], "vox", { vel: 0.8, vowel: "a" });
    if (i === 1 || i === 3 || i === 5) chants(c, SORE);
    if (i === 7) chants(c, SENO);
    add(bar, 0, "saw", { midis, len: BAR, vel: 0.3 + i * 0.05, pad: true });
    if (i < 7) {
      for (const s of i >= 4 ? [0, 4, 8, 12] : [0, 8]) add(bar, s, "kick", { vel: 1 });
      const snares = i < 4 ? [4, 12] : i < 6 ? [0, 2, 4, 6, 8, 10, 12, 14] : Array.from({ length: 16 }, (_, s) => s);
      snares.forEach((s) => add(bar, s, "snare", { vel: 0.4 + (0.5 * (i * 16 + s)) / 112 }));
      for (const s of [2, 6, 10, 14]) add(bar, s, "bass", { midi: root + 12, len: STEP * 2, vel: 0.8 });
      kane(c, 0.6);
    } else {
      // 盛り上げの最後: 音を抜いて「セーノ!」
      add(bar, 0, "kick", { vel: 1 });
      add(bar, 0, "crash", { vel: 0.6 });
    }
    if (i === 6) add(bar, 0, "riser", { len: BAR * 2 });
  }

  if (chorus) {
    const mel = HOOK_MEL[b];
    mel.forEach(([s, name, l], k) => add(bar, s, "vox", { midi: m(name) + c.key, len: STEP * l, vel: 0.9, vowel: VOWELS[(bar * 5 + k) % VOWELS.length] }));
    if (last) chants(c, AYOI);
    for (const s of [0, 4, 8, 12]) add(bar, s, "kick", { vel: 1 });
    for (const s of [4, 12]) {
      add(bar, s, "clap", { vel: 0.8 });
      add(bar, s, "snare", { vel: 0.6 });
    }
    for (const s of [2, 6, 10, 14]) add(bar, s, "openhat", { vel: 0.4 });
    for (let s = 0; s < 16; s += 2) add(bar, s, "shime", { vel: s % 4 === 0 ? 0.35 : 0.5 });
    kane(c, 0.8);
    if (b === 0) add(bar, 0, "crash", { vel: 1 });
    if (b % 2 === 0) add(bar, 0, "taiko", { vel: 1 });
    if (b % 4 === 0) add(bar, 0, "suzu", { vel: 1 });
    for (const [s, l] of [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]]) add(bar, s, "saw", { midis, len: STEP * l, vel: 0.65 });
    for (let s = 0; s < 16; s += 2) add(bar, s, "bass", { midi: root + (s % 4 === 2 ? 12 : 0), len: STEP * 2, vel: 0.95 });
    const r = chordRoot(c.chord, 5) + c.key;
    const pat = [0, 7, 12, 7, 12 + c.tones[1], 12, 7, 12];
    for (let s = 0; s < 16; s++) add(bar, s, "piano", { midi: r + pat[s % 8] - 12, len: STEP * 1.5, vel: s % 4 === 0 ? 0.6 : 0.4 });
    if (n === "chorus2") {
      // 篠笛の対旋律(長い音)
      const top = chordRoot(c.chord, 6) + c.key + c.tones[b % 2 === 0 ? 1 : 2];
      add(bar, 0, "shino", { midi: top > m("B6") ? top - 12 : top, len: BAR * 0.9, vel: 0.5 });
    }
  }

  if (n === "break") {
    for (const s of [0, 6, 8, 11, 12, 14]) add(bar, s, "taiko", { vel: s === 0 ? 1 : 0.75 });
    kane(c, 0.9);
    if (b < 2) chants(c, WASSHOI);
    if (BREAK_MEL[b]) melody(c, BREAK_MEL[b], "shino", { vel: 0.85, orn: true });
    if (last) {
      for (let s = 0; s < 16; s++) add(bar, s, "shime", { vel: 0.4 + s * 0.04 });
      add(bar, 0, "riser", { len: BAR });
    } else {
      shimeDoko(c, 0.8);
    }
  }

  if (n === "outro" && b === 0) {
    for (const inst of ["kick", "crash", "taiko", "suzu"]) add(bar, 0, inst, { vel: 1 });
    add(bar, 0, "saw", { midis, len: BAR * 2, vel: 0.8 });
    add(bar, 0, "bass", { midi: root, len: BAR, vel: 0.9 });
    chants(c, [[0, "yo", "D4", 3], [3, "i", "D4", 6]]);
    add(bar, 0, "shino", { midi: m("G6"), len: BAR * 1.2, vel: 0.8, orn: true });
  }
}

function buildSong() {
  return compose(BPM, SECTIONS, perBar);
}

module.exports = { BPM, SECTIONS, buildSong };
