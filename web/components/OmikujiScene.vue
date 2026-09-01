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

      <!-- 狐(DOMスプライト)。寝床で寝ていて、玉(や木札)に起こされてビンを飛び移る -->
      <div v-if="!reducedMotion" class="fox-wrap" :style="foxStyle">
        <FoxSprite :pose="foxPose" :style="{ transform: 'scaleX(' + foxFlip + ')' }" />
        <div v-if="foxPose === 'sleep'" class="bubble zzz">Zzz…</div>
        <div v-if="showBang" class="bubble bang">!</div>
      </div>

      <!-- 儀式が完了した時の波紋(鈴が鳴った・玉を放った) -->
      <div v-if="ringPulse" class="ring-pulse" :style="pulseStyle"></div>

      <!-- 案内(文言は装置ごと) -->
      <div v-if="phase === 'ritual'" class="hint">
        <div v-if="!reducedMotion">
          <div class="hint-title">{{ hint.title }}</div>
          <a class="hint-fallback" href="javascript:void(0)" @click.stop="onFallback">
            {{ hint.fallback }}
          </a>
        </div>
        <div v-else>
          <button class="btn btn-lg btn-accent" @click.stop="onRing">{{ hint.button }}</button>
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
import machines from "@/components/omikujiMachines";
import { foxHopSequence } from "@/components/omikujiFox";
import FoxSprite from "@/components/FoxSprite";

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

// 狐の横幅(シーン内%)。寝床の位置は装置ごと(machine.FOX)。
const FOX_WIDTH_PCT = 17;

