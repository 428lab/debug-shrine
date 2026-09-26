// リズムゲームの曲(譜面の元になる音の並び)。描画も音も含まない純関数。
//
// 和のテイストのボカロ系の曲をプログラムで組み立てる。音は rhythmAudio.js がその場で
// 合成して鳴らす(音声ファイルは使わない)。歌の代わりに、母音を合成した「ボーカル
// チョップ」がメロディを受け持つ。
//
// - 172 BPM、D マイナー。サビは王道進行(B♭ C Am Dm)
// - 構成: イントロ(三味線 → 和太鼓)→ A メロ → B メロ → サビ ×2 → 和のブレイク
//   → 半音上げの最後のサビ → 締め
// - 1 小節 = 16 ステップ(16 分音符)。音は { step, midi, len, ... } で書き、時刻に直す
//
// 検証は scripts/test-rhythm-song.js。

const BPM = 172;
const STEP = 60 / BPM / 4; // 16 分音符の秒数
const BAR = STEP * 16;

// 音名 → MIDI 番号(C4 = 60)
const NOTE = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
function m(name) {
  const mm = /^([A-G](?:#|b)?)(-?\d)$/.exec(name);
  if (!mm) throw new Error(`bad note ${name}`);
  return 12 * (Number(mm[2]) + 1) + NOTE[mm[1]];
}

// コード(根音と構成音の半音差)
const CHORDS = {
  Dm: { root: "D", tones: [0, 3, 7] },
  Bb: { root: "Bb", tones: [0, 4, 7] },
  C: { root: "C", tones: [0, 4, 7] },
  Am: { root: "A", tones: [0, 3, 7] },
  Gm: { root: "G", tones: [0, 3, 7] },
  A: { root: "A", tones: [0, 4, 7] },
};
function chordRoot(name, octave) {
  return m(CHORDS[name].root + octave);
}

// ---- メロディ(ボーカルチョップ)。[ステップ, 音, 長さ] を小節ごとに ----
const VERSE_MEL = [
  [[0, "A4", 2], [2, "D5", 2], [4, "F5", 2], [6, "E5", 2], [8, "D5", 4], [14, "A4", 2]],
  [[0, "D5", 2], [2, "F5", 2], [4, "G5", 4], [8, "F5", 2], [10, "D5", 2], [12, "F5", 4]],
  [[0, "E5", 2], [2, "G5", 2], [4, "E5", 2], [6, "C5", 2], [8, "D5", 4], [12, "E5", 2], [14, "G5", 2]],
  [[0, "A5", 6], [6, "G5", 2], [8, "E5", 4]],
  [[0, "A4", 2], [2, "D5", 2], [4, "F5", 2], [6, "A5", 2], [8, "G5", 4], [14, "F5", 2]],
  [[0, "D5", 2], [2, "F5", 2], [4, "Bb5", 4], [8, "A5", 2], [10, "F5", 2], [12, "D5", 4]],
  [[0, "E5", 2], [2, "G5", 2], [4, "C6", 4], [8, "Bb5", 2], [10, "G5", 2], [12, "E5", 4]],
  [[0, "A5", 8], [8, "C5", 2], [10, "D5", 2], [12, "E5", 4]],
];
const PRE_MEL = [
  [[0, "D5", 4], [4, "G5", 4], [8, "F5", 4], [12, "D5", 4]],
  [[0, "E5", 4], [4, "A5", 4], [8, "G5", 4], [12, "E5", 4]],
  [[0, "F5", 4], [4, "Bb5", 4], [8, "A5", 4], [12, "F5", 4]],
  [[0, "G5", 4], [4, "C6", 4], [8, "Bb5", 4], [12, "G5", 4]],
  [[0, "D5", 2], [2, "G5", 2], [4, "Bb5", 2], [6, "D6", 2], [8, "C6", 2], [10, "Bb5", 2], [12, "G5", 4]],
  [[0, "E5", 2], [2, "A5", 2], [4, "C6", 2], [6, "E6", 2], [8, "D6", 2], [10, "C6", 2], [12, "A5", 4]],
  [[0, "Bb5", 8], [8, "C6", 8]],
  // 最後はためて「ア!」(サビ直前の空白に入る)
  [[0, "C#6", 8], [14, "A5", 2]],
];
const HOOK_MEL = [
  [[0, "D5", 2], [2, "F5", 2], [4, "G5", 3], [7, "F5", 1], [8, "D5", 2], [10, "C5", 2], [12, "D5", 4]],
  [[0, "E5", 2], [2, "G5", 2], [4, "A5", 4], [8, "G5", 2], [10, "E5", 2], [12, "C5", 2], [14, "D5", 2]],
  [[0, "E5", 2], [2, "A5", 2], [4, "C6", 3], [7, "A5", 1], [8, "G5", 2], [10, "E5", 2], [12, "A5", 4]],
  [[0, "A5", 2], [2, "F5", 2], [4, "D5", 4], [8, "F5", 1], [9, "G5", 1], [10, "A5", 2], [12, "D6", 4]],
  [[0, "D6", 2], [2, "C6", 2], [4, "Bb5", 3], [7, "A5", 1], [8, "G5", 2], [10, "A5", 2], [12, "Bb5", 4]],
  [[0, "C6", 2], [2, "Bb5", 2], [4, "A5", 2], [6, "G5", 2], [8, "E5", 2], [10, "G5", 2], [12, "C6", 4]],
  [[0, "C#6", 4], [4, "A5", 2], [6, "E5", 2], [8, "C#5", 2], [10, "E5", 2], [12, "A5", 2], [14, "G5", 2]],
  // 「アー、ア・ア・ア」と連打して駆け上がる
  [[0, "A5", 6], [8, "A5", 1], [9, "A5", 1], [10, "A5", 1], [12, "C#6", 2], [14, "E6", 2]],
];
// 母音の並び(意味のある言葉ではなく、響きで選ぶ)
const VOWELS = "aiaoeiaouaeaoia";

// 三味線のリフ(都節の響き: D E♭ G A B♭)。1 小節ずつ交互に
const SHAMI_A = [[0, "D5"], [2, "A5"], [3, "G5"], [4, "A5"], [6, "D6"], [8, "Bb5"], [9, "A5"], [10, "G5"], [12, "Eb5"], [13, "D5"], [14, "A4"], [15, "D5"]];
const SHAMI_B = [[0, "D5"], [2, "Eb5"], [4, "G5"], [6, "A5"], [7, "Bb5"], [8, "A5"], [10, "G5"], [11, "Eb5"], [12, "D5"], [14, "D5"], [15, "D5"]];

// ---- 曲の構成 ----
const SECTIONS = [
  { name: "intro", label: "イントロ", bars: 4, chords: ["Dm", "Dm", "Dm", "Dm"] },
  { name: "intro2", label: "イントロ(太鼓)", bars: 4, chords: ["Dm", "Dm", "Dm", "Dm"] },
  { name: "verse", label: "A メロ", bars: 8, chords: ["Dm", "Bb", "C", "Am", "Dm", "Bb", "C", "Am"] },
  { name: "pre", label: "B メロ", bars: 8, chords: ["Gm", "Am", "Bb", "C", "Gm", "Am", "Bb", "A"] },
  { name: "chorus", label: "サビ", bars: 8, chords: ["Bb", "C", "Am", "Dm", "Gm", "C", "A", "A"] },
  { name: "chorus2", label: "サビ 2", bars: 8, chords: ["Bb", "C", "Am", "Dm", "Gm", "C", "A", "A"] },
  { name: "break", label: "和のブレイク", bars: 4, chords: ["Dm", "Dm", "Dm", "A"] },
  { name: "chorus3", label: "ラスサビ(転調)", bars: 8, chords: ["Bb", "C", "Am", "Dm", "Gm", "C", "A", "A"], key: 1 },
  { name: "outro", label: "締め", bars: 2, chords: ["Dm", "Dm"], key: 1 },
];

function buildSong() {
  const events = [];
  const sections = [];
  let bar0 = 0;
  const add = (bar, step, inst, props = {}) => {
    events.push(Object.assign({ t: (bar * 16 + step) * STEP, bar, step, inst }, props));
  };
  for (const sec of SECTIONS) {
    const key = sec.key || 0;
    sections.push({ name: sec.name, label: sec.label, startBar: bar0, bars: sec.bars, start: bar0 * BAR, key });
    for (let b = 0; b < sec.bars; b++) {
      const bar = bar0 + b;
      const chord = sec.chords[b];
      // ベースの根音は E1〜D#2 に収める(オクターブ上を足しても低音のまま)
      let root = chordRoot(chord, 2) + key;
      while (root > m("D#2")) root -= 12;
      const tones = CHORDS[chord].tones;
      const last = b === sec.bars - 1;
      const n = sec.name;
      const chorus = n.startsWith("chorus");

      // --- 和の楽器 ---
      if (n === "intro" || n === "intro2" || n === "break") {
        const riff = b % 2 === 0 ? SHAMI_A : SHAMI_B;
        for (const [s, name] of riff) add(bar, s, "shamisen", { midi: m(name) + key, len: STEP * 2, vel: s % 4 === 0 ? 1 : 0.75 });
        if (b % 2 === 0) add(bar, 0, "suzu", { vel: 0.8 });
      }
      if (n === "intro2" || n === "break") {
        for (const s of [0, 6, 8, 12, 14]) add(bar, s, "taiko", { vel: s === 0 ? 1 : 0.75 });
      }
      if (n === "intro2" && last) {
        for (let s = 0; s < 16; s++) add(bar, s, "snare", { vel: 0.3 + (0.7 * s) / 15 });
        add(bar, 0, "riser", { len: BAR });
      }
      if (n === "break" && last) {
        for (let s = 8; s < 16; s++) add(bar, s, "taiko", { vel: 0.6 + (0.4 * (s - 8)) / 7 });
        add(bar, 0, "riser", { len: BAR });
      }
      if (n === "verse") {
        // 琴のアルペジオ(控えめ)
        const base = chordRoot(chord, 4) + key;
        const arp = [0, 1, 2, 1, 0, 2, 1, 2];
        arp.forEach((ti, i) => add(bar, i * 2, "koto", { midi: base + tones[ti] + (i >= 4 ? 12 : 0), len: STEP * 4, vel: 0.5 }));
      }
      if (chorus && b % 2 === 0) add(bar, 0, "taiko", { vel: 1 });
      if (chorus && b % 4 === 0) add(bar, 0, "suzu", { vel: 1 });
      if (chorus && b === 0) add(bar, 0, "crash", { vel: 1 });
      if (n === "chorus2" || n === "chorus3") {
        // 笛の対旋律(長い音)
        const top = chordRoot(chord, 5) + key + tones[b % 2 === 0 ? 1 : 2];
        add(bar, 0, "fue", { midi: top, len: BAR * 0.95, vel: 0.55 });
      }

      // --- リズム ---
      if (n === "verse") {
        for (const s of [0, 10]) add(bar, s, "kick", { vel: 1 });
        add(bar, 8, "snare", { vel: 0.9 });
        for (let s = 0; s < 16; s += 2) add(bar, s, "hat", { vel: s % 4 === 0 ? 0.5 : 0.35 });
      }
      if (n === "pre") {
        if (b < 4) {
          for (const s of [0, 8]) add(bar, s, "kick", { vel: 1 });
          for (const s of [4, 12]) add(bar, s, "snare", { vel: 0.85 });
        } else if (b < 6) {
          for (const s of [0, 4, 8, 12]) add(bar, s, "kick", { vel: 1 });
          for (const s of [4, 12]) add(bar, s, "snare", { vel: 0.9 });
        } else if (b === 6) {
          for (const s of [0, 4, 8, 12]) add(bar, s, "kick", { vel: 1 });
          for (let s = 0; s < 16; s += 2) add(bar, s, "snare", { vel: 0.5 + s / 32 });
          add(bar, 0, "riser", { len: BAR * 2 });
        } else {
          // 最後の小節: 16 分の連打で詰めて、最後の拍は空ける(サビ前の「ため」)
          for (let s = 0; s < 12; s++) add(bar, s, "snare", { vel: 0.5 + s / 24 });
        }
        for (let s = 0; s < 16; s += 2) if (!(b === 7 && s >= 12)) add(bar, s, "hat", { vel: 0.35 });
      }
      if (chorus) {
        for (const s of [0, 4, 8, 12]) add(bar, s, "kick", { vel: 1 });
        for (const s of [4, 12]) {
          add(bar, s, "snare", { vel: 0.9 });
          add(bar, s, "clap", { vel: 0.7 });
        }
        for (const s of [2, 6, 10, 14]) add(bar, s, "openhat", { vel: 0.45 });
        for (let s = 0; s < 16; s++) if (s % 2 === 1) add(bar, s, "hat", { vel: 0.22 });
        if (last) for (const s of [12, 13, 14, 15]) add(bar, s, "snare", { vel: 0.7 + (s - 12) * 0.1 });
      }
      if (n === "outro") {
        if (b === 0) {
          add(bar, 0, "kick", { vel: 1 });
          add(bar, 0, "crash", { vel: 1 });
          add(bar, 0, "taiko", { vel: 1 });
          add(bar, 0, "suzu", { vel: 1 });
          const base = chordRoot(chord, 3) + key;
          add(bar, 0, "saw", { midis: tones.map((x) => base + x).concat([base + 12]), len: BAR * 2, vel: 0.9 });
          add(bar, 0, "shamisen", { midi: m("D5") + key, len: STEP * 8, vel: 1 });
        }
      }

      // --- ベース ---
      if (n === "verse") {
        for (const [s, l] of [[0, 3], [3, 3], [6, 2], [8, 4], [12, 2], [14, 2]]) add(bar, s, "bass", { midi: root + (s === 14 ? 12 : 0), len: STEP * l, vel: 0.9 });
      }
      if (n === "pre") {
        const upto = b === 7 ? 12 : 16;
        for (let s = 0; s < upto; s += 2) add(bar, s, "bass", { midi: root, len: STEP * 2, vel: 0.85 });
      }
      if (chorus) {
        for (let s = 0; s < 16; s += 2) add(bar, s, "bass", { midi: root + (s % 4 === 2 ? 12 : 0), len: STEP * 2, vel: 0.95 });
      }
      if (n === "intro2" && b >= 2) {
        for (const s of [0, 6, 8, 12, 14]) add(bar, s, "bass", { midi: root, len: STEP * 2, vel: 0.8 });
      }

      // --- シンセ(和音)とピアノ ---
      // 和音は A3〜E5 あたりに収める(高すぎる根音は 1 オクターブ下げる)
      let base = chordRoot(chord, 4) + key;
      if (base > m("F4")) base -= 12;
      const midis = tones.map((x) => base + x).concat([base + 12]);
      if (n === "pre") {
        add(bar, 0, "saw", { midis, len: BAR, vel: b >= 4 ? 0.6 : 0.4, pad: true });
      }
      if (chorus) {
        for (const [s, l] of [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]]) add(bar, s, "saw", { midis, len: STEP * l, vel: 0.7 });
        // ピアノの 16 分のアルペジオ(1-5-8-5-10-8-5-8)
        const r = chordRoot(chord, 5) + key;
        const third = tones[1];
        const pat = [0, 7, 12, 7, 12 + third, 12, 7, 12];
        for (let s = 0; s < 16; s++) add(bar, s, "piano", { midi: r + pat[s % 8] - 12, len: STEP * 1.5, vel: s % 4 === 0 ? 0.7 : 0.5 });
      }

      // --- ボーカルチョップ ---
      let mel = null;
      if (n === "verse") mel = VERSE_MEL[b];
      if (n === "pre") mel = PRE_MEL[b];
      if (chorus) mel = HOOK_MEL[b];
      if (mel) {
        for (const [s, name, l] of mel) {
          const vi = (bar * 7 + s) % VOWELS.length;
          add(bar, s, "vox", { midi: m(name) + key, len: STEP * l, vel: chorus ? 0.9 : 0.75, vowel: VOWELS[vi] });
        }
      }
    }
    bar0 += sec.bars;
  }
  events.sort((a, b) => a.t - b.t);
  return { bpm: BPM, step: STEP, bar: BAR, bars: bar0, duration: bar0 * BAR + 2.5, sections, events };
}

module.exports = { BPM, STEP, BAR, SECTIONS, CHORDS, m, buildSong };
