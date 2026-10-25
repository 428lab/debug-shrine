<template>
  <!-- だるま落とし(3D)。境内の台に積んだだるまを、タップするたびに木槌で一番下の段から
       打ち抜く(打つ瞬間はカメラが寄ってスロー)。頭か胴のどれかにおみくじが潜んでいて、
       その段を打つと紙のおみくじが飛び出し、開くとレア度が出る。
       ルールと物理は omikujiDaruma.js(cannon-es)、見た目は darumaView.js(three.js)。
       どちらもこの演出の時だけ読む。
       ほかの演出と同じく、最初に打ったら rang、見せ終えたら landed を出す。 -->
  <div ref="root" class="omikuji-daruma" @contextmenu.prevent @pointerdown.prevent="onDown">
    <canvas ref="canvas" class="dr-canvas"></canvas>

    <!-- WebGL が使えない時: おみくじがその場で開くだけ -->
    <div v-if="!hasView && phase !== 'loading'" class="dr-flat">
      <div class="dr-card" :class="{ flipped: !!flatTier }">
        <div class="dr-card-back">御神籤</div>
        <div class="dr-card-front" :style="{ color: flatColor }">
          <small>御神籤</small>
          <span v-for="(ch, k) in flatTier || ''" :key="k">{{ ch }}</span>
        </div>
      </div>
    </div>

    <div class="dr-hud">
      <div v-if="phase === 'loading'" class="dr-hint">境内を整えています<span class="dots"></span></div>
      <div v-else-if="phase === 'ritual'" class="dr-hint">
        <b>タップ</b>で、だるまを打ち抜く
        <small>一番下の段から一つずつ。どこかにおみくじが潜んでいる</small>
        <button type="button" class="dr-fallback" @pointerdown.stop @click.stop="autoPlay">うまくできないときはここをタップ</button>
      </div>
      <div v-if="waitingHint" class="dr-hint dr-hint-small">結果を受け取っています<span class="dots"></span></div>
      <div v-if="banner" class="dr-banner" :style="{ '--tier': banner.color }">
        <small>御神籤</small>
        <b>{{ banner.tier }}</b>
      </div>
      <button v-if="canSkip" type="button" class="dr-skip" @pointerdown.stop @click.stop="finish">結果へ ▶</button>
    </div>
  </div>
</template>

<script>
import D from "@/components/omikujiDaruma";

const SLOW = 0.3; // 打つ瞬間の速さ
const RISE_S = 1.1; // おみくじが浮き上がる秒数
const FLIP_S = 1.2; // 開いて表を向く秒数
const SHOW_MS = 2000; // 表が出てから landed まで
const IDLE_S = 8; // 打ち始めてから、この秒数打たなければ自動で打つ(結果まで止まったままにしない)
const HARD_CAP = 45; // どんな場合も打ち始めてからこの秒数で閉じる
const RESULT_WAIT_MAX = 25; // 結果が届かないまま、ここまで待ったら閉じる(ページが取り直す)
const TIER_COLORS = {
  超吉: "#ffcc33",
  大吉: "#e83a3a",
  中吉: "#e8743a",
  小吉: "#3aa860",
  末吉: "#3a78c8",
  凶: "#555566",
  大凶: "#5a2a7a",
};

function loadLib() {
  return Promise.all([
    import("three"),
    import("three/examples/jsm/environments/RoomEnvironment.js"),
    import("cannon-es"),
    import("@/components/darumaView"),
  ]).then(([THREE, env, CANNON, view]) => ({
    THREE,
    RoomEnvironment: env.RoomEnvironment,
    CANNON,
    createView: (view.default || view).createView,
  }));
}

