<template>
  <!-- 隠しあみだくじ。途中の横線は霞に隠れていて、線を選んでから(結果が届いてから)
       組み立てる。組み立ては omikujiAmida.js。OmikujiScene と同じく、儀式が済んだら
       rang、結果を見せ終えたら landed を出す。
       スキップはclickとtouchendの両方で拾う(OmikujiScene と同じ理由)。 -->
  <div class="omikuji-amida" @click="onTap" @touchend="onTap">
    <div class="amida-inner" :style="innerStyle">
      <svg class="amida-svg" :viewBox="`0 0 ${W} ${H}`" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="amida-mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#d9d2c8" stop-opacity="0.55" />
            <stop offset="0.12" stop-color="#cfc6ba" stop-opacity="0.96" />
            <stop offset="1" stop-color="#b9afa2" stop-opacity="0.98" />
          </linearGradient>
        </defs>

        <!-- 縦線 -->
        <line
          v-for="i in LANES"
          :key="'v' + i"
          :x1="laneX(i - 1)"
          :x2="laneX(i - 1)"
          :y1="TOP_Y"
          :y2="BOTTOM_Y"
          class="lane"
        />

        <!-- 横線(組み立て後だけ存在する。霞の下) -->
        <line
          v-for="h in rungs"
          :key="'h' + h.r + '-' + h.c"
          :x1="laneX(h.c)"
          :x2="laneX(h.c + 1)"
          :y1="rowY(h.r)"
          :y2="rowY(h.r)"
          class="rung"
        />

        <!-- たどった道(光の軌跡) -->
        <polyline v-if="trail.length > 1" :points="trailPoints" class="trail" />

        <!-- 霞。光の少し先まで晴れる -->
        <g v-if="mistTop < MIST_BOTTOM" class="mist" :class="{ swirling: phase === 'waiting' }">
          <rect :x="0" :y="mistTop" :width="W" :height="MIST_BOTTOM - mistTop" fill="url(#amida-mist)" />
          <ellipse
            v-for="p in visiblePuffs"
            :key="'p' + p.k"
            :cx="p.x"
            :cy="Math.max(p.y, mistTop + 6)"
            :rx="p.rx"
            :ry="p.ry"
            class="puff"
          />
        </g>

        <!-- 光 -->
        <circle v-if="tracer" :cx="tracer.x" :cy="tracer.y" r="11" class="tracer" />

        <!-- 上の選び口 -->
        <g
          v-for="i in LANES"
          :key="'s' + i"
          class="start"
          :class="{ chosen: chosen === i - 1, dim: chosen !== null && chosen !== i - 1 }"
          role="button"
          :tabindex="phase === 'choose' ? 0 : -1"
          :aria-label="`${i}本目の線を選ぶ`"
          @click.stop="choose(i - 1)"
          @touchend.stop.prevent="choose(i - 1)"
          @keydown.enter.space.prevent="choose(i - 1)"
        >
          <circle :cx="laneX(i - 1)" :cy="TOP_Y - 26" r="22" class="start-hit" />
          <circle :cx="laneX(i - 1)" :cy="TOP_Y - 26" r="15" class="start-lamp" />
        </g>
      </svg>

      <!-- 下の端(レア度)。毎回シャッフル -->
      <div class="end-row">
        <div
          v-for="(tier, i) in tierByBin"
          :key="i"
          class="end-slot"
          :class="{ target: arrived && i === targetBin }"
        >
          <span class="end-label" :class="'bl-' + tierKey(tier)">{{ tier }}</span>
        </div>
      </div>

      <div v-if="phase === 'choose'" class="hint">
        <div class="hint-title">好きな線をひとつ選ぼう</div>
        <a class="hint-fallback" href="javascript:void(0)" @click.stop="chooseRandom">
          迷ったらおまかせ
        </a>
      </div>
      <div v-else-if="phase === 'waiting'" class="hint">
        <div class="hint-title">霞の向こうをお伺い中…</div>
      </div>
      <div v-else-if="phase === 'tracing'" class="hint skip">タップでスキップ</div>
    </div>
  </div>
</template>

<script>
import { LANES, buildLadder } from "@/components/omikujiAmida";

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

// 論理座標(OmikujiScene の装置と同じ 480x760)
const W = 480;
const H = 760;
const LANE_X0 = 60;
const LANE_GAP = 60;
const TOP_Y = 172; // 横長の小さい画面でも、案内文(2行)が選び口に重ならない高さ
const BOTTOM_Y = 648;
const RUNG_TOP = 200;
const RUNG_BOTTOM = 620;
const MIST_TOP = 192; // 霞の上端(選ぶ前・待つ間)
const MIST_BOTTOM = 632;
const SPEED = 0.3; // 光の速さ(px/ms)
const MIST_LEAD = 36; // 光の何px先まで霞が晴れるか
const FAILSAFE_MS = 25000; // 結果を待つ上限

