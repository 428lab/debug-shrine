<template>
  <!-- 和風ピタゴラ。鈴の緒を引くと、玉が横長の装置を駆け抜け(2D)、回転盤から玉の
       視点(3D)であみだくじを走り、結果の門をくぐって巻物が広がる。物理エンジンは
       使わず、動きはすべて時間の関数(omikujiPitagora.js)。OmikujiScene と同じく、
       儀式が済んだら rang、結果を見せ終えたら landed を出す。 -->
  <div class="omikuji-pitagora" @click="onTap" @touchend="onTap">
    <div ref="inner" class="pg-inner" :style="innerStyle">
      <!-- 2D の装置 -->
      <svg v-show="show2D" class="pg-svg" :viewBox="viewBox" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="pg-ball" cx="0.35" cy="0.35" r="0.7">
            <stop offset="0" stop-color="#fff3c4" />
            <stop offset="0.45" stop-color="#e7b54a" />
            <stop offset="1" stop-color="#8a5f18" />
          </radialGradient>
          <linearGradient id="pg-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#1c1a26" />
            <stop offset="1" stop-color="#3a2d2a" />
          </linearGradient>
        </defs>
        <!-- 空と遠景は出口のレールの先(カメラが玉に寄る所)まで広げておく -->
        <rect x="0" y="-12" width="2400" height="832" fill="url(#pg-sky)" />
        <!-- 遠景の山 -->
        <path
          d="M0 520 L160 440 L300 500 L470 410 L640 480 L820 400 L1000 470 L1180 390 L1380 470 L1560 410 L1760 480 L1900 430 L2120 480 L2400 420 V820 H0 Z"
          class="hills"
        />

        <!-- ① 鈴と鈴の緒(横長の小さい画面でも案内文と重ならないよう、全体を 72 下げて描く) -->
        <g transform="translate(0 72)">
        <rect x="95" y="58" width="110" height="10" rx="3" class="wood" />
        <g :transform="`rotate(${bellSwing} 150 68)`">
          <path d="M150 68 V92" class="rope-top" />
          <path d="M116 142 C116 96 184 96 184 142 L192 158 H108 Z" class="bell" />
          <path d="M126 146 H174" class="bell-line" />
          <circle cx="150" cy="152" r="4" class="ink" />
        </g>
        <g class="rope-grab" @pointerdown.stop.prevent="onRopeDown">
          <path :d="`M150 160 V${ropeEnd}`" class="rope" />
          <path :d="`M142 ${ropeEnd} h16 l5 26 h-26 z`" class="tassel" />
          <rect x="105" :y="ropeEnd - 110" width="90" height="160" fill="transparent" />
        </g>
        </g>

        <!-- ② レールと絵馬の棚 -->
        <path :d="`M${G.RAIL.x0 - 8} ${G.RAIL.y0 + 11} L${G.RAIL.x1 + 5} ${G.RAIL.y1 + 11}`" class="rail" />
        <rect :x="G.LEDGE.x0 - 5" :y="G.LEDGE.y + 10" :width="G.LEDGE.x1 - G.LEDGE.x0 + 10" height="9" rx="2" class="wood" />
        <g v-for="i in G.EMA.n" :key="'ema' + i">
          <g :transform="`rotate(${emaAngles[i - 1]} ${G.EMA.x0 + (i - 1) * G.EMA.gap + 11} ${G.EMA.baseY - 2})`">
            <path
              :d="emaPath(G.EMA.x0 + (i - 1) * G.EMA.gap, G.EMA.baseY - 2)"
              class="ema"
            />
            <circle :cx="G.EMA.x0 + (i - 1) * G.EMA.gap + 11" :cy="G.EMA.baseY - 30" r="2" class="shu-fill" />
          </g>
        </g>

        <!-- ③ 鳥居と螺旋(柱に巻き付く1本のレール。奥 → 奥の玉 → 柱 → 手前の順に重ねる) -->
        <g class="torii">
          <rect x="800" y="300" width="200" height="14" rx="3" />
          <rect x="814" y="326" width="172" height="9" />
          <rect x="824" y="314" width="13" height="300" />
          <rect x="963" y="314" width="13" height="300" />
        </g>
        <path v-for="(d, k) in helixRails.back" :key="'hb' + k" :d="d" class="rail helix-back" />
        <circle
          v-if="phase !== 'ritual' && ball.coilBack"
          :cx="ball.x"
          :cy="ball.y"
          :r="10 * (ball.s || 1)"
          fill="url(#pg-ball)"
          class="ball"
        />
        <rect :x="G.HELIX.cx - 5" y="336" width="10" height="278" class="wood" />
        <path v-for="(d, k) in helixRails.front" :key="'hf' + k" :d="d" class="rail" />

        <!-- ④ 跳ね板と谷 -->
        <path :d="`M${G.HELIX.cx} ${G.HELIX.y1 + 11} L${G.BOARD.x + 4} ${G.BOARD.y + 11}`" class="rail" />
        <path d="M930 614 H1135 V820 H930 Z" class="ground" />
        <path d="M1316 614 H1395 V642 H2400 V820 H1316 Z" class="ground" />
        <path d="M1062 614 q-6 -8 0 -16 q6 -8 0 -16" class="spring" />
        <g :transform="`rotate(${boardTilt} 1062 600)`">
          <rect x="1030" y="596" width="96" height="8" rx="3" class="plank" />
        </g>
        <!-- 谷越えのスロー: 玉の後ろに残像を引く -->
        <circle
          v-for="(g, k) in slowGhosts"
          :key="'sg' + k"
          :cx="g.x"
          :cy="g.y"
          r="10"
          fill="url(#pg-ball)"
          :opacity="g.o"
        />

        <!-- ⑤ 鹿威し -->
        <!-- 樋の口は竹筒の口の真上。水は筒の上面(傾きで上下する)まで落ちて注がれる -->
        <path :d="`M1590 440 V476 H${WATER_X}`" class="pipe" />
        <path
          :d="`M${WATER_X} 484 V${waterEndY}`"
          class="water"
          :style="{ strokeDashoffset: -t * 90 }"
        />
        <rect :x="G.SHISHI.pivotX - 6" :y="G.SHISHI.pivotY - 40" width="12" height="92" class="wood" />
        <g :transform="`rotate(${shishiDeg} ${G.SHISHI.pivotX} ${G.SHISHI.pivotY - 40})`">
          <rect
            :x="G.SHISHI.pivotX - G.SHISHI.len / 2"
            :y="G.SHISHI.pivotY - 51"
            :width="G.SHISHI.len"
            height="22"
            rx="9"
            class="bamboo"
          />
          <ellipse :cx="G.SHISHI.pivotX + G.SHISHI.len / 2 - 3" :cy="G.SHISHI.pivotY - 40" rx="5" ry="10" class="ink" />
          <!-- 上面の口(樋の水はここに注がれる) -->
          <ellipse :cx="G.SHISHI.pivotX + 60" :cy="G.SHISHI.pivotY - 51" rx="12" ry="3.5" class="ink" />
        </g>
        <ellipse :cx="WATER_X" :cy="waterEndY" rx="6" ry="2" class="splash" />
        <circle :cx="G.SHISHI.pivotX" :cy="G.SHISHI.pivotY - 40" r="4" class="ink" />
        <ellipse cx="1350" cy="604" rx="30" ry="12" class="stone" />
        <!-- 竹が石を打った瞬間: 文字でなく、石から広がる輪と飛ぶ破片で見せる -->
        <g v-if="kakon" class="impact">
          <ellipse
            v-for="k in 3"
            :key="'kr' + k"
            cx="1348"
            cy="596"
            :rx="kakon.r * (1 + (k - 1) * 0.45)"
            :ry="kakon.r * (1 + (k - 1) * 0.45) * 0.38"
            :opacity="kakon.o / k"
          />
          <line
            v-for="k in 5"
            :key="'ks' + k"
            :x1="1348 + Math.cos(-0.35 - k * 0.48) * (14 + kakon.r * 0.5)"
            :y1="590 + Math.sin(-0.35 - k * 0.48) * (14 + kakon.r * 0.5)"
            :x2="1348 + Math.cos(-0.35 - k * 0.48) * (26 + kakon.r * 0.9)"
            :y2="590 + Math.sin(-0.35 - k * 0.48) * (26 + kakon.r * 0.9)"
            :opacity="kakon.o"
          />
        </g>

        <!-- ⑥ 回転盤 -->
        <path :d="`M1488 594 L${G.TABLE.cx - G.TABLE.rx + 6} ${G.TABLE.cy + 2}`" class="rail" />
        <rect :x="G.TABLE.cx - 8" :y="G.TABLE.cy" width="16" height="80" class="wood" />
        <ellipse :cx="G.TABLE.cx" :cy="G.TABLE.cy + 6" :rx="G.TABLE.rx" :ry="G.TABLE.ry" class="table-side" />
        <ellipse :cx="G.TABLE.cx" :cy="G.TABLE.cy" :rx="G.TABLE.rx" :ry="G.TABLE.ry" class="table-top" />
        <ellipse :cx="G.TABLE.cx" :cy="G.TABLE.cy" :rx="G.TABLE.rx - 22" :ry="G.TABLE.ry - 7" class="table-groove" />
        <!-- 出口のレール(回転盤の手前の真ん中から右へ。この先が 3D のあみだにつながる) -->
        <path :d="`M${G.TABLE.cx + 4} ${G.TABLE.cy - 8 + G.TABLE.ry + 11} L2400 ${G.TABLE.cy - 8 + G.TABLE.ry + 11}`" class="rail" />

        <!-- 御神玉 -->
        <circle
          v-if="phase !== 'ritual' && !ball.coilBack"
          :cx="ball.x"
          :cy="ball.y"
          :r="10 * (ball.s || 1)"
          fill="url(#pg-ball)"
          class="ball"
        />
      </svg>

      <!-- 3D のあみだ(玉の視点) -->
      <canvas v-show="phase === 'pov'" ref="canvas" class="pg-canvas" :style="{ opacity: povFade }"></canvas>

      <!-- 結果: 太鼓と巻物 -->
      <div v-if="phase === 'final'" class="final">
        <div class="taiko"><span class="shock"></span><span class="shock late"></span></div>
        <div class="scroll">
          <div class="scroll-rod"></div>
          <div class="scroll-paper">
            <div class="scroll-head">運勢</div>
            <div class="scroll-tier" :class="'bl-' + tierKey(targetTier)">
              <span v-for="(ch, k) in targetTier || ''" :key="k">{{ ch }}</span>
            </div>
          </div>
          <div class="scroll-rod"></div>
        </div>
      </div>

      <!-- 谷越えのスロー: 映画のような上下の黒帯と、周りの暗がり -->
      <div v-if="slowK > 0.01" class="slow-vignette" :style="{ opacity: slowK }"></div>
      <div v-if="slowK > 0.01" class="slow-bar top" :style="{ transform: `scaleY(${slowK})` }"></div>
      <div v-if="slowK > 0.01" class="slow-bar bottom" :style="{ transform: `scaleY(${slowK})` }"></div>

      <div class="flash" :style="{ opacity: flash }"></div>

      <div v-if="phase === 'ritual'" class="hint">
        <div class="hint-title">鈴の緒をつまんで、下に引こう</div>
        <a class="hint-fallback" href="javascript:void(0)" @click.stop="autoPull">
          うまく引けないときはここをタップ
        </a>
      </div>
      <div v-else-if="waiting && (t > G.T.tableIn || reducedMotion)" class="hint">
        <div class="hint-title">お伺い中…</div>
      </div>
      <div v-else-if="!waiting && phase !== 'done'" class="hint skip">タップでスキップ</div>
    </div>
  </div>
