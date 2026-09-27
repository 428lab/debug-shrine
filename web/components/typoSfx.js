// ミニゲーム「誤字祓い」の効果音(BGM に合わせたチップチューン風)。Web Audio でその場で作る。
//
// - slash: タップした時。祓串を 左・右・左 と振る「シュッ」3 回と、砕ける瞬間(impact 秒後)の上がる「ピュイーン」
// - done: 言葉を直した時。コインのような 2 音。コンボが増えるほど高くなる(陽音階)
// - miss: お手つき。低い「ブブッ」
// - leak: しめ縄まで落ちた時。下がる「ヒュ〜」と崩れる音
// - special: 一斉お祓い。駆け上がるアルペジオと、ふくらむノイズ
// - pillar: 光の柱。きらきら降りてくるアルペジオと鈴
// - over: 終わり。下がっていくジングル
//
// 使い方: const s = createSfx(ctx, out); s.play("done", { combo: 5, delay: 0.34 });

function createSfx(ctx, out) {
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(out);
  const pulse = (duty) => {
    const n = 40;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return ctx.createPeriodicWave(real, imag);
  };
  const P50 = pulse(0.5);
  const P25 = pulse(0.25);
  const P125 = pulse(0.125);
  const noiseBuf = (() => {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i += 3) d[i] = d[i + 1] = d[i + 2] = Math.random() * 2 - 1; // 粗いノイズ
    return b;
  })();
  const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // 音 1 つ。f1 があれば f0 → f1 へ滑らせる
  function note(t, f0, dur, vol, wave, f1) {
    const o = ctx.createOscillator();
    if (wave === "tri") o.type = "triangle";
    else o.setPeriodicWave(wave);
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function noise(t, dur, vol, type, f0, f1) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }
  // 速いアルペジオ(midi の並びを step 秒ずつ)
  function arp(t, midis, step, vol, wave, len) {
    midis.forEach((n, i) => note(t + i * step, mtof(n), len || step * 1.2, vol, wave));
  }

  const S = {
    slash(t, o) {
      // シュッ・シュッ・シュッ(左・右・左)
      for (const [dt, f0, f1] of [[0, 1800, 6000], [0.11, 2200, 7000], [0.22, 2000, 6500]]) noise(t + dt, 0.08, 0.32, "bandpass", f0, f1);
      // 砕ける瞬間: 上がる「ピュイーン」と破裂
      const ti = t + (o.impact || 0.34);
      arp(ti, [84, 88, 91, 96], 0.022, 0.09, P25);
      note(ti, mtof(72), 0.16, 0.08, P125, mtof(96));
      noise(ti, 0.18, 0.28, "highpass", 2500, 7000);
    },
    done(t, o) {
      // コンボで上がる陽音階の 2 音(コインのように)
      const scale = [0, 2, 4, 7, 9];
      const n = Math.min(o.combo || 0, 24);
      const base = 76 + scale[n % 5] + 12 * Math.floor(n / 5) * 0.5;
      note(t, mtof(Math.round(base)), 0.06, 0.1, P50);
      note(t + 0.06, mtof(Math.round(base) + 5), 0.22, 0.1, P50);
    },
    miss(t) {
      note(t, mtof(45), 0.07, 0.14, P50);
      note(t + 0.09, mtof(40), 0.14, 0.14, P50);
    },
    leak(t) {
      note(t, mtof(79), 0.45, 0.1, P25, mtof(43));
      noise(t + 0.2, 0.35, 0.25, "lowpass", 1200, 150);
      note(t + 0.2, 90, 0.3, 0.3, "tri", 45);
    },
    special(t) {
      // 駆け上がる 2 オクターブ
      arp(t + 0.05, [62, 65, 69, 72, 74, 77, 81, 84, 86, 89, 93, 96], 0.05, 0.07, P25);
      noise(t, 0.9, 0.18, "bandpass", 300, 6000);
      note(t + 0.9, 110, 0.5, 0.35, "tri", 50);
    },
    pillar(t) {
      // きらきら降りてくる + 鈴
      arp(t, [98, 93, 89, 86, 81, 77, 74, 69], 0.04, 0.07, P125, 0.18);
      arp(t + 0.02, [86, 81, 77, 74], 0.08, 0.06, P50, 0.3);
      for (let k = 0; k < 3; k++) for (const r of [1, 2.76, 5.4]) note(t + k * 0.05, 2400 * r, 0.4, 0.04 / r, "tri");
      noise(t, 0.4, 0.2, "highpass", 4000, 9000);
    },
    over(t) {
      arp(t, [79, 76, 72, 67], 0.14, 0.1, P25, 0.13);
      note(t + 0.6, mtof(62), 0.5, 0.12, P25, mtof(55));
      note(t + 0.6, mtof(38), 0.5, 0.3, "tri");
    },
  };

  return {
    play(kind, o = {}) {
      const fn = S[kind];
      if (fn) fn(ctx.currentTime + 0.005 + (o.delay || 0), o);
    },
  };
}

module.exports = { createSfx };
