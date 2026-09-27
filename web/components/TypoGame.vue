<template>
  <!-- ミニゲーム「誤字祓い」。ルールは typoGame.js(純関数)、らぼみの動きは labomiRig.js、
       ここは描画・演出・音・操作。ハイスコアはこの端末にだけ保存する(DB には送らない)。 -->
  <div class="tg" @dblclick.prevent>
    <div ref="wrap" class="tg-wrap">
      <canvas
        ref="canvas"
        class="tg-canvas"
        :class="{ lock: phase !== 'over' }"
        @pointerdown.prevent="onPointer"
        @pointerup="unlockAudio"
        @touchstart="onTouch"
        @touchend="onTouch"
        @contextmenu.prevent
      ></canvas>
    </div>

    <!-- 結果の札(スクショ・画像保存で共有しやすい) -->
    <div v-if="phase === 'over' && result" class="tg-card">
      <img src="/labomi/labomi_01.png" alt="" class="tg-card-labomi" />
      <div class="tg-card-body">
        <div class="tg-card-name">誤字祓い</div>
        <div class="tg-card-score">{{ result.score.toLocaleString() }}</div>
        <div class="tg-card-title">称号「{{ result.title }}」</div>
        <div class="tg-card-best" :class="{ hot: result.newBest }">{{ result.bestLine }}</div>
        <div class="tg-card-meta">
          直した誤字 {{ result.fixed }} / 最大コンボ {{ result.maxCombo }} / お手つき {{ result.misses }}
        </div>
        <div class="tg-card-line">らぼみ「{{ result.line }}」</div>
        <div class="tg-card-site">でばっぐ神社 {{ siteHost }} ・ {{ result.date }}</div>
      </div>
    </div>
    <div v-if="phase === 'over'" class="tg-actions">
      <button type="button" class="btn btn-warning" @click="onButton($event, start)">もう1回</button>
      <button type="button" class="btn btn-outline-light" @click="onButton($event, saveImage)">
        <i class="fas fa-download fa-fw"></i> 画像を保存
      </button>
    </div>
    <p class="tg-help">
      落ちてくる言葉の<b>間違っている文字</b>をタップ。正しい文字を押すとお手つき。<br />
      ゲージが満タンになったら、らぼみをタップで一斉お祓い。
    </p>
  </div>
</template>

<script>
import G from "@/components/typoGame";
import Rig from "@/components/labomiRig";

const BEST_KEY = "debug-shrine:typo:best";
const MINCHO = "'Hiragino Mincho ProN', 'Yu Mincho', serif";
const MONO = "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace";
const GOTHIC = "'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', sans-serif";
const GOLD = "#ffd84a";
const SPECIAL_MS = 1900; // 一斉お祓いの演出の長さ
// タップしてから、幻の祓串が左・右・左と振り終えて誤字が砕けるまで(ms)
const SWING_MS = 330;
const IMPACT = 340;
const DYING_MS = 1100;
// らぼみ(しめ縄の下、右寄りに立つ)
const LB_SCALE = 0.44;
const LB_FOOT = { x: G.W - 105, y: G.H - 6 };
// らぼみのセリフ(口調は docs/character.md)
const LINES = {
  start: ["あーしに任せて!", "誤字、ぜんぶ祓っちゃお!", "いくよー!"],
  combo: ["えらすぎ!", "最高かよ!", "ちょーヤバいじゃん!", "わかる〜!", "それな!"],
  miss: ["そこ合ってるしww", "ｳｹﾙｰwww", "ないわ〜"],
  leak: ["ガン萎えだわ〜", "まじありえない", "ふつーにやばくない?"],
  special: ["あーしに任せて!"],
  over: ["なんとかなるっしょ!", "ドンマイ!次いこ!", "ぶっちゃけ最高だったよ!"],
  great: ["神じゃん!えらすぎ!", "最高かよ!ちょーウケるww"],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function loadBest() {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0;
  } catch (e) {
    return 0;
  }
}
function saveBest(v) {
  try {
    window.localStorage.setItem(BEST_KEY, String(v));
  } catch (e) {
    // 保存できない環境では、その場のベストだけ
  }
}

