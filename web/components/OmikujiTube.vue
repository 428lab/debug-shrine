<template>
  <!-- おみくじ筒(神社の作法どおり)。筒を上下に振る → ひっくり返すと番号の棒が出る
       → その番号の引き出しが開き、中の札にレア度が書いてある。
       番号と引き出しの中身は結果が届いてから決める(引き出しは閉じていて中は
       見えないので、後出しでも嘘にならない)。OmikujiScene と同じく、儀式が
       済んだら rang、結果を見せ終えたら landed を出す。 -->
  <div class="omikuji-tube" @click="onTap" @touchend="onTap">
    <div ref="inner" class="tube-inner" :style="innerStyle">
      <svg class="tube-svg" :viewBox="`0 0 ${W} ${H}`" xmlns="http://www.w3.org/2000/svg">
        <!-- 筒(つまんで上下に振る)。位置と回転は外側の g の transform 属性、
             カラカラの揺れは内側の g の CSS アニメーション。同じ要素に付けると
             CSS の transform が属性の transform を上書きして、筒が定位置へ飛ぶ。 -->
        <g :transform="tubeTransform">
          <g class="tube" :class="{ grabbing: dragging, rattling: rattling }" @pointerdown.stop.prevent="onDown">
            <!-- 出てくる棒(筒の口から伸びる。筒と一緒に回る) -->
            <rect
              v-if="stickOut > 0"
              :x="TUBE.x - 7"
              :y="TUBE.y - TUBE.h / 2 - stickOut"
              width="14"
              :height="stickOut + 20"
              rx="3"
              class="stick"
            />
            <!-- 本体(六角柱を正面から見た形) -->
            <rect
              :x="TUBE.x - TUBE.w / 2"
              :y="TUBE.y - TUBE.h / 2"
              :width="TUBE.w"
              :height="TUBE.h"
              rx="10"
              class="tube-body"
            />
            <rect :x="TUBE.x - TUBE.w / 2" :y="TUBE.y - TUBE.h / 2" :width="TUBE.w * 0.22" :height="TUBE.h" rx="8" class="tube-facet" />
            <rect :x="TUBE.x + TUBE.w * 0.28" :y="TUBE.y - TUBE.h / 2" :width="TUBE.w * 0.22" :height="TUBE.h" rx="8" class="tube-facet dark" />
            <rect :x="TUBE.x - TUBE.w / 2" :y="TUBE.y - TUBE.h / 2 + 22" :width="TUBE.w" height="8" class="tube-band" />
            <rect :x="TUBE.x - TUBE.w / 2" :y="TUBE.y + TUBE.h / 2 - 30" :width="TUBE.w" height="8" class="tube-band" />
            <!-- 1文字ずつ別の text にして、それぞれ中央揃えにする。1つの text の中で
                 tspan を改行して並べていたら、tspan の間の改行が空白として描かれ、
                 「御␣」「神␣」が空白込みで中央揃えされて左に寄った(末尾の籤だけ中央)。
                 >{{ ch }}</text> と詰めて書き、空白を入れないこと。 -->
            <text
              v-for="(ch, k) in TUBE_LABEL"
              :key="'l' + k"
              :x="TUBE.x"
              :y="TUBE.y - 40 + k * 36"
              class="tube-label"
            >{{ ch }}</text>
            <!-- 口(上面の穴) -->
            <ellipse :cx="TUBE.x" :cy="TUBE.y - TUBE.h / 2 + 4" rx="10" ry="4" class="tube-hole" />
          </g>
        </g>
        <!-- 棒の番号。筒はひっくり返っているので、筒の外に正立で書く -->
        <template v-if="drawerNo !== null && stickOut > 90">
          <text
            v-for="(ch, k) in stickLabel"
            :key="'n' + k"
            :x="TUBE.x"
            :y="stickLabelY + k * 15"
            class="stick-no"
          >{{ ch }}</text>
        </template>

        <!-- 引き出しの棚 -->
        <rect :x="CAB.x" :y="CAB.y" :width="CAB.w" :height="CAB.h" rx="6" class="cabinet" />
        <g v-for="i in DRAWERS" :key="'d' + i" :class="{ open: openDrawer === i - 1 }" class="drawer">
          <g :transform="`translate(0 ${openDrawer === i - 1 ? drawerPull : 0})`">
            <rect
              :x="drawerX(i - 1) + 3"
              :y="CAB.y + 10"
              :width="drawerW - 6"
              :height="CAB.h - 20"
              rx="4"
              class="drawer-face"
            />
            <circle :cx="drawerX(i - 1) + drawerW / 2" :cy="CAB.y + CAB.h - 24" r="4" class="drawer-knob" />
            <text :x="drawerX(i - 1) + drawerW / 2" :y="CAB.y + 36" class="drawer-no">{{ KANJI[i - 1] }}</text>
          </g>
        </g>
      </svg>

      <!-- 引き出しから出てくる札(HTML。縦書き) -->
      <div v-if="paperShown" class="paper" :style="paperStyle">
        <!-- 1文字ずつ縦に積む(writing-mode だと、絶対配置の札の高さが文字に
             合わずに文字が札の外へはみ出した) -->
        <span
          v-for="(ch, k) in targetTier || ''"
          :key="k"
          class="paper-tier"
          :class="'bl-' + tierKey(targetTier)"
        >{{ ch }}</span>
      </div>

      <div v-if="phase === 'ritual'" class="hint">
        <div class="hint-title">筒をつまんで、上下に振ろう</div>
        <a class="hint-fallback" href="javascript:void(0)" @click.stop="autoShake">
          うまく振れないときはここをタップ
        </a>
      </div>
      <div v-else-if="phase === 'waiting'" class="hint">
        <div class="hint-title">カラカラ…</div>
      </div>
      <div v-else-if="phase === 'reveal'" class="hint skip">タップでスキップ</div>
    </div>
  </div>
