<template>
  <!-- スキップはclickとtouchendの両方で拾う。装置canvasのMatter.Mouseが
       touchstartをpreventDefaultするため、iOS Safariではcanvas上のタップで
       clickが合成されない(touchendはバブルするので拾える)。 -->
  <div class="omikuji-scene" @click="onTap" @touchend="onTap">
    <div ref="inner" class="scene-inner" :style="innerStyle">
      <!-- からくり装置(鈴の緒・絵馬・水車・斜面)の物理キャンバス -->
      <div v-if="!reducedMotion" ref="canvasWrap" class="canvas-wrap"></div>

      <!-- ビン(レア度)ラベル。毎回シャッフルした割当 -->
      <div class="bin-row">
        <div
          v-for="(tier, i) in tierByBin"
          :key="i"
          class="bin-slot"
          :class="{ target: targetGlow && i === targetBinIndex }"
        >
          <span class="bin-label" :class="'bl-' + tierKey(tier)">{{ tier }}</span>
        </div>
      </div>

      <!-- 狐(DOMスプライト)。寝床で寝ていて、玉に起こされてビンを飛び移る -->
      <div v-if="!reducedMotion" class="fox-wrap" :style="foxStyle">
        <FoxSprite :pose="foxPose" :style="{ transform: 'scaleX(' + foxFlip + ')' }" />
        <div v-if="foxPose === 'sleep'" class="bubble zzz">Zzz…</div>
        <div v-if="showBang" class="bubble bang">!</div>
      </div>

      <!-- 鈴が鳴った時の波紋 -->
      <div v-if="ringPulse" class="ring-pulse" :style="bellPulseStyle"></div>

      <!-- 案内 -->
      <div v-if="phase === 'ritual'" class="hint">
        <div v-if="!reducedMotion">
          <div class="hint-title">鈴の緒(金色の房)をつかんで、左右に振ろう</div>
          <a class="hint-fallback" href="javascript:void(0)" @click.stop="onRing">
            うまく鳴らせないときはここをタップ
          </a>
        </div>
        <div v-else>
          <button class="btn btn-lg btn-accent" @click.stop="onRing">鈴を鳴らす</button>
        </div>
      </div>
      <div v-else-if="phase === 'cascade' || phase === 'fox'" class="hint skip">
        タップでスキップ
      </div>
    </div>
  </div>
</template>

<script>
import Matter from "matter-js";
import machine from "@/components/omikujiMachine";
import { foxHopSequence } from "@/components/omikujiFox";
import FoxSprite from "@/components/FoxSprite";

const GEO = machine.GEO;

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

// 狐の座標(シーン内%)。物理の論理座標から換算した定数。
const FOX = {
  // 寝床(FOX_PLATFORM 上。右向きに寝て、おしりが左=玉2の飛来方向)
  sleepLeft: (443 / GEO.W) * 100,
  sleepBottom: ((GEO.H - 639) / GEO.H) * 100,
  // ビンの中に立つときの足元
  binBottom: ((GEO.H - 744) / GEO.H) * 100,
  widthPct: 17,
};