export default {
  props: {
    siteUrl: { type: String, default: "" },
  },
  data() {
    return {
      phase: "ready", // ready | play | paused | dying | over
      best: 0,
      result: null,
    };
  },
  computed: {
    siteHost() {
      return (this.siteUrl || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    },
  },
  created() {
    // 毎フレーム書き換わるものは data に入れない
    this.game = null;
    this.fx = null;
  },
  mounted() {
    this.best = loadBest();
    this.game = G.newGame();
    this.resetFx();
    this.bg = this.makeBackground();
    const img = new Image();
    img.onload = () => {
      if (this._destroyed) return;
      try {
        this.rig = Rig.createLabomi(img);
      } catch (e) {
        this.rig = null;
      }
    };
    img.src = "/labomi/labomi_01.png";
    this.resize();
    window.addEventListener("resize", this.resize);
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(this.$refs.wrap);
    }
    document.addEventListener("visibilitychange", this.onVisibility);
    // ダブルタップで拡大しないように(このページにいる間だけ)
    this._prevTouchAction = document.documentElement.style.touchAction;
    document.documentElement.style.touchAction = "manipulation";
    this._last = performance.now();
    this._acc = 0;
    this._raf = requestAnimationFrame(this.frame);
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    document.documentElement.style.touchAction = this._prevTouchAction || "";
    if (this._ro) this._ro.disconnect();
    this._destroyed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this.rig) this.rig.destroy();
    if (this.ac) this.ac.close();
  },
  methods: {
    resize() {
      const c = this.$refs.canvas;
      const wrap = this.$refs.wrap;
      if (!c || !wrap) return;
      const w = wrap.clientWidth;
      if (!w) return;
      const h = (w * G.H) / G.W;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.style.height = h + "px";
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      this._scale = c.width / G.W;
    },
    resetFx() {
      this.fx = {
        parts: [], // 光の粒・紙垂
        shards: [], // 砕けた間違いの文字
        beams: [], // 祓串から言葉へ走る光
        rings: [], // 衝撃の輪
        pops: [], // 点数
        pillars: [], // 一斉お祓いの光の柱
        goheis: [], // 言葉の上で左右左と振る、幻の祓串
        rays: [], // 放射状の光
        seals: [], // 「祓」の印
        flashes: [], // 画面が白く光る
        quakes: [], // あとで揺らす(砕けた瞬間)
        itemFx: {}, // 言葉ごとの演出(直した時刻・お手つき)
        shake: 0,
        swingAt: -1e9,
        jumpAt: -1e9,
        say: null, // らぼみのセリフ { text, at }
        blinkAt: 0,
        nextBlink: performance.now() + 2000,
        special: null, // 一斉お祓いの開始時刻
        comboAt: 0,
      };
    },
    onVisibility() {
      if (document.hidden && this.phase === "play") {
        this.phase = "paused";
        this._pausedAt = performance.now();
      }
    },
    // 遊んでいる間だけ、タッチでページが動いたり拡大したりしないようにする
    // (終わった後は、下の結果の札とボタンまでスクロールできるように)
    onTouch(e) {
      if (this.phase !== "over" && e.cancelable) e.preventDefault();
    },
    // スマホは、指を離した時(pointerup)でないと音を出す許可が下りない
    unlockAudio() {
      if (this.phase === "ready" || !this.ac || this.ac.state !== "running") this.ensureAudio();
    },
    onButton(e, fn) {
      if (e && e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
      fn();
    },
    start() {
      this.game = G.newGame();
      this.resetFx();
      this.result = null;
      this.phase = "play";
      this._startBest = this.best;
      this._gaugeSaid = false;
      this._acc = 0;
      this._last = performance.now();
      this.ensureAudio();
      this.say(pick(LINES.start));
    },
    // 画面の点 → 論理の座標
    toLogical(e) {
      const r = this.$refs.canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * G.W) / r.width, y: ((e.clientY - r.top) * G.H) / r.height };
    },
    onPointer(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const now = performance.now();
      if (this.phase === "ready") {
        this.start();
        return;
      }
      if (this.phase === "paused") {
        // 一斉お祓いの途中で止めた時は、止まっていた分だけ演出の時刻をずらす
        const d = now - (this._pausedAt || now);
        if (this.fx.special) {
          this.fx.special += d;
          this.fx.swingAt += d;
        }
        this.phase = "play";
        this._last = now;
        this.ensureAudio();
        return;
      }
      if (this.phase !== "play" || this.fx.special) return;
      const p = this.toLogical(e);
      const g = this.game;
      // ゲージが満タンなら、らぼみをタップで一斉お祓い
      if (g.gauge >= G.GAUGE_MAX && this.onLabomi(p)) {
        this.startSpecial(now);
        return;
      }
      const r = G.tap(g, p.x, p.y);
      if (r.result === "none" && g.gauge >= G.GAUGE_MAX && p.y > G.LINE_Y) this.startSpecial(now);
      this.consumeEvents(now);
    },
    onLabomi(p) {
      return p.x > LB_FOOT.x - 90 && p.x < LB_FOOT.x + 90 && p.y > G.LINE_Y - 10;
    },

    // ---- 進める ----
    frame(now) {
      this._raf = requestAnimationFrame(this.frame);
      const dt = Math.min(0.1, (now - this._last) / 1000);
      this._last = now;
      const g = this.game;
      const fx = this.fx;
      if (this.phase === "play" && !fx.special) {
        this._acc += dt;
        while (this._acc >= G.STEP && !g.over) {
          G.step(g);
          this._acc -= G.STEP;
        }
        this.consumeEvents(now);
        // コンボ 10 から、らぼみの周りに炎が立つ
        if (g.combo >= 10 && Math.random() < Math.min(0.9, 0.3 + g.combo * 0.02)) {
          fx.parts.push({ x: LB_FOOT.x + (Math.random() - 0.5) * 120, y: LB_FOOT.y - Math.random() * 150, vx: (Math.random() - 0.5) * 30, vy: -90 - Math.random() * 90, at: now, life: 500 + Math.random() * 300, shide: false, rot: 0, hue: g.combo >= 20 ? Math.random() * 0.7 : 0.75 + Math.random() * 0.25, fire: true });
        }
        if (g.over) {
          this.phase = "dying";
          this._dieAt = now;
          this.sfx("over");
        }
      } else if (this.phase === "play" && fx.special) {
        const u = now - fx.special;
        // 途中で、画面の誤字をすべて直す
        if (!fx.specialFired && u > 1050) {
          fx.specialFired = true;
          for (const it of g.items) if (!it.done && !it.leaked) fx.pillars.push({ x: it.x + it.width / 2, at: now });
          G.special(g);
          this.consumeEvents(now);
          fx.shake = 18;
          // 真ん中に大きな「祓」の印と光、紙垂の嵐
          fx.rays.push({ x: G.W / 2, y: 260, at: now, big: true, rot: 0 });
          fx.rays.push({ x: G.W / 2, y: 260, at: now + 120, big: true, rot: 0.5 });
          fx.seals.push({ x: G.W / 2, y: 300, at: now, rot: -0.12, size: 3.2 });
          for (let k = 0; k < 4; k++) fx.rings.push({ x: G.W / 2, y: 260, at: now + k * 90, big: true });
          for (let k = 0; k < 70; k++) {
            fx.parts.push({ x: Math.random() * G.W, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 80, vy: 120 + Math.random() * 160, at: now, life: 1600, shide: Math.random() < 0.6, rot: Math.random() * 6, hue: Math.random() });
          }
          this.sfx("pillar");
        }
        if (u > SPECIAL_MS) {
          fx.special = null;
          this._acc = 0;
        }
      } else if (this.phase === "dying" && now - this._dieAt > DYING_MS) {
        this.finish();
      }
      // 片付いた言葉の演出の記録を捨てる
      if (Object.keys(fx.itemFx).length > 80) {
        const live = new Set(g.items.map((it) => String(it.id)));
        for (const k of Object.keys(fx.itemFx)) if (!live.has(k)) delete fx.itemFx[k];
      }
      // 瞬き(ときどき、たまに 2 回続けて)
      if (now > fx.nextBlink) {
        fx.blinkAt = now;
        fx.nextBlink = now + 2200 + Math.random() * 3200 - (Math.random() < 0.2 ? 1800 : 0);
      }
      this.draw(now);
    },
    consumeEvents(now) {
      const g = this.game;
      for (const e of g.events.splice(0)) {
        const it = g.items.find((x) => x.id === e.id);
        if (e.type === "fixSeg" && it) this.onFixSeg(it, e, now);
        else if (e.type === "done" && it) this.onDone(it, e, now);
        else if (e.type === "miss" && it) this.onMiss(it, e, now);
        else if (e.type === "leak") this.onLeak(e, now);
      }
    },
    itemFx(id) {
      if (!this.fx.itemFx[id]) this.fx.itemFx[id] = { fixedAt: {}, missAt: -1e9, doneAt: 0 };
      return this.fx.itemFx[id];
    },
    // 祓串の先(論理の座標)
    goheiTip(now) {
      const s = this.swingAngle(now);
      const px = 103;
      const py = 183;
      const dx = 64 - px;
      const dy = 88 - py;
      const x = px + dx * Math.cos(s) - dy * Math.sin(s);
      const y = py + dx * Math.sin(s) + dy * Math.cos(s);
      const o = this.lbOrigin();
      return { x: o.x + (x + 60) * LB_SCALE, y: o.y + (y + 60) * LB_SCALE };
    },
    lbOrigin() {
      // rig の絵の左上(論理の座標)。rig の中で足元は (60 + 180, 60 + 455)
      return { x: LB_FOOT.x - 240 * LB_SCALE, y: LB_FOOT.y - 515 * LB_SCALE };
    },
    onFixSeg(it, e, now) {
      const f = this.itemFx(it.id);
      const special = e.how === "special";
      const hit = special ? now : now + IMPACT; // 誤字が砕ける時刻
      f.fixedAt[e.from] = hit;
      const x0 = G.glyphX(it, e.from);
      const x1 = G.glyphX(it, e.to);
      const cx = (x0 + x1) / 2;
      const cy = it.y - G.FS * 0.35;
      const combo = this.game.combo;
      if (!special) {
        // らぼみが振る → 光が走る → 言葉の上に幻の祓串が現れて左・右・左
        this.fx.swingAt = now;
        const tip = this.goheiTip(now);
        this.fx.beams.push({ x0: tip.x, y0: tip.y, x1: cx, y1: cy, at: now });
        this.fx.goheis.push({ x: cx, y: cy, at: now + 30, big: combo >= 20 });
        this.sfx("slash");
      }
      const big = special || combo >= 10;
      this.fx.rings.push({ x: cx, y: cy, at: hit, big });
      if (big) this.fx.rings.push({ x: cx, y: cy, at: hit + 90, big });
      this.fx.rays.push({ x: cx, y: cy, at: hit, big, rot: Math.random() * Math.PI });
      this.fx.flashes.push({ at: hit, power: special ? 0 : Math.min(0.45, 0.18 + combo * 0.01) });
      this.fx.quakes.push({ at: hit, power: special ? 0 : Math.min(12, 4 + combo * 0.25) });
      // 間違いの文字が砕けて飛ぶ
      for (let i = e.from; i < e.to; i++) {
        const gx = G.glyphX(it, i) + G.glyphW(it.glyphs[i]) / 2;
        for (let k = 0; k < 3; k++) {
          const a = -Math.PI / 2 + (k - 1) * 0.9 + (Math.random() - 0.5) * 0.6;
          const v = 220 + Math.random() * 220;
          this.fx.shards.push({ ch: it.glyphs[i], kind: it.kind, k, x: gx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: (Math.random() - 0.5) * 16, at: hit });
        }
      }
      this.burst(cx, cy, Math.round(26 + Math.min(combo, 40) * 1.2), hit, big);
    },
    onDone(it, e, now) {
      const f = this.itemFx(it.id);
      const hit = e.how === "special" ? now : now + IMPACT;
      f.doneAt = hit;
      this.fx.pops.push({ text: `+${e.pts}`, x: it.x + it.width / 2, y: it.y - G.FS - 50, at: hit, combo: e.combo });
      this.fx.seals.push({ x: it.x + it.width / 2, y: it.y - G.FS * 0.4, at: hit, rot: (Math.random() - 0.5) * 0.5 });
      if (e.combo >= 5) this.fx.comboAt = hit;
      this.sfx("done", e.combo, (hit - now) / 1000);
      if (e.how !== "special" && e.combo > 0 && e.combo % 10 === 0) {
        this.say(pick(LINES.combo));
        this.fx.jumpAt = now;
      }
      if (this.game.gauge >= G.GAUGE_MAX && !this._gaugeSaid) {
        this._gaugeSaid = true;
        this.say("ゲージ満タン!あーしをタップ!");
      }
    },
    onMiss(it, e, now) {
      this.itemFx(it.id).missAt = now;
      this.fx.missMark = { x: e.x, y: e.y, at: now };
      this.sfx("miss");
      if (Math.random() < 0.5) this.say(pick(LINES.miss));
    },
    onLeak(e, now) {
      this.itemFx(e.id).leakAt = now;
      this.fx.shake = 10;
      this.fx.leakAt = now;
      this.fx.leakX = e.x;
      this.sfx("leak");
      this.say(pick(LINES.leak));
    },
    startSpecial(now) {
      this.fx.special = now;
      this.fx.specialFired = false;
      this._gaugeSaid = false;
      this.fx.swingAt = now + 900;
      this.say(pick(LINES.special));
      this.sfx("special");
    },
    say(text) {
      this.fx.say = { text, at: performance.now() };
    },
    burst(x, y, n, now, big) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (big ? 180 : 120) + Math.random() * (big ? 340 : 240);
        const shide = i % 4 === 0; // 紙垂(白いジグザグ)
        this.fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, at: now, life: 700 + Math.random() * 600, shide, rot: Math.random() * 6, hue: Math.random() });
      }
      if (this.fx.parts.length > 700) this.fx.parts.splice(0, this.fx.parts.length - 700);
    },
    finish() {
      const g = this.game;
      const prev = this.best;
      const newBest = g.score > prev;
      if (newBest) {
        this.best = g.score;
        saveBest(g.score);
      }
      const d = new Date();
      this.result = {
        score: g.score,
        title: G.titleOf(g.score),
        newBest,
        bestLine: newBest ? (prev ? `ベスト更新!(これまで ${prev.toLocaleString()})` : "はじめての記録!") : `ベスト ${prev.toLocaleString()}`,
        fixed: g.fixed,
        maxCombo: g.maxCombo,
        misses: g.misses,
        line: g.score >= 15000 ? pick(LINES.great) : pick(LINES.over),
        date: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
      };
      this.say(this.result.line);
      this.phase = "over";
      // 結果の札が見えるように(スマホではゲーム画面だけで画面がいっぱい)
      this.$nextTick(() => {
        const card = this.$el && this.$el.querySelector(".tg-card");
        if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    },

    // ---- らぼみのポーズ ----
    // らぼみの祓串: 左・右・左と振って戻す
    swingAngle(now) {
      const u = (now - this.fx.swingAt) / 460;
      if (u < 0 || u > 1) return 0;
      const keys = [
        [0, 0],
        [0.14, -0.55],
        [0.36, 0.6],
        [0.58, -0.45],
        [0.8, 0.2],
        [1, 0],
      ];
      for (let i = 1; i < keys.length; i++) {
        if (u <= keys[i][0]) {
          const [t0, a0] = keys[i - 1];
          const [t1, a1] = keys[i];
          const k = (u - t0) / (t1 - t0);
          return a0 + (a1 - a0) * (k * k * (3 - 2 * k));
        }
      }
      return 0;
    },
    pose(now) {
      const fx = this.fx;
      const b = now - fx.blinkAt;
      const blink = b < 0 ? 0 : b < 50 ? 1 : b < 120 ? 2 : b < 170 ? 1 : 0;
      const j = (now - fx.jumpAt) / 450;
      const jump = j >= 0 && j < 1 ? Math.sin(j * Math.PI) * 26 : 0;
      const l = fx.leakAt ? (now - fx.leakAt) / 300 : 9;
      const squash = l < 1 ? Math.sin(l * Math.PI) * 0.06 : 0;
      const since = now - fx.swingAt;
      const flash = since >= 0 && since < 220 ? (1 - since / 220) * 0.35 : 0;
      return { swing: this.swingAngle(now), blink, jump, squash, flash };
    },

    // ---- 描画 ----
    makeBackground() {
      // 奥をゆっくり昇る、薄いコードの文字
      const chars = "{}();=<>/+*&|#01ｱｲｳｴｵ祓誤字";
      return Array.from({ length: 34 }, () => ({
        x: Math.random() * G.W,
        y: Math.random() * G.H,
        v: 6 + Math.random() * 14,
        ch: chars[Math.floor(Math.random() * chars.length)],
        s: 10 + Math.random() * 14,
      }));
    },
    draw(now) {
      const c = this.$refs.canvas;
      if (!c) return;
      const ctx = c.getContext("2d");
      const s = this._scale || 1;
      const fx = this.fx;
      ctx.setTransform(s, 0, 0, s, 0, 0);
      for (const q of fx.quakes) if (now >= q.at && !q.done) {
        q.done = true;
        fx.shake = Math.max(fx.shake, q.power);
      }
      fx.quakes = fx.quakes.filter((q) => !q.done);
      if (fx.shake > 0.2) {
        ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
        fx.shake *= 0.86;
      }
      this.drawBack(ctx, now);
      this.drawRope(ctx, now);
      for (const it of this.game.items) this.drawItem(ctx, it, now);
      this.drawLabomi(ctx, now);
      this.drawFx(ctx, now);
      // コンボ 20 から、画面の縁が金色に燃える
      const cb = this.game.combo;
      if (cb >= 20 && this.phase === "play") {
        const a = Math.min(0.55, 0.25 + (cb - 20) * 0.01) * (0.75 + 0.25 * Math.sin(now / 90));
        for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
          [0, 0, 36, 0, 0, 0, 36, G.H],
          [G.W, 0, G.W - 36, 0, G.W - 36, 0, 36, G.H],
        ]) {
          const grd = ctx.createLinearGradient(x0, y0, x1, y1);
          grd.addColorStop(0, `rgba(255,190,60,${a})`);
          grd.addColorStop(1, "rgba(255,190,60,0)");
          ctx.fillStyle = grd;
          ctx.fillRect(rx, ry, rw, rh);
        }
      }
      // 誤字が砕けた瞬間、画面が白く光る
      fx.flashes = fx.flashes.filter((fl) => now - fl.at < 160);
      for (const fl of fx.flashes) {
        const u = (now - fl.at) / 160;
        if (u < 0 || !fl.power) continue;
        ctx.fillStyle = `rgba(255,250,230,${fl.power * (1 - u)})`;
        ctx.fillRect(-20, -20, G.W + 40, G.H + 40);
      }
      this.drawHud(ctx, now);
      if (fx.special) this.drawSpecial(ctx, now);
      if (this.phase === "ready") this.drawReady(ctx, now);
      if (this.phase === "paused") this.drawCenter(ctx, "一時停止中", "タップで再開");
      if (this.phase === "dying" || this.phase === "over") this.drawOver(ctx, now);
    },
    drawBack(ctx, now) {
      const bg = ctx.createLinearGradient(0, 0, 0, G.H);
      bg.addColorStop(0, "#0d0b1c");
      bg.addColorStop(0.6, "#1d1430");
      bg.addColorStop(1, "#2b1422");
      ctx.fillStyle = bg;
      ctx.fillRect(-20, -20, G.W + 40, G.H + 40);
      // 月と鳥居の影
      const moon = ctx.createRadialGradient(372, 150, 8, 372, 150, 120);
      moon.addColorStop(0, "rgba(255,236,200,0.28)");
      moon.addColorStop(1, "rgba(255,236,200,0)");
      ctx.fillStyle = moon;
      ctx.fillRect(240, 20, 240, 260);
      ctx.fillStyle = "rgba(255,240,215,0.85)";
      ctx.beginPath();
      ctx.arc(372, 150, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(120,30,40,0.35)";
      ctx.fillRect(60, 250, 14, 250);
      ctx.fillRect(G.W - 74, 250, 14, 250);
      ctx.fillRect(40, 266, G.W - 80, 10);
      ctx.fillRect(20, 236, G.W - 40, 16);
      // 昇るコードの文字
      ctx.textAlign = "center";
      for (const b of this.bg) {
        const y = (((b.y - (now / 1000) * b.v) % (G.H + 40)) + G.H + 40) % (G.H + 40) - 20;
        ctx.globalAlpha = 0.07 + 0.05 * Math.sin(now / 900 + b.x);
        ctx.fillStyle = "#9fd0ff";
        ctx.font = `600 ${b.s}px ${MONO}`;
        ctx.fillText(b.ch, b.x, y);
      }
      ctx.globalAlpha = 1;
    },
    drawRope(ctx, now) {
      // しめ縄。言葉が近づくと赤く脈打つ
      const g = this.game;
      const near = g.items.some((it) => !it.done && !it.leaked && it.y > G.LINE_Y - 90);
      const y = G.LINE_Y + 8;
      if (near) {
        const glow = ctx.createLinearGradient(0, y - 40, 0, y + 10);
        glow.addColorStop(0, "rgba(255,60,60,0)");
        glow.addColorStop(1, `rgba(255,60,60,${0.25 + 0.15 * Math.sin(now / 90)})`);
        ctx.fillStyle = glow;
        ctx.fillRect(0, y - 40, G.W, 50);
      }
      ctx.strokeStyle = "#c9a15a";
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-10, y - 4);
      ctx.quadraticCurveTo(G.W / 2, y + 14, G.W + 10, y - 4);
      ctx.stroke();
      ctx.strokeStyle = "#8a6a32";
      ctx.lineWidth = 2;
      for (let x = 0; x < G.W; x += 16) {
        const yy = y - 4 + 18 * (x / G.W) * (1 - x / G.W) * 4 * 0.9;
        ctx.beginPath();
        ctx.moveTo(x, yy - 4);
        ctx.lineTo(x + 8, yy + 4);
        ctx.stroke();
      }
      // 紙垂
      for (const x of [70, 170, 250, 350]) {
        const yy = y - 4 + 18 * (x / G.W) * (1 - x / G.W) * 4 * 0.9 + 4;
        this.drawShide(ctx, x, yy, 1, Math.sin(now / 600 + x) * 0.08);
      }
    },
    drawShide(ctx, x, y, k, rot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(k, k);
      ctx.fillStyle = "#f7f3ea";
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(5, 0);
      ctx.lineTo(5, 9);
      ctx.lineTo(9, 9);
      ctx.lineTo(9, 18);
      ctx.lineTo(1, 18);
      ctx.lineTo(1, 27);
      ctx.lineTo(-7, 27);
      ctx.lineTo(-7, 18);
      ctx.lineTo(-1, 18);
      ctx.lineTo(-1, 9);
      ctx.lineTo(-5, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
    fontOf(it, ch) {
      return G.isWide(ch) ? `800 ${G.FS * 0.9}px ${GOTHIC}` : `700 ${G.FS}px ${MONO}`;
    },
    drawItem(ctx, it, now) {
      const f = this.itemFx(it.id);
      let alpha = 1;
      let dy = 0;
      let scale = 1;
      if (it.done) {
        const u = Math.max(0, (now - f.doneAt) / 900);
        alpha = Math.max(0, 1 - Math.max(0, u - 0.35) / 0.65);
        dy = -Math.max(0, u - 0.25) * 60;
        scale = 1 + Math.min(1, u * 4) * 0.08;
      }
      if (it.leaked) {
        const u = (now - (f.leakAt || now)) / 600;
        alpha = Math.max(0, 1 - u);
      }
      if (alpha <= 0) return;
      const shakeX = now - f.missAt < 260 ? Math.sin((now - f.missAt) / 18) * 6 : 0;
      const cx = it.x + it.width / 2;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx + shakeX, it.y + dy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -it.y);
      // 札(読みやすいように暗い板)
      const danger = !it.done && it.y > G.LINE_Y - 90;
      const top = it.y - G.FS * 0.95 - 6;
      ctx.fillStyle = it.done ? "rgba(60,40,10,0.75)" : "rgba(10,8,20,0.78)";
      this.roundRect(ctx, it.x - 8, top, it.width + 16, G.FS * 1.25 + 10, 8);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = it.done ? GOLD : danger ? `rgba(255,80,80,${0.6 + 0.4 * Math.sin(now / 80)})` : "rgba(255,216,74,0.45)";
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      if (it.done && now - f.doneAt > 250) {
        // 直し終えた: 正しい言葉を金色で、真ん中にそろえて
        const glyphs = Array.from(it.right);
        const w = G.widthOf(glyphs);
        let x = cx - w / 2;
        ctx.shadowColor = GOLD;
        ctx.shadowBlur = 14;
        ctx.fillStyle = "#fff4c4";
        for (const ch of glyphs) {
          ctx.font = this.fontOf(it, ch);
          ctx.fillText(ch, x + G.glyphW(ch) / 2, it.y);
          x += G.glyphW(ch);
        }
        ctx.shadowBlur = 0;
        ctx.restore();
        return;
      }
      // 1 文字ずつマスに描く。直した所は正しい文字をそのマスに収めて金色で
      let i = 0;
      while (i < it.glyphs.length) {
        const seg = it.segs.find((sg) => sg.fixed && sg.from === i);
        if (seg) {
          const x0 = G.glyphX(it, seg.from);
          const x1 = G.glyphX(it, seg.to);
          const fw = G.widthOf(seg.fix) || 1;
          const k = Math.min(1.2, (x1 - x0) / fw);
          const t0 = f.fixedAt[seg.from] || now;
          if (now < t0) {
            // 祓串を振っている間: 間違いの文字が白く熱を帯びて震える
            const heat = 1 - (t0 - now) / IMPACT;
            ctx.save();
            ctx.shadowColor = "#ffffff";
            ctx.shadowBlur = 8 + heat * 20;
            ctx.fillStyle = `rgb(255,${Math.round(140 + heat * 110)},${Math.round(120 + heat * 130)})`;
            for (let k = seg.from; k < seg.to; k++) {
              const ch = it.glyphs[k];
              ctx.font = this.fontOf(it, ch);
              ctx.fillText(ch, G.glyphX(it, k) + G.glyphW(ch) / 2 + (Math.random() - 0.5) * heat * 4, it.y + (Math.random() - 0.5) * heat * 4);
            }
            ctx.restore();
            i = seg.to;
            continue;
          }
          const pop = Math.min(1, (now - t0) / 180);
          ctx.save();
          ctx.translate(x0, it.y);
          ctx.scale(k, 1);
          ctx.shadowColor = GOLD;
          ctx.shadowBlur = 16;
          ctx.fillStyle = GOLD;
          ctx.globalAlpha = alpha * pop;
          let x = ((x1 - x0) / k - fw) / 2;
          for (const ch of seg.fix) {
            ctx.font = this.fontOf(it, ch);
            ctx.fillText(ch, x + G.glyphW(ch) / 2, 0);
            x += G.glyphW(ch);
          }
          ctx.restore();
          i = seg.to;
          continue;
        }
        const ch = it.glyphs[i];
        const miss = now - f.missAt < 260;
        ctx.fillStyle = miss ? "#ff8a80" : "#f4f1ea";
        ctx.font = this.fontOf(it, ch);
        ctx.fillText(ch, G.glyphX(it, i) + G.glyphW(ch) / 2, it.y);
        i++;
      }
      ctx.restore();
    },
    drawLabomi(ctx, now) {
      const o = this.lbOrigin();
      const g = this.game;
      const full = g && g.gauge >= G.GAUGE_MAX && this.phase === "play";
      // 足元の光(ゲージ満タンの時は強く)
      const aura = ctx.createRadialGradient(LB_FOOT.x, LB_FOOT.y - 90, 10, LB_FOOT.x, LB_FOOT.y - 90, 150);
      aura.addColorStop(0, full ? `rgba(255,216,74,${0.45 + 0.2 * Math.sin(now / 120)})` : "rgba(255,120,90,0.12)");
      aura.addColorStop(1, "rgba(255,216,74,0)");
      ctx.fillStyle = aura;
      ctx.fillRect(LB_FOOT.x - 160, LB_FOOT.y - 250, 320, 260);
      if (this.rig) {
        let cv;
        try {
          cv = this.rig.render(now / 1000, this.pose(now));
        } catch (e) {
          cv = null; // 動かせない時は、動かない絵を出す
        }
        if (cv) ctx.drawImage(cv, o.x, o.y, cv.width * LB_SCALE, cv.height * LB_SCALE);
        else ctx.drawImage(this.rig.frames[0], o.x + 60 * LB_SCALE, o.y + 60 * LB_SCALE, 360 * LB_SCALE, 480 * LB_SCALE);
      }
      // セリフの吹き出し
      const say = this.fx.say;
      if (say && now - say.at < 2600) {
        const u = (now - say.at) / 2600;
        ctx.globalAlpha = u > 0.85 ? (1 - u) / 0.15 : Math.min(1, (now - say.at) / 120);
        ctx.font = `800 ${say.text.length > 11 ? 14 : 17}px ${GOTHIC}`;
        const w = Math.min(LB_FOOT.x - 110 - 8, ctx.measureText(say.text).width + 24);
        const bx = LB_FOOT.x - 110 - w;
        const by = G.LINE_Y + 40;
        ctx.fillStyle = "#fff8e1";
        this.roundRect(ctx, bx, by, w, 36, 18);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(bx + w - 4, by + 12);
        ctx.lineTo(bx + w + 14, by + 20);
        ctx.lineTo(bx + w - 4, by + 26);
        ctx.fill();
        ctx.fillStyle = "#b8412c";
        ctx.textAlign = "center";
        ctx.fillText(say.text, bx + w / 2, by + 24, w - 16);
        ctx.globalAlpha = 1;
      }
    },
    drawFx(ctx, now) {
      const fx = this.fx;
      this.drawRays(ctx, now);
      this.drawGoheis(ctx, now);
      this.drawSeals(ctx, now);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      // 祓串から走る光(曲がった軌跡)
      fx.beams = fx.beams.filter((b) => now - b.at < 260);
      for (const b of fx.beams) {
        const u = (now - b.at) / 260;
        const mx = (b.x0 + b.x1) / 2 - 60;
        const my = Math.min(b.y0, b.y1) - 60;
        const head = Math.min(1, u * 2.5);
        const tail = Math.max(0, u * 2.5 - 0.6);
        ctx.strokeStyle = `rgba(255,230,150,${1 - u})`;
        ctx.shadowColor = GOLD;
        ctx.shadowBlur = 20;
        for (const [lw, a] of [[10, 0.35], [4, 1]]) {
          ctx.lineWidth = lw * (1 - u * 0.5);
          ctx.globalAlpha = a;
          ctx.beginPath();
          for (let k = 0; k <= 16; k++) {
            const t = tail + ((head - tail) * k) / 16;
            const x = (1 - t) * (1 - t) * b.x0 + 2 * (1 - t) * t * mx + t * t * b.x1;
            const y = (1 - t) * (1 - t) * b.y0 + 2 * (1 - t) * t * my + t * t * b.y1;
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.shadowBlur = 0;
      // 衝撃の輪と十字のきらめき
      fx.rings = fx.rings.filter((r) => now - r.at < 500);
      for (const r of fx.rings) {
        const u = (now - r.at) / 500;
        if (u < 0) continue;
        ctx.strokeStyle = `rgba(255,220,140,${1 - u})`;
        ctx.lineWidth = 4 * (1 - u) + 1;
        ctx.beginPath();
        ctx.arc(r.x, r.y, (r.big ? 26 : 16) + u * (r.big ? 110 : 70), 0, Math.PI * 2);
        ctx.stroke();
        const k = (1 - u) * (r.big ? 70 : 48);
        const grd = ctx.createLinearGradient(r.x - k, r.y, r.x + k, r.y);
        grd.addColorStop(0, "rgba(255,255,255,0)");
        grd.addColorStop(0.5, `rgba(255,250,220,${1 - u})`);
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(r.x - k, r.y - 1.5, k * 2, 3);
        ctx.fillRect(r.x - 1.5, r.y - k * 0.6, 3, k * 1.2);
      }
      // 光の粒
      fx.parts = fx.parts.filter((p) => now - p.at < p.life);
      for (const p of fx.parts) {
        if (now < p.at) continue;
        const u = (now - p.at) / 1000;
        const x = p.x + p.vx * u;
        const y = p.y + p.vy * u + (p.fire ? 0 : 140 * u * u);
        const a = 1 - (now - p.at) / p.life;
        if (p.shide) {
          ctx.globalAlpha = a;
          ctx.globalCompositeOperation = "source-over";
          this.drawShide(ctx, x, y, 0.45, p.rot + u * 5);
          ctx.globalCompositeOperation = "lighter";
        } else {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.hue < 0.7 ? "#ffd84a" : "#ff9a6a";
          ctx.beginPath();
          ctx.arc(x, y, 2.2 + 1.5 * a, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      // 砕けた文字(3 つの破片に切って飛ばす)
      fx.shards = fx.shards.filter((sd) => now - sd.at < 650);
      for (const sd of fx.shards) {
        const u = (now - sd.at) / 1000;
        if (u < 0) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - u / 0.65);
        ctx.translate(sd.x + sd.vx * u, sd.y + sd.vy * u + 500 * u * u);
        ctx.rotate(sd.rot * u);
        ctx.beginPath();
        const r = G.FS;
        const a0 = (sd.k * Math.PI * 2) / 3 - Math.PI / 2;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
        ctx.lineTo(Math.cos(a0 + 2.1) * r, Math.sin(a0 + 2.1) * r);
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = "#ff6b5a";
        ctx.textAlign = "center";
        ctx.font = G.isWide(sd.ch) ? `800 ${G.FS * 0.9}px ${GOTHIC}` : `700 ${G.FS}px ${MONO}`;
        ctx.fillText(sd.ch, 0, G.FS * 0.35);
        ctx.restore();
      }
      // 点数
      fx.pops = fx.pops.filter((p) => now - p.at < 800);
      for (const p of fx.pops) {
        const u = (now - p.at) / 800;
        if (u < 0) continue;
        ctx.globalAlpha = 1 - u * u;
        ctx.fillStyle = GOLD;
        ctx.font = `900 ${p.combo >= 20 ? 26 : 22}px ${MONO}`;
        ctx.textAlign = "center";
        ctx.shadowColor = "#ff7a2a";
        ctx.shadowBlur = 10;
        ctx.fillText(p.text, p.x, p.y - u * 34);
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
      // お手つきの印
      const mm = fx.missMark;
      if (mm && now - mm.at < 350) {
        const u = (now - mm.at) / 350;
        ctx.strokeStyle = `rgba(255,90,90,${1 - u})`;
        ctx.lineWidth = 4;
        const k = 12 + u * 6;
        ctx.beginPath();
        ctx.moveTo(mm.x - k, mm.y - k);
        ctx.lineTo(mm.x + k, mm.y + k);
        ctx.moveTo(mm.x + k, mm.y - k);
        ctx.lineTo(mm.x - k, mm.y + k);
        ctx.stroke();
      }
      // 漏れた: しめ縄が赤く光る
      if (fx.leakAt && now - fx.leakAt < 500) {
        const u = (now - fx.leakAt) / 500;
        ctx.fillStyle = `rgba(255,40,40,${0.35 * (1 - u)})`;
        ctx.fillRect(0, 0, G.W, G.H);
      }
      // 一斉お祓いの光の柱
      fx.pillars = fx.pillars.filter((p) => now - p.at < 700);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const p of fx.pillars) {
        const u = (now - p.at) / 700;
        const w = 70 * (1 - u) + 10;
        const grd = ctx.createLinearGradient(p.x - w, 0, p.x + w, 0);
        grd.addColorStop(0, "rgba(255,216,74,0)");
        grd.addColorStop(0.5, `rgba(255,248,210,${1 - u})`);
        grd.addColorStop(1, "rgba(255,216,74,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(p.x - w, 0, w * 2, G.LINE_Y + 10);
      }
      ctx.restore();
    },
    // 祓串の形(手元が原点、上へ伸びる)。lag は紙垂の遅れ(振る速さ)
    drawGoheiShape(ctx, x, y, ang, sc, alpha, lag = 0) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.scale(sc, sc);
      ctx.globalAlpha = alpha;
      const L = 120;
      const stick = ctx.createLinearGradient(-3, 0, 3, 0);
      stick.addColorStop(0, "#8a5a2b");
      stick.addColorStop(0.5, "#d9a060");
      stick.addColorStop(1, "#8a5a2b");
      ctx.fillStyle = stick;
      ctx.fillRect(-3.5, -L, 7, L);
      ctx.fillStyle = GOLD;
      ctx.fillRect(-5, -L - 6, 10, 8);
      // 紙垂(左右に 3 本ずつ、振る向きと逆へなびく)
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 12;
      for (let k = 0; k < 6; k++) {
        const side = k < 3 ? -1 : 1;
        const j = k % 3;
        ctx.save();
        ctx.translate(side * (4 + j * 7), -L + 2 + j * 3);
        ctx.rotate(side * (0.12 + j * 0.1) - lag * (0.5 + j * 0.25));
        ctx.fillStyle = "#fbf8f0";
        ctx.beginPath();
        const w = 8;
        ctx.moveTo(-w / 2, 0);
        ctx.lineTo(w / 2, 0);
        ctx.lineTo(w / 2, 14);
        ctx.lineTo(w * 1.2, 14);
        ctx.lineTo(w * 1.2, 30);
        ctx.lineTo(w / 2 - 1, 30);
        ctx.lineTo(w / 2 - 1, 46);
        ctx.lineTo(-w / 2 - 1, 46);
        ctx.lineTo(-w / 2 - 1, 30);
        ctx.lineTo(-w * 0.1, 30);
        ctx.lineTo(-w * 0.1, 14);
        ctx.lineTo(-w / 2, 14);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    },
    // 幻の祓串: 言葉の上で 左・右・左 と振る。振った跡に光の刃が残る
    goheiAngle(u) {
      const keys = [
        [0, 0.2],
        [0.3, -1.05],
        [0.64, 1.05],
        [1, -0.95],
      ];
      for (let i = 1; i < keys.length; i++) {
        if (u <= keys[i][0]) {
          const [t0, a0] = keys[i - 1];
          const [t1, a1] = keys[i];
          const k = (u - t0) / (t1 - t0);
          return a0 + (a1 - a0) * (1 - Math.pow(1 - k, 3));
        }
      }
      return keys[keys.length - 1][1];
    },
    drawGoheis(ctx, now) {
      const fx = this.fx;
      fx.goheis = fx.goheis.filter((gh) => now - gh.at < SWING_MS + 220);
      for (const gh of fx.goheis) {
        const t = now - gh.at;
        if (t < 0) continue;
        const u = Math.min(1, t / SWING_MS);
        const fade = t < 60 ? t / 60 : t > SWING_MS ? Math.max(0, 1 - (t - SWING_MS) / 220) : 1;
        const sc = gh.big ? 1.15 : 0.95;
        const px = gh.x;
        const py = gh.y + 100 * sc; // 手元(言葉の下)
        const ang = this.goheiAngle(u);
        const prev = this.goheiAngle(Math.max(0, u - 0.08));
        const lag = (ang - prev) * 2.5;
        // 光の刃(直前の角度から今の角度まで、紙垂のあたりをなぞる)
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const r = 112 * sc;
        const a0 = Math.min(prev, ang) - Math.PI / 2;
        const a1 = Math.max(prev, ang) - Math.PI / 2;
        if (a1 - a0 > 0.02 && t <= SWING_MS) {
          for (const [lw, al] of [[26, 0.25], [12, 0.55], [4, 1]]) {
            ctx.strokeStyle = `rgba(255,236,170,${al * fade})`;
            ctx.lineWidth = lw * sc;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.arc(px, py, r, a0, a1);
            ctx.stroke();
          }
        }
        // 残像
        for (let k = 3; k >= 1; k--) {
          const pa = this.goheiAngle(Math.max(0, u - k * 0.05));
          this.drawGoheiShape(ctx, px, py, pa, sc, 0.18 * fade * (1 - k / 4), lag);
        }
        ctx.restore();
        this.drawGoheiShape(ctx, px, py, ang, sc, 0.92 * fade, lag);
        // 振り切った所で、紙垂の欠片が散る
        if (t <= SWING_MS && Math.random() < 0.5) {
          const ta = ang - Math.PI / 2;
          fx.parts.push({ x: px + Math.cos(ta) * r, y: py + Math.sin(ta) * r, vx: (Math.random() - 0.5) * 160, vy: -40 - Math.random() * 80, at: now, life: 500, shide: Math.random() < 0.4, rot: Math.random() * 6, hue: Math.random() * 0.6 });
        }
      }
    },
    // 放射状の光(回りながら広がる)
    drawRays(ctx, now) {
      const fx = this.fx;
      fx.rays = fx.rays.filter((r) => now - r.at < 520);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const r of fx.rays) {
        const u = (now - r.at) / 520;
        if (u < 0) continue;
        const n = r.big ? 16 : 10;
        const len = (r.big ? 230 : 150) * (0.4 + u * 0.8);
        const w = (r.big ? 0.13 : 0.1) * (1 - u);
        for (let k = 0; k < n; k++) {
          const a = r.rot + u * 0.8 + (k * Math.PI * 2) / n;
          const grd = ctx.createRadialGradient(r.x, r.y, 4, r.x, r.y, len);
          grd.addColorStop(0, `rgba(255,248,210,${0.9 * (1 - u)})`);
          grd.addColorStop(1, "rgba(255,200,80,0)");
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.moveTo(r.x, r.y);
          ctx.arc(r.x, r.y, len, a - w, a + w);
          ctx.closePath();
          ctx.fill();
        }
        // 中心の光の玉
        const core = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, 60 * (1 - u) + 10);
        core.addColorStop(0, `rgba(255,255,255,${1 - u})`);
        core.addColorStop(1, "rgba(255,216,74,0)");
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 60 * (1 - u) + 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    // 「祓」の印(朱の丸に白い字。押された感じで縮んで止まる)
    drawSeals(ctx, now) {
      const fx = this.fx;
      fx.seals = fx.seals.filter((sl) => now - sl.at < (sl.size ? 1000 : 700));
      for (const sl of fx.seals) {
        const t = now - sl.at;
        if (t < 0) continue;
        const k = (t < 110 ? 1.9 - 0.9 * (t / 110) : 1) * (sl.size || 1);
        const a = t > 450 ? Math.max(0, 1 - (t - 450) / 250) : 1;
        ctx.save();
        ctx.globalAlpha = a * 0.92;
        ctx.translate(sl.x, sl.y - 44);
        ctx.rotate(sl.rot);
        ctx.scale(k, k);
        ctx.fillStyle = "#c0392b";
        ctx.shadowColor = "#ff5a3a";
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#ffe3c0";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#fff8e1";
        ctx.font = `900 24px ${MINCHO}`;
        ctx.textAlign = "center";
        ctx.fillText("祓", 0, 9);
        ctx.restore();
      }
    },
    drawHud(ctx, now) {
      const g = this.game;
      ctx.textAlign = "left";
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 6;
      ctx.fillStyle = "#fff8e1";
      ctx.font = `900 26px ${MONO}`;
      ctx.fillText(g.score.toLocaleString(), 14, 34);
      ctx.font = `600 11px ${GOTHIC}`;
      ctx.fillStyle = "rgba(255,248,225,0.6)";
      ctx.fillText(`BEST ${Math.max(this.best, g.score).toLocaleString()}`, 15, 50);
      ctx.shadowBlur = 0;
      // 命(紙垂)
      for (let i = 0; i < G.LIVES; i++) {
        ctx.globalAlpha = i < g.lives ? 1 : 0.2;
        this.drawShide(ctx, G.W - 22 - i * 22, 14, 0.85, 0);
      }
      ctx.globalAlpha = 1;
      // コンボ
      if (g.combo >= 3 && this.phase === "play") {
        const u = Math.min(1, (now - this.fx.comboAt) / 200);
        ctx.textAlign = "center";
        ctx.shadowColor = g.combo >= 20 ? GOLD : "#ff8a5a";
        ctx.shadowBlur = 16;
        ctx.fillStyle = g.combo >= 20 ? GOLD : "#fff8e1";
        ctx.font = `900 ${34 + (1 - u) * 10}px ${MONO}`;
        ctx.fillText(String(g.combo), G.W / 2, 44);
        ctx.shadowBlur = 0;
        ctx.font = `800 11px ${GOTHIC}`;
        ctx.fillText("コンボ", G.W / 2, 60);
      }
      // お祓いゲージ(左下)
      const gx = 16;
      const gy = G.H - 34;
      const gw = 170;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      this.roundRect(ctx, gx, gy, gw, 14, 7);
      ctx.fill();
      const k = g.gauge / G.GAUGE_MAX;
      const full = k >= 1;
      const grd = ctx.createLinearGradient(gx, 0, gx + gw, 0);
      grd.addColorStop(0, "#ff7a52");
      grd.addColorStop(1, GOLD);
      ctx.fillStyle = grd;
      if (k > 0) {
        this.roundRect(ctx, gx, gy, Math.max(14, gw * k), 14, 7);
        ctx.fill();
      }
      ctx.textAlign = "left";
      ctx.font = `800 12px ${GOTHIC}`;
      ctx.fillStyle = full ? GOLD : "rgba(255,248,225,0.75)";
      if (full && this.phase === "play") {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now / 110);
        ctx.fillText("満タン! らぼみをタップで一斉お祓い", gx, gy - 8);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillText("お祓いゲージ", gx, gy - 8);
      }
    },
    // 一斉お祓い: 暗転 → らぼみのカットイン → 光の柱
    drawSpecial(ctx, now) {
      const u = (now - this.fx.special) / SPECIAL_MS;
      const dark = u < 0.1 ? u / 0.1 : u < 0.62 ? 1 : Math.max(0, 1 - (u - 0.62) / 0.2);
      ctx.fillStyle = `rgba(5,3,12,${0.62 * dark})`;
      ctx.fillRect(0, 0, G.W, G.H);
      // 帯(斜め)が右から入って、左へ抜ける
      const inT = Math.min(1, Math.max(0, (u - 0.05) / 0.12));
      const outT = Math.max(0, (u - 0.55) / 0.1);
      if (outT < 1) {
        const ease = (x) => 1 - Math.pow(1 - x, 3);
        const off = (1 - ease(inT)) * 520 - ease(Math.min(1, outT)) * 560;
        ctx.save();
        ctx.translate(G.W / 2 + off, 300);
        ctx.rotate(-0.12);
        // 集中線
        ctx.save();
        ctx.beginPath();
        ctx.rect(-400, -95, 800, 190);
        ctx.clip();
        const band = ctx.createLinearGradient(0, -95, 0, 95);
        band.addColorStop(0, "#7a1d22");
        band.addColorStop(0.5, "#c0392b");
        band.addColorStop(1, "#5a1418");
        ctx.fillStyle = band;
        ctx.fillRect(-400, -95, 800, 190);
        ctx.strokeStyle = "rgba(255,230,180,0.35)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 26; i++) {
          const y = -95 + ((i * 37 + now * 0.9) % 190);
          ctx.beginPath();
          ctx.moveTo(-400, y);
          ctx.lineTo(400, y + 6);
          ctx.stroke();
        }
        // らぼみの顔(瞬きしてから、いつものウインク)
        if (this.rig) {
          const ft = u - 0.2;
          const fi = ft > 0.06 && ft < 0.08 ? 1 : ft >= 0.08 && ft < 0.12 ? 2 : ft >= 0.12 && ft < 0.14 ? 1 : 0;
          const src = this.rig.frames[fi];
          ctx.drawImage(src, 110, 40, 180, 170, -210, -118, 250, 236);
        }
        ctx.restore();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 4;
        ctx.strokeRect(-400, -95, 800, 190);
        // セリフ
        ctx.textAlign = "left";
        ctx.font = `900 34px ${MINCHO}`;
        ctx.lineWidth = 7;
        ctx.strokeStyle = "#2a0c10";
        ctx.strokeText("あーしに", 30, -18);
        ctx.strokeText("任せて!", 50, 30);
        ctx.fillStyle = "#fff8e1";
        ctx.fillText("あーしに", 30, -18);
        ctx.fillStyle = GOLD;
        ctx.fillText("任せて!", 50, 30);
        ctx.font = `800 14px ${GOTHIC}`;
        ctx.fillStyle = "#ffe7b0";
        ctx.fillText("― 一斉お祓い ―", 44, 62);
        ctx.restore();
      }
      // 光の柱の直前に、真っ白に光る
      const fl = u > 0.6 && u < 0.72 ? 1 - Math.abs(u - 0.64) / 0.08 : 0;
      if (fl > 0) {
        ctx.fillStyle = `rgba(255,252,235,${Math.min(1, fl) * 0.85})`;
        ctx.fillRect(0, 0, G.W, G.H);
      }
    },
    drawCenter(ctx, a, b) {
      ctx.fillStyle = "rgba(8,6,14,0.6)";
      ctx.fillRect(0, 0, G.W, G.H);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff8e1";
      ctx.font = `900 30px ${MINCHO}`;
      ctx.fillText(a, G.W / 2, 250);
      ctx.font = `700 17px ${GOTHIC}`;
      ctx.fillText(b, G.W / 2, 290);
    },
    drawReady(ctx, now) {
      ctx.fillStyle = "rgba(8,6,14,0.55)";
      ctx.fillRect(0, 0, G.W, G.LINE_Y);
      ctx.textAlign = "center";
      ctx.shadowColor = "#ff7a52";
      ctx.shadowBlur = 24;
      ctx.fillStyle = GOLD;
      ctx.font = `900 52px ${MINCHO}`;
      ctx.fillText("誤字祓い", G.W / 2, 110);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff8e1";
      ctx.font = `700 16px ${GOTHIC}`;
      ctx.fillText("落ちてくる誤字を、タップでお祓い!", G.W / 2, 148);
      // 見本: retrun の「ru」をタップ
      const demo = { id: -1, x: G.W / 2 - 58, y: 225, glyphs: Array.from("retrun"), segs: [{ from: 3, to: 5, fix: ["u", "r"], fixed: false }], width: G.widthOf(Array.from("retrun")), right: "return" };
      ctx.fillStyle = "rgba(10,8,20,0.85)";
      this.roundRect(ctx, demo.x - 8, demo.y - G.FS * 0.95 - 6, demo.width + 16, G.FS * 1.25 + 10, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,216,74,0.45)";
      ctx.lineWidth = 2;
      ctx.stroke();
      demo.glyphs.forEach((ch, i) => {
        const inSeg = i >= 3 && i < 5;
        ctx.fillStyle = inSeg ? `rgba(255,138,128,${0.7 + 0.3 * Math.sin(now / 150)})` : "#f4f1ea";
        ctx.font = `700 ${G.FS}px ${MONO}`;
        ctx.fillText(ch, G.glyphX(demo, i) + G.glyphW(ch) / 2, demo.y);
      });
      const hx = (G.glyphX(demo, 3) + G.glyphX(demo, 5)) / 2;
      ctx.fillStyle = "#ff8a80";
      ctx.font = `800 14px ${GOTHIC}`;
      ctx.fillText("↑ 間違っている所をタップ(retrun → return)", G.W / 2, demo.y + 34);
      ctx.beginPath();
      ctx.arc(hx, demo.y - 10, 18 + 3 * Math.sin(now / 150), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,138,128,0.8)";
      ctx.stroke();
      ctx.fillStyle = "rgba(255,248,225,0.85)";
      ctx.font = `600 14px ${GOTHIC}`;
      ctx.fillText("正しい文字を押すとお手つき(コンボが切れる)", G.W / 2, 305);
      ctx.fillText("しめ縄まで落ちると紙垂が 1 枚減る。3 枚で終わり", G.W / 2, 328);
      ctx.fillText("ゲージ満タンで、らぼみをタップすると一斉お祓い", G.W / 2, 351);
      ctx.fillStyle = "#fff8e1";
      ctx.font = `800 20px ${GOTHIC}`;
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(now / 250);
      ctx.fillText("タップでスタート", G.W / 2, 420);
      ctx.globalAlpha = 1;
      if (this.best > 0) {
        ctx.font = `700 14px ${GOTHIC}`;
        ctx.fillStyle = GOLD;
        ctx.fillText(`ベスト ${this.best.toLocaleString()}`, G.W / 2, 455);
      }
    },
    drawOver(ctx, now) {
      const u = this.phase === "dying" ? (now - this._dieAt) / DYING_MS : 1;
      ctx.fillStyle = `rgba(8,6,14,${0.6 * Math.min(1, u)})`;
      ctx.fillRect(0, 0, G.W, G.LINE_Y);
      if (this.phase !== "over") return;
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff8e1";
      ctx.font = `900 30px ${MINCHO}`;
      ctx.fillText("お祓い終了", G.W / 2, 170);
      ctx.fillStyle = GOLD;
      ctx.font = `900 48px ${MONO}`;
      ctx.fillText(this.game.score.toLocaleString(), G.W / 2, 235);
      ctx.fillStyle = "#fff8e1";
      ctx.font = `800 18px ${GOTHIC}`;
      ctx.fillText(`称号「${G.titleOf(this.game.score)}」`, G.W / 2, 275);
    },
    roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },

    // ---- 音(Web Audio でその場で作る) ----
    ensureAudio() {
      try {
        if (!this.ac) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ac = new AC();
          this.acOut = this.ac.createGain();
          this.acOut.gain.value = 0.5;
          this.acOut.connect(this.ac.destination);
          const len = this.ac.sampleRate;
          this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
          const d = this.noiseBuf.getChannelData(0);
          for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        }
        if (this.ac.state !== "running") {
          const p = this.ac.resume();
          if (p && p.catch) p.catch(() => {});
        }
      } catch (e) {
        this.ac = null;
      }
    },
    sfx(kind, combo = 0, delay = 0) {
      const ac = this.ac;
      if (!ac) return;
      const t = ac.currentTime + 0.005 + delay;
      const out = this.acOut;
      const tone = (f, dur, vol, type = "sine", at = t, f2 = null) => {
        const o = ac.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f, at);
        if (f2) o.frequency.exponentialRampToValueAtTime(f2, at + dur);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(vol, at + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        o.connect(g);
        g.connect(out);
        o.start(at);
        o.stop(at + dur + 0.05);
      };
      const noise = (dur, vol, type, f0, f1, at = t) => {
        const s = ac.createBufferSource();
        s.buffer = this.noiseBuf;
        const f = ac.createBiquadFilter();
        f.type = type;
        f.Q.value = 2;
        f.frequency.setValueAtTime(f0, at);
        f.frequency.exponentialRampToValueAtTime(f1, at + dur);
        const g = ac.createGain();
        g.gain.setValueAtTime(vol, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        s.connect(f);
        f.connect(g);
        g.connect(out);
        s.start(at, Math.random() * 0.5);
        s.stop(at + dur + 0.05);
      };
      if (kind === "slash") {
        // 祓串を 左・右・左 と振る「さっ、さっ、さっ」、砕ける瞬間に鈴と破裂音
        for (const [dt, f0, f1] of [[0, 2200, 6500], [0.11, 2600, 7500], [0.22, 2400, 7000]]) noise(0.09, 0.45, "bandpass", f0, f1, t + dt);
        noise(0.25, 0.5, "highpass", 1500, 6000, t + IMPACT / 1000);
        tone(140, 0.25, 0.35, "sine", t + IMPACT / 1000, 60);
        for (const r of [1, 2.76, 5.4]) tone(2600 * r, 0.45, 0.07 / r, "sine", t + IMPACT / 1000);
      } else if (kind === "done") {
        // コンボで上がっていく音(陽音階)
        const scale = [0, 2, 4, 7, 9];
        const n = Math.min(combo, 24);
        const semi = scale[n % 5] + 12 * Math.floor(n / 5);
        const f = 523 * Math.pow(2, semi / 12);
        tone(f, 0.35, 0.16, "triangle", t + 0.06);
        tone(f * 2, 0.25, 0.05, "sine", t + 0.06);
      } else if (kind === "miss") {
        tone(180, 0.18, 0.25, "square", t, 90);
      } else if (kind === "leak") {
        tone(110, 0.6, 0.4, "sine", t, 55);
        noise(0.3, 0.3, "lowpass", 800, 200);
      } else if (kind === "special") {
        noise(1.0, 0.35, "bandpass", 300, 6000);
        tone(80, 0.9, 0.5, "sine", t + 0.9, 45);
      } else if (kind === "pillar") {
        for (const [f, a] of [[1047, 0.12], [1319, 0.1], [1568, 0.1], [2093, 0.06]]) tone(f, 1.2, a, "sine");
        noise(0.5, 0.3, "highpass", 3000, 8000);
      } else if (kind === "over") {
        tone(392, 0.3, 0.15, "triangle");
        tone(330, 0.3, 0.15, "triangle", t + 0.25);
        tone(262, 0.6, 0.15, "triangle", t + 0.5);
      }
    },

    // ---- 結果の画像(正方形。共有できる端末ではシェアシート) ----
    saveImage() {
      const r = this.result;
      if (!r) return;
      const c = document.createElement("canvas");
      c.width = 1080;
      c.height = 1080;
      const ctx = c.getContext("2d");
      const bg = ctx.createLinearGradient(0, 0, 0, 1080);
      bg.addColorStop(0, "#1d1430");
      bg.addColorStop(1, "#0d0b1c");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1080, 1080);
      ctx.strokeStyle = "#b8412c";
      ctx.lineWidth = 14;
      ctx.strokeRect(40, 40, 1000, 1000);
      const img = this.rig ? this.rig.frames[0] : null;
      if (img) ctx.drawImage(img, 640, 330, 405, 540);
      ctx.textAlign = "left";
      const line = (text, x, y, font, color) => {
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
      };
      line("誤字祓い", 100, 170, `900 72px ${MINCHO}`, GOLD);
      line(r.score.toLocaleString(), 100, 330, `900 120px ${MONO}`, "#fff8e1");
      line(`称号「${r.title}」`, 100, 420, `800 48px ${MINCHO}`, "#fff8e1");
      line(r.bestLine, 100, 490, "700 34px sans-serif", r.newBest ? GOLD : "#c9b8a0");
      line(`直した誤字 ${r.fixed}`, 100, 580, "600 34px sans-serif", "#e8dcc8");
      line(`最大コンボ ${r.maxCombo}`, 100, 630, "600 34px sans-serif", "#e8dcc8");
      line(`お手つき ${r.misses}`, 100, 680, "600 34px sans-serif", "#e8dcc8");
      // らぼみの吹き出し
      ctx.font = "800 34px sans-serif";
      const w = Math.min(520, ctx.measureText(r.line).width + 60);
      ctx.fillStyle = "#fff8e1";
      this.roundRect(ctx, 100, 760, w, 70, 35);
      ctx.fill();
      ctx.fillStyle = "#b8412c";
      ctx.fillText(r.line, 130, 808, w - 60);
      line(`でばっぐ神社 ${this.siteHost}  ${r.date}`, 100, 960, `800 32px ${MINCHO}`, "#ff8a6a");
      if (!c.toBlob) return;
      c.toBlob(async (blob) => {
        if (!blob) return;
        const name = `typo-${r.score}.png`;
        try {
          const file = new File([blob], name, { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
            return;
          }
        } catch (e) {
          if (e && e.name === "AbortError") return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
    },
  },
};
</script>

<style scoped>
.tg {
  max-width: 460px;
  margin: 0 auto;
  touch-action: manipulation;
}
.tg-wrap {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid #b8412c;
}
.tg-canvas {
  display: block;
  width: 100%;
  aspect-ratio: 420 / 700;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
.tg-canvas.lock {
  touch-action: none;
}
.tg-card {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px auto 0;
  background: linear-gradient(#1d1430, #0d0b1c);
  color: #fff8e1;
  border: 4px solid #b8412c;
  border-radius: 14px;
  padding: 12px 10px;
}
.tg-card-labomi {
  flex: none;
  width: 92px;
  height: auto;
  order: 2;
}
.tg-card-body {
  flex: 1;
  min-width: 0;
  text-align: center;
}
.tg-card-name,
.tg-card-title,
.tg-card-site {
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-weight: 800;
}
.tg-card-name {
  color: #ffd84a;
  font-size: 1.1rem;
}
.tg-card-score {
  font: 900 2.6rem/1.1 "IBM Plex Mono", ui-monospace, monospace;
}
.tg-card-title {
  font-size: 1.15rem;
}
.tg-card-best {
  margin-top: 4px;
  font-weight: 700;
  color: #c9b8a0;
}
.tg-card-best.hot {
  color: #ffd84a;
}
.tg-card-meta {
  font-size: 0.8rem;
  color: #e8dcc8;
}
.tg-card-line {
  margin-top: 6px;
  font-weight: 800;
  color: #ff9a7a;
}
.tg-card-site {
  margin-top: 6px;
  font-size: 0.85rem;
  color: #ff8a6a;
}
.tg-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 12px;
}
.tg-help {
  text-align: center;
  font-size: 0.85rem;
  opacity: 0.8;
  margin-top: 8px;
}
</style>
