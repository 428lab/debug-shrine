<template>
  <!-- リズムゲームの試作: まず曲と効果音だけを聴けるページ(一覧にはまだ載せない) -->
  <div class="container py-3 rh">
    <div class="mb-2"><nuxt-link to="/games">&lt; ミニゲーム一覧</nuxt-link></div>
    <h1 class="h4 text-center mb-1">リズムゲーム(試作)</h1>
    <p class="text-center small opacity-note mb-3">曲と効果音の試聴。iPhone は消音スイッチをオフにしてください。</p>

    <div class="stage">
      <canvas ref="viz" class="viz"></canvas>
      <div class="now">
        <div class="now-label">{{ playing ? sectionLabel : "停止中" }}</div>
        <div class="now-time">{{ timeText }}</div>
      </div>
      <div class="bar"><div class="bar-in" :style="{ width: progress * 100 + '%' }"></div></div>
    </div>

    <div class="controls">
      <button type="button" class="btn btn-lg btn-warning" @click="toggle">
        <i class="fas fa-fw" :class="playing ? 'fa-stop' : 'fa-play'"></i>
        {{ playing ? "止める" : "曲を再生" }}
      </button>
    </div>
    <div class="jumps">
      <button
        v-for="s in sections"
        :key="s.name"
        type="button"
        class="btn btn-sm btn-outline-light"
        @click="play(s.start)"
      >
        {{ s.label }}
      </button>
    </div>

    <h2 class="h6 mt-4 mb-2 text-center">叩いた時の効果音</h2>
    <div class="pads">
      <div v-for="lane in lanes" :key="lane.id" class="pad-col">
        <div class="pad-name">{{ lane.name }}</div>
        <button
          v-for="j in judges"
          :key="j.id"
          type="button"
          class="btn btn-sm pad"
          :class="'pad-' + j.id"
          @click="hit(lane.id, j.id)"
        >
          {{ j.name }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import Song from "@/components/rhythmSong";
import Audio from "@/components/rhythmAudio";

export default {
  data() {
    return {
      playing: false,
      t: 0,
      lanes: [
        { id: "suzu", name: "鈴" },
        { id: "taiko", name: "太鼓" },
        { id: "clap", name: "柏手" },
      ],
      judges: [
        { id: "kiwami", name: "極" },
        { id: "ryo", name: "良" },
        { id: "ka", name: "可" },
        { id: "fuka", name: "不可" },
      ],
    };
  },
  head() {
    return { title: "リズムゲーム(試作) | でばっぐ神社", meta: [{ hid: "robots", name: "robots", content: "noindex" }] };
  },
  created() {
    // 曲のデータは大きく、描画に使わないので data に入れない
    this.song = Song.buildSong();
    this.sections = this.song.sections;
  },
  computed: {
    sectionLabel() {
      let label = "";
      for (const s of this.sections) if (this.t >= s.start) label = s.label;
      return label;
    },
    timeText() {
      const f = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
      return `${f(Math.max(0, this.t))} / ${f(this.song.duration)}`;
    },
    progress() {
      return Math.max(0, Math.min(1, this.t / this.song.duration));
    },
  },
  mounted() {
    this._raf = requestAnimationFrame(this.frame);
  },
  beforeDestroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this.stop();
    if (this.ctx) this.ctx.close();
  },
  methods: {
    // 音は押した時に初めて用意する(ブラウザは操作の前に音を出させない)
    ensureCtx() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    },
    newEngine() {
      const ctx = this.ensureCtx();
      const eng = Audio.createEngine(ctx);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;
      eng.master.connect(this.analyser);
      return eng;
    },
    toggle() {
      if (this.playing) this.stop();
      else this.play(0);
    },
    play(offset) {
      this.stop();
      this.engine = this.newEngine();
      this.engine.startSong(this.song, offset);
      this.playing = true;
    },
    stop() {
      if (this.engine) this.engine.silence();
      this.engine = null;
      this.playing = false;
      this.t = 0;
    },
    hit(lane, judge) {
      if (!this.sfxEngine || this.sfxEngine.ctx !== this.ensureCtx()) this.sfxEngine = Audio.createEngine(this.ensureCtx());
      this.sfxEngine.sfx(lane, judge);
    },
    frame() {
      this._raf = requestAnimationFrame(this.frame);
      if (this.playing && this.engine) {
        this.t = this.engine.songTime();
        if (this.t > this.song.duration) this.stop();
      }
      this.drawViz();
    },
    // 音に合わせて動く波形(鳥居の朱と金)
    drawViz() {
      const c = this.$refs.viz;
      if (!c) return;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== w * 2) {
        c.width = w * 2;
        c.height = h * 2;
      }
      const g = c.getContext("2d");
      g.setTransform(2, 0, 0, 2, 0, 0);
      g.clearRect(0, 0, w, h);
      const n = 48;
      let data = null;
      if (this.analyser && this.playing) {
        data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(data);
      }
      const bw = w / n;
      for (let i = 0; i < n; i++) {
        const v = data ? data[Math.floor((i / n) * data.length * 0.7)] / 255 : 0.04;
        const bh = Math.max(2, v * h * 0.9);
        const grad = g.createLinearGradient(0, h, 0, h - bh);
        grad.addColorStop(0, "#b8412c");
        grad.addColorStop(1, "#ffd84a");
        g.fillStyle = grad;
        g.fillRect(i * bw + 1, h - bh, bw - 2, bh);
      }
    },
  },
};
</script>

<style scoped>
.rh {
  max-width: 720px;
}
.opacity-note {
  opacity: 0.7;
}
.stage {
  position: relative;
  background: radial-gradient(ellipse at 50% 120%, #3a1f1a, #0e0c12 70%);
  border: 2px solid #b8412c;
  border-radius: 12px;
  overflow: hidden;
  height: 200px;
}
.viz {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.now {
  position: absolute;
  top: 12px;
  left: 0;
  right: 0;
  text-align: center;
  color: #fff8e1;
  text-shadow: 0 2px 6px #000;
}
.now-label {
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-weight: 800;
  font-size: 1.4rem;
}
.now-time {
  font: 600 0.9rem "IBM Plex Mono", ui-monospace, monospace;
  opacity: 0.8;
}
.bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
}
.bar-in {
  height: 100%;
  background: #ffd84a;
}
.controls {
  text-align: center;
  margin-top: 14px;
}
.jumps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-top: 10px;
}
.pads {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.pad-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
}
.pad-name {
  text-align: center;
  font-weight: 700;
}
.pad {
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.4);
}
.pad-kiwami {
  background: #b8862c;
}
.pad-ryo {
  background: #b8412c;
}
.pad-ka {
  background: #5a3f28;
}
.pad-fuka {
  background: #333;
}
</style>
