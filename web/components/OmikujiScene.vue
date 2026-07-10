<template>
  <div class="omikuji-scene" @click="onOverlayClick">
    <div ref="inner" class="scene-inner" :style="innerStyle">
      <!-- 物理(鈴の緒 + 連鎖)キャンバス -->
      <div ref="canvasWrap" class="canvas-wrap"></div>

      <!-- ビン(レア度)ラベル。毎回シャッフルした割当 -->
      <div class="bin-row">
        <div
          v-for="(tier, i) in tierByBin"
          :key="i"
          class="bin-slot"
          :class="{ target: phase === 'done' && i === targetBinIndex }"
        >
          <span class="bin-label" :class="'bl-' + tierKey(tier)">{{ tier }}</span>
        </div>
      </div>

      <!-- 狐(DOMスプライト。スクリプトでホップ) -->
      <div
        v-show="phase === 'fox' || phase === 'done'"
        class="fox"
        :style="foxStyle"
      >🦊</div>

      <!-- ヒント -->
      <div v-if="phase === 'ritual'" class="hint">
        <div class="hint-title">鈴の緒を左右に振って参拝しよう</div>
        <button class="btn btn-outline-light btn-sm mt-2" @click.stop="ringByButton">
          鈴を鳴らす
        </button>
      </div>
      <div v-else-if="phase === 'cascade'" class="hint">
        <div class="hint-title">御神籤が転がり出した…</div>
      </div>
      <div v-else-if="phase === 'fox'" class="hint skip">タップでスキップ</div>
    </div>
  </div>
</template>

<script>
import Matter from "matter-js";
import { foxHopSequence } from "@/components/omikujiFox";

// 論理座標(物理キャンバス)。DOMオーバーレイは % で合わせる。
const W = 480;
const H = 760;

const TIER_KEYS = {
  超吉: "chokichi",
  大吉: "daikichi",
  中吉: "chukichi",
  小吉: "shokichi",
  末吉: "suekichi",
  凶: "kyo",
  大凶: "daikyo",
};
const ALL_TIERS = Object.keys(TIER_KEYS);
const BIN_COUNT = 7;

