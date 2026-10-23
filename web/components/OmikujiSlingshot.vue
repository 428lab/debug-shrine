<template>
  <!-- 弾き玉(3D)。Y 字の台の御神玉を引き絞って放つと、カメラが玉の後ろについて飛び、
       櫓に当たる瞬間はスローモーション。崩れが収まると、一番手前に落ちた木札が浮き上がり、
       裏返ってレア度が出る。ルールと物理は omikujiSlingshot.js(cannon-es)、見た目は
       slingshotView.js(three.js)。どちらもこの演出の時だけ読む。
       ほかの演出と同じく、放ったら rang、見せ終えたら landed を出す。 -->
  <div
    ref="root"
    class="omikuji-sling"
    @contextmenu.prevent
    @pointerdown.prevent="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onCancel"
    @lostpointercapture="onCancel"
  >
    <canvas ref="canvas" class="sl-canvas"></canvas>

    <!-- WebGL が使えない時: 木札がその場で裏返るだけ -->
    <div v-if="!hasView && phase !== 'loading'" class="sl-flat">
      <div class="sl-card" :class="{ flipped: !!flatTier }">
        <div class="sl-card-back">奉納</div>
        <div class="sl-card-front" :style="{ color: flatColor }">
          <small>御神籤</small>
          <span v-for="(ch, k) in flatTier || ''" :key="k">{{ ch }}</span>
        </div>
      </div>
    </div>

    <div class="sl-hud">
      <div v-if="phase === 'loading'" class="sl-hint">境内を整えています<span class="dots"></span></div>
      <div v-else-if="phase === 'ritual'" class="sl-hint">
        御神玉を<b>引き絞って</b>、放つ
        <small>引いた向きの反対へ飛ぶ。下へ引くほど櫓の上を狙う</small>
        <button type="button" class="sl-fallback" @pointerdown.stop @click.stop="autoLaunch">うまく引けないときはここをタップ</button>
      </div>
      <div v-if="waitingHint" class="sl-hint sl-hint-small">結果を受け取っています<span class="dots"></span></div>
      <div v-if="slowLabel" class="sl-slow">SLOW</div>
      <div v-if="banner" class="sl-banner" :style="{ '--tier': banner.color }">
        <small>御神籤</small>
        <b>{{ banner.tier }}</b>
      </div>
      <button v-if="canSkip" type="button" class="sl-skip" @pointerdown.stop @click.stop="finish">結果へ ▶</button>
    </div>
  </div>
</template>

<script>
import S from "@/components/omikujiSlingshot";