export default {
  components: { FoxSprite },
  props: {
    // 親が omikujiGo 応答後に渡す。届くまでは装置と狐が場を繋ぐ。
    targetTier: { type: String, default: null },
    // 装置(からくり)の種類。omikujiMachines.js の id。
    pattern: { type: String, default: "bell" },
  },
  data() {
    // 狐の初期位置は装置の寝床。装置そのものは data に入れない(computed の machine)。
    // data に入れると Vue 2 が装置モジュール(共有オブジェクト)を丸ごと
    // リアクティブ化して __ob__ を生やし、ヘッドレス検証と共有している
    // モジュールの中身を書き換えてしまう。
    const fox = machines.byId(this.pattern).FOX;
    return {
      phase: "ritual", // ritual | cascade | fox | done
      tierByBin: ALL_TIERS.slice(),
      rung: false,
      targetGlow: false,
      innerStyle: {},
      // 狐
      foxPose: "sleep",
      foxLeft: fox.sleepLeft,
      foxBottom: fox.sleepBottom,
      foxFlip: fox.flip,
      showBang: false,
      ringPulse: false,
      pulsePos: null,
      reducedMotion: false,
    };
  },
  computed: {
    // 装置は生成時に確定(以後変えない)。座標系(GEO)も装置のもの。
    machine() {
      return machines.byId(this.pattern);
    },
    GEO() {
      return this.machine.GEO;
    },
    hint() {
      return this.machine.HINT;
    },
    // ビンの中に立つときの足元
    foxBinBottom() {
      return ((this.GEO.H - this.GEO.FLOOR_Y) / this.GEO.H) * 100;
    },
    targetBinIndex() {
      return this.targetTier ? this.tierByBin.indexOf(this.targetTier) : -1;
    },
    foxStyle() {
      return {
        left: this.foxLeft + "%",
        bottom: this.foxBottom + "%",
        width: FOX_WIDTH_PCT + "%",
      };
    },
    pulseStyle() {
      const p = this.pulsePos || this.machine.pulseAt(this.built || {});
      return {
        left: (p.x / this.GEO.W) * 100 + "%",
        top: (p.y / this.GEO.H) * 100 + "%",
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
      const ratio = this.GEO.W / this.GEO.H;
      let w = Math.min(vw * 0.96, vh * 0.9 * ratio, 460);
      const h = w / ratio;
      this.innerStyle = { width: Math.round(w) + "px", height: Math.round(h) + "px" };
    },
    binLeftPct(i) {
      return ((i + 0.5) / this.GEO.BIN_COUNT) * 100;
    },

    // ---- 物理シーン(装置は machine が組む。シーンは幕の進行だけを持つ) ----
    initScene() {
      if (this.destroyed || !this.$refs.canvasWrap) return;
      const GEO = this.GEO;
      const built = this.machine.build(Matter);
      this.built = built;
      this.engine = built.engine;

      this.render = Matter.Render.create({
        element: this.$refs.canvasWrap,
        engine: built.engine,
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

      // 指でつまめるのは装置が決めたものだけ(鈴の緒 / 御神玉)。装置や他の玉は操作不可。
      const mouse = Matter.Mouse.create(this.render.canvas);
      this.mouseConstraint = Matter.MouseConstraint.create(built.engine, {
        mouse,
        collisionFilter: this.machine.grabFilter,
        constraint: { stiffness: 0.18, render: { visible: false } },
      });
      Matter.World.add(built.world, this.mouseConstraint);
      this.render.mouse = mouse;

      this.ritual = this.machine.createRitual(Matter, built);
      this.settle = this.machine.createSettleDetector
        ? this.machine.createSettleDetector(Matter, built)
        : null;

      // 玉(や木札・絵馬)が狐のおしりに直撃 → 目を覚ます
      const wakeLabels = this.machine.wakeLabels;
      Matter.Events.on(built.engine, "collisionStart", (e) => {
        if (this.phase !== "cascade") return;
        for (const p of e.pairs) {
          const labels = [p.bodyA.label, p.bodyB.label];
          if (!labels.includes("fox-sensor")) continue;
          const other = labels[0] === "fox-sensor" ? labels[1] : labels[0];
          if (wakeLabels.includes(other)) {
            this.wakeFox();
            return;
          }
        }
      });

      // 手動固定ステップ。儀式中は装置の完了判定、見せ場中は静止検知を回す。
      const step = () => {
        if (this.destroyed) return;
        Matter.Engine.update(this.engine, GEO.FIXED_DELTA, 1);
        if (this.phase === "ritual" && this.ritual) {
          const dragging = !!(this.mouseConstraint && this.mouseConstraint.body);
          if (this.ritual.step(dragging)) this.onRing();
        } else if (this.phase === "cascade" && this.settle && !this._settleFired) {
          // 狙いが外れて何にも当たらず、玉も木札も静まったら、物音で狐が起きる
          // (タイムボックスを待たずに数秒で先へ進める)。
          if (this.settle.step()) {
            this._settleFired = true;
            this.later(1200, () => this.wakeFox());
          }
        }
        this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    },

    // 「うまく鳴らせない/放てないとき」の代替操作。装置がその場で完了なら鳴らす。
    onFallback() {
      if (this.rung) return;
      if (!this.ritual || this.machine.fallbackRitual(Matter, this.built, this.ritual)) {
        this.onRing();
      }
    },

    onRing() {
      if (this.rung) return;
      this.rung = true;
      // 鳴った直後はスキップを武装しない。鈴を鳴らしたジェスチャーの指離し
      // (touchend)や勢い余った直後のタップが、cascadeに切り替わった瞬間の
      // スキップ判定に食われて即結果表示になるのを防ぐ。
      this._skipArmedAt = performance.now() + 1500;
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
      // 波紋は儀式完了時の位置(鈴 / 射出点)に出す
      this.pulsePos = this.machine.pulseAt(this.built || {});
      // 掴み操作はもう終わり
      if (this.mouseConstraint && this.engine) {
        Matter.World.remove(this.engine.world, this.mouseConstraint);
        this.mouseConstraint = null;
      }
      // 装置側の仕掛け(鈴なら御神玉の投入。弾き玉なら何もしない)
      this.machine.onRitualDone(Matter, this.built, (ms, fn) => this.later(ms, fn));
      // フォールバック階段(通常は途中で狐に直撃して不要):
      // 1) 詰まったら装置をそっと押す
      const tl = this.machine.TIMELINE;
      this.later(tl.nudgeMs, () => {
        if (this.phase === "cascade" && this.built && this.engine) {
          this.machine.nudge(Matter, this.built);
        }
      });
      // 2) それでも届かなければ狐を起こす
      this.later(tl.wakeMs, () => this.wakeFox());
      // 3) 全体フェイルセーフ
      this.later(tl.failsafeMs, () => this.finish());
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
      this.hopSeq = foxHopSequence(target, this.GEO.BIN_COUNT);
      this.hopIndex = 0;
      // まず寝床からひと跳びで最初のビンへ。ひと跳び直行(hopSeqが本命のみ)の
      // 場合はこれが決めのジャンプなので、本命着地の演出(長い溜め・長い滞空)にする。
      const directToTarget = this.hopSeq.length === 1;
      this.doHop(this.foxLeft, this.binLeftPct(this.hopSeq[0]), this.foxBinBottom, directToTarget, () => {
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
      this.doHop(from, to, this.foxBinBottom, isFinal, () => {
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
      // 鳴った直後の猶予中(_skipArmedAt前)も無効(onRing参照)。
      if (this._skipArmedAt && performance.now() < this._skipArmedAt) return;
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
      this.built = null;
      this.ritual = null;
      this.settle = null;
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