</template>

<script>
import G from "@/components/omikujiPitagora";

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
const TIER_COLORS = {
  超吉: "#ffd24d",
  大吉: "#ffcf6b",
  中吉: "#ffd9a8",
  小吉: "#b8e0c0",
  末吉: "#cfe0ea",
  凶: "#cfcfcf",
  大凶: "#ff9a9a",
};

const ROPE = { top: 160, rest: 300, pull: 48, max: 90 };
const LAP_SPEED = (2 * Math.PI) / 1.2; // 回転盤の角速度(rad/s)
// 出口でカメラが寄る倍率。3D の最初の構図(真横)はこの寄りの画面に合わせる
// (玉の大きさ・位置・動く速さがそろうよう、EXIT_SIDE_DIST を決めている)。
const EXIT_ZOOM = 3.2;
// 鹿威しの樋の口の x(竹筒の口 = 右端より少し内側の真上)
const WATER_X = 1476;
// 谷越えのスローでカメラが玉に寄る倍率
const SLOW_ZOOM = 2.2;
// 2D の玉の半径(画面の幅に対する割合)= 3D の玉の半径 → 真横のカメラの距離
const EXIT_SIDE_DIST = (0.9 * 0.42 * 480) / (10 * 1.06 * EXIT_ZOOM);
// 3D の走り出しの速さの倍率(2D の出口で玉の周りが流れる速さ ÷ 3D の真横で流れる速さ)
const EXIT_SPEED_MATCH =
  ((G.EXIT_SPEED * LAP_SPEED * EXIT_ZOOM) / 480) / ((0.9 * G.POV.speed) / EXIT_SIDE_DIST);
