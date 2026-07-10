<template>
  <div class="omikuji-scene" @click="onOverlayClick">
    <div class="scene-inner" :style="innerStyle">
      <div ref="canvasWrap" class="canvas-wrap"></div>

      <!-- ビン(レア度)ラベル。毎回シャッフルした割当を表示 -->
      <div class="bin-labels">
        <div
          v-for="(tier, i) in tierByBin"
          :key="i"
          class="bin-label"
          :class="'bl-' + tierKey(tier)"
        >
          {{ tier }}
        </div>
      </div>

      <!-- 儀式: 鈴の緒を振る -->
      <div v-if="phase === 'ritual'" class="hint">
        <div class="hint-title">鈴の緒を左右に振って参拝しよう</div>
        <button class="btn btn-outline-light btn-sm mt-2" @click.stop="ringByButton">
          鈴を鳴らす
        </button>
      </div>
      <div v-else-if="phase === 'waiting'" class="hint">
        <div class="hint-title">御神籤を占っています…</div>
      </div>
      <div v-else-if="phase === 'animating'" class="hint skip">タップでスキップ</div>
    </div>
  </div>
</template>

<script>
import Matter from "matter-js";
import physics from "@/components/omikujiPhysics";

const GEO = physics.GEO;

// レア度→CSSキー(OmikujiResult.vue と同じ7段階)
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

