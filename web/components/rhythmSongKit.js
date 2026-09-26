// リズムゲームの曲を組み立てるための道具(音名、コード、区間ごとの組み立て)。純関数。
//
// 曲は「区間(A メロ、サビ ...)の並び」と「1 小節ずつ音を置く関数」で書く。
// 1 小節 = 16 ステップ(16 分音符)。音は { t, bar, step, inst, ... } の形で、rhythmAudio.js が鳴らし、
// rhythmChart.js が譜面にする。

const NOTE = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };

// 音名 → MIDI 番号(C4 = 60)
function m(name) {
  const mm = /^([A-G](?:#|b)?)(-?\d)$/.exec(name);
  if (!mm) throw new Error(`bad note ${name}`);
  return 12 * (Number(mm[2]) + 1) + NOTE[mm[1]];
}

// コード名(C、F#m など)→ 根音の音名と構成音の半音差
function chord(name) {
  const mm = /^([A-G](?:#|b)?)(m?)$/.exec(name);
  if (!mm) throw new Error(`bad chord ${name}`);
  return { root: mm[1], pc: NOTE[mm[1]], tones: mm[2] ? [0, 3, 7] : [0, 4, 7] };
}
function chordRoot(name, octave) {
  return m(chord(name).root + octave);
}

// 区間の並びから曲を組み立てる。perBar(c) が 1 小節ずつ音を置く
function compose(bpm, sections, perBar) {
  const STEP = 60 / bpm / 4;
  const BAR = STEP * 16;
  const events = [];
  const secs = [];
  let bar0 = 0;
  let energy = 1;
  const add = (bar, step, inst, props = {}) => {
    const e = Object.assign({ t: (bar * 16 + step) * STEP, bar, step, inst }, props);
    if (e.vel != null) e.vel *= energy;
    events.push(e);
  };
  for (const sec of sections) {
    // 区間の強さ(A メロなどは控えめにして、サビで広がるように)
    energy = sec.energy || 1;
    const key = sec.key || 0;
    secs.push({ name: sec.name, label: sec.label, startBar: bar0, bars: sec.bars, start: bar0 * BAR, key });
    for (let b = 0; b < sec.bars; b++) {
      const name = sec.chords[b];
      perBar({
        add,
        bar: bar0 + b,
        b,
        n: sec.name,
        sec,
        key,
        chord: name,
        tones: chord(name).tones,
        last: b === sec.bars - 1,
        STEP,
        BAR,
      });
    }
    bar0 += sec.bars;
  }
  events.sort((a, b) => a.t - b.t);
  return { bpm, step: STEP, bar: BAR, bars: bar0, duration: bar0 * BAR + 2.5, sections: secs, events };
}

// メロディ([ステップ, 音名, 長さ] の並び)を置く
function melody(c, mel, inst, props = {}) {
  for (const [s, name, l] of mel) c.add(c.bar, s, inst, Object.assign({ midi: m(name) + c.key, len: c.STEP * l }, props));
}

module.exports = { m, chord, chordRoot, compose, melody };