</template>

<script>
const TIER_KEYS = {
  超吉: "chokichi",
  大吉: "daikichi",
  中吉: "chukichi",
  小吉: "shokichi",
  末吉: "suekichi",
  凶: "kyo",
  大凶: "daikyo",
};
const KANJI = ["一", "二", "三", "四", "五", "六", "七"];
const TUBE_LABEL = ["御", "神", "籤"];

// 論理座標(OmikujiScene の装置と同じ 480x760)
const W = 480;
const H = 760;
const TUBE = { x: 240, y: 330, w: 96, h: 250 };
const CAB = { x: 30, y: 600, w: 420, h: 120 };
const DRAWERS = 7;
// 振りの判定: 上下の向きが SHAKE_AMP(論理座標)以上動いてから切り返した回数が SHAKES に達したら完了
const SHAKE_AMP = 22;
const SHAKES = 4;
const MAX_OFFSET = 70; // 筒が指について動ける範囲(上下)
const FAILSAFE_MS = 25000; // 結果を待つ上限

export default {
  props: {
    targetTier: { type: String, default: null },
    // ページは全種類に同じ props を渡すので受けておく(ここでは使わない)
    pattern: { type: String, default: null },
  },
  data() {
    return {
      W,
      H,
      TUBE,
      CAB,
      DRAWERS,
      KANJI,
      TUBE_LABEL,
      phase: "ritual", // ritual | waiting | reveal | done
      offsetY: 0,
      tilt: 0,
      flip: 0, // 0 → 180(ひっくり返す)
      flipping: false,
      dragging: false,
      rattling: false,
      stickOut: 0,
      drawerNo: null, // 0 始まり
      openDrawer: null,
      drawerPull: 0,
      paperShown: false,
      innerStyle: {},
      reducedMotion: false,
    };
  },
  computed: {
    drawerW() {
      return CAB.w / DRAWERS;
    },
    tubeTransform() {
      return `translate(0 ${this.offsetY}) rotate(${this.tilt + this.flip} ${TUBE.x} ${TUBE.y})`;
    },
    stickLabel() {
      return ["第", KANJI[this.drawerNo] || "", "番"];
    },
    // ひっくり返った筒の口から下へ伸びた棒の、先端寄りの位置
    stickLabelY() {
      const hole = TUBE.y + this.offsetY + TUBE.h / 2 - 4;
      return hole + this.stickOut - 44;
    },
    paperStyle() {
      const cx = this.drawerX(this.drawerNo) + this.drawerW / 2;
      return {
        left: (cx / W) * 100 + "%",
        // 開いた引き出しの上半分に重ねる(引き出しから札が立ち上がる見た目)。
        // 棚の上に置くと、真ん中の引き出しのとき筒から出た棒の先と重なった。
        bottom: ((H - (CAB.y + 50)) / H) * 100 + "%",
      };
    },
  },
  watch: {
    targetTier(v) {
      // ひっくり返している最中なら、終わってから出す(ここで棒のアニメーションを
      // 始めると、ひっくり返す途中で止まって筒が傾いたままになった)
      if (v && this.phase === "waiting" && !this.flipping) this.reveal();
    },
  },
  mounted() {
    this.reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.computeSize();
    window.addEventListener("resize", this.computeSize);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    this._timers = [];
    this._raf = null;
    this.destroyed = false;
  },
  beforeDestroy() {
    this.destroyed = true;
    window.removeEventListener("resize", this.computeSize);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
    (this._timers || []).forEach(clearTimeout);
    clearTimeout(this._rattleTimer);
    if (this._raf) cancelAnimationFrame(this._raf);
  },
  methods: {
    tierKey(t) {
      return TIER_KEYS[t] || "";
    },
    drawerX(i) {
      return CAB.x + i * this.drawerW;
    },
    later(ms, fn) {
      const id = setTimeout(() => {
        if (!this.destroyed) fn();
      }, ms);
      this._timers.push(id);
    },
    computeSize() {
      const ratio = W / H;
      const w = Math.min(window.innerWidth * 0.96, window.innerHeight * 0.9 * ratio, 460);
      this.innerStyle = { width: Math.round(w) + "px", height: Math.round(w / ratio) + "px" };
    },
    // 画面の y(px)を論理座標の y に
    toLogicalY(clientY) {
      const r = this.$refs.inner.getBoundingClientRect();
      return ((clientY - r.top) / r.height) * H;
    },

    // ---- 儀式: 筒をつまんで上下に振る ----
    onDown(e) {
      if (this.phase !== "ritual") return;
      this.dragging = true;
      this._grabY = this.toLogicalY(e.clientY) - this.offsetY;
      this._dir = 0;
      this._extreme = this.offsetY;
      this._shakes = 0;
    },
    onMove(e) {
      if (!this.dragging || this.phase !== "ritual") return;
      const y = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, this.toLogicalY(e.clientY) - this._grabY));
      const dy = y - this.offsetY;
      this.offsetY = y;
      this.tilt = Math.max(-8, Math.min(8, dy * 0.6));
      // 向きの切り返しを数える(一定以上動いてからの切り返しだけ)
      const dir = y > this._extreme ? 1 : y < this._extreme ? -1 : 0;
      if (this._dir === 0) {
        if (Math.abs(y - this._extreme) >= SHAKE_AMP) this._dir = dir;
      } else if (dir === this._dir) {
        this._extreme = y;
      } else if (dir !== 0 && Math.abs(y - this._extreme) >= SHAKE_AMP) {
        this._shakes++;
        this._dir = dir;
        this._extreme = y;
        this.rattle();
        if (this._shakes >= SHAKES) this.completeRitual();
      }
    },
    onUp() {
      // 振っている途中で儀式が済んだ場合、その後の指離し(touchend / click)が
      // スキップに食われないよう、離した時点から改めて少し待つ。振り続けて
      // 1.5 秒後に離すと、札が出る前に演出が終わってしまった。
      if (this._releasePending) {
        this._releasePending = false;
        this._skipArmedAt = Math.max(this._skipArmedAt || 0, performance.now() + 600);
        return;
      }
      if (!this.dragging) return;
      this.dragging = false;
      if (this.phase === "ritual") this.settleTube();
    },
    rattle() {
      this.rattling = true;
      this.later(160, () => (this.rattling = false));
    },
    // 指を離したら筒を定位置に戻す
    settleTube() {
      this.animate(260, (t) => {
        this.offsetY *= 1 - t;
        this.tilt *= 1 - t;
      });
    },
    // 「うまく振れないとき」: 自動で数回振ってから完了
    autoShake() {
      if (this.phase !== "ritual") return;
      const seq = [-50, 50, -50, 50, 0];
      seq.forEach((y, k) => {
        this.later(k * 170, () => {
          if (this.phase !== "ritual") return;
          this.offsetY = y;
          this.tilt = y ? (y > 0 ? 6 : -6) : 0;
          if (y) this.rattle();
          if (k === seq.length - 1) this.completeRitual();
        });
      });
    },

    // 振り終えた → 抽選を頼む(rang)。筒をひっくり返して結果を待つ。
    completeRitual() {
      if (this.phase !== "ritual") return;
      this.phase = "waiting";
      if (this.dragging) this._releasePending = true;
      this.dragging = false;
      this._skipArmedAt = performance.now() + 1500;
      this.$emit("rang");
      // 結果が届かないまま(通信が途中で止まった等)でも画面を閉じられるように、
      // 待ちが長引いたら着地させる。ページは結果が無ければ状態を取り直す
      // (OmikujiScene の TIMELINE.failsafeMs と同じ扱い)。
      this.later(FAILSAFE_MS, () => {
        if (this.phase === "waiting") this.finish();
      });
      const y0 = this.offsetY;
      const t0 = this.tilt;
      this.flipping = true;
      this.animate(this.reducedMotion ? 1 : 700, (t) => {
        const e = t * t * (3 - 2 * t);
        this.offsetY = y0 * (1 - e) - 90 * e;
        this.tilt = t0 * (1 - e);
        this.flip = 180 * e;
      }, () => {
        this.flipping = false;
        if (this.targetTier) this.reveal();
        else this.waitRattle();
      });
    },
    // 結果待ちの間は、ときどき筒がカラカラ揺れる
    waitRattle() {
      if (this.phase !== "waiting") return;
      this.rattle();
      // タイマーは積まない(待ちが長いと _timers が増え続けるので、1本を張り替える)
      clearTimeout(this._rattleTimer);
      this._rattleTimer = setTimeout(() => {
        if (!this.destroyed) this.waitRattle();
      }, 650);
    },

    // ---- 結果: 棒が出る → 引き出しが開く → 札 ----
    reveal() {
      if (this.phase !== "waiting" || !this.targetTier) return;
      this.phase = "reveal";
      // 引き出しの中身は今決める(閉じているので見えていない)
      this.drawerNo = Math.floor(Math.random() * DRAWERS);
      const quick = this.reducedMotion;
      this.animate(quick ? 1 : 900, (t) => {
        this.stickOut = 115 * (1 - Math.pow(1 - t, 3));
      }, () => {
        this.later(quick ? 0 : 700, () => {
          this.openDrawer = this.drawerNo;
          this.animate(quick ? 1 : 500, (t) => {
            this.drawerPull = 26 * t;
          }, () => {
            this.paperShown = true;
            this.later(quick ? 300 : 1500, () => this.finish());
          });
        });
      });
    },
    finish() {
      if (this.phase === "done") return;
      this.phase = "done";
      this.$emit("landed", { tier: this.targetTier });
    },
    onTap() {
      if (this._skipArmedAt && performance.now() < this._skipArmedAt) return;
      if (this.phase === "reveal") this.finish();
    },

    // 0→1 の進みで step を呼ぶ小さなアニメーション
    animate(ms, step, done) {
      if (this._raf) cancelAnimationFrame(this._raf);
      const t0 = performance.now();
      const tick = () => {
        if (this.destroyed) return;
        const t = Math.min(1, (performance.now() - t0) / ms);
        step(t);
        if (t < 1) this._raf = requestAnimationFrame(tick);
        else {
          this._raf = null;
          if (done) done();
        }
      };
      this._raf = requestAnimationFrame(tick);
    },
  },
};
</script>