export default {
  props: {
    targetTier: { type: String, default: null },
    // ページは全種類に同じ props を渡すので受けておく(ここでは使わない)
    pattern: { type: String, default: null },
  },
  data() {
    // 霞の模様(雲のかたまり)。見た目だけなので毎回ランダムでよい。
    const puffs = [];
    for (let y = MIST_TOP + 20; y < MIST_BOTTOM; y += 34) {
      for (let x = 20; x < W; x += 70) {
        puffs.push({
          k: puffs.length,
          x: x + Math.random() * 40,
          y: y + Math.random() * 16,
          rx: 34 + Math.random() * 20,
          ry: 14 + Math.random() * 8,
        });
      }
    }
    return {
      W,
      H,
      LANES,
      TOP_Y,
      BOTTOM_Y,
      MIST_BOTTOM,
      phase: "choose", // choose | waiting | tracing | done
      chosen: null,
      tierByBin: ALL_TIERS.slice(),
      ladder: null,
      trail: [],
      tracer: null,
      mistTop: MIST_TOP,
      arrived: false,
      puffs,
      innerStyle: {},
      reducedMotion: false,
    };
  },
  computed: {
    targetBin() {
      return this.targetTier ? this.tierByBin.indexOf(this.targetTier) : -1;
    },
    // 横線(組み立て後だけ)。霞の下に描く
    rungs() {
      if (!this.ladder) return [];
      const out = [];
      this.ladder.rows.forEach((row, r) => row.forEach((on, c) => on && out.push({ r, c })));
      return out;
    },
    // 霞の模様のうち、まだ晴れていない所
    visiblePuffs() {
      return this.puffs.filter((p) => p.y > this.mistTop - 10);
    },
    trailPoints() {
      return this.trail.map((p) => `${p.x},${p.y}`).join(" ");
    },
  },
  watch: {
    targetTier(v) {
      if (v && this.phase === "waiting") this.startTrace();
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
    this.destroyed = false;
  },
  beforeDestroy() {
    this.destroyed = true;
    window.removeEventListener("resize", this.computeSize);
    (this._timers || []).forEach(clearTimeout);
    if (this._raf) cancelAnimationFrame(this._raf);
  },
  methods: {
    tierKey(t) {
      return TIER_KEYS[t] || "";
    },
    laneX(i) {
      return LANE_X0 + i * LANE_GAP;
    },
    rowY(r) {
      const n = this.ladder ? this.ladder.rows.length : 1;
      return RUNG_TOP + ((r + 0.5) * (RUNG_BOTTOM - RUNG_TOP)) / n;
    },
    later(ms, fn) {
      const id = setTimeout(() => {
        if (!this.destroyed) fn();
      }, ms);
      this._timers.push(id);
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
      const ratio = W / H;
      const w = Math.min(window.innerWidth * 0.96, window.innerHeight * 0.9 * ratio, 460);
      this.innerStyle = { width: Math.round(w) + "px", height: Math.round(w / ratio) + "px" };
    },

    // 線を選ぶ → 抽選を頼む(rang)。結果が届くまで霞が渦を巻く。
    choose(i) {
      if (this.phase !== "choose") return;
      this.chosen = i;
      this.phase = "waiting";
      // 選んだ指離しがそのままスキップに食われないように、しばらく武装しない
      this._skipArmedAt = performance.now() + 1500;
      this.$emit("rang");
      // 結果が届かないまま(通信が途中で止まった等)でも画面を閉じられるように、
      // 待ちが長引いたら着地させる。ページは結果が無ければ状態を取り直す
      // (OmikujiScene の TIMELINE.failsafeMs と同じ扱い)。
      this.later(FAILSAFE_MS, () => {
        if (this.phase === "waiting") this.finish();
      });
      if (this.targetTier) this.startTrace();
    },
    chooseRandom() {
      this.choose(Math.floor(Math.random() * LANES));
    },

    // 結果が届いた → 横線を組み、光が選んだ線をたどる。
    startTrace() {
      if (this.phase !== "waiting" || this.targetBin < 0) return;
      this.ladder = buildLadder(this.chosen, this.targetBin);
      this.phase = "tracing";
      const pts = this.pathPoints();
      if (this.reducedMotion) {
        this.trail = pts;
        this.mistTop = MIST_BOTTOM;
        this.arrive();
        return;
      }
      // 折れ線に沿って一定の速さで進む
      const segs = [];
      let total = 0;
      for (let k = 1; k < pts.length; k++) {
        const len = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
        segs.push({ a: pts[k - 1], b: pts[k], from: total, len });
        total += len;
      }
      const t0 = performance.now();
      const tick = () => {
        if (this.destroyed || this.phase !== "tracing") return;
        const d = Math.min(total, (performance.now() - t0) * SPEED);
        const trail = [pts[0]];
        let head = pts[0];
        for (const s of segs) {
          if (d >= s.from + s.len) {
            trail.push(s.b);
            head = s.b;
          } else {
            const f = (d - s.from) / s.len;
            head = { x: s.a.x + (s.b.x - s.a.x) * f, y: s.a.y + (s.b.y - s.a.y) * f };
            trail.push(head);
            break;
          }
        }
        this.trail = trail;
        this.tracer = head;
        this.mistTop = Math.max(this.mistTop, Math.min(MIST_BOTTOM, head.y + MIST_LEAD));
        if (d >= total) {
          this.mistTop = MIST_BOTTOM;
          this.arrive();
        } else {
          this._raf = requestAnimationFrame(tick);
        }
      };
      this._raf = requestAnimationFrame(tick);
    },
    // 選んだ線の道筋(上端 → 各段 → 下端)
    pathPoints() {
      const { rows, path } = this.ladder;
      const pts = [{ x: this.laneX(path[0]), y: TOP_Y }];
      rows.forEach((row, r) => {
        const y = this.rowY(r);
        if (path[r + 1] !== path[r]) {
          pts.push({ x: this.laneX(path[r]), y });
          pts.push({ x: this.laneX(path[r + 1]), y });
        }
      });
      pts.push({ x: this.laneX(path[path.length - 1]), y: BOTTOM_Y });
      return pts;
    },
    arrive() {
      this.arrived = true;
      this.later(1300, () => this.finish());
    },
    finish() {
      if (this.phase === "done") return;
      this.phase = "done";
      this.$emit("landed", { tier: this.targetTier });
    },
    onTap() {
      // 選ぶ前と、選んだ直後の猶予中は無効(誤爆防止)
      if (this._skipArmedAt && performance.now() < this._skipArmedAt) return;
      if (this.phase === "tracing") this.finish();
    },
  },
};
</script>

<style scoped>
.omikuji-amida {
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
.amida-inner {
  position: relative;
}
.amida-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.lane {
  stroke: #c9a46a;
  stroke-width: 4;
  stroke-linecap: round;
}
.rung {
  stroke: #c9a46a;
  stroke-width: 4;
  stroke-linecap: round;
}
.trail {
  fill: none;
  stroke: #ffd24d;
  stroke-width: 7;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 6px rgba(255, 210, 77, 0.8));
}
.tracer {
  fill: #fff6cf;
  filter: drop-shadow(0 0 10px #ffd24d);
}
.puff {
  fill: #ddd5ca;
  opacity: 0.9;
}
.mist.swirling .puff {
  animation: puff-drift 2.4s ease-in-out infinite alternate;
}
.mist.swirling .puff:nth-child(odd) {
  animation-duration: 3.1s;
  animation-direction: alternate-reverse;
}
@keyframes puff-drift {
  from { transform: translateX(-10px); }
  to { transform: translateX(10px); }
}
.start {
  cursor: pointer;
}
.start-hit {
  fill: transparent;
}
.start-lamp {
  fill: #b23a48;
  stroke: #ffd9a8;
  stroke-width: 3;
  transition: fill 0.3s, opacity 0.3s;
}
.start.chosen .start-lamp {
  fill: #ffd24d;
  filter: drop-shadow(0 0 8px #ffd24d);
}
.start.dim .start-lamp {
  opacity: 0.35;
}

/* 下の端(OmikujiScene のビンと同じ見た目) */
.end-row {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 13%;
  display: flex;
  padding: 0 calc(100% * 30 / 480);
  pointer-events: none;
}
.end-slot {
  flex: 1 1 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 6px;
  transition: background 0.4s;
}
.end-slot.target {
  background: linear-gradient(to top, rgba(255, 210, 90, 0.45), transparent);
}
.end-slot.target .end-label {
  animation: end-pop 0.5s ease-out;
}
@keyframes end-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.5); }
  100% { transform: scale(1.2); }
}
.end-label {
  writing-mode: vertical-rl;
  font-weight: 800;
  font-size: clamp(10px, 2.6vw, 15px);
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  display: inline-block;
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
  /* vw だと横長の画面で大きくなりすぎ、選び口に重なった。短い辺を基準にする */
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
  /* 下に置くと線の下端(光の終点)に重なる */
  opacity: 0.65;
  font-size: 0.85rem;
}
@media (prefers-reduced-motion: reduce) {
  .mist.swirling .puff,
  .end-slot.target .end-label {
    animation: none;
  }
}
</style>