export default {
  props: {
    // 親が API 応答後に渡す。null の間は儀式待ち。
    targetTier: { type: String, default: null },
  },
  data() {
    return {
      phase: "presim", // presim | ritual | waiting | animating | done
      tierByBin: ALL_TIERS.slice(), // 物理ビン index → tier(mounted でシャッフル)
      dropMap: null,
      presimReady: false,
      rung: false,
      innerStyle: {},
      // matter 参照
      engine: null,
      render: null,
      runnerRaf: null,
      // 儀式
      mouseConstraint: null,
      ropeTip: null,
      swingCount: 0,
      lastSwingSign: 0,
      // タイマ
      failsafeId: null,
      destroyed: false,
    };
  },
  mounted() {
    // reduced-motion: 演出を全スキップし、鳴らすだけで結果へ
    this.reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.shuffleBins();
    this.computeSize();
    window.addEventListener("resize", this.computeSize);

    if (this.reducedMotion) {
      this.phase = "ritual"; // ボタンだけ出す(キャンバスは空でも可)
      // 対応表は不要(演出しないため)
      this.presimReady = true;
      return;
    }

    this.initRitualScene();
    this.phase = "ritual";
    // プリシムは初回描画後に(短時間ブロックするため)。儀式スイング中に完了する。
    this.$nextTick(() => {
      setTimeout(() => {
        if (this.destroyed) return;
        this.dropMap = physics.buildDropMap();
        this.presimReady = true;
        if (this.pendingRing) this.beginDraw();
      }, 40);
    });
  },
  beforeDestroy() {
    this.destroyed = true;
    window.removeEventListener("resize", this.computeSize);
    this.teardownMatter();
    if (this.failsafeId) clearTimeout(this.failsafeId);
  },
  watch: {
    // 親から tier が届いたら装置を確定走行(鳴らし済みのときのみ)
    targetTier(v) {
      if (v && this.rung) this.startPlay();
    },
  },
  methods: {
    tierKey(t) {
      return TIER_KEYS[t] || "";
    },
    shuffleBins() {
      const a = ALL_TIERS.slice();
      // Fisher–Yates(演出用途なので Math.random で可。抽選結果には無関係)
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
      const ratio = GEO.W / GEO.H;
      let w = Math.min(vw * 0.94, vh * 0.82 * ratio);
      w = Math.min(w, 560);
      const h = w / ratio;
      this.innerStyle = { width: Math.round(w) + "px", height: Math.round(h) + "px" };
    },

    // ---- 儀式シーン(盤面 + 鈴の緒) ----
    initRitualScene() {
      const { engine } = physics.buildWorld();
      this.engine = engine;
      const world = engine.world;

      // 鈴の緒(制約チェーン)を上部中央からぶら下げる
      const anchorX = GEO.W / 2;
      const anchorY = 24;
      const N = 6;
      const segH = 15;
      const group = Matter.Body.nextGroup(true);
      const rope = Matter.Composites.stack(anchorX - 4, anchorY + 6, 1, N, 0, 0, (x, y) =>
        Matter.Bodies.rectangle(x, y, 7, segH, {
          collisionFilter: { group },
          render: { fillStyle: "#b23a48" },
        })
      );
      Matter.Composites.chain(rope, 0, 0.5, 0, -0.5, {
        stiffness: 0.9,
        length: 0,
        render: { visible: true, strokeStyle: "#b23a48", lineWidth: 3 },
      });
      Matter.Composite.add(
        rope,
        Matter.Constraint.create({
          pointA: { x: anchorX, y: anchorY },
          bodyB: rope.bodies[0],
          pointB: { x: 0, y: -segH / 2 },
          stiffness: 0.95,
          length: 0,
          render: { strokeStyle: "#b23a48", lineWidth: 3 },
        })
      );
      // 先端に房(スイング検出対象)
      this.ropeTip = rope.bodies[rope.bodies.length - 1];
      this.ropeTip.render.fillStyle = "#e8c86a";
      Matter.World.add(world, rope);
      this.rope = rope;

      this.render = Matter.Render.create({
        element: this.$refs.canvasWrap,
        engine,
        options: {
          width: GEO.W,
          height: GEO.H,
          wireframes: false,
          background: "transparent",
          pixelRatio: window.devicePixelRatio || 1,
        },
      });
      this.render.canvas.style.width = "100%";
      this.render.canvas.style.height = "100%";
      Matter.Render.run(this.render);

      // マウス/タッチで鈴の緒を掴んで振れる
      const mouse = Matter.Mouse.create(this.render.canvas);
      this.mouseConstraint = Matter.MouseConstraint.create(engine, {
        mouse,
        constraint: { stiffness: 0.2, render: { visible: false } },
      });
      Matter.World.add(world, this.mouseConstraint);
      this.render.mouse = mouse;

      // 儀式フェーズは物理を Runner ではなく手動RAFで軽く回す(鈴が揺れるだけ)
      const step = () => {
        if (this.destroyed || this.phase !== "ritual") return;
        Matter.Engine.update(this.engine, GEO.FIXED_DELTA, 1);
        this.trackSwing();
        this.runnerRaf = requestAnimationFrame(step);
      };
      this.runnerRaf = requestAnimationFrame(step);
    },
    trackSwing() {
      if (!this.ropeTip || this.rung) return;
      const vx = this.ropeTip.velocity.x;
      const sign = vx > 3 ? 1 : vx < -3 ? -1 : 0;
      if (sign !== 0 && this.lastSwingSign !== 0 && sign !== this.lastSwingSign) {
        this.swingCount++;
      }
      if (sign !== 0) this.lastSwingSign = sign;
      if (this.swingCount >= 4) this.onRing();
    },
    ringByButton() {
      this.onRing();
    },
    onRing() {
      if (this.rung) return;
      this.rung = true;
      // 鈴が鳴った → 親に抽選開始を要求
      this.$emit("rang");
      if (this.reducedMotion) {
        // 演出なし。tier が来たら onLanded 相当を即出す
        this.phase = "waiting";
        this.waitThenEmitLandedIfReady();
        return;
      }
      this.phase = "waiting";
      // プリシム未完なら待ってから、済んでいれば tier 到着で startPlay が走る
      if (this.presimReady && this.targetTier) this.startPlay();
    },
    waitThenEmitLandedIfReady() {
      // reduced-motion: targetTier が来次第 landed
      if (this.targetTier) {
        this.$emit("landed", { tier: this.targetTier });
      } else {
        this._rmWatch = setInterval(() => {
          if (this.destroyed) return clearInterval(this._rmWatch);
          if (this.targetTier) {
            clearInterval(this._rmWatch);
            this.$emit("landed", { tier: this.targetTier });
          }
        }, 100);
      }
    },
    beginDraw() {
      // プリシム完了待ちだった場合のフック
      if (this.rung && this.targetTier) this.startPlay();
    },

    // ---- 本番走行(必ず pre-sim と同一の buildWorld でサーバ tier のビンへ) ----
    startPlay() {
      if (this.phase === "animating" || this.phase === "done") return;
      if (!this.presimReady || !this.dropMap) {
        this.pendingRing = true; // プリシム完了時に beginDraw から再入
        return;
      }
      const tier = this.targetTier;
      const binIndex = this.tierByBin.indexOf(tier);
      const cands = (binIndex >= 0 && this.dropMap[binIndex]) || [];
      let cand;
      if (cands.length > 0) {
        cand = cands[Math.floor(Math.random() * cands.length)];
      } else {
        // フォールバック(通常起きない):狙いビン直上から真下に落とす
        cand = { dropX: physics.binCenterX(Math.max(0, binIndex)), vx: 0 };
      }

      this.phase = "animating";
      this.teardownMatter(); // 儀式シーンを破棄
      if (this.destroyed) return;

      // pre-sim と同一の新規ワールド(決定論一致を保証)
      const { engine } = physics.buildWorld();
      this.engine = engine;
      const ball = physics.makeBall(cand.dropX, cand.vx);
      ball.render.fillStyle = "#ff5a3c";
      Matter.World.add(engine.world, ball);
      this.ball = ball;

      this.render = Matter.Render.create({
        element: this.$refs.canvasWrap,
        engine,
        options: {
          width: GEO.W,
          height: GEO.H,
          wireframes: false,
          background: "transparent",
          pixelRatio: window.devicePixelRatio || 1,
        },
      });
      this.render.canvas.style.width = "100%";
      this.render.canvas.style.height = "100%";
      Matter.Render.run(this.render);

      let landed = false;
      const settle = (bin) => {
        if (landed) return;
        landed = true;
        setTimeout(() => {
          if (!this.destroyed) this.finish();
        }, 700); // 着地の余韻
      };
      Matter.Events.on(engine, "collisionStart", (evt) => {
        for (const p of evt.pairs) {
          const labels = [p.bodyA.label, p.bodyB.label];
          if (!labels.includes("ball")) continue;
          const bl = labels.find((l) => l && l.indexOf("bin-") === 0);
          if (bl) return settle(parseInt(bl.slice(4), 10));
        }
      });

      // 手動固定ステップ(Runner不使用=決定論)。RAF に同期して見せる。
      const step = () => {
        if (this.destroyed) return;
        Matter.Engine.update(engine, GEO.FIXED_DELTA, 1);
        if (!landed) this.runnerRaf = requestAnimationFrame(step);
      };
      this.runnerRaf = requestAnimationFrame(step);

      // フェイルセーフ(演出尺を十分超える)
      this.failsafeId = setTimeout(() => {
        if (!landed && !this.destroyed) this.finish();
      }, 22000);
    },
    finish() {
      if (this.phase === "done") return;
      this.phase = "done";
      this.$emit("landed", { tier: this.targetTier });
    },
    onOverlayClick() {
      // 演出中はタップでスキップ
      if (this.phase === "animating") this.finish();
    },

    teardownMatter() {
      if (this.runnerRaf) cancelAnimationFrame(this.runnerRaf);
      this.runnerRaf = null;
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
  background: radial-gradient(circle at 50% 32%, #5a5050, #241f1f 72%);
  display: flex;
  align-items: center;
  justify-content: center;
}
.scene-inner {
  position: relative;
}
.canvas-wrap {
  width: 100%;
  height: 100%;
}
.canvas-wrap canvas {
  display: block;
}

/* ビンラベル(盤面下部のビン帯に重ねる) */
.bin-labels {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 1.2%;
  height: 12%;
  display: flex;
  pointer-events: none;
}
.bin-label {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: clamp(9px, 2.4vw, 15px);
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
  writing-mode: vertical-rl;
  letter-spacing: 0.02em;
}
.bl-chokichi { color: #ffd24d; }
.bl-daikichi { color: #ffcf6b; }
.bl-chukichi { color: #ffd9a8; }
.bl-shokichi { color: #b8e0c0; }
.bl-suekichi { color: #cfe0ea; }
.bl-kyo { color: #cfcfcf; }
.bl-daikyo { color: #ff9a9a; }

.hint {
  position: absolute;
  top: 6%;
  left: 0;
  right: 0;
  text-align: center;
  color: #fff;
  pointer-events: none;
}
.hint .btn {
  pointer-events: auto;
}
.hint-title {
  font-size: clamp(0.95rem, 3.6vw, 1.3rem);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
}
.hint.skip {
  top: auto;
  bottom: 16%;
  opacity: 0.7;
  font-size: 0.85rem;
}
</style>
