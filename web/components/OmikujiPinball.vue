<template>
  <!-- サイバー弾き盤。右端の玉を下に引いて放つと、カメラが玉のすぐ後ろについて盤面を
       駆け回り、最後は盤の下のレールを走ってレア度のポートに入る。ルールと物理は
       omikujiPinball.js、3D の見た目は pinballView.js(three.js はこの演出の時だけ読む)。
       ほかの演出と同じく、放ったら rang、ポートに入って見せ終えたら landed を出す。 -->
  <div class="omikuji-pinball" @contextmenu.prevent>
    <canvas
      ref="canvas"
      class="pb-canvas"
      @pointerdown.prevent="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @lostpointercapture="onUp"
    ></canvas>
    <!-- 小さな見取り図(玉の視点だと、盤のどこにいるか分かりにくいので) -->
    <canvas v-show="showMini && hasView" ref="mini" class="pb-mini"></canvas>

    <div class="pb-hud">
      <div v-if="phase === 'loading'" class="pb-hint">装置を起動しています<span class="dots"></span></div>
      <template v-else-if="phase === 'ritual'">
        <div class="pb-hint">
          画面を<b>下に引いて</b>、放すと発射
          <small>遊んでいる間は、画面の左右をタップでフリッパー</small>
        </div>
        <div class="pb-power"><div class="pb-power-bar" :style="{ height: pull * 100 + '%' }"></div></div>
      </template>
      <div v-if="phase === 'play' && !targetTier && sinceRang > 3" class="pb-hint pb-hint-small">結果を受け取っています<span class="dots"></span></div>

      <transition-group name="pb-pop" tag="div" class="pb-pops">
        <div v-for="p in pops" :key="p.key" class="pb-pop" :class="p.cls">{{ p.text }}</div>
      </transition-group>

      <div v-if="banner" class="pb-banner" :style="{ '--tier': banner.color }">
        <div class="pb-banner-sub">PORT {{ banner.i + 1 }}</div>
        <div class="pb-banner-tier">{{ banner.tier }}</div>
      </div>

      <!-- フリッパーの場所の目印(押している間は光る) -->
      <template v-if="phase === 'play' && gamePhase === 'play'">
        <div class="pb-flip pb-flip-left" :class="{ on: held.left }">◀</div>
        <div class="pb-flip pb-flip-right" :class="{ on: held.right }">▶</div>
      </template>
      <button v-if="canSkip" type="button" class="pb-skip" @pointerdown.stop @click.stop="finish">結果へ ▶</button>
    </div>
  </div>
</template>

<script>
import P from "@/components/omikujiPinball";
import { TIER_COLORS } from "@/components/pinballView";

const PULL_PX = 200; // この距離を下に引くと全力
const PORT_SHOW_MS = 2400; // ポートに入ってから landed まで
const POP_MS = 1000;
const KEYS_LEFT = ["ArrowLeft", "KeyZ", "ShiftLeft", "KeyA"];
const KEYS_RIGHT = ["ArrowRight", "Slash", "ShiftRight", "KeyD", "KeyM"];

// three.js と追加のモジュールを、この演出が選ばれた時だけ読む
function loadLib() {
  return Promise.all([
    import("three"),
    import("three/examples/jsm/environments/RoomEnvironment.js"),
    import("three/examples/jsm/postprocessing/EffectComposer.js"),
    import("three/examples/jsm/postprocessing/RenderPass.js"),
    import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
    import("three/examples/jsm/postprocessing/OutputPass.js"),
    import("@/components/pinballView"),
  ]).then(([THREE, env, ec, rp, ub, op, view]) => ({
    THREE,
    RoomEnvironment: env.RoomEnvironment,
    EffectComposer: ec.EffectComposer,
    RenderPass: rp.RenderPass,
    UnrealBloomPass: ub.UnrealBloomPass,
    OutputPass: op.OutputPass,
    createView: (view.default || view).createView,
  }));
}

const POP_TEXT = {
  bumper: (e) => ({ text: e.combo > 1 ? `BUMP ×${e.combo}` : "BUMP", cls: "mag" }),
  sling: () => ({ text: "KICK", cls: "mag" }),
  drop: () => ({ text: "DROP", cls: "amb" }),
  dropAll: () => ({ text: "ALL DROP!", cls: "amb big" }),
  lane: (e) => ({ text: e.label, cls: "amb" }),
  laneAll: () => ({ text: "BUG FIXED!", cls: "amb big" }),
  spinner: () => ({ text: "SPIN", cls: "lime" }),
  laser: () => ({ text: "LASER", cls: "red" }),
  magnet: () => ({ text: "MAGNET LOCK", cls: "blue big" }),
  magnetRelease: () => ({ text: "RELEASE!", cls: "blue" }),
  portalIn: () => ({ text: "WARP", cls: "mag big" }),
  rampIn: () => ({ text: "RAMP", cls: "cyan big" }),
  save: () => ({ text: "SAVE!", cls: "lime" }),
  finale: () => ({ text: "結界解除", cls: "lime big jp" }),
  drain: () => ({ text: "ROUTING…", cls: "cyan" }),
};