<style scoped>
.omikuji-tube {
  position: fixed;
  inset: 0;
  z-index: 9999;
  overflow: hidden;
  background: radial-gradient(circle at 50% 30%, #5a5050, #221d1d 72%);
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  touch-action: none;
}
.tube-inner {
  position: relative;
}
.tube-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.tube {
  cursor: grab;
}
.tube.grabbing {
  cursor: grabbing;
}
.tube.rattling {
  animation: rattle 0.16s linear;
}
@keyframes rattle {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  75% { transform: translateX(3px); }
}
.tube-body {
  fill: #b8322a;
  stroke: #6e1c16;
  stroke-width: 3;
}
.tube-facet {
  fill: #d24a3c;
  opacity: 0.7;
}
.tube-facet.dark {
  fill: #8e241d;
  opacity: 0.6;
}
.tube-band {
  fill: #e0b84a;
}
.tube-label {
  fill: #f3ead8;
  font-size: 30px;
  font-weight: 800;
  text-anchor: middle;
}
.tube-hole {
  fill: #2a1a14;
}
.stick {
  fill: #e8dcc0;
  stroke: #9a8454;
  stroke-width: 1.5;
}
.stick-no {
  fill: #6e1c16;
  font-size: 12px;
  font-weight: 800;
  text-anchor: middle;
}
.cabinet {
  fill: #5a3a22;
  stroke: #2e1c10;
  stroke-width: 3;
}
.drawer-face {
  fill: #8a5a34;
  stroke: #3e2616;
  stroke-width: 2;
}
.drawer.open .drawer-face {
  fill: #a8703f;
  filter: drop-shadow(0 0 6px rgba(255, 210, 90, 0.8));
}
.drawer-knob {
  fill: #e0b84a;
}
.drawer-no {
  fill: #f3ead8;
  font-size: 22px;
  font-weight: 800;
  text-anchor: middle;
}

/* 引き出しから出る札(縦書き) */
.paper {
  position: absolute;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
  background: #fbf6ea;
  border: 2px solid #b23a48;
  border-radius: 4px;
  padding: 12px 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
  animation: paper-rise 0.6s ease-out;
  z-index: 3;
}
@keyframes paper-rise {
  0% { transform: translate(-50%, 60%) scale(0.6); opacity: 0; }
  100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
}
.paper-tier {
  font-weight: 900;
  font-size: clamp(18px, 5vw, 28px);
  color: #3a2a20;
  text-shadow: none;
}
.paper-tier.bl-chokichi,
.paper-tier.bl-daikichi {
  color: #b8860b;
}
.paper-tier.bl-kyo,
.paper-tier.bl-daikyo {
  color: #6e1c16;
}

.hint {
  position: absolute;
  top: 3%;
  left: 0;
  right: 0;
  text-align: center;
  color: #fff;
  pointer-events: none;
  z-index: 4;
}
.hint .hint-fallback {
  pointer-events: auto;
}
.hint-title {
  /* vw だと横長の画面で大きくなりすぎ、筒の口に重なった。短い辺を基準にする */
  font-size: clamp(0.8rem, 3.4vmin, 1.15rem);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}
.hint-fallback {
  display: inline-block;
  margin-top: 6px;
  font-size: clamp(0.7rem, 2.8vmin, 0.8rem);
  color: rgba(255, 255, 255, 0.75);
  text-decoration: underline;
}
.hint.skip {
  opacity: 0.65;
  font-size: 0.85rem;
}
@media (prefers-reduced-motion: reduce) {
  .tube.rattling,
  .paper {
    animation: none;
  }
}
</style>
