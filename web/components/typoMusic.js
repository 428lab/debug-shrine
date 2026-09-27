// ミニゲーム「誤字祓い」の BGM(和風チップチューン)。Web Audio でその場で作る(音声ファイルは使わない)。
//
// - 152 BPM、D マイナー。ところどころ E♭ を混ぜて都節(和の音階)の響きに
// - 16 小節(A 8 + B 8、約 25 秒)を切れ目なくくり返す
// - 音: 矩形波のメロディ(ピコピコ)、三角波のベース(8 分でオクターブを跳ねる)、ノイズと三角波のドラム、
//   鈴(4 小節ごと)と太鼓(8 小節ごと)
// - 盛り上がり(level): 0 = メロディ・ベース・軽いドラム、1 = + アルペジオ・16 分のハイハット、
//   2 = + 上の対旋律・スネアの連打。ゲームの難しさ(時間)に合わせて上げる
//
// 使い方: const m = createMusic(ctx, out); m.start(); m.setLevel(1); m.stop(0.5);
// OfflineAudioContext でも動く(試聴用の書き出し)。

const BPM = 152;
const STEP = 60 / BPM / 4;
const BARS = 16;
const LOOP = BARS * 16; // ステップ数

const NOTE = { C: 0, "C#": 1, D: 2, Eb: 3, E: 4, F: 5, "F#": 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
function m(name) {
  const mm = /^([A-G](?:#|b)?)(-?\d)$/.exec(name);
  return 12 * (Number(mm[2]) + 1) + NOTE[mm[1]];
}
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

// コード(根音と 3 和音)
const CHORDS = {
  Dm: ["D", [0, 3, 7]],
  Bb: ["Bb", [0, 4, 7]],
  C: ["C", [0, 4, 7]],
  Gm: ["G", [0, 3, 7]],
  A: ["A", [0, 4, 7]],
};
const PROG = ["Dm", "Dm", "Bb", "C", "Dm", "Dm", "Gm", "A", "Bb", "C", "Dm", "Dm", "Bb", "C", "A", "A"];

// メロディ([ステップ, 音, 長さ])
const MEL = [
  [[0, "D5", 2], [2, "A4", 2], [4, "D5", 2], [6, "Eb5", 2], [8, "D5", 4], [12, "A4", 2], [14, "C5", 2]],
  [[0, "D5", 2], [2, "F5", 2], [4, "A5", 4], [8, "F5", 2], [10, "G5", 2], [12, "A5", 2], [14, "Eb5", 2]],
  [[0, "D5", 4], [4, "Bb4", 2], [6, "D5", 2], [8, "F5", 4], [12, "D5", 4]],
  [[0, "E5", 2], [2, "G5", 2], [4, "C6", 4], [8, "E6", 2], [10, "D6", 2], [12, "C6", 4]],
  [[0, "A5", 2], [2, "G5", 2], [4, "A5", 2], [6, "C6", 2], [8, "D6", 2], [10, "C6", 2], [12, "A5", 2], [14, "G5", 2]],
  [[0, "F5", 4], [4, "A5", 2], [6, "G5", 2], [8, "F5", 2], [10, "G5", 2], [12, "A5", 2], [14, "G5", 2]],
  [[0, "G5", 2], [2, "Bb5", 2], [4, "D6", 4], [8, "Bb5", 2], [10, "A5", 2], [12, "G5", 4]],
  [[0, "A5", 6], [6, "G5", 2], [8, "E5", 2], [10, "C#5", 2], [12, "A4", 4]],
  [[0, "F5", 2], [2, "F5", 1], [3, "G5", 1], [4, "F5", 2], [6, "D5", 2], [8, "Bb4", 2], [10, "D5", 2], [12, "F5", 4]],
  [[0, "G5", 2], [2, "G5", 1], [3, "A5", 1], [4, "G5", 2], [6, "E5", 2], [8, "C5", 2], [10, "E5", 2], [12, "G5", 4]],
  [[0, "A5", 4], [4, "D6", 4], [8, "A5", 2], [10, "C6", 2], [12, "D6", 2], [14, "C6", 2]],
  [[0, "A5", 8], [8, "D5", 2], [10, "Eb5", 2], [12, "F5", 2], [14, "G5", 2]],
  [[0, "Bb5", 4], [4, "F5", 2], [6, "G5", 2], [8, "F5", 4], [12, "D5", 4]],
  [[0, "C6", 4], [4, "G5", 2], [6, "A5", 2], [8, "G5", 4], [12, "E5", 4]],
  [[0, "A5", 2], [2, "C#6", 2], [4, "E6", 4], [8, "C#6", 2], [10, "D6", 2], [12, "A5", 4]],
  [[0, "E6", 2], [2, "C#6", 2], [4, "A5", 2], [6, "E5", 2], [8, "A5", 1], [9, "A5", 1], [10, "A5", 2], [12, "C#6", 2], [14, "E6", 2]],
];

// 1 周分の音の並び(step は 0〜LOOP-1、lv はこの盛り上がりから鳴らす)
function buildLoop() {
  const ev = [];
  const add = (step, inst, props) => ev.push(Object.assign({ step, inst, lv: 0 }, props));
  PROG.forEach((name, bar) => {
    const [root, tones] = CHORDS[name];
    const s0 = bar * 16;
    const bassRoot = m(root + "2") > m("Eb2") ? m(root + "1") : m(root + "2");
    // メロディ(矩形波 25%)と、盛り上がり 2 からは 1 オクターブ上の対旋律(12.5%、少し遅らせる)
    for (const [s, n, l] of MEL[bar]) {
      add(s0 + s, "lead", { midi: m(n), len: l });
      add(s0 + s, "lead2", { midi: m(n) + 12, len: l, lv: 2 });
    }
    // ベース(三角波): 8 分でオクターブを跳ねる
    for (let s = 0; s < 16; s += 2) add(s0 + s, "bass", { midi: bassRoot + (s % 4 === 2 ? 12 : 0), len: 2 });
    // アルペジオ(矩形波 12.5%、16 分)
    const r = m(root + "5");
    const arp = [0, 1, 2, 1];
    for (let s = 0; s < 16; s++) add(s0 + s, "arp", { midi: r + tones[arp[s % 4]] + (s >= 8 ? 12 : 0) - 12, len: 1, lv: 1 });
    // ドラム
    for (const s of [0, 8]) add(s0 + s, "kick", {});
    add(s0 + 10, "kick", { lv: 2 });
    for (const s of [4, 12]) add(s0 + s, "snare", {});
    for (let s = 0; s < 16; s += 2) add(s0 + s, "hat", { open: s % 4 === 2 });
    for (let s = 1; s < 16; s += 2) add(s0 + s, "hat", { lv: 1, soft: true });
    if (bar % 4 === 3) for (const s of [12, 13, 14, 15]) add(s0 + s, "snare", { lv: 2, soft: s < 15 });
    // 和の味付け
    if (bar % 4 === 0) add(s0, "suzu", {});
    if (bar % 8 === 0) add(s0, "taiko", {});
  });
  ev.sort((a, b) => a.step - b.step);
  return ev;
}

function createMusic(ctx, out) {
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(out);
  const LOOP_EV = buildLoop();
  // 矩形波(デューティ比ごとの波形)
  const pulse = (duty) => {
    const n = 40;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return ctx.createPeriodicWave(real, imag);
  };
  const P25 = pulse(0.25);
  const P125 = pulse(0.125);
  const noiseBuf = (() => {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    // チップチューンらしく、少し粗いノイズ(同じ値を 2 つずつ)
    for (let i = 0; i < d.length; i += 2) d[i] = d[i + 1] = Math.random() * 2 - 1;
    return b;
  })();

  function tone(t, freq, dur, vol, wave, type) {
    const o = ctx.createOscillator();
    if (wave) o.setPeriodicWave(wave);
    else o.type = type || "triangle";
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.setValueAtTime(vol, t + Math.max(0.005, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
    return o;
  }
  function noise(t, dur, vol, type, freq) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }
  const I = {
    lead(t, e) {
      const o = tone(t, mtof(e.midi), e.len * STEP * 0.92, 0.16, P25);
      // 長い音はビブラート(ファミコン風に遅れてかかる)
      if (e.len >= 4) {
        const v = ctx.createOscillator();
        v.frequency.value = 6;
        const vg = ctx.createGain();
        vg.gain.setValueAtTime(0, t);
        vg.gain.setValueAtTime(0, t + 0.15);
        vg.gain.linearRampToValueAtTime(mtof(e.midi) * 0.012, t + 0.3);
        v.connect(vg);
        vg.connect(o.frequency);
        v.start(t);
        v.stop(t + e.len * STEP + 0.05);
      }
    },
    lead2(t, e) {
      tone(t + STEP * 0.5, mtof(e.midi), e.len * STEP * 0.6, 0.05, P125);
    },
    bass(t, e) {
      tone(t, mtof(e.midi), e.len * STEP * 0.85, 0.34, null, "triangle");
    },
    arp(t, e) {
      tone(t, mtof(e.midi), STEP * 0.7, 0.045, P125);
    },
    kick(t) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + 0.15);
    },
    snare(t, e) {
      noise(t, e.soft ? 0.06 : 0.1, e.soft ? 0.12 : 0.22, "bandpass", 1800);
    },
    hat(t, e) {
      noise(t, e.open ? 0.07 : 0.025, e.soft ? 0.04 : 0.07, "highpass", 7000);
    },
    suzu(t) {
      for (let k = 0; k < 3; k++) {
        for (const r of [1, 2.76, 5.4]) tone(t + k * 0.04, 2300 * r, 0.35, 0.05 / r, null, "sine");
      }
    },
    taiko(t) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + 0.65);
    },
  };

  let level = 0;
  let playing = false;
  let startAt = 0;
  let nextStep = 0; // これまでに予約した通しのステップ
  let timer = null;
  // 先読みして予約する(until まで)
  function schedule(until) {
    while (playing) {
      const t = startAt + nextStep * STEP;
      if (t >= until) break;
      const s = nextStep % LOOP;
      for (const e of LOOP_EV) {
        if (e.step !== s) continue;
        if (e.lv > level) continue;
        I[e.inst](Math.max(t, ctx.currentTime), e);
      }
      nextStep++;
    }
  }
  function start(vol = 0.5) {
    if (playing) return;
    playing = true;
    startAt = ctx.currentTime + 0.08;
    nextStep = 0;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(vol, ctx.currentTime);
    if (typeof setInterval === "function" && !ctx.startRendering) {
      schedule(ctx.currentTime + 0.2);
      timer = setInterval(() => schedule(ctx.currentTime + 0.2), 25);
    }
  }
  function stop(fade = 0.3) {
    if (!playing) return;
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + fade);
  }
  return {
    start,
    stop,
    setLevel(lv) {
      level = lv;
    },
    // 書き出し用: seconds 秒分を先に全部予約する
    renderAhead(seconds) {
      schedule(startAt + seconds);
    },
    get playing() {
      return playing;
    },
  };
}

module.exports = { createMusic, BPM, STEP, BARS, LOOP, buildLoop };