export default {
  props: {
    // 親が omikujiGo 応答後に渡す。null の間は儀式待ち。
    targetTier: { type: String, default: null },
  },
  data() {
    return {
      phase: "ritual", // ritual | cascade | fox | done
      tierByBin: ALL_TIERS.slice(),
      rung: false,
      innerStyle: {},
      // fox 表示状態(%)
      foxLeft: 50,
      foxBottom: 12,
      foxScaleX: 1,
      foxScaleY: 1,
      foxFlip: 1,
      // matter
      engine: null,
      render: null,
      raf: null,
      mouseConstraint: null,
      ropeTip: null,
      rope: null,
      swingCount: 0,
      lastSwingSign: 0,
      // タイマ
      cascadeTimer: null,
      failsafe: null,
      foxRaf: null,
      destroyed: false,
      reducedMotion: false,
    };
  },
  computed: {
    targetBinIndex() {
      return this.targetTier ? this.tierByBin.indexOf(this.targetTier) : -1;
    },
    foxStyle() {
      return {
        left: this.foxLeft + "%",
        bottom: this.foxBottom + "%",
        transform: `translate(-50%, 0) scaleX(${this.foxScaleX * this.foxFlip}) scaleY(${this.foxScaleY})`,
      };
    },
  },
  watch: {
    targetTier(v) {
      // 鳴らし済みで tier が届いたら、連鎖の後に狐へ進む(cascade 完了時に startFox が拾う)
      if (v && this.rung && this.phase === "cascade" && this._cascadeDone) {
        this.startFox();
      }
    },
  },
  mounted() {
    this.reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.shuffleBins();
    this.computeSize();
    window.addEventListener("resize", this.computeSize);

    if (this.reducedMotion) {
      this.phase = "ritual"; // ボタンだけ
      return;
    }
    this.$nextTick(() => this.initScene());
  },
  beforeDestroy() {
    this.destroyed = true;
    window.removeEventListener("resize", this.computeSize);
    if (this.cascadeTimer) clearTimeout(this.cascadeTimer);
    if (this.failsafe) clearTimeout(this.failsafe);
    if (this.foxRaf) cancelAnimationFrame(this.foxRaf);
    this.teardownMatter();
  },
  methods: {
    tierKey(t) {
      return TIER_KEYS[t] || "";
    },
    shuffleBins() {
      const a = ALL_TIERS.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
      }
      this.tierByBin = a;
    },
    computeSize() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const ratio = W / H;
      let w = Math.min(vw * 0.94, vh * 0.84 * ratio, 460);
      const h = w / ratio;
      this.innerStyle = { width: Math.round(w) + "px", height: Math.round(h) + "px" };
    },
    binLeftPct(i) {
      return ((i + 0.5) / BIN_COUNT) * 100;
    },

    // ---- 物理シーン(鈴の緒 + 連鎖の土台) ----
    initScene() {
      if (this.destroyed || !this.$refs.canvasWrap) return;
      const engine = Matter.Engine.create();
      engine.gravity.scale = 0.001;
      this.engine = engine;
      const world = engine.world;
      const add = (b) => Matter.World.add(world, b);

      // 外壁・床
      add([
        Matter.Bodies.rectangle(-6, H / 2, 12, H, { isStatic: true, render: { fillStyle: "#3a3230" } }),
        Matter.Bodies.rectangle(W + 6, H / 2, 12, H, { isStatic: true, render: { fillStyle: "#3a3230" } }),
        Matter.Bodies.rectangle(W / 2, H - 30, W, 16, { isStatic: true, render: { fillStyle: "#3a3230" } }),
      ]);

      // 連鎖の土台(見せ場・結果には無関係):斜面 + ドミノ + 自由回転の風車
      add(Matter.Bodies.rectangle(150, 330, 260, 12, { isStatic: true, angle: 0.28, render: { fillStyle: "#7a5230" } }));
      add(Matter.Bodies.rectangle(340, 440, 260, 12, { isStatic: true, angle: -0.28, render: { fillStyle: "#7a5230" } }));
      this.dominoes = [];
      for (let i = 0; i < 5; i++) {
        const d = Matter.Bodies.rectangle(300 + i * 24, 512, 8, 40, { density: 0.002, render: { fillStyle: "#cdbba8" } });
        this.dominoes.push(d);
        add(d);
      }
      const spin = Matter.Body.create({
        parts: [Matter.Bodies.rectangle(0, 0, 110, 12), Matter.Bodies.rectangle(0, 0, 12, 110)],
        density: 0.0012,
        render: { fillStyle: "#e0663c" },
      });
      Matter.Body.setPosition(spin, { x: 150, y: 470 });
      add(spin);
      add(Matter.Constraint.create({ pointA: { x: 150, y: 470 }, bodyB: spin, pointB: { x: 0, y: 0 }, length: 0, stiffness: 1, render: { visible: false } }));

      // 鈴の緒(制約チェーン)
      const anchorX = W / 2;
      const anchorY = 22;
      const N = 6;
      const segH = 15;
      const group = Matter.Body.nextGroup(true);
      const rope = Matter.Composites.stack(anchorX - 3.5, anchorY + 6, 1, N, 0, 0, (x, y) =>
        Matter.Bodies.rectangle(x, y, 7, segH, { collisionFilter: { group }, render: { fillStyle: "#b23a48" } })
      );
      Matter.Composites.chain(rope, 0, 0.5, 0, -0.5, { stiffness: 0.9, length: 0, render: { strokeStyle: "#b23a48", lineWidth: 3 } });
      Matter.Composite.add(rope, Matter.Constraint.create({ pointA: { x: anchorX, y: anchorY }, bodyB: rope.bodies[0], pointB: { x: 0, y: -segH / 2 }, stiffness: 0.95, length: 0, render: { strokeStyle: "#b23a48", lineWidth: 3 } }));
      this.ropeTip = rope.bodies[rope.bodies.length - 1];
      this.ropeTip.render.fillStyle = "#e8c86a";
      Matter.World.add(world, rope);
      this.rope = rope;

      // 鈴(飾り)
      add(Matter.Bodies.circle(anchorX, anchorY - 4, 12, { isStatic: true, render: { fillStyle: "#e8c86a" } }));

      this.render = Matter.Render.create({
        element: this.$refs.canvasWrap,
        engine,
        options: { width: W, height: H, wireframes: false, background: "transparent", pixelRatio: window.devicePixelRatio || 1 },
      });
      this.render.canvas.style.width = "100%";
      this.render.canvas.style.height = "100%";
      Matter.Render.run(this.render);

      const mouse = Matter.Mouse.create(this.render.canvas);
      this.mouseConstraint = Matter.MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.2, render: { visible: false } } });
      Matter.World.add(world, this.mouseConstraint);
      this.render.mouse = mouse;

      const step = () => {
        if (this.destroyed) return;
        Matter.Engine.update(engine, 1000 / 60, 1);
        if (this.phase === "ritual") this.trackSwing();
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    },
    trackSwing() {
      if (!this.ropeTip || this.rung) return;
      const vx = this.ropeTip.velocity.x;
      const sign = vx > 3 ? 1 : vx < -3 ? -1 : 0;
      if (sign !== 0 && this.lastSwingSign !== 0 && sign !== this.lastSwingSign) this.swingCount++;
      if (sign !== 0) this.lastSwingSign = sign;
      if (this.swingCount >= 4) this.onRing();
    },
    ringByButton() {
      this.onRing();
    },
    onRing() {
      if (this.rung) return;
      this.rung = true;
      this.$emit("rang");

      if (this.reducedMotion) {
        // 演出なし:tier が来次第 landed
        this.waitTargetThen(() => this.finish());
        return;
      }

      this.phase = "cascade";
      // 鈴の緒を外し、玉を落として連鎖を見せる
      if (this.rope) Matter.World.remove(this.engine.world, this.rope);
      if (this.mouseConstraint) Matter.World.remove(this.engine.world, this.mouseConstraint);
      const ball = Matter.Bodies.circle(W / 2, 70, 12, { restitution: 0.5, frictionAir: 0.004, density: 0.004, render: { fillStyle: "#ff5a3c" } });
      Matter.Body.setVelocity(ball, { x: 1.5, y: 0 });
      Matter.World.add(this.engine.world, ball);
      this.ball = ball;

      // 連鎖はタイムボックスで必ず前進(約4.2秒)→ 狐へ
      this._cascadeDone = false;
      this.cascadeTimer = setTimeout(() => {
        this._cascadeDone = true;
        if (this.targetTier) this.startFox();
        // targetTier 未着なら watch で拾う
      }, 4200);

      // 全体フェイルセーフ
      this.failsafe = setTimeout(() => {
        if (!this.destroyed && this.phase !== "done") this.finish();
      }, 24000);
    },
    waitTargetThen(cb) {
      if (this.targetTier) return cb();
      this._tWatch = setInterval(() => {
        if (this.destroyed) return clearInterval(this._tWatch);
        if (this.targetTier) {
          clearInterval(this._tWatch);
          cb();
        }
      }, 100);
    },

    // ---- 狐セレクタ(結果を決める。スクリプトで必ずターゲットへ) ----
    startFox() {
      if (this.phase === "fox" || this.phase === "done") return;
      this.phase = "fox";
      // 物理は畳んで軽くする(見た目は残ってOKだが負荷減)
      this.teardownMatter();

      const target = this.tierByBin.indexOf(this.targetTier);
      const seq = foxHopSequence(target < 0 ? 0 : target, BIN_COUNT);
      // スタートは左端外から
      this.foxLeft = this.binLeftPct(seq[0]);
      this.foxBottom = 12;
      this.hopQueue = seq.slice();
      this.currentBin = seq[0];
      // 最初のビンへ"登場"してから順に飛び移る
      this.runHops(1);
    },
    runHops(idx) {
      if (this.destroyed) return;
      if (idx >= this.hopQueue.length) {
        // 本命に着地済み。少し溜めてから結果へ。
        this.foxSettle();
        setTimeout(() => {
          if (!this.destroyed) this.finish();
        }, 800);
        return;
      }
      const fromBin = this.hopQueue[idx - 1];
      const toBin = this.hopQueue[idx];
      const isFinal = idx === this.hopQueue.length - 1;
      this.animateHop(fromBin, toBin, isFinal, () => {
        // 着地後の"溜め"(ハラハラ)。本命前は少し長め。
        const pause = isFinal ? 260 : 220;
        setTimeout(() => this.runHops(idx + 1), pause);
      });
    },
    animateHop(fromBin, toBin, isFinal, done) {
      const x0 = this.binLeftPct(fromBin);
      const x1 = this.binLeftPct(toBin);
      this.foxFlip = x1 >= x0 ? 1 : -1;
      const dur = isFinal ? 620 : 460;
      const apex = 26 + Math.min(30, Math.abs(x1 - x0)); // 距離で弧の高さ
      const t0 = performance.now();
      const tick = () => {
        if (this.destroyed) return;
        const t = Math.min(1, (performance.now() - t0) / dur);
        const e = t; // 線形でOK(弧で見栄えを作る)
        this.foxLeft = x0 + (x1 - x0) * e;
        this.foxBottom = 12 + apex * Math.sin(Math.PI * t);
        // スクワッシュ&ストレッチ:離陸/着地で潰れ、空中で伸びる
        const air = Math.sin(Math.PI * t);
        this.foxScaleY = 1 + 0.22 * air;
        this.foxScaleX = 1 - 0.16 * air;
        if (t < 1) {
          this.foxRaf = requestAnimationFrame(tick);
        } else {
          this.foxBottom = 12;
          this.foxScaleX = 1.18;
          this.foxScaleY = 0.82; // 着地の潰れ
          setTimeout(() => {
            this.foxScaleX = 1;
            this.foxScaleY = 1;
          }, 90);
          done();
        }
      };
      this.foxRaf = requestAnimationFrame(tick);
    },
    foxSettle() {
      this.foxScaleX = 1;
      this.foxScaleY = 1;
      this.foxBottom = 12;
    },

    finish() {
      if (this.phase === "done") return;
      this.phase = "done";
      this.$emit("landed", { tier: this.targetTier });
    },
    onOverlayClick() {
      if (this.phase === "cascade" || this.phase === "fox") this.finish();
    },
    teardownMatter() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      if (this.render) {
        Matter.Render.stop(this.render);
        if (this.render.canvas && this.render.canvas.remove) this.render.canvas.remove();
        this.render.textures = {};
        this.render = null;
      }
      if (this.engine) {
        Matter.World.clear(this.engine.world, false);
        Matter.Engine.clear(this.engine);
        this.engine = null;
      }
      this.mouseConstraint = null;
      this.ropeTip = null;
      this.rope = null;
      this.ball = null;
    },
  },
};
</script>

