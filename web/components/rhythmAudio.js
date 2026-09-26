// リズムゲームの音(Web Audio でその場で合成する。音声ファイルは使わない)。
//
// - 曲: rhythmSong.js の音の並びを、少し先読みしながら予約して鳴らす(先読み 0.15 秒)
// - 楽器: 三味線・琴(弦をはじく音の物理モデル = Karplus-Strong を先に計算して使い回す)、
//   和太鼓・鈴・笛、キック・スネア・ハット・クラップ、分厚いシンセ(のこぎり波を 3 本
//   ずらして重ねる)、FM のピアノ、ベース
// - ボーカルチョップ: のこぎり波を 3 つの帯域フィルタ(声の「フォルマント」)に通して
//   母音(あいうえお)を作る。音の頭で下からずり上げる(しゃくり)、長い音にはビブラート
// - 効果音: レーン(鈴・太鼓・柏手)ごと、判定(極・良・可・不可)ごとに鳴らし分ける
//
// ブラウザでしか動かない(AudioContext を使う)。

function mtof(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// 母音のフォルマント(Hz)。少し高めにずらして、かわいい声に寄せる
const VOWELS = {
  a: [850, 1220, 2810],
  i: [310, 2790, 3310],
  u: [370, 950, 2670],
  e: [610, 2330, 2990],
  o: [450, 830, 2830],
};
const FORMANT_SHIFT = 1.12;

function createEngine(ctx) {
  const sr = ctx.sampleRate;

  // ---- 出口: コンプレッサ → マスター ----
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.12;
  comp.connect(master);
  master.connect(ctx.destination);

  // 残響(減衰するノイズを畳み込む)
  const reverb = ctx.createConvolver();
  {
    const len = Math.floor(sr * 1.8);
    const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    reverb.buffer = ir;
  }
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = 0.32;
  reverb.connect(reverbOut);
  reverbOut.connect(comp);

  // 付点 8 分のディレイ(ボーカルと笛に)
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.26;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const delayOut = ctx.createGain();
  delayOut.gain.value = 0.28;
  const delayLp = ctx.createBiquadFilter();
  delayLp.type = "lowpass";
  delayLp.frequency.value = 3500;
  delay.connect(delayLp);
  delayLp.connect(fb);
  fb.connect(delay);
  delayLp.connect(delayOut);
  delayOut.connect(comp);

  // 楽器ごとの通り道(音量と、残響・ディレイへの送り)
  function bus(level, rev = 0, dly = 0) {
    const g = ctx.createGain();
    g.gain.value = level;
    g.connect(comp);
    if (rev) {
      const s = ctx.createGain();
      s.gain.value = rev;
      g.connect(s);
      s.connect(reverb);
    }
    if (dly) {
      const s = ctx.createGain();
      s.gain.value = dly;
      g.connect(s);
      s.connect(delay);
    }
    return g;
  }
  const B = {
    drums: bus(0.9, 0.08),
    bass: bus(0.38),
    synth: bus(0.32, 0.25),
    piano: bus(0.22, 0.2, 0.15),
    vox: bus(0.5, 0.3, 0.35),
    wa: bus(0.6, 0.35),
    fue: bus(0.28, 0.45, 0.3),
    sfx: bus(0.8, 0.2),
  };
  // シンセはキックに合わせて音量が沈む(サビのうねり)
  const pump = ctx.createGain();
  pump.connect(B.synth);

  // ---- 部品 ----
  const noiseBuf = (() => {
    const b = ctx.createBuffer(1, sr, sr);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();
  function noise(t, dur) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
    return s;
  }
  function env(t, peak, attack, decay, hold = 0) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (hold) g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay);
    return g;
  }
  function osc(type, freq, t, dur) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  // 弦をはじく音(Karplus-Strong)を先に計算しておく。bright: 明るさ、decay: 伸び
  const plucked = new Map();
  function pluckBuffer(midi, kind) {
    const key = kind + midi;
    if (plucked.has(key)) return plucked.get(key);
    const f = mtof(midi);
    const len = Math.floor(sr * (kind === "koto" ? 1.6 : 0.9));
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / f));
    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;
    const damp = kind === "koto" ? 0.996 : 0.985;
    let idx = 0;
    let prev = 0;
    let peak = 0;
    for (let i = 0; i < len; i++) {
      const cur = line[idx];
      const next = line[(idx + 1) % period];
      line[idx] = damp * 0.5 * (cur + next);
      let out = cur * 0.9 + prev * 0.1;
      // 三味線は「さわり」(弦が棹に触れてビリつく)を出力にだけ足す(繰り返しの中に入れると
      // エネルギーが増え続けて音が割れた)
      if (kind === "shamisen") out += 0.25 * Math.tanh(out * 5);
      d[i] = out;
      if (Math.abs(out) > peak) peak = Math.abs(out);
      prev = cur;
      idx = (idx + 1) % period;
    }
    // 音の大きさをそろえる
    for (let i = 0; i < len; i++) d[i] *= 0.5 / (peak || 1);
    plucked.set(key, buf);
    return buf;
  }
  function pluck(t, midi, vel, kind, dest) {
    const s = ctx.createBufferSource();
    s.buffer = pluckBuffer(midi, kind);
    // 弦の長さは整数サンプルに丸め、隣と平均する分だけ周期が半サンプル短くなって音程が上ずる。
    // 再生の速さで補正する
    const period = Math.max(2, Math.round(sr / mtof(midi)));
    s.playbackRate.value = (mtof(midi) * (period - 0.5)) / sr;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = kind === "shamisen" ? 250 : 120;
    const g = ctx.createGain();
    g.gain.value = vel * (kind === "shamisen" ? 0.9 : 0.6);
    s.connect(hp);
    hp.connect(g);
    g.connect(dest);
    s.start(t);
    // 三味線は撥(ばち)の当たる音
    if (kind === "shamisen") {
      const n = noise(t, 0.03);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 3000;
      const e = env(t, 0.25 * vel, 0.001, 0.03);
      n.connect(bp);
      bp.connect(e);
      e.connect(dest);
    }
  }

  // ---- 楽器 ----
  const I = {
    kick(t, e) {
      const o = osc("sine", 160, t, 0.4);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      const g = env(t, 1.0 * e.vel, 0.002, 0.35);
      o.connect(g);
      g.connect(B.drums);
      const c = noise(t, 0.01);
      const ce = env(t, 0.3 * e.vel, 0.0005, 0.01);
      c.connect(ce);
      ce.connect(B.drums);
      // シンセを沈める
      pump.gain.cancelScheduledValues(t);
      pump.gain.setValueAtTime(0.35, t);
      pump.gain.linearRampToValueAtTime(1, t + 0.16);
    },
    snare(t, e) {
      const n = noise(t, 0.2);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1400;
      const g = env(t, 0.55 * e.vel, 0.001, 0.16);
      n.connect(hp);
      hp.connect(g);
      g.connect(B.drums);
      const o = osc("triangle", 200, t, 0.1);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
      const og = env(t, 0.4 * e.vel, 0.001, 0.08);
      o.connect(og);
      og.connect(B.drums);
    },
    clap(t, e) {
      for (let k = 0; k < 3; k++) {
        const tt = t + k * 0.011;
        const n = noise(tt, 0.12);
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1300;
        bp.Q.value = 1.2;
        const g = env(tt, 0.45 * e.vel, 0.0005, k === 2 ? 0.14 : 0.01);
        n.connect(bp);
        bp.connect(g);
        g.connect(B.drums);
      }
    },
    hat(t, e) {
      const n = noise(t, 0.05);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 8000;
      const g = env(t, 0.35 * e.vel, 0.0005, 0.035);
      n.connect(hp);
      hp.connect(g);
      g.connect(B.drums);
    },
    openhat(t, e) {
      const n = noise(t, 0.25);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7000;
      const g = env(t, 0.3 * e.vel, 0.001, 0.22);
      n.connect(hp);
      hp.connect(g);
      g.connect(B.drums);
    },
    crash(t, e) {
      const n = noise(t, 1.8);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 4500;
      const g = env(t, 0.35 * e.vel, 0.002, 1.7);
      n.connect(hp);
      hp.connect(g);
      g.connect(B.drums);
    },
    riser(t, e) {
      const n = noise(t, e.len);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 3;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(7000, t + e.len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + e.len * 0.95);
      g.gain.linearRampToValueAtTime(0, t + e.len);
      n.connect(bp);
      bp.connect(g);
      g.connect(B.drums);
    },
    taiko(t, e) {
      // 和太鼓: 低い胴鳴り + 皮を打つ音
      const o = osc("sine", 110, t, 0.9);
      o.frequency.exponentialRampToValueAtTime(58, t + 0.25);
      const g = env(t, 0.95 * e.vel, 0.003, 0.8);
      o.connect(g);
      g.connect(B.wa);
      const n = noise(t, 0.12);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      const ng = env(t, 0.5 * e.vel, 0.001, 0.1);
      n.connect(lp);
      lp.connect(ng);
      ng.connect(B.wa);
    },
    suzu(t, e) {
      // 神楽鈴: 金属的な倍音の束を、少しずつずらして何度か鳴らす(シャン、シャラン)
      for (let k = 0; k < 4; k++) {
        const tt = t + k * 0.035 + Math.random() * 0.01;
        for (const ratio of [1, 2.76, 5.4]) {
          const o = osc("sine", 2300 * ratio * (1 + (Math.random() - 0.5) * 0.02), tt, 0.5);
          const g = env(tt, (0.08 * e.vel) / ratio, 0.001, 0.45 - k * 0.05);
          o.connect(g);
          g.connect(B.wa);
        }
      }
    },
    shamisen(t, e) {
      pluck(t, e.midi, e.vel, "shamisen", B.wa);
    },
    koto(t, e) {
      pluck(t, e.midi, e.vel, "koto", B.wa);
    },
    fue(t, e) {
      // 笛: 正弦波 + 息の音、遅れてかかるビブラート
      const f = mtof(e.midi);
      const o = osc("sine", f, t, e.len);
      const o2 = osc("triangle", f * 2, t, e.len);
      const vib = osc("sine", 5.5, t, e.len);
      const vg = ctx.createGain();
      vg.gain.setValueAtTime(0, t);
      vg.gain.linearRampToValueAtTime(f * 0.012, t + 0.4);
      vib.connect(vg);
      vg.connect(o.frequency);
      const g = env(t, 0.5 * e.vel, 0.06, 0.25, Math.max(0, e.len - 0.3));
      const g2 = ctx.createGain();
      g2.gain.value = 0.15;
      o.connect(g);
      o2.connect(g2);
      g2.connect(g);
      const n = noise(t, e.len);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f * 2;
      bp.Q.value = 2;
      const ng = ctx.createGain();
      ng.gain.value = 0.06;
      n.connect(bp);
      bp.connect(ng);
      ng.connect(g);
      g.connect(B.fue);
    },
    bass(t, e) {
      const f = mtof(e.midi);
      const o = osc("sawtooth", f, t, e.len);
      const sub = osc("sine", f, t, e.len);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(300, t + 0.12);
      const g = env(t, 0.6 * e.vel, 0.004, 0.06, Math.max(0, e.len - 0.08));
      o.connect(lp);
      lp.connect(g);
      sub.connect(g);
      g.connect(B.bass);
    },
    saw(t, e) {
      // 分厚いシンセ: のこぎり波を少しずつずらして重ねた和音
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(e.pad ? 1200 : 5000, t);
      lp.frequency.exponentialRampToValueAtTime(e.pad ? 3500 : 1800, t + (e.pad ? e.len : 0.2));
      const g = e.pad ? env(t, 0.5 * e.vel, 0.3, 0.2, Math.max(0, e.len - 0.5)) : env(t, 0.5 * e.vel, 0.005, 0.08, Math.max(0, e.len - 0.1));
      lp.connect(g);
      g.connect(pump);
      for (const midi of e.midis) {
        const f = mtof(midi);
        // スマホでも重くならないよう、ずらす本数は 3 本に抑える
        for (const cents of [-12, 0, 12]) {
          const o = osc("sawtooth", f * Math.pow(2, cents / 1200), t, e.len + 0.3);
          const og = ctx.createGain();
          og.gain.value = 0.13;
          o.connect(og);
          og.connect(lp);
        }
      }
    },
    piano(t, e) {
      // FM のピアノ(速いアルペジオ用)
      const f = mtof(e.midi);
      const car = osc("sine", f, t, 0.6);
      const mod = osc("sine", f * 2, t, 0.6);
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 2.2, t);
      mg.gain.exponentialRampToValueAtTime(f * 0.2, t + 0.3);
      mod.connect(mg);
      mg.connect(car.frequency);
      const g = env(t, 0.5 * e.vel, 0.002, 0.45);
      car.connect(g);
      g.connect(B.piano);
    },
    vox(t, e) {
      // ボーカルチョップ: のこぎり波 → 母音のフォルマント(3 つの帯域フィルタ)
      const f = mtof(e.midi);
      const len = e.len * 0.92;
      const form = (VOWELS[e.vowel] || VOWELS.a).map((x) => x * FORMANT_SHIFT);
      // 発振器は 1 つ(スマホでも重くならないように)
      const src = osc("sawtooth", f * 0.94, t, len + 0.1);
      // しゃくり: 下からずり上げる
      src.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      if (len > 0.3) {
        // 長い音は遅れてビブラート
        const vib = osc("sine", 6, t, len);
        const vg = ctx.createGain();
        vg.gain.setValueAtTime(0, t);
        vg.gain.setValueAtTime(0, t + 0.18);
        vg.gain.linearRampToValueAtTime(f * 0.018, t + 0.35);
        vib.connect(vg);
        vg.connect(src.frequency);
      }
      const out = env(t, 0.55 * e.vel, 0.008, 0.05, Math.max(0, len - 0.06));
      form.forEach((ff, i) => {
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = ff;
        bp.Q.value = [7, 11, 14][i];
        const g = ctx.createGain();
        g.gain.value = [1, 0.6, 0.3][i] * 2.2;
        src.connect(bp);
        bp.connect(g);
        g.connect(out);
      });
      // 子音っぽい息の頭
      const n = noise(t, 0.02);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 5000;
      const ng = env(t, 0.12 * e.vel, 0.001, 0.02);
      n.connect(hp);
      hp.connect(ng);
      ng.connect(out);
      out.connect(B.vox);
    },
  };

  function play(e, t) {
    const fn = I[e.inst];
    if (fn) fn(t, e);
  }

  // ---- 効果音(叩いた時): lane = suzu | taiko | clap、judge = kiwami | ryo | ka | fuka ----
  function sfx(lane, judge, t = ctx.currentTime) {
    const strong = judge === "kiwami" ? 1 : judge === "ryo" ? 0.8 : 0.55;
    if (judge === "fuka") {
      // 外した: 鈍く短い音
      const o = osc("sine", 120, t, 0.15);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
      const g = env(t, 0.35, 0.002, 0.12);
      o.connect(g);
      g.connect(B.sfx);
      return;
    }
    if (lane === "suzu") {
      for (let k = 0; k < (judge === "kiwami" ? 3 : 2); k++) {
        const tt = t + k * 0.03;
        for (const ratio of [1, 2.76, 5.4]) {
          const o = osc("sine", 2600 * ratio, tt, 0.4);
          const g = env(tt, (0.16 * strong) / ratio, 0.001, 0.35);
          o.connect(g);
          g.connect(B.sfx);
        }
      }
    } else if (lane === "taiko") {
      const o = osc("sine", 130, t, 0.6);
      o.frequency.exponentialRampToValueAtTime(62, t + 0.2);
      const g = env(t, 0.9 * strong, 0.002, 0.5);
      o.connect(g);
      g.connect(B.sfx);
      const n = noise(t, 0.06);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1500;
      const ng = env(t, 0.5 * strong, 0.001, 0.05);
      n.connect(lp);
      lp.connect(ng);
      ng.connect(B.sfx);
    } else {
      // 柏手: 乾いた破裂音 + 短い響き
      const n = noise(t, 0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800;
      bp.Q.value = 0.9;
      const g = env(t, 0.9 * strong, 0.0005, 0.12);
      n.connect(bp);
      bp.connect(g);
      g.connect(B.sfx);
    }
    // 極: きらっと高い音を重ねる
    if (judge === "kiwami") {
      for (const f of [3520, 5274]) {
        const o = osc("sine", f, t, 0.3);
        const g = env(t, 0.05, 0.001, 0.25);
        o.connect(g);
        g.connect(B.sfx);
      }
    }
  }

  // ---- 曲を鳴らす(先読みして予約) ----
  let timer = null;
  let startAt = 0;
  let cursor = 0;
  let song = null;
  function startSong(s, offset = 0, lead = 0.1) {
    stopSong();
    song = s;
    startAt = ctx.currentTime + lead - offset;
    cursor = s.events.findIndex((e) => e.t >= offset);
    if (cursor < 0) cursor = s.events.length;
    const tick = () => {
      const until = ctx.currentTime + 0.15;
      while (cursor < song.events.length && startAt + song.events[cursor].t < until) {
        const e = song.events[cursor++];
        play(e, Math.max(ctx.currentTime, startAt + e.t));
      }
    };
    tick();
    timer = setInterval(tick, 25);
    return startAt;
  }
  function stopSong() {
    if (timer) clearInterval(timer);
    timer = null;
    song = null;
  }
  // 曲の中の今の時刻(秒)
  function songTime() {
    return ctx.currentTime - startAt;
  }

  // すべての音を止める(予約済みの音も、出口ごと切り替えて消す)
  function silence() {
    stopSong();
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.08);
    // 鳴り終わったら出口ごと外す(残すと残響やディレイが処理を食い続ける)
    setTimeout(() => {
      try {
        master.disconnect();
      } catch (e) {
        // すでに外れている
      }
    }, 150);
  }

  return { ctx, master, analyserTarget: master, play, sfx, startSong, stopSong, songTime, silence, prepare: pluckBuffer };
}

module.exports = { createEngine, mtof, VOWELS };