const PULL_MIN = 0.15; // これより引かずに放したら放たない(抽選は取り消せない)
const SLOW = 0.2; // 当たる瞬間の速さ
const RISE_S = 1.3; // 木札が浮き上がる秒数
const FLIP_S = 1.2; // 裏返る秒数
const SHOW_MS = 2000; // 表が出てから landed まで
const HARD_CAP = 45; // どんな場合も放ってからこの秒数で閉じる
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
    import("@/components/slingshotView"),
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
      slowLabel: false,
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
      // 知らないレア度(木札に書けない)なら、放った後は閉じる(ページが結果を出す)
      if (t && !S.TIERS.includes(t) && this.phase !== "ritual" && this.phase !== "loading") this.finish();
    },
  },
  created() {
    this.game = null;
    this.view = null;
    this._timers = [];
    this._ui = { reveal: null, simDt: 0 };
    // 引き具合(物理が読めなかった時も、これで放つかどうかを決める)
    this._aim = { power: 0, ax: 0, ay: 0.5 };
  },
  mounted() {
    this.reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    window.addEventListener("blur", this.releaseAll);
    loadLib()
      .then((lib) => {
        if (this.destroyed) return;
        this.game = S.build(lib.CANNON);
        try {
          this.view = lib.createView(lib, this.$refs.canvas, { reducedMotion: this.reducedMotion });
          this.$refs.canvas.addEventListener("webglcontextlost", this.onContextLost);
          this.resize();
          this.view.warmUp();
        } catch (e) {
          this.view = null;
        }
        this.hasView = !!this.view;
        this.phase = "ritual";
      })
      .catch(() => {
        // 読めなかった(通信が切れた等)→ 木札が裏返るだけで見せる
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
    window.removeEventListener("keyup", this.onKey);
    window.removeEventListener("blur", this.releaseAll);
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
      // 放った後なら、木札が裏返るだけの見せ方で続ける(止まったままにしない)
      if ((this.phase === "play" || this.phase === "reveal") && !this.banner) this.startFlat();
    },

    // ---- 引き絞り ----
    onDown(e) {
      if (this.phase !== "ritual") return;
      this._drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
      try {
        this.$refs.root.setPointerCapture(e.pointerId);
      } catch (err) {
        // 取れなくても続ける
      }
    },
    onMove(e) {
      if (this.phase !== "ritual" || !this._drag || this._drag.id !== e.pointerId) return;
      this.setAim(S.aimFromDrag(e.clientX - this._drag.x0, e.clientY - this._drag.y0));
    },
    onUp(e) {
      if (this.phase !== "ritual" || !this._drag || this._drag.id !== e.pointerId) return;
      this._drag = null;
      if (this._aim.power >= PULL_MIN) this.launch();
      else this.resetAim();
    },
    setAim(aim) {
      this._aim = aim;
      if (this.game) S.setAim(this.game, aim);
    },
    onCancel(e) {
      if (this._drag && this._drag.id === e.pointerId) {
        this._drag = null;
        this.resetAim();
      }
    },
    releaseAll() {
      if (this._drag) {
        this._drag = null;
        this.resetAim();
      }
      if (this._keyAt) {
        this._keyAt = null;
        this.resetAim();
      }
    },
    resetAim() {
      this.setAim({ power: 0, ax: 0, ay: 0.5 });
    },
    onKey(e) {
      if (this.phase !== "ritual" || !(e.code === "Space" || e.code === "Enter")) return;
      e.preventDefault();
      if (e.type === "keydown") {
        if (!this._keyAt) this._keyAt = performance.now();
      } else if (this._keyAt) {
        this._keyAt = null;
        if (this._aim.power >= PULL_MIN) this.launch();
        else this.resetAim();
      }
    },
    autoLaunch() {
      if (this.phase !== "ritual") return;
      this.setAim({ power: 0.6, ax: 0, ay: 0.45 });
      this.launch();
    },
    launch() {
      if (this.phase !== "ritual") return;
      this.phase = "play";
      this._rangAt = performance.now();
      this._perf = { n: 0, sum: 0, checked: false };
      this.$emit("rang");
      if (this.game && this.view) S.launch(this.game);
      else this.startFlat();
    },

    // ---- 毎フレーム ----
    frame(now) {
      if (this.destroyed) return;
      this._raf = requestAnimationFrame(this.frame);
      const dt = Math.min(0.05, Math.max(0, (now - this._last) / 1000));
      this._last = now;
      const g = this.game;
      if (this.phase === "ritual" && this._keyAt) {
        this.setAim({ power: Math.min(1, (now - this._keyAt) / 900), ax: 0, ay: 0.5 });
      }
      if (this.phase === "play" || this.phase === "reveal" || this.phase === "done") {
        const since = (now - this._rangAt) / 1000;
        const waiting = !this.targetTier && since > 3;
        if (this.waitingHint !== waiting) this.waitingHint = waiting;
        if (!this.canSkip && this.targetTier && since > 2) this.canSkip = true;
        // 届かない・知らないレア度・どんな場合も上限 → 閉じる(ページが状態を取り直す・結果を出す)
        const unknown = this.targetTier && !S.TIERS.includes(this.targetTier);
        if ((!this.targetTier && since > RESULT_WAIT_MAX) || unknown || since > HARD_CAP) this.finish();
      }
      this._ui.simDt = dt;
      if (g && this.view && (this.phase === "play" || this.phase === "reveal")) {
        const scale = this.timeScale(g, dt);
        this._ui.simDt = dt * scale;
        S.step(g, dt * scale);
        for (const e of g.events.splice(0)) this.onEvent(e);
        if (this._ui.reveal) this.advanceReveal(dt);
        this.measure(dt);
      }
      if (g && this.view) this.view.render(g, dt, this._ui);
    },
    // 遅い端末なら、影を止めて解像度を下げる(放ってから 2 秒ほどの平均で決める)
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
    // 当たる瞬間だけゆっくり(動きを減らす設定ではしない)
    timeScale(g, dt) {
      let want = 1;
      if (!this.reducedMotion) {
        const front = S.TOWER.z + S.TOWER.halfD;
        if (g.phase === "flight" && g.ball.position.z - front < 3.2) want = SLOW;
        if (g.phase === "impact" && g.t - g.impactAt < 0.5) want = SLOW;
      }
      this._scale = this._scale == null ? 1 : this._scale + (want - this._scale) * Math.min(1, dt * 8);
      const slow = this._scale < 0.6;
      if (this.slowLabel !== slow) this.slowLabel = slow;
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
      if (r.u >= 1 && r.flip == null && this.targetTier && S.TIERS.includes(this.targetTier)) {
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

    // WebGL が無い時: 木札が裏返るだけ
    startFlat() {
      const tick = () => {
        if (this.destroyed || this.phase === "done") return;
        if (this.targetTier && S.TIERS.includes(this.targetTier)) {
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
.omikuji-sling {
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
.sl-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.sl-hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: "Hiragino Sans", "Noto Sans JP", sans-serif;
  color: #fff8ec;
}
.sl-hint {
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
.sl-hint b {
  color: #ffd080;
}
.sl-hint small {
  display: block;
  margin-top: 4px;
  font-size: 0.78rem;
  color: #f0d8b8;
}
.sl-hint-small {
  top: auto;
  bottom: 22px;
  font-size: 0.85rem;
}
.sl-fallback {
  pointer-events: auto;
  display: block;
  margin: 8px auto 0;
  border: none;
  background: none;
  color: #f0d8b8;
  font-size: 0.78rem;
  text-decoration: underline;
}
.sl-slow {
  position: absolute;
  top: 16px;
  right: 16px;
  font: 900 1rem "IBM Plex Mono", monospace;
  letter-spacing: 0.3em;
  color: #fff;
  text-shadow: 0 0 8px #ff9a3a;
}
.sl-banner {
  position: absolute;
  bottom: 9%;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  padding: 6px 22px 8px;
  border-radius: 10px;
  background: rgba(30, 14, 8, 0.6);
  border: 2px solid var(--tier);
  animation: sl-banner 0.45s cubic-bezier(0.2, 1.4, 0.4, 1);
}
.sl-banner small {
  display: block;
  font-size: 0.75rem;
  letter-spacing: 0.3em;
  color: #f0d8b8;
}
.sl-banner b {
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-size: 2.4rem;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 0 14px var(--tier);
}
@keyframes sl-banner {
  from {
    opacity: 0;
    transform: translateX(-50%) scale(1.6);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
}
.sl-skip {
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
.sl-flat {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 800px;
}
.sl-card {
  position: relative;
  width: 120px;
  height: 220px;
  transform-style: preserve-3d;
  transition: transform 1s cubic-bezier(0.3, 1.3, 0.5, 1);
}
.sl-card.flipped {
  transform: rotateY(540deg);
}
.sl-card-back,
.sl-card-front {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  border: 4px solid #8a1e14;
  border-radius: 4px;
  background: #ead2a8;
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
.sl-card-back {
  font-size: 1.4rem;
  writing-mode: vertical-rl;
}
.sl-card-front {
  transform: rotateY(180deg);
}
.sl-card-front small {
  font-size: 0.8rem;
  color: #8a1e14;
  margin-bottom: 6px;
}
.dots::after {
  content: "";
  animation: sl-dots 1.2s steps(4) infinite;
}
@keyframes sl-dots {
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