export default {
  props: {
    targetTier: { type: String, default: null },
  },
  data() {
    return {
      phase: "loading", // loading | ritual | play | port | done
      gamePhase: "ready",
      pull: 0,
      pops: [],
      banner: null,
      held: { left: false, right: false },
      sinceRang: 0,
      showMini: false,
      hasView: false, // 3D で描けているか(描けない時は上から見た 2D なので見取り図は出さない)
      reducedMotion: false,
    };
  },
  computed: {
    canSkip() {
      return !!this.targetTier && (this.phase === "play" || this.phase === "port") && this.sinceRang > 2;
    },
  },
  watch: {
    targetTier(t) {
      if (t && this.game) P.setTarget(this.game, t);
    },
  },
  created() {
    // 毎フレーム書き換わるものは data に入れない
    this.game = null;
    this.view = null;
    this._timers = [];
    this._pointers = {};
  },
  mounted() {
    this.reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    this.game = P.newGame();
    if (this.targetTier) P.setTarget(this.game, this.targetTier);
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    this.resize();
    loadLib()
      .then((lib) => {
        if (this.destroyed) return;
        try {
          this.view = lib.createView(lib, this.$refs.canvas, { reducedMotion: this.reducedMotion });
          this.$refs.canvas.addEventListener("webglcontextlost", this.onContextLost);
        } catch (e) {
          this.view = null; // WebGL が使えない → 上から見た 2D で続ける
        }
        this.hasView = !!this.view;
        this.resize();
        this.phase = "ritual";
      })
      .catch(() => {
        if (this.destroyed) return;
        this.view = null;
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
    if (this.view) this.view.dispose();
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
      const c = this.$refs.canvas;
      if (!c) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (this.view) this.view.resize(w, h);
      else {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const m = this.$refs.mini;
      if (m) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        m.width = Math.round(84 * dpr);
        m.height = Math.round(((84 * (P.H + 200)) / P.W) * dpr);
      }
    },
    onContextLost(e) {
      e.preventDefault();
      // 描けなくなった → 上から見た 2D で続ける
      if (this.view) {
        try {
          this.view.dispose();
        } catch (err) {
          // 捨てるだけ
        }
      }
      this.view = null;
      this.hasView = false;
      this.resize();
    },

    // ---- 操作 ----
    onDown(e) {
      if (this.phase === "ritual") {
        this._drag = { id: e.pointerId, y0: e.clientY, moved: false };
        try {
          this.$refs.canvas.setPointerCapture(e.pointerId);
        } catch (err) {
          // 取れなくても続ける
        }
        return;
      }
      if (this.phase !== "play") return;
      const side = e.clientX < window.innerWidth / 2 ? "left" : "right";
      this._pointers[e.pointerId] = side;
      this.syncHeld();
    },
    onMove(e) {
      if (this.phase !== "ritual" || !this._drag || this._drag.id !== e.pointerId) return;
      const u = Math.max(0, Math.min(1, (e.clientY - this._drag.y0) / PULL_PX));
      if (u > 0.04) this._drag.moved = true;
      this.pull = u;
      P.setPull(this.game, u);
    },
    onUp(e) {
      if (this.phase === "ritual" && this._drag && this._drag.id === e.pointerId) {
        const moved = this._drag.moved;
        this._drag = null;
        // 引かずにタップしただけでも、ほどほどの強さで放つ
        if (!moved) P.setPull(this.game, 0.5);
        this.launch();
        return;
      }
      delete this._pointers[e.pointerId];
      this.syncHeld();
    },
    onKey(e) {
      const down = e.type === "keydown";
      if (this.phase === "ritual" && (e.code === "Space" || e.code === "Enter" || e.code === "ArrowDown")) {
        e.preventDefault();
        if (down) {
          if (!this._keyPull) this._keyPull = performance.now();
        } else if (this._keyPull) {
          this._keyPull = null;
          this.launch();
        }
        return;
      }
      let side = null;
      if (KEYS_LEFT.includes(e.code)) side = "left";
      else if (KEYS_RIGHT.includes(e.code)) side = "right";
      if (!side) return;
      e.preventDefault();
      this._pointers["key-" + side] = down ? side : undefined;
      if (!down) delete this._pointers["key-" + side];
      this.syncHeld();
    },
    syncHeld() {
      const sides = Object.values(this._pointers);
      this.held = { left: sides.includes("left"), right: sides.includes("right") };
    },
    launch() {
      if (this.phase !== "ritual") return;
      P.launch(this.game);
      this.pull = 0;
      this.phase = "play";
      this._rangAt = performance.now();
      this._perf = { n: 0, sum: 0, checked: false };
      this.showMini = true;
      this.$emit("rang");
    },

    // ---- 毎フレーム ----
    frame(now) {
      if (this.destroyed) return;
      this._raf = requestAnimationFrame(this.frame);
      const dt = Math.min(0.05, Math.max(0, (now - this._last) / 1000));
      this._last = now;
      const g = this.game;
      if (this.phase === "ritual" && this._keyPull) {
        this.pull = Math.min(1, (now - this._keyPull) / 900);
        P.setPull(g, this.pull);
      }
      if (this.phase === "play" || this.phase === "port") {
        this.sinceRang = (now - this._rangAt) / 1000;
        if (this.targetTier && g.target == null) P.setTarget(g, this.targetTier);
        P.step(g, dt, this.held);
        for (const e of g.events.splice(0)) this.onEvent(e);
        this.gamePhase = g.phase;
        // 結果が届かないまま長く待った(通信が止まった等)→ 閉じる(ページが状態を取り直す)
        if (!this.targetTier && this.sinceRang > P.RESULT_WAIT_MAX) this.finish();
        this.measure(dt);
      }
      if (this.view) this.view.render(g, dt);
      else if (this.phase !== "loading") this.draw2D(this.$refs.canvas, g, false);
      if (this.showMini && this.view) this.draw2D(this.$refs.mini, g, true);
    },
    // 遅い端末なら、にじみを止めて解像度を下げる(最初の 2 秒ほどで判断)
    measure(dt) {
      const p = this._perf;
      if (!p || p.checked || !this.view) return;
      p.n++;
      if (p.n < 20) return;
      p.sum += dt;
      if (p.n >= 140) {
        p.checked = true;
        if (p.sum / (p.n - 19) > 1 / 42) this.view.degrade();
      }
    },
    onEvent(e) {
      if (this.view) this.view.onEvent(e, this.game);
      const f = POP_TEXT[e.type];
      if (f) this.pop(f(e));
      if (e.type === "port") this.onPort(e);
    },
    pop(p) {
      const key = (this._popKey = (this._popKey || 0) + 1);
      this.pops.push(Object.assign({ key }, p));
      if (this.pops.length > 4) this.pops.splice(0, this.pops.length - 4);
      this.later(POP_MS, () => {
        this.pops = this.pops.filter((x) => x.key !== key);
      });
    },
    onPort(e) {
      this.phase = "port";
      this.banner = { tier: e.tier, i: e.i, color: "#" + TIER_COLORS[e.tier].toString(16).padStart(6, "0") };
      this.later(PORT_SHOW_MS, () => this.finish());
    },
    finish() {
      if (this.phase === "done") return;
      this.phase = "done";
      this.$emit("landed", { tier: this.targetTier });
    },

    // ---- 上から見た 2D(見取り図と、WebGL が無い時の代わり) ----
    draw2D(c, g, mini) {
      if (!c) return;
      const ctx = c.getContext("2d");
      const W = c.width;
      const Hc = c.height;
      const totalH = P.H + 200;
      const s = Math.min(W / P.W, Hc / totalH);
      const ox = (W - P.W * s) / 2;
      const oy = (Hc - totalH * s) / 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, Hc);
      if (!mini) {
        ctx.fillStyle = "#05030f";
        ctx.fillRect(0, 0, W, Hc);
      }
      ctx.setTransform(s, 0, 0, s, ox, oy);
      ctx.fillStyle = mini ? "rgba(8,6,24,0.75)" : "#0a0820";
      ctx.fillRect(0, 0, P.W, P.H);
      ctx.lineCap = "round";
      for (const sh of g.shapes) {
        if (!sh.active) continue;
        if (sh.kind === "drop" && !g.drops[sh.id]) continue;
        if (sh.kind === "barrier" && g.phase !== "play") continue;
        ctx.strokeStyle = sh.kind === "sling" || sh.kind === "bumper" ? "#ff3df0" : sh.kind === "drop" ? "#ffb02e" : sh.kind === "barrier" ? "#8cff5a" : "#38e8ff";
        if (sh.type === "circle") {
          ctx.lineWidth = mini ? 4 : 3;
          ctx.beginPath();
          ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.lineWidth = Math.max(mini ? 5 : 3, sh.r * 2);
          ctx.beginPath();
          ctx.moveTo(sh.ax, sh.ay);
          ctx.lineTo(sh.bx, sh.by);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = "#38e8ff";
      for (const f of g.flippers) {
        const e = P.flipperEnds(f, f.a);
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.moveTo(e.ax, e.ay);
        ctx.lineTo(e.bx, e.by);
        ctx.stroke();
      }
      // ポート
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      for (const p of P.PORTS) {
        const col = "#" + TIER_COLORS[p.tier].toString(16).padStart(6, "0");
        ctx.fillStyle = g.target === p.i && g.phase !== "play" ? col : "rgba(255,255,255,0.25)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
        ctx.fill();
        if (!mini) {
          ctx.fillStyle = col;
          ctx.fillText(p.tier, p.x, p.y + 44);
        }
      }
      const b = g.ball;
      if (b.mode !== "gone") {
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#7fe9ff";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(b.x, b.y, mini ? P.R * 1.8 : P.R, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    },
  },
};
</script>

<style scoped>
.omikuji-pinball {
  position: fixed;
  inset: 0;
  z-index: 9999;
  overflow: hidden;
  background: #04020c;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  -webkit-touch-callout: none;
}
.pb-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}
.pb-mini {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 84px;
  border: 1px solid rgba(56, 232, 255, 0.45);
  border-radius: 6px;
  background: rgba(4, 2, 12, 0.35);
  pointer-events: none;
}
.pb-hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: #e9fbff;
  font-family: "IBM Plex Mono", ui-monospace, monospace;
}
.pb-hint {
  position: absolute;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  width: min(92vw, 420px);
  text-align: center;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(6, 4, 22, 0.72);
  border: 1px solid rgba(56, 232, 255, 0.5);
  box-shadow: 0 0 18px rgba(56, 232, 255, 0.25);
  font-family: "Hiragino Sans", "Noto Sans JP", sans-serif;
  font-size: 1rem;
}
.pb-hint b {
  color: #38e8ff;
}
.pb-hint small {
  display: block;
  margin-top: 4px;
  color: #b6c9ff;
  font-size: 0.78rem;
}
.pb-hint-small {
  top: auto;
  bottom: 22px;
  font-size: 0.85rem;
}
.pb-power {
  position: absolute;
  left: 18px;
  bottom: 18%;
  width: 14px;
  height: 34%;
  border: 1px solid rgba(56, 232, 255, 0.6);
  border-radius: 7px;
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  background: rgba(6, 4, 22, 0.6);
}
.pb-power-bar {
  width: 100%;
  background: linear-gradient(#38e8ff, #ff3df0);
  box-shadow: 0 0 12px #ff3df0;
}
.pb-pops {
  position: absolute;
  top: 22%;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.pb-pop {
  font-weight: 900;
  font-size: 1.15rem;
  letter-spacing: 0.08em;
  text-shadow: 0 0 10px currentColor, 0 0 2px #000;
}
.pb-pop.big {
  font-size: 1.7rem;
}
.pb-pop.jp {
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
}
.pb-pop.mag {
  color: #ff7af4;
}
.pb-pop.amb {
  color: #ffc45a;
}
.pb-pop.lime {
  color: #a8ff7a;
}
.pb-pop.red {
  color: #ff5a8a;
}
.pb-pop.blue {
  color: #8fb4ff;
}
.pb-pop.cyan {
  color: #7ff1ff;
}
.pb-pop-enter-active {
  transition: transform 0.18s ease-out, opacity 0.18s;
}
.pb-pop-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}
.pb-pop-enter {
  opacity: 0;
  transform: scale(1.6);
}
.pb-pop-leave-to {
  opacity: 0;
  transform: translateY(-14px);
}
.pb-banner {
  position: absolute;
  bottom: 12%;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  animation: pb-banner 0.5s cubic-bezier(0.2, 1.4, 0.4, 1);
}
.pb-banner-sub {
  font-size: 0.9rem;
  letter-spacing: 0.3em;
  color: var(--tier);
  text-shadow: 0 0 8px var(--tier);
}
.pb-banner-tier {
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-size: 4.2rem;
  font-weight: 900;
  line-height: 1.1;
  color: #fff;
  text-shadow: 0 0 18px var(--tier), 0 0 40px var(--tier);
}
@keyframes pb-banner {
  from {
    opacity: 0;
    transform: translateX(-50%) scale(1.8);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
}
.pb-flip {
  position: absolute;
  bottom: 14px;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 1px solid rgba(56, 232, 255, 0.4);
  color: rgba(56, 232, 255, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  transition: background 0.08s, color 0.08s;
}
.pb-flip.on {
  background: rgba(56, 232, 255, 0.3);
  color: #fff;
}
.pb-flip-left {
  left: 14px;
}
.pb-flip-right {
  right: 14px;
}
.pb-skip {
  position: absolute;
  top: 12px;
  right: 12px;
  pointer-events: auto;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(6, 4, 22, 0.6);
  color: #fff;
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 0.85rem;
}
.dots::after {
  content: "";
  animation: pb-dots 1.2s steps(4) infinite;
}
@keyframes pb-dots {
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