<style scoped>
.omikuji-scene {
  position: fixed;
  inset: 0;
  z-index: 9999;
  overflow: hidden;
  background: radial-gradient(circle at 50% 30%, #5a5050, #221d1d 72%);
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}
.scene-inner {
  position: relative;
}
.canvas-wrap {
  position: absolute;
  inset: 0;
}
.canvas-wrap canvas {
  display: block;
}

/* ビン(下部) */
.bin-row {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 22%;
  display: flex;
  pointer-events: none;
}
.bin-slot {
  flex: 1 1 0;
  border-left: 2px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 4px;
  transition: background 0.3s;
}
.bin-slot:first-child { border-left: none; }
.bin-slot.target {
  background: linear-gradient(to top, rgba(255, 210, 90, 0.35), transparent);
}
.bin-label {
  writing-mode: vertical-rl;
  font-weight: 800;
  font-size: clamp(10px, 2.6vw, 16px);
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
.bl-chokichi { color: #ffd24d; }
.bl-daikichi { color: #ffcf6b; }
.bl-chukichi { color: #ffd9a8; }
.bl-shokichi { color: #b8e0c0; }
.bl-suekichi { color: #cfe0ea; }
.bl-kyo { color: #cfcfcf; }
.bl-daikyo { color: #ff9a9a; }

/* 狐 */
.fox {
  position: absolute;
  font-size: clamp(28px, 8vw, 44px);
  line-height: 1;
  transform-origin: 50% 100%;
  will-change: left, bottom, transform;
  filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.5));
  pointer-events: none;
}

.hint {
  position: absolute;
  top: 5%;
  left: 0;
  right: 0;
  text-align: center;
  color: #fff;
  pointer-events: none;
}
.hint .btn { pointer-events: auto; }
.hint-title {
  font-size: clamp(0.95rem, 3.6vw, 1.25rem);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}
.hint.skip {
  top: auto;
  bottom: 24%;
  opacity: 0.7;
  font-size: 0.85rem;
}
</style>