export default {
  props: {
    targetTier: { type: String, default: null },
  },
  data() {
    return {
      phase: "loading", // loading | ritual | play | reveal | done
      hasView: false,
      waitingHint: false,
      canSkip: false,
      banner: null,
      flatTier: null,
    };
  },
  computed: {
    flatColor() {
      return TIER_COLORS[this.flatTier] || "#222";
    },
  },
  watch: {
    targetTier(t) {
      // 知らないレア度(紙に書けない)なら、打ち始めた後は閉じる(ページが結果を出す)
      if (t && !D.TIERS.includes(t) && this.phase !== "ritual" && this.phase !== "loading") this.finish();
    },
  },
  created() {
    this.game = null;
    this.view = null;
    this._timers = [];
    this._ui = { reveal: null, simDt: 0 };
    this._auto = false; // 自動で打つ(「うまくできないとき」を押した)
    this._idleAuto = false; // しばらく打たなかったので自動で打っている(タップしたら止める)
    this._lastTapAt = 0;
  },
  mounted() {
    this.reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKey);
    loadLib()
      .then((lib) => {
        if (this.destroyed) return;
        this.game = D.build(lib.CANNON);
        try {
          this.view = lib.createView(lib, this.$refs.canvas, { reducedMotion: this.reducedMotion });
          this.$refs.canvas.addEventListener("webglcontextlost", this.onContextLost);
          this.resize();
          this.view.warmUp();
        } catch (e) {
          if (this.view) {
            try {
              this.view.dispose();
            } catch (err) {
              // 捨てるだけ
            }
          }
          this.view = null;
        }
        this.hasView = !!this.view;
        this.phase = "ritual";
      })
      .catch(() => {
        // 読めなかった(通信が切れた等)→ おみくじが開くだけで見せる
        if (this.destroyed) return;
        this.phase = "ritual";
      });
    this._last = performance.now();
    this._raf = requestAnimationFrame(this.frame);
  },
  beforeDestroy() {
    this.destroyed = true;
    cancelAnimationFrame(this._raf);
    this._timers.forEach(clearTimeout);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKey);
    if (this.$refs.canvas) this.$refs.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    const view = this.view;
    this.view = null;
    if (view) view.dispose();
  },
  methods: {
    later(ms, fn) {
      this._timers.push(
        setTimeout(() => {
          if (!this.destroyed) fn();
        }, ms)
      );
    },
    resize() {
      if (this.view) this.view.resize(window.innerWidth, window.innerHeight);
    },
    onContextLost(e) {
      e.preventDefault();
      if (this.destroyed) return;
      this.$refs.canvas.removeEventListener("webglcontextlost", this.onContextLost);
      const view = this.view;
      this.view = null;
      this.hasView = false;
      if (view) {
        try {
          view.dispose();
        } catch (err) {
          // 捨てるだけ
        }
      }
      // 打ち始めた後なら、おみくじが開くだけの見せ方で続ける(止まったままにしない)
      if ((this.phase === "play" || this.phase === "reveal") && !this.banner) this.startFlat();
    },

    // ---- 打つ ----
    onDown(e) {
      // 1 本目の指・左クリックだけ(右クリックや 2 本目の指では打たない)
      if (e && (e.isPrimary === false || (e.pointerType === "mouse" && e.button !== 0))) return;
      this.hit();
    },
    onKey(e) {
      if (!(e.code === "Space" || e.code === "Enter") || e.repeat) return;
      if (this.phase !== "ritual" && this.phase !== "play") return;
      e.preventDefault();
      this.hit();
    },
    // うまくできない時: 打てるようになるたびに自動で打つ
    autoPlay() {
      this._auto = true;
      this.hit();
    },
    hit() {
      if (this.phase === "ritual") {
        this.phase = "play";
        this._rangAt = performance.now();
        this._perf = { n: 0, sum: 0, checked: false };
        this.$emit("rang");
        if (!(this.game && this.view)) {
          this.startFlat();
          return;
        }
      }
      if (this.phase !== "play" || !this.game || !this.view) return;
      this._lastTapAt = performance.now();
      this._idleAuto = false;
      D.tap(this.game);
    },

    // ---- 毎フレーム ----
    frame(now) {
      if (this.destroyed) return;
      this._raf = requestAnimationFrame(this.frame);
      const dt = Math.min(0.05, Math.max(0, (now - this._last) / 1000));
      this._last = now;
      const g = this.game;
      if (this.phase === "play" || this.phase === "reveal" || this.phase === "done") {
        const since = (now - this._rangAt) / 1000;
        const waiting = !this.targetTier && since > 3;
        if (this.waitingHint !== waiting) this.waitingHint = waiting;
        if (!this.canSkip && this.targetTier && since > 2) this.canSkip = true;
        // 届かない・知らないレア度・どんな場合も上限 → 閉じる(ページが状態を取り直す・結果を出す)
        const unknown = this.targetTier && !D.TIERS.includes(this.targetTier);
        if ((!this.targetTier && since > RESULT_WAIT_MAX) || unknown || since > HARD_CAP) this.finish();
      }
      this._ui.simDt = dt;
      if (g && this.view && (this.phase === "play" || this.phase === "reveal")) {
        if (this.phase === "play") {
          // 自動(うまくできない時・しばらく打たなかった時)
          if (!this._idleAuto && (now - this._lastTapAt) / 1000 > IDLE_S) this._idleAuto = true;
          if ((this._auto || this._idleAuto) && D.canHit(g)) D.tap(g);
        }
        const scale = this.timeScale(g, dt);
        this._ui.simDt = dt * scale;
        D.step(g, dt * scale);
        for (const e of g.events.splice(0)) this.onEvent(e);
        if (this._ui.reveal) this.advanceReveal(dt);
        this.measure(dt);
      }
      if (g && this.view) this.view.render(g, dt, this._ui);
    },
    // 遅い端末なら、影を止めて解像度を下げる(打ち始めてから 2 秒ほどの平均で決める)
    measure(dt) {
      const p = this._perf;
      if (!p || p.checked || !this.view) return;
      p.n++;
      if (p.n < 20) return;
      p.sum += dt;
      if (p.n >= 140) {
        p.checked = true;
        if (p.sum / (p.n - 19) > 1 / 40) this.view.degrade();
      }
    },
    // 打つ瞬間だけゆっくり(動きを減らす設定ではしない)
    timeScale(g, dt) {
      let want = 1;
      if (!this.reducedMotion && g.phase === "play") {
        if (g.swing && g.swing.at - g.t < 0.06) want = SLOW;
        if (g.t - g.lastHitAt < 0.22) want = SLOW;
      }
      this._scale = this._scale == null ? 1 : this._scale + (want - this._scale) * Math.min(1, dt * 14);
      return this._scale;
    },
    onEvent(e) {
      if (this.view) this.view.onEvent(e, this.game);
      if (e.type === "reveal" && this.phase !== "done") {
        this.phase = "reveal";
        this._ui.reveal = { u: 0, flip: null, tier: null };
      }
    },
    advanceReveal(dt) {
      const r = this._ui.reveal;
      r.u = Math.min(1, r.u + dt / RISE_S);
      if (r.u >= 1 && r.flip == null && this.targetTier && D.TIERS.includes(this.targetTier)) {
        r.flip = 0;
        r.tier = this.targetTier;
      }
      if (r.flip != null && r.flip < 1) {
        r.flip = Math.min(1, r.flip + dt / FLIP_S);
        if (r.flip >= 1) {
          this.banner = { tier: r.tier, color: TIER_COLORS[r.tier] };
          this.later(SHOW_MS, () => this.finish());
        }
      }
    },

    // WebGL が無い時: おみくじが開くだけ
    startFlat() {
      const tick = () => {
        if (this.destroyed || this.phase === "done") return;
        if (this.targetTier && D.TIERS.includes(this.targetTier)) {
          this.flatTier = this.targetTier;
          this.banner = { tier: this.targetTier, color: TIER_COLORS[this.targetTier] };
          this.later(SHOW_MS, () => this.finish());
          return;
        }
        this.later(200, tick);
      };
      this.later(600, tick);
    },
    finish() {
      if (this.phase === "done") return;
      this.phase = "done";
      this.$emit("landed", { tier: this.targetTier });
    },
  },
};
</script>