export default {
  components: { FoxSprite },
  props: {
    // 親が omikujiGo 応答後に渡す。届くまでは装置と狐が場を繋ぐ。
    targetTier: { type: String, default: null },
  },
  data() {
    return {
      phase: "ritual", // ritual | cascade | fox | done
      tierByBin: ALL_TIERS.slice(),
      rung: false,
      targetGlow: false,
      innerStyle: {},
      // 狐
      foxPose: "sleep",
      foxLeft: FOX.sleepLeft,
      foxBottom: FOX.sleepBottom,
      foxFlip: 1, // 右向きで寝る(おしりを左=玉の飛来方向に向ける)
      showBang: false,
      ringPulse: false,
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
        width: FOX.widthPct + "%",
      };
    },
    bellPulseStyle() {
      return {
        left: (GEO.BELL.x / GEO.W) * 100 + "%",
        top: (GEO.BELL.y / GEO.H) * 100 + "%",
      };
    },
  },
  watch: {
    // 鳴らし済みで tier が届き、装置パートが終わっていれば狐が動き出す
    targetTier(v) {
      if (v && this._waitingTarget) {
        this._waitingTarget = false;
        this.startHops();
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
    this._timers = [];
    this._raf = null;
    this._foxRaf = null;
    this.destroyed = false;

    if (!this.reducedMotion) {
      this.$nextTick(() => this.initScene());
    }
  },
  beforeDestroy() {
    this.destroyed = true;
    window.removeEventListener("resize", this.computeSize);
    (this._timers || []).forEach(clearTimeout);
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._foxRaf) cancelAnimationFrame(this._foxRaf);
    this.teardownMatter();
  },
  methods: {
    tierKey(t) {
      return TIER_KEYS[t] || "";
    },
    later(ms, fn) {
      const id = setTimeout(() => {
        if (!this.destroyed) fn();
      }, ms);
      this._timers.push(id);
      return id;
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
      const ratio = GEO.W / GEO.H;
      let w = Math.min(vw * 0.96, vh * 0.9 * ratio, 460);
      const h = w / ratio;
      this.innerStyle = { width: Math.round(w) + "px", height: Math.round(h) + "px" };
    },
    binLeftPct(i) {
      return ((i + 0.5) / GEO.BIN_COUNT) * 100;
    },

    // ---- 物理シーン(からくり装置+鈴の緒) ----
    initScene() {
      if (this.destroyed || !this.$refs.canvasWrap) return;
      const { engine, world, tassel, relayBall } = machine.buildMachineWorld(Matter);
      this.engine = engine;
      this.tassel = tassel;
      this.relayBall = relayBall;

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

      // 鈴の緒「だけ」掴める(カテゴリで制限。装置や玉は操作不可)
      const mouse = Matter.Mouse.create(this.render.canvas);
      this.mouseConstraint = Matter.MouseConstraint.create(engine, {
        mouse,
        collisionFilter: { category: GEO.CAT_MOUSE, mask: GEO.CAT_ROPE },
        constraint: { stiffness: 0.18, render: { visible: false } },
      });
      Matter.World.add(world, this.mouseConstraint);
      this.render.mouse = mouse;

      // 玉(または飛んだ絵馬)が狐のおしりに直撃 → 目を覚ます
      Matter.Events.on(engine, "collisionStart", (e) => {
        if (this.phase !== "cascade") return;
        for (const p of e.pairs) {
          const labels = [p.bodyA.label, p.bodyB.label];
          if (labels.includes("fox-sensor") && (labels.includes("ball") || labels.includes("ema"))) {
            this.wakeFox();
            return;
          }
        }
      });

      // 手動固定ステップ(揺れ検知は儀式中のみ)
      const step = () => {
        if (this.destroyed) return;
        Matter.Engine.update(this.engine, GEO.FIXED_DELTA, 1);
        if (this.phase === "ritual") this.trackSwing();
        this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    },

    // 鈴の緒のスイング検知:房の x が中心から左右のしきい値を交互に越えたら
    // 「振った」と数える(往復1.5回で鳴る。振幅ベースなので判定が安定)
    trackSwing() {
      if (!this.tassel || this.rung) return;
      const dx = this.tassel.position.x - GEO.BELL.x;
      const TH = 26;
      const side = dx > TH ? 1 : dx < -TH ? -1 : 0;
      if (side !== 0 && side !== this._lastSide) {
        if (this._lastSide === 1 || this._lastSide === -1) this._swings = (this._swings || 0) + 1;
        this._lastSide = side;
      }
      if ((this._swings || 0) >= 3) this.onRing();
    },

    onRing() {
      if (this.rung) return;
      this.rung = true;
      this.$emit("rang");
      this.ringPulse = true;
      this.later(900, () => (this.ringPulse = false));

      if (this.reducedMotion) {
        // 演出なし:tier が届き次第すぐ結果へ
        this.phase = "cascade";
        this.waitTargetThen(() => this.finish());
        return;
      }

      this.phase = "cascade";
      // 掴み操作はもう終わり(装置には最初から触れない)
      if (this.mouseConstraint && this.engine) {
        Matter.World.remove(this.engine.world, this.mouseConstraint);
        this.mouseConstraint = null;
      }
      // 鈴から御神玉を放つ
      this.later(300, () => {
        if (this.engine) machine.spawnBall(Matter, this.engine.world, 0.35);
      });
      // フォールバック階段(通常は約11.5秒で狐に直撃して不要):
      // 1) 連鎖が途中で詰まったら、リレーの玉2をそっと押して旅を続けさせる
      this.later(16000, () => {
        if (this.phase === "cascade" && this.relayBall && this.engine) {
          Matter.Sleeping.set(this.relayBall, false);
          Matter.Body.setVelocity(this.relayBall, { x: -1.2, y: -0.4 });
        }
      });
      // 2) それでも届かなければ狐を起こす
      this.later(20000, () => this.wakeFox());
      // 3) 全体フェイルセーフ
      this.later(32000, () => this.finish());
    },
    waitTargetThen(cb) {
      if (this.targetTier) return cb();
      const id = setInterval(() => {
        if (this.destroyed) return clearInterval(id);
        if (this.targetTier) {
          clearInterval(id);
          cb();
        }
      }, 100);
      this._timers.push(id);
    },

    // ---- 狐(結果を決める1個。最後は必ずサーバーの tier のビンへ) ----
    wakeFox() {
      if (this.phase !== "cascade") return;
      this.phase = "fox";
      // 「!」と共に目を覚ます(物理はそのまま残す=玉や装置の余韻が見える)
      this.showBang = true;
      this.foxPose = "idle";
      this.later(750, () => {
        this.showBang = false;
        if (this.targetTier) this.startHops();
        else {
          this._waitingTarget = true; // 応答待ち(通常は先に届いている)
          this.waitTargetThen(() => {
            if (this._waitingTarget) {
              this._waitingTarget = false;
              this.startHops();
            }
          });
        }
      });
    },
    startHops() {
      if (this.destroyed || this.phase === "done") return;
      const target = this.targetBinIndex >= 0 ? this.targetBinIndex : 0;
      this.hopSeq = foxHopSequence(target, GEO.BIN_COUNT);
      this.hopIndex = 0;
      // まず寝床からひと跳びで最初のビンへ。ひと跳び直行(hopSeqが本命のみ)の
      // 場合はこれが決めのジャンプなので、本命着地の演出(長い溜め・長い滞空)にする。
      const directToTarget = this.hopSeq.length === 1;
      this.doHop(this.foxLeft, this.binLeftPct(this.hopSeq[0]), FOX.binBottom, directToTarget, () => {
        this.later(directToTarget ? 250 : 500, () => this.nextHop());
      });
    },
    nextHop() {
      if (this.destroyed || this.phase === "done") return;
      this.hopIndex++;
      if (this.hopIndex >= this.hopSeq.length) {
        // 本命に着地済み → ご機嫌ポーズ+ビンが光って、溜めてから結果へ
        this.foxPose = "happy";
        this.targetGlow = true;
        this.later(1000, () => this.finish());
        return;
      }
      const from = this.binLeftPct(this.hopSeq[this.hopIndex - 1]);
      const to = this.binLeftPct(this.hopSeq[this.hopIndex]);
      const isFinal = this.hopIndex === this.hopSeq.length - 1;
      this.doHop(from, to, FOX.binBottom, isFinal, () => {
        // 着地後の間(キョロキョロ)。本命前は長めに焦らす
        this.later(isFinal ? 250 : 550 + Math.random() * 350, () => this.nextHop());
      });
    },
    // 1回のジャンプ:溜め(しゃがみ・おしりフリフリ)→ 放物線 → 着地の潰れ
    doHop(fromLeft, toLeft, toBottom, isFinal, done) {
      this.foxFlip = toLeft >= fromLeft ? 1 : -1;
      this.foxPose = "crouch";
      const crouchMs = isFinal ? 780 : 430;
      this.later(crouchMs, () => {
        this.foxPose = "jump";
        const fromBottom = this.foxBottom;
        const dur = isFinal ? 950 : 760;
        const apex = 15 + Math.min(18, Math.abs(toLeft - fromLeft) * 0.3);
        const t0 = performance.now();
        const tick = () => {
          if (this.destroyed) return;
          const t = Math.min(1, (performance.now() - t0) / dur);
          this.foxLeft = fromLeft + (toLeft - fromLeft) * t;
          this.foxBottom = fromBottom + (toBottom - fromBottom) * t + apex * Math.sin(Math.PI * t);
          if (t < 1) {
            this._foxRaf = requestAnimationFrame(tick);
          } else {
            this.foxBottom = toBottom;
            this.foxPose = "land";
            this.later(170, () => {
              if (this.foxPose === "land") this.foxPose = "idle";
            });
            done();
          }
        };
        this._foxRaf = requestAnimationFrame(tick);
      });
    },

    finish() {
      if (this.phase === "done") return;
      this.phase = "done";
      this.targetGlow = true;
      this.$emit("landed", { tier: this.targetTier });
    },
    onTap() {
      // 演出中はタップでスキップ(儀式中は誤爆防止のため無効。fallbackリンクを使う)
      if (this.phase === "cascade" || this.phase === "fox") this.finish();
    },

    teardownMatter() {
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
      this.tassel = null;
      this.relayBall = null;
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
  touch-action: none; /* スワイプで鈴の緒を振れるように(画面スクロールを止める) */
}
.scene-inner {
  position: relative;
}
.canvas-wrap {
  position: absolute;
  inset: 0;
  touch-action: none;
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
  height: 13%;
  display: flex;
  pointer-events: none;
}
.bin-slot {
  flex: 1 1 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 3px;
  transition: background 0.4s;
}
.bin-slot.target {
  background: linear-gradient(to top, rgba(255, 210, 90, 0.4), transparent);
}
.bin-label {
  writing-mode: vertical-rl;
  font-weight: 800;
  font-size: clamp(10px, 2.6vw, 15px);
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
.fox-wrap {
  position: absolute;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 3;
}
.bubble {
  position: absolute;
  color: #fff;
  font-weight: 800;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
}
.bubble.zzz {
  top: -18px;
  right: -6px;
  font-size: 14px;
  opacity: 0.9;
  animation: zzz-float 2s ease-in-out infinite;
}
@keyframes zzz-float {
  0%, 100% { transform: translateY(0); opacity: 0.55; }
  50% { transform: translateY(-6px); opacity: 1; }
}
.bubble.bang {
  top: -26px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 30px;
  color: #ffd24d;
  animation: bang-pop 0.35s ease-out;
}
@keyframes bang-pop {
  0% { transform: translateX(-50%) scale(0.2); }
  70% { transform: translateX(-50%) scale(1.3); }
  100% { transform: translateX(-50%) scale(1); }
}

/* 鈴の波紋 */
.ring-pulse {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 3px solid rgba(255, 210, 90, 0.9);
  transform: translate(-50%, -50%);
  animation: ring-expand 0.9s ease-out forwards;
  pointer-events: none;
}
@keyframes ring-expand {
  0% { width: 20px; height: 20px; opacity: 1; }
  100% { width: 130px; height: 130px; opacity: 0; }
}

/* 案内 */
.hint {
  position: absolute;
  top: 4%;
  left: 0;
  right: 0;
  text-align: center;
  color: #fff;
  pointer-events: none;
  z-index: 4;
}
.hint .btn,
.hint .hint-fallback {
  pointer-events: auto;
}
.hint-title {
  font-size: clamp(0.9rem, 3.4vw, 1.15rem);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}
.hint-fallback {
  display: inline-block;
  margin-top: 6px;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.75);
  text-decoration: underline;
}
.hint.skip {
  top: auto;
  bottom: 15%;
  opacity: 0.65;
  font-size: 0.85rem;
}
</style>