// 真横のカメラの見下ろす角度: 地平線 = 玉の 38 上(回転盤の地面の縁)× EXIT_ZOOM
const EXIT_PITCH = Math.atan((38 * EXIT_ZOOM) / 480 / 0.9);
const FAILSAFE_MS = 25000; // 結果を待つ上限
const FINAL_MS = 2300; // 巻物を見せる長さ
const PLAQUE_UNIT = 64; // 門の札の画像の文字の大きさ(px)

export default {
  props: {
    targetTier: { type: String, default: null },
    // ページは全種類に同じ props を渡すので受けておく(ここでは使わない)
    pattern: { type: String, default: null },
  },
  data() {
    return {
      phase: "ritual", // ritual | run | exit | pov | final | done
      t: 0, // rang からの秒
      tableAngle: 0,
      camX: 0,
      zoomF: 0, // 出口でカメラが玉に寄る度合い(0〜1)
      exitD: 0, // 回転盤から出口のレールへ出てからの距離
      povFade: 0, // 3D の絵を重ねていく度合い(2D と同じ構図から始めて、なじませる)
      flash: 0,
      pull: 0,
      bellSwing: 0,
      innerStyle: {},
      reducedMotion: false,
    };
  },
  computed: {
    show2D() {
      if (this.phase === "pov") return this.povFade < 1;
      return this.phase === "ritual" || this.phase === "run" || this.phase === "exit";
    },
    ball() {
      if (this.phase === "exit" || this.phase === "pov") return G.onExit(this.exitD);
      return G.ball2D(this.t, this.tableAngle);
    },
    viewBox() {
      // 寄り: 出口(3D へ切り替わる前)と、谷越えのスロー(スローの強さに合わせてアップ)
      const k = this.zoomF > 0 ? this.zoomF : this.slowK;
      if (k > 0) {
        // いつもの画面から、玉を真ん中にした寄りの画面へなめらかに移る
        const zoom = 1 + ((this.zoomF > 0 ? EXIT_ZOOM : SLOW_ZOOM) - 1) * k;
        const w = G.STAGE.W / zoom;
        const h = G.STAGE.H / zoom;
        const b = this.ball;
        const cx = this.camX + G.STAGE.W / 2 + (b.x - this.camX - G.STAGE.W / 2) * k;
        const cy = G.STAGE.H / 2 + (b.y - G.STAGE.H / 2) * k;
        return `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;
      }
      return `${this.camX} ${this.shake} ${G.STAGE.W} ${G.STAGE.H}`;
    },
    ropeEnd() {
      return ROPE.rest + this.pull;
    },
    emaAngles() {
      const out = [];
      for (let i = 0; i < G.EMA.n; i++) out.push(G.emaAngle(i, this.t));
      return out;
    },
    boardTilt() {
      return G.boardDip(this.t) * 0.6;
    },
    shishiDeg() {
      return G.shishiAngle(this.t);
    },
    // 樋から落ちる水が当たる所(竹筒の上面。筒の傾きで上下する)
    waterEndY() {
      const a = (this.shishiDeg * Math.PI) / 180;
      const d = (WATER_X - G.SHISHI.pivotX) / Math.cos(a);
      return G.SHISHI.pivotY - 40 + d * Math.sin(a) - 11 / Math.cos(a);
    },
    // 谷越えのスローの強さ(0〜1)
    slowK() {
      return this.phase === "run" && this.ball.slow ? this.ball.slow : 0;
    },
    // スローの間の残像(放物線の少し手前の位置に、薄く並べる)
    slowGhosts() {
      const k = this.slowK;
      if (k < 0.05) return [];
      const out = [];
      for (let i = 1; i <= 4; i++) {
        const f = this.ball.arcF - i * 0.035;
        if (f <= 0) break;
        const p = G.arcPoint(f);
        out.push({ x: p.x, y: p.y, o: (k * 0.4) / i });
      }
      return out;
    },
    // カコーンの輪: 打った瞬間に広がって消える
    kakon() {
      const u = (this.t - G.T.kakon) / 0.6;
      if (u < 0 || u > 1) return null;
      return { r: 10 + 40 * (1 - (1 - u) * (1 - u)), o: 1 - u };
    },
    // 打った瞬間だけ画面を小さく揺らす(減っていく揺れ)
    shake() {
      const u = (this.t - G.T.kakon) / 0.28;
      if (u < 0 || u > 1 || this.reducedMotion) return 0;
      return Math.sin(u * Math.PI * 7) * 4 * (1 - u);
    },
    // 結果を待っている(この間はスキップできない)
    waiting() {
      return (this.phase === "run" || this.phase === "exit") && !this.targetTier;
    },
  },
  created() {
    // 組み立てのモジュールは data に入れない(Vue 2 が中身までリアクティブ化して
    // __ob__ を生やし、検証スクリプトと共有しているモジュールを書き換えてしまう)
    this.G = G;
    this.helixRails = G.helixRailPaths();
    this.WATER_X = WATER_X;
  },
  mounted() {
    this.reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.computeSize();
    window.addEventListener("resize", this.computeSize);
    window.addEventListener("pointermove", this.onRopeMove);
    window.addEventListener("pointerup", this.onRopeUp);
    window.addEventListener("pointercancel", this.onRopeUp);
    this._timers = [];
    this._raf = null;
    this.destroyed = false;
  },
  beforeDestroy() {
    this.destroyed = true;
    window.removeEventListener("resize", this.computeSize);
    window.removeEventListener("pointermove", this.onRopeMove);
    window.removeEventListener("pointerup", this.onRopeUp);
    window.removeEventListener("pointercancel", this.onRopeUp);
    (this._timers || []).forEach(clearTimeout);
    if (this._raf) cancelAnimationFrame(this._raf);
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
    },
    computeSize() {
      const ratio = G.STAGE.W / G.STAGE.H;
      const w = Math.min(window.innerWidth * 0.96, window.innerHeight * 0.9 * ratio, 460);
      this.innerStyle = { width: Math.round(w) + "px", height: Math.round(w / ratio) + "px" };
      this._size = { w, h: w / ratio };
      const c = this.$refs.canvas;
      if (c) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        c.width = Math.round(w * dpr);
        c.height = Math.round((w / ratio) * dpr);
      }
    },
    toLogicalY(clientY) {
      const r = this.$refs.inner.getBoundingClientRect();
      return ((clientY - r.top) / r.height) * G.STAGE.H;
    },
    emaPath(x, baseY) {
      // 絵馬(五角形)。左下 x、底 baseY、幅 22・高さ 34
      return `M${x} ${baseY} V${baseY - 26} L${x + 11} ${baseY - 36} L${x + 22} ${baseY - 26} V${baseY} Z`;
    },

    // ---- 儀式: 鈴の緒を引く ----
    onRopeDown(e) {
      if (this.phase !== "ritual") return;
      this._grabY = this.toLogicalY(e.clientY) - this.pull;
      this._dragging = true;
    },
    onRopeMove(e) {
      if (!this._dragging || this.phase !== "ritual") return;
      this.pull = Math.max(0, Math.min(ROPE.max, this.toLogicalY(e.clientY) - this._grabY));
      this.bellSwing = this.pull * 0.08;
    },
    onRopeUp() {
      if (!this._dragging) return;
      this._dragging = false;
      if (this.phase !== "ritual") return;
      if (this.pull >= ROPE.pull) this.ring();
      else this.releaseRope();
    },
    releaseRope() {
      const p0 = this.pull;
      this.animate(300, (f) => {
        this.pull = p0 * (1 - f);
        this.bellSwing = Math.sin(f * Math.PI * 3) * 6 * (1 - f);
      });
    },
    autoPull() {
      if (this.phase !== "ritual") return;
      this.animate(350, (f) => {
        this.pull = ROPE.max * Math.sin((f * Math.PI) / 2);
      }, () => this.ring());
    },

    // 緒を引いた → 抽選を頼む(rang)。装置が動き出す。
    ring() {
      if (this.phase !== "ritual") return;
      this.phase = "run";
      this._skipArmedAt = performance.now() + 1500;
      this.$emit("rang");
      this.releaseRope();
      // 結果が届かないまま(通信が途中で止まった等)でも画面を閉じられるように、
      // 待ちが長引いたら着地させる。ページは結果が無ければ状態を取り直す
      // (OmikujiScene の TIMELINE.failsafeMs と同じ扱い)。
      this.later(FAILSAFE_MS, () => {
        if (this.phase === "run" || this.phase === "exit") this.finish();
      });
      if (this.reducedMotion) {
        this.waitThenFinal();
        return;
      }
      this._t0 = performance.now();
      this._last = this._t0;
      const tick = (now) => {
        if (this.destroyed || this.phase !== "run") return;
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;
        this.t = (now - this._t0) / 1000;
        if (this.t > G.T.tableIn) this.tableAngle += LAP_SPEED * dt;
        // 回転盤で最低1周し、結果が届いていれば、手前の真ん中に来た所で出口のレールへ出る
        if (this._exitAt == null && this.t > G.T.tableIn + G.T.minLap && this.targetTier) {
          this._exitAt = G.nextExitAngle(this.tableAngle);
        }
        if (this._exitAt != null && this.tableAngle >= this._exitAt) {
          this.tableAngle = this._exitAt;
          this.startExit();
          return;
        }
        // カメラは玉を追う(少し遅れてついていく)
        const target = G.cameraX(this.ball.x, this.t);
        this.camX += (target - this.camX) * Math.min(1, dt * 6);
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    },
    // 演出を減らす設定: 結果が届いたら巻物だけ見せる
    waitThenFinal() {
      if (this.destroyed || this.phase === "done") return;
      if (this.targetTier) this.showFinal();
      else this.later(200, () => this.waitThenFinal());
    },

    // 玉が回転盤から出口のレールへ出て、カメラが玉に寄っていく
    startExit() {
      this.phase = "exit";
      const t0 = performance.now();
      let last = t0;
      const tick = (now) => {
        if (this.destroyed || this.phase !== "exit") return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        this.exitD += G.EXIT_SPEED * LAP_SPEED * dt;
        // 寄る間もカメラは玉を追う(装置の右端で止めない。玉が画面の外へ逃げないように)
        this.camX += (this.ball.x - G.STAGE.W / 2 - this.camX) * Math.min(1, dt * 10);
        const f = Math.min(1, (now - t0) / (G.T.exit * 1000));
        this.zoomF = f * f * (3 - 2 * f);
        if (f < 1) this._raf = requestAnimationFrame(tick);
        else this.startPov();
      };
      this._raf = requestAnimationFrame(tick);
    },

    // ---- 玉の視点のあみだ(3D) ----
    startPov() {
      // 門の並び(レア度)は毎回シャッフル。入る線は回転盤から出た線(ランダム)。
      const gates = ALL_TIERS.slice();
      for (let i = gates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gates[i], gates[j]] = [gates[j], gates[i]];
      }
      const start = Math.floor(Math.random() * G.LANES);
      const target = gates.indexOf(this.targetTier);
      if (target < 0) {
        // 想定外のレア度(サーバーは7種で固定なので通常は起きない)。組めないので結果へ
        this.finish();
        return;
      }
      this._gates = gates;
      this._plaques = gates.map((tier) => [this.makePlaque(tier, false), this.makePlaque(tier, true)]);
      this._route = G.buildRoute(start, target);
      this.povFade = 0;
      this._yaw = 0;
      this.phase = "pov";
      this.$nextTick(() => {
        this.computeSize();
        const t0 = performance.now();
        let last = t0;
        const total = this._route.samples.total;
        const tick = (now) => {
          if (this.destroyed || this.phase !== "pov") return;
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const el = (now - t0) / 1000;
          // 2D の玉と同じ速さのまま走る。最初は 2D の寄りの画面に 3D を重ねてなじませる
          // (その間も 2D の玉は同じ速さで進める)
          // 走り出しは 2D の出口の速さ(画面の上で同じ速さに見える値)から、回り込む間に
          // いつもの速さへ戻す
          const k = EXIT_SPEED_MATCH - 1;
          const o = G.T.orbit;
          const s = G.POV.speed * (el + k * (el < o ? el - (el * el) / (2 * o) : o / 2));
          if (this.povFade < 1) {
            this.povFade = Math.min(1, el / 0.25);
            this.exitD += G.EXIT_SPEED * LAP_SPEED * dt;
          }
          this.flash = Math.max(0, (s - (total - 3)) / 4);
          this.drawPov(s, dt, Math.min(1, el / G.T.orbit));
          if (s < total + 1.5) this._raf = requestAnimationFrame(tick);
          else this.showFinal();
        };
        this._raf = requestAnimationFrame(tick);
      });
    },
    // o: カメラが真横から玉の後ろへ回り込む進み具合(0〜1)
    drawPov(s, dt, o = 1) {
      const c = this.$refs.canvas;
      if (!c) return;
      const ctx = c.getContext("2d");
      const W = c.width;
      const H = c.height;
      const route = this._route;
      const p = G.sampleRoute(route, s);
      const heading = Math.atan2(p.dir.x, p.dir.z);
      let d = heading - this._yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this._yaw += d * Math.min(1, dt * 7);
      // 最初は 2D の寄りの画面と同じ真横(玉が右へ転がって見える向き)から、玉を中心に
      // 回り込んで、いつもの「玉のやや後ろ上」へ移る
      const e = o * o * (3 - 2 * o);
      const side = -Math.PI / 2;
      const yaw = side + (this._yaw - side) * e;
      // 真横でも少し見下ろす(2D の寄りの画面で玉の上に見えている地面の縁と、地平線の高さを合わせる)
      // (EXIT_SIDE_DIST は玉までの視線の長さ。水平の距離と高さに分ける)
      const y0 = 0.45 + EXIT_SIDE_DIST * Math.sin(EXIT_PITCH);
      const side0 = EXIT_SIDE_DIST * Math.cos(EXIT_PITCH);
      const dist = side0 + (3.6 - side0) * e;
      const cam = {
        // 玉のやや後ろ上から。玉が画面の下寄りに来て、進む先を隠さない高さ
        x: p.x - Math.sin(yaw) * dist,
        y: y0 + (2.6 - y0) * e,
        z: p.z - Math.cos(yaw) * dist,
        yaw,
        pitch: EXIT_PITCH + (0.36 - EXIT_PITCH) * e,
        f: W * 0.9,
        cx: W / 2,
        cy: H * (0.5 - 0.1 * e),
      };

      // 空と地面
      const horizon = cam.cy - cam.f * Math.tan(cam.pitch);
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#1c1a26");
      sky.addColorStop(1, "#5a3f36");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      const ground = ctx.createLinearGradient(0, horizon, 0, H);
      ground.addColorStop(0, "#3a2d26");
      ground.addColorStop(1, "#15110e");
      ctx.fillStyle = ground;
      ctx.fillRect(0, horizon, W, H - horizon);

      // 線は色と太さ(0.5px 刻み)ごとにまとめて、最後に1本のパスで描く。1本ずつ
      // stroke すると1フレーム400回を超え、遅い端末で 3D の場面だけカクついた。
      const batches = new Map();
      const line = (a, b, width, color) => {
        const seg = G.projectSegment(cam, a, b);
        if (!seg) return;
        const z = (seg[0].z + seg[1].z) / 2;
        const w = Math.max(0.5, Math.round(((cam.f * width) / z) * 2) / 2);
        const key = color + "|" + w;
        let arr = batches.get(key);
        if (!arr) batches.set(key, (arr = []));
        arr.push(seg[0].x, seg[0].y, seg[1].x, seg[1].y);
      };
      const flush = () => {
        batches.forEach((arr, key) => {
          const [color, w] = key.split("|");
          ctx.strokeStyle = color;
          ctx.lineWidth = Number(w);
          ctx.beginPath();
          for (let i = 0; i < arr.length; i += 4) {
            ctx.moveTo(arr[i], arr[i + 1]);
            ctx.lineTo(arr[i + 2], arr[i + 3]);
          }
          ctx.stroke();
        });
        batches.clear();
      };
      ctx.lineCap = "round";
      const zEnd = route.zEnd;
      const gateZ = zEnd - 3;
      // 枕木は玉の近くだけ描く(遠くの枕木は細くて見えない)。範囲の端で急に現れない
      // よう、遠い側は十分先まで取る。後ろ側も、横へ渡る間に左右の列が欠けない程度に取る。
      const zNear = p.z - 20;
      const zFar = p.z + 70;
      const rungZ = (r) => G.POV.lead + r * G.POV.rowGap;

      // 先に枕木をすべて描いてから、レールを描く(まとめ描きは色と太さごとなので、
      // 同じ回に混ぜると手前の太い枕木がレールの上に描かれた)
      for (let lane = 0; lane < G.LANES; lane++) {
        const x = G.laneX(lane);
        const zs = Math.max(-6, Math.floor((zNear + 6) / 1.8) * 1.8 - 6);
        for (let z = zs; z < Math.min(gateZ + 4, zFar); z += 1.8) {
          line({ x: x - 0.75, y: 0.02, z }, { x: x + 0.75, y: 0.02, z }, 0.22, "#4a3524");
        }
      }
      route.ladder.rows.forEach((row, r) => {
        const z = rungZ(r);
        if (z < zNear || z > zFar) return;
        row.forEach((on, cIdx) => {
          if (!on) return;
          const x0 = G.laneX(cIdx) + 0.45;
          const x1 = G.laneX(cIdx + 1) - 0.45;
          for (let x = x0 + 0.6; x < x1; x += 1.8) {
            line({ x, y: 0.02, z: z - 0.75 }, { x, y: 0.02, z: z + 0.75 }, 0.22, "#4a3524");
          }
        });
      });
      flush();

      // レール(縦線2本ずつと、隣の線へ渡る横線)
      for (let lane = 0; lane < G.LANES; lane++) {
        const x = G.laneX(lane);
        for (let z = -6; z < gateZ + 4; z += 6) {
          const z2 = Math.min(gateZ + 4, z + 6);
          line({ x: x - 0.45, y: 0.12, z }, { x: x - 0.45, y: 0.12, z: z2 }, 0.12, "#c79a64");
          line({ x: x + 0.45, y: 0.12, z }, { x: x + 0.45, y: 0.12, z: z2 }, 0.12, "#c79a64");
        }
      }
      route.ladder.rows.forEach((row, r) => {
        const z = rungZ(r);
        row.forEach((on, cIdx) => {
          if (!on) return;
          const x0 = G.laneX(cIdx) + 0.45;
          const x1 = G.laneX(cIdx + 1) - 0.45;
          line({ x: x0, y: 0.12, z: z - 0.45 }, { x: x1, y: 0.12, z: z - 0.45 }, 0.12, "#c79a64");
          line({ x: x0, y: 0.12, z: z + 0.45 }, { x: x1, y: 0.12, z: z + 0.45 }, 0.12, "#c79a64");
        });
      });
      flush();

      // 門(鳥居)とレア度の札。着く直前に結果の門が灯る
      const near = s > route.samples.total - 14;
      const target = this._gates.indexOf(this.targetTier);
      for (let lane = 0; lane < G.LANES; lane++) {
        const x = G.laneX(lane);
        const lit = near && lane === target;
        const shu = lit ? "#ff7a52" : "#b8412c";
        line({ x: x - 2, y: 0, z: gateZ }, { x: x - 2, y: 4.2, z: gateZ }, 0.32, shu);
        line({ x: x + 2, y: 0, z: gateZ }, { x: x + 2, y: 4.2, z: gateZ }, 0.32, shu);
        line({ x: x - 2.7, y: 4.3, z: gateZ }, { x: x + 2.7, y: 4.3, z: gateZ }, 0.36, shu);
        line({ x: x - 2.2, y: 3.6, z: gateZ }, { x: x + 2.2, y: 3.6, z: gateZ }, 0.22, shu);
        flush();
        const pc = G.project(cam, { x, y: 2.5, z: gateZ });
        if (pc) {
          // 札は最初に作った画像を拡大縮小して貼る。毎フレーム文字を違う大きさで描き直すと、
          // 文字の描画がキャッシュに乗らず、3D の場面の重さの大半を占めた。
          const size = (cam.f * 0.85) / pc.z;
          if (size >= 3) {
            const img = this._plaques[lane][lit ? 1 : 0];
            const h = size * img.height / PLAQUE_UNIT;
            const w = size * img.width / PLAQUE_UNIT;
            ctx.drawImage(img, pc.x - w / 2, pc.y - h / 2, w, h);
          }
        }
      }

      // 御神玉
      const pb = G.project(cam, { x: p.x, y: 0.45, z: p.z });
      if (pb) {
        const r = (cam.f * 0.42) / pb.z;
        const g = ctx.createRadialGradient(pb.x - r * 0.35, pb.y - r * 0.35, r * 0.1, pb.x, pb.y, r);
        g.addColorStop(0, "#fff3c4");
        g.addColorStop(0.45, "#e7b54a");
        g.addColorStop(1, "#8a5f18");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(pb.x, pb.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    // 門の札の画像(文字の大きさ PLAQUE_UNIT px で1回だけ描く)
    makePlaque(tier, lit) {
      const chars = [...tier];
      const u = PLAQUE_UNIT;
      const c = document.createElement("canvas");
      c.width = Math.round(u * 1.5);
      c.height = Math.round(u * (chars.length * 1.1 + 0.3));
      const g = c.getContext("2d");
      if (lit) {
        g.fillStyle = "rgba(255, 210, 77, 0.95)";
        g.fillRect(0, 0, c.width, c.height);
      }
      const pad = u * 0.1;
      g.fillStyle = lit ? "#fff8e1" : "#efe6d2";
      g.fillRect(pad, pad, c.width - pad * 2, c.height - pad * 2);
      g.fillStyle = lit ? "#b8412c" : "#3a2a20";
      g.font = `800 ${u}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      chars.forEach((ch, k) => {
        g.fillText(ch, c.width / 2, c.height / 2 + (k - (chars.length - 1) / 2) * u * 1.05);
      });
      return c;
    },

    // ---- 結果: 太鼓と巻物 ----
    showFinal() {
      if (this.phase === "final" || this.phase === "done") return;
      this.phase = "final";
      this.flash = 0;
      this.later(this.reducedMotion ? 800 : FINAL_MS, () => this.finish());
    },
    finish() {
      if (this.phase === "done") return;
      this.phase = "done";
      this.flash = 0;
      this.$emit("landed", { tier: this.targetTier });
    },
    onTap() {
      if (this.phase === "ritual") return;
      if (this._skipArmedAt && performance.now() < this._skipArmedAt) return;
      if (this.phase === "run" && !this.targetTier) return; // 結果が無いと見せる物が無い
      if (this.phase !== "done") this.finish();
    },

    // 0→1 の進みで step を呼ぶ小さなアニメーション(儀式の間だけ使う)
    animate(ms, step, done) {
      const t0 = performance.now();
      const tick = () => {
        if (this.destroyed) return;
        const f = Math.min(1, (performance.now() - t0) / ms);
        step(f);
        if (f < 1) requestAnimationFrame(tick);
        else if (done) done();
      };
      requestAnimationFrame(tick);
    },
  },
};
</script>

<style scoped>
.omikuji-pitagora {
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
.pg-inner {
  position: relative;
  overflow: hidden;
  border-radius: 6px;
}
.pg-svg,
.pg-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.hills { fill: #2b2230; }
.wood { fill: #8b6a48; }
.ink { fill: #2a1a14; }
.shu-fill { fill: #cf4a30; }
.rope-top { stroke: #cf4a30; stroke-width: 6; }
.bell { fill: #d9ab45; stroke: #6b4a14; stroke-width: 2; }
.bell-line { stroke: #6b4a14; stroke-width: 2; }
.rope { stroke: #cf4a30; stroke-width: 9; stroke-dasharray: 12 7; fill: none; }
.tassel { fill: #cf4a30; }
.rope-grab { cursor: grab; }
.rail { stroke: #c79a64; stroke-width: 5; stroke-linecap: round; fill: none; }
.helix-back { stroke: #8a6a48; }
.ema { fill: #f3ead8; stroke: #5b3b23; stroke-width: 1.6; }
.torii rect { fill: #b8412c; }
.ground { fill: #2a211c; }
.spring { fill: none; stroke: #93b56f; stroke-width: 4; }
.plank { fill: #3a2d26; stroke: #c79a64; stroke-width: 1.5; }
.pipe { fill: none; stroke: #6f8f4e; stroke-width: 10; stroke-linecap: round; }
.water { stroke: #9cc3ec; stroke-width: 5; stroke-dasharray: 10 5; stroke-linecap: round; opacity: 0.9; }
.splash { fill: #a9c6e6; opacity: 0.7; }
.bamboo { fill: #6f8f4e; stroke: #3f5a2a; stroke-width: 1.5; }
.stone { fill: #6a6460; }
.table-side { fill: #5a3f28; }
.table-top { fill: #8b6a48; stroke: #c79a64; stroke-width: 2; }
.table-groove { fill: none; stroke: #5a3f28; stroke-width: 2; stroke-dasharray: 5 5; }
.ball { filter: drop-shadow(0 0 4px rgba(255, 210, 90, 0.7)); }
.impact ellipse { fill: none; stroke: #efe6d2; stroke-width: 2.5; }
.impact line { stroke: #efe6d2; stroke-width: 3; stroke-linecap: round; }

.slow-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(8, 6, 12, 0.7) 100%);
}
.slow-bar {
  position: absolute;
  left: 0;
  right: 0;
  height: 9%;
  background: #000;
  pointer-events: none;
}
.slow-bar.top {
  top: 0;
  transform-origin: top;
}
.slow-bar.bottom {
  bottom: 0;
  transform-origin: bottom;
}
.flash {
  position: absolute;
  inset: 0;
  background: #fff8e1;
  pointer-events: none;
}

/* 結果: 太鼓と巻物 */
.final {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 40%, #3a2d2a, #1c1a26 75%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4%;
}
.taiko {
  width: 38%;
  aspect-ratio: 2 / 1.1;
  border-radius: 50%;
  background: #b8412c;
  box-shadow: inset 0 -8px 0 #7d2a1c;
  position: relative;
  animation: taiko-hit 0.35s ease-out;
  order: 2;
}
.taiko::after {
  content: "";
  position: absolute;
  inset: 10% 8% 30%;
  border-radius: 50%;
  background: #efe6d2;
}
/* ドンは文字でなく、太鼓から広がる衝撃の輪で見せる */
.shock {
  position: absolute;
  inset: -4%;
  border-radius: 50%;
  border: 3px solid rgba(255, 214, 120, 0.9);
  opacity: 0;
  animation: shock 0.7s ease-out;
  pointer-events: none;
}
.shock.late {
  animation-delay: 0.12s;
  border-width: 2px;
}
@keyframes taiko-hit {
  0% { transform: scale(1.18); }
  100% { transform: scale(1); }
}
@keyframes shock {
  0% { transform: scale(0.9); opacity: 1; }
  100% { transform: scale(1.9); opacity: 0; }
}

.scroll {
  width: 44%;
  display: flex;
  flex-direction: column;
  align-items: center;
  order: 1;
}
.scroll-rod {
  width: 112%;
  height: 12px;
  border-radius: 6px;
  background: #8b6a48;
}
.scroll-paper {
  width: 100%;
  background: #fbf6ea;
  border-inline: 3px solid #b8412c;
  overflow: hidden;
  animation: unroll 0.9s ease-out both;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-block: 10px 16px;
  gap: 6px;
}
@keyframes unroll {
  from { max-height: 0; }
  to { max-height: 60vh; }
}
.scroll-head {
  font-size: 12px;
  letter-spacing: 0.2em;
  color: #7d6a58;
}
.scroll-tier {
  display: flex;
  flex-direction: column;
  align-items: center;
  font: 900 clamp(40px, 13vmin, 72px) / 1.05 "Hiragino Mincho ProN", "Yu Mincho", serif;
  color: #3a2a20;
}
.scroll-tier.bl-chokichi,
.scroll-tier.bl-daikichi {
  color: #b8860b;
}
.scroll-tier.bl-kyo,
.scroll-tier.bl-daikyo {
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
  .taiko,
  .shock,
  .scroll-paper {
    animation: none;
  }
}
</style>