<style scoped>
.omikuji-daruma {
  position: fixed;
  inset: 0;
  z-index: 9999;
  overflow: hidden;
  background: linear-gradient(#3a4a8a, #c87a6a 45%, #f0b070 62%, #6f6a64 62%, #4a4440);
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  -webkit-touch-callout: none;
}
.dr-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.dr-hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: "Hiragino Sans", "Noto Sans JP", sans-serif;
  color: #fff8ec;
}
.dr-hint {
  position: absolute;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  width: min(92vw, 420px);
  text-align: center;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(40, 20, 12, 0.72);
  border: 1px solid rgba(255, 210, 150, 0.5);
}
.dr-hint b {
  color: #ffd080;
}
.dr-hint small {
  display: block;
  margin-top: 4px;
  font-size: 0.78rem;
  color: #f0d8b8;
}
.dr-hint-small {
  top: auto;
  bottom: 22px;
  font-size: 0.85rem;
}
.dr-fallback {
  pointer-events: auto;
  display: block;
  margin: 8px auto 0;
  border: none;
  background: none;
  color: #f0d8b8;
  font-size: 0.78rem;
  text-decoration: underline;
}
.dr-banner {
  position: absolute;
  bottom: 9%;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  padding: 6px 22px 8px;
  border-radius: 10px;
  background: rgba(30, 14, 8, 0.6);
  border: 2px solid var(--tier);
  animation: dr-banner 0.45s cubic-bezier(0.2, 1.4, 0.4, 1);
}
.dr-banner small {
  display: block;
  font-size: 0.75rem;
  letter-spacing: 0.3em;
  color: #f0d8b8;
}
.dr-banner b {
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-size: 2.4rem;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 0 14px var(--tier);
}
@keyframes dr-banner {
  from {
    opacity: 0;
    transform: translateX(-50%) scale(1.6);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
}
.dr-skip {
  position: absolute;
  top: 12px;
  left: 12px;
  pointer-events: auto;
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: rgba(30, 14, 8, 0.55);
  color: #fff;
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 0.85rem;
}
.dr-flat {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 800px;
}
.dr-card {
  position: relative;
  width: 110px;
  height: 260px;
  transform-style: preserve-3d;
  transition: transform 1s cubic-bezier(0.3, 1.3, 0.5, 1);
}
.dr-card.flipped {
  transform: rotateY(540deg);
}
.dr-card-back,
.dr-card-front {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  border: 4px solid #b8281c;
  border-radius: 3px;
  background: #fbf6ea;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-weight: 900;
  font-size: 2.6rem;
  line-height: 1.15;
  color: #3a2a1a;
}
.dr-card-back {
  font-size: 1.4rem;
  color: #b8281c;
  writing-mode: vertical-rl;
}
.dr-card-front {
  transform: rotateY(180deg);
}
.dr-card-front small {
  font-size: 0.8rem;
  color: #b8281c;
  margin-bottom: 6px;
}
.dots::after {
  content: "";
  animation: dr-dots 1.2s steps(4) infinite;
}
@keyframes dr-dots {
  0% {
    content: "";
  }
  25% {
    content: ".";
  }
  50% {
    content: "..";
  }
  75% {
    content: "...";
  }
}
</style>
