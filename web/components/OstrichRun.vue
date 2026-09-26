<template>
  <!-- ミニゲーム「ダチョウ走」。ルールは ostrichGame.js(純関数)、ここは描画と操作だけ。
       ハイスコアはこの端末にだけ保存する(DB には送らない)。終わった画面は、そのまま
       スクショしても共有しやすい1枚(スコア・ベスト・称号・日付・サイト名)にする。 -->
  <div class="ostrich">
    <div ref="wrap" class="os-wrap">
      <canvas
        ref="canvas"
        class="os-canvas"
        @pointerdown.prevent="onPress"
      ></canvas>
    </div>
    <!-- 結果の札(スマホの縦画面でも大きく読める。ゲーム画面と一緒にスクショしやすい) -->
    <div v-if="phase === 'over' && result" class="os-card">
      <div class="os-card-name">ダチョウ走</div>
      <div class="os-card-score">{{ result.score }}</div>
      <div class="os-card-title">称号「{{ result.title }}」</div>
      <div class="os-card-best" :class="{ hot: result.newBest }">{{ result.bestLine }}</div>
      <div class="os-card-next">{{ result.nextLine }}</div>
      <div class="os-card-meta">門を {{ result.gates }} 回くぐった / {{ result.date }}</div>
      <div class="os-card-site">でばっぐ神社 {{ siteHost }}</div>
    </div>
    <div class="os-actions">
      <button type="button" class="btn btn-warning" @click="onButton($event, restart)">
        {{ phase === "over" ? "もう1回" : "はじめる" }}
      </button>
      <button v-if="phase === 'over'" type="button" class="btn btn-outline-light" @click="onButton($event, saveImage)">
        <i class="fas fa-download fa-fw"></i> 画像を保存
      </button>
    </div>
    <p class="os-help">タップ / スペースキーでジャンプ。空中でタップすると羽ばたく。</p>
  </div>
</template>

<script>
import G from "@/components/ostrichGame";

const BEST_KEY = "debug-shrine:ostrich:best";
const OVER_LOCK_MS = 600; // 終わった直後のタップでうっかり再開しない
const DYING_MS = 700; // ぶつかってから結果の画面まで

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
    // 保存できない環境(プライベートモード等)では、その場のベストだけ使う
  }
}
function pad(n) {
  return String(n).padStart(5, "0");
}

export default {
  props: {
    // 画像に入れるサイトの URL(表示用)
    siteUrl: { type: String, default: "" },
  },
  data() {
    return {
      phase: "ready", // ready | play | dying | over
      best: 0,
      newBest: false,
      result: null, // 終わった時の結果(札に出す)
    };
  },
  created() {
    // ゲームの状態は毎フレーム書き換わるので data に入れない(リアクティブにしない)
    this.G = G;
    this.game = null;
  },
  mounted() {
    this.best = loadBest();
    this.game = G.newGame();
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKey);
    this._last = performance.now();
    this._acc = 0;
    this._raf = requestAnimationFrame(this.frame);
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKey);
    if (this._raf) cancelAnimationFrame(this._raf);
  },
  methods: {
    resize() {
      const c = this.$refs.canvas;
      const wrap = this.$refs.wrap;
      if (!c || !wrap) return;
      const w = wrap.clientWidth;
      const h = (w * G.H) / G.W;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.style.height = h + "px";
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      this._scale = c.width / G.W;
    },
    onKey(e) {
      if (e.code !== "Space" && e.code !== "ArrowUp") return;
      // ボタンやテキスト入力にいる時は邪魔しない
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      e.preventDefault(); // ページがスクロールしないように
      if (!e.repeat) this.onPress();
    },
    onPress() {
      if (this.phase === "ready") {
        this.start();
        G.press(this.game);
      } else if (this.phase === "play") {
        G.press(this.game);
      } else if (this.phase === "over") {
        if (performance.now() - this._overAt > OVER_LOCK_MS) this.restart();
      }
    },
    start() {
      this.game = G.newGame();
      this.phase = "play";
      this.newBest = false;
      this._startBest = this.best;
      this._popups = [];
      this._flashBest = 0;
      this._acc = 0;
      this._last = performance.now();
    },
    restart() {
      this.start();
    },
    // ボタンを押したら、ボタンからフォーカスを外す(残っているとスペースキーで
    // ジャンプした時にボタンがまた押されて、最初からやり直しになる)
    onButton(e, fn) {
      if (e && e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
      fn();
    },
    frame(now) {
      this._raf = requestAnimationFrame(this.frame);
      const dt = Math.min(0.1, (now - this._last) / 1000);
      this._last = now;
      const g = this.game;
      if (this.phase === "play") {
        this._acc += dt;
        const gatesBefore = g.gates;
        while (this._acc >= G.STEP && !g.over) {
          G.step(g);
          this._acc -= G.STEP;
        }
        if (g.gates > gatesBefore) this._popups.push({ text: "+20 くぐった！", t: now });
        if (!this.newBest && this._startBest > 0 && g.score > this._startBest) {
          this.newBest = true;
          this._flashBest = now;
        }
        if (g.over) {
          this.phase = "dying";
          this._dieAt = now;
          if (g.score > this.best) {
            this.best = g.score;
            saveBest(g.score);
            this.newBest = true;
          }
        }
      } else if (this.phase === "dying" && now - this._dieAt > DYING_MS) {
        this.phase = "over";
        this._overAt = now;
        this.result = this.makeResult(g);
      }
      this.draw(now);
    },

    // ---- 描画 ----
    draw(now) {
      const c = this.$refs.canvas;
      if (!c) return;
      const ctx = c.getContext("2d");
      const s = this._scale || 1;
      const g = this.game;
      ctx.setTransform(s, 0, 0, s, 0, 0);
      // ぶつかった直後は画面を小さく揺らす
      if (this.phase === "dying") {
        const u = (now - this._dieAt) / DYING_MS;
        const k = Math.max(0, 1 - u * 2.5) * 6;
        ctx.translate(Math.sin(now / 18) * k, Math.cos(now / 23) * k);
      }
      this.drawWorld(ctx, g, now);
      this.drawHud(ctx, g, now);
      if (this.phase === "ready") this.drawReady(ctx);
      if (this.phase === "over") this.drawOver(ctx, g);
    },
    // 昼(0)〜夜(1)。スコア 1000 ごとに昼と夜が入れ替わる
    night(g) {
      const p = (g.score % 2000) / 2000;
      const tri = p < 0.5 ? p * 2 : 2 - p * 2; // 0→1→0
      return Math.max(0, Math.min(1, (tri - 0.35) / 0.3));
    },
    drawWorld(ctx, g, now) {
      const W = G.W;
      const H = G.H;
      const n = this.night(g);
      const mix = (a, b) => {
        const pa = parseInt(a.slice(1), 16);
        const pb = parseInt(b.slice(1), 16);
        const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - n) + ((pb >> sh) & 255) * n);
        return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
      };
      const sky = ctx.createLinearGradient(0, 0, 0, G.GROUND);
      sky.addColorStop(0, mix("#f7e7c6", "#16142a"));
      sky.addColorStop(1, mix("#f3c98f", "#3a2d4a"));
      ctx.fillStyle = sky;
      ctx.fillRect(-10, -10, W + 20, H + 20);
      // 月 / 太陽
      ctx.fillStyle = n > 0.5 ? "rgba(255,244,210,0.9)" : "rgba(255,170,90,0.85)";
      ctx.beginPath();
      ctx.arc(520, 70, 22, 0, Math.PI * 2);
      ctx.fill();
      // 遠くの山(ゆっくり流れる)
      const off1 = (g.dist * 0.15) % 320;
      ctx.fillStyle = mix("#d9a877", "#2a2240");
      ctx.beginPath();
      ctx.moveTo(-10, G.GROUND);
      for (let x = -off1 - 320; x < W + 320; x += 320) {
        ctx.lineTo(x + 80, G.GROUND - 110);
        ctx.lineTo(x + 170, G.GROUND - 60);
        ctx.lineTo(x + 250, G.GROUND - 140);
        ctx.lineTo(x + 320, G.GROUND);
      }
      ctx.lineTo(W + 10, G.GROUND);
      ctx.fill();
      // 地面
      ctx.fillStyle = mix("#8b6a48", "#2a211c");
      ctx.fillRect(-10, G.GROUND, W + 20, H - G.GROUND + 10);
      ctx.strokeStyle = mix("#5a3f28", "#c79a64");
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, G.GROUND + 1);
      ctx.lineTo(W + 10, G.GROUND + 1);
      ctx.stroke();
      // 地面の小石(速さが分かる)
      const off2 = g.dist % 60;
      ctx.fillStyle = mix("#6d4f33", "#4a3a30");
      for (let x = -off2; x < W; x += 60) {
        ctx.fillRect(x + 7, G.GROUND + 12, 6, 3);
        ctx.fillRect(x + 37, G.GROUND + 26, 4, 2);
      }
      // ベストの位置の旗(もう少しで届くのが見える)
      this.drawBestFlag(ctx, g);
      for (const ob of g.obstacles) {
        if (ob.kind === "cactus") this.drawCactus(ctx, ob);
        else if (ob.kind === "crow") this.drawCrow(ctx, ob, now);
        else this.drawGate(ctx, ob, n);
      }
      this.drawOstrich(ctx, g, now);
    },
    drawBestFlag(ctx, g) {
      const best = this._startBest || 0;
      if (best <= 0 || this.phase === "ready") return;
      // ベストのスコアに相当する距離(門のボーナスを除いた、今の走りでの位置の目安)
      const need = best - g.gates * 20;
      const x = G.BIRD.x + (need / 0.1 - g.dist);
      if (x < -20 || x > G.W + 20) return;
      ctx.strokeStyle = "#5a3f28";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, G.GROUND);
      ctx.lineTo(x, G.GROUND - 70);
      ctx.stroke();
      ctx.fillStyle = "#b8412c";
      ctx.beginPath();
      ctx.moveTo(x, G.GROUND - 70);
      ctx.lineTo(x + 42, G.GROUND - 60);
      ctx.lineTo(x, G.GROUND - 50);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "700 11px sans-serif";
      ctx.fillText("BEST", x + 4, G.GROUND - 57);
    },
    drawCactus(ctx, ob) {
      ctx.fillStyle = "#4f7a3a";
      const n = Math.round((ob.w + 6) / 24);
      for (let i = 0; i < n; i++) {
        const x = ob.x + i * 24;
        const h = ob.h - (i % 2) * 8;
        const y = G.GROUND - h;
        this.roundRect(ctx, x + 4, y, 10, h, 5);
        this.roundRect(ctx, x, y + h * 0.35, 5, h * 0.28, 2.5);
        this.roundRect(ctx, x + 13, y + h * 0.25, 5, h * 0.3, 2.5);
      }
    },
    drawCrow(ctx, ob, now) {
      const cx = ob.x + ob.w / 2;
      const cy = ob.y + ob.h / 2;
      const up = Math.sin(now / 90) > 0;
      ctx.fillStyle = "#1c1a22";
      ctx.beginPath();
      ctx.ellipse(cx, cy + 3, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - 13, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e0a53a";
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy - 1);
      ctx.lineTo(cx - 26, cy + 1);
      ctx.lineTo(cx - 18, cy + 3);
      ctx.fill();
      ctx.fillStyle = "#1c1a22";
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy + 1);
      ctx.lineTo(cx + 6, up ? cy - 16 : cy + 16);
      ctx.lineTo(cx + 10, cy + 2);
      ctx.fill();
    },
    drawGate(ctx, ob, n) {
      // 鳥居の柱: 上から下がる柱と、下から立つ柱。すき間の縁に笠木(黒い横木)
      const x = ob.x;
      const w = ob.w;
      ctx.fillStyle = ob.passed ? "#d9603f" : "#b8412c";
      ctx.fillRect(x + 6, -10, w - 12, ob.gapTop + 10);
      ctx.fillRect(x + 6, ob.gapBottom, w - 12, G.GROUND - ob.gapBottom);
      ctx.fillStyle = n > 0.5 ? "#0e0c12" : "#2a211c";
      ctx.fillRect(x - 8, ob.gapTop - 12, w + 16, 12);
      ctx.fillRect(x - 4, ob.gapBottom, w + 8, 9);
    },
    drawOstrich(ctx, g, now) {
      const x = G.BIRD.x;
      const y = g.y; // 足の位置
      const dying = this.phase === "dying" || this.phase === "over";
      const run = g.onGround && !dying ? g.dist / 22 : 0;
      const flapping = !g.onGround && g.t - g.flapT < 0.18;
      ctx.save();
      if (dying) {
        ctx.translate(x, y - 30);
        ctx.rotate(-0.5);
        ctx.translate(-x, -(y - 30));
      }
      // 脚
      ctx.strokeStyle = "#c98b5a";
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      const legs = g.onGround && !dying ? [Math.sin(run), Math.sin(run + Math.PI)] : [0.5, -0.3];
      legs.forEach((a) => {
        ctx.beginPath();
        ctx.moveTo(x + 2, y - 26);
        ctx.lineTo(x + 2 + a * 9, y - 12);
        ctx.lineTo(x + 2 + a * 14, y - (g.onGround ? 0 : 6));
        ctx.stroke();
      });
      // 胴体
      ctx.fillStyle = "#2b2230";
      ctx.beginPath();
      ctx.ellipse(x - 2, y - 32, 19, 12, -0.12, 0, Math.PI * 2);
      ctx.fill();
      // 尾羽
      ctx.fillStyle = "#f3ead8";
      ctx.beginPath();
      ctx.ellipse(x - 20, y - 38, 7, 5, -0.6, 0, Math.PI * 2);
      ctx.fill();
      // 翼(羽ばたくと上がる)
      ctx.fillStyle = "#4a3d52";
      ctx.beginPath();
      if (flapping) {
        ctx.moveTo(x - 10, y - 38);
        ctx.lineTo(x - 22, y - 62);
        ctx.lineTo(x + 4, y - 40);
      } else {
        ctx.ellipse(x - 4, y - 33, 11, 6, 0.2, 0, Math.PI * 2);
      }
      ctx.fill();
      // 首と頭
      ctx.strokeStyle = "#e8c9a8";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x + 12, y - 38);
      ctx.quadraticCurveTo(x + 14, y - 50, x + 11, y - 56);
      ctx.stroke();
      ctx.fillStyle = "#e8c9a8";
      ctx.beginPath();
      ctx.arc(x + 13, y - 58, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e0a53a";
      ctx.beginPath();
      ctx.moveTo(x + 17, y - 60);
      ctx.lineTo(x + 26, y - 57);
      ctx.lineTo(x + 17, y - 55);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(x + 14.5, y - 59.5, dying ? 0.1 : 1.4, 0, Math.PI * 2);
      ctx.fill();
      if (dying) {
        // 目が × になる
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x + 12.5, y - 61.5);
        ctx.lineTo(x + 16.5, y - 57.5);
        ctx.moveTo(x + 16.5, y - 61.5);
        ctx.lineTo(x + 12.5, y - 57.5);
        ctx.stroke();
      }
      ctx.restore();
    },
    drawHud(ctx, g, now) {
      const light = this.night(g) > 0.5;
      ctx.fillStyle = light ? "#efe6d2" : "#3a2a20";
      ctx.font = "700 18px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.fillText(`HI ${pad(Math.max(this.best, g.score))}  ${pad(g.score)}`, G.W - 16, 30);
      ctx.textAlign = "left";
      // 門をくぐった時の「+20」
      this._popups = (this._popups || []).filter((p) => now - p.t < 800);
      this._popups.forEach((p) => {
        const u = (now - p.t) / 800;
        ctx.globalAlpha = 1 - u;
        ctx.fillStyle = "#b8412c";
        ctx.font = "800 16px sans-serif";
        ctx.fillText(p.text, G.BIRD.x + 20, g.y - 80 - u * 24);
        ctx.globalAlpha = 1;
      });
      // ベスト更新の瞬間
      if (this._flashBest && now - this._flashBest < 1400) {
        const u = (now - this._flashBest) / 1400;
        ctx.globalAlpha = 1 - u * u;
        ctx.fillStyle = "#b8412c";
        ctx.font = "900 26px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("ベスト更新！", G.W / 2, 90);
        ctx.textAlign = "left";
        ctx.globalAlpha = 1;
      }
    },
    drawReady(ctx) {
      ctx.fillStyle = "rgba(20,16,24,0.55)";
      ctx.fillRect(0, 0, G.W, G.H);
      ctx.fillStyle = "#fff8e1";
      ctx.textAlign = "center";
      ctx.font = "900 40px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
      ctx.fillText("ダチョウ走", G.W / 2, 150);
      ctx.font = "700 18px sans-serif";
      ctx.fillText("タップでスタート", G.W / 2, 200);
      ctx.font = "500 14px sans-serif";
      ctx.fillStyle = "rgba(255,248,225,0.8)";
      ctx.fillText("地面でタップ = ジャンプ / 空中でタップ = 羽ばたき", G.W / 2, 232);
      ctx.fillText("鳥居の柱のすき間をくぐると +20", G.W / 2, 254);
      if (this.best > 0) ctx.fillText(`ベスト ${this.best}`, G.W / 2, 290);
      ctx.textAlign = "left";
    },
    // 終わった時のゲーム画面(暗くして、スコアと「もう1回」だけ)
    drawOver(ctx, g) {
      ctx.fillStyle = "rgba(20,16,24,0.5)";
      ctx.fillRect(0, 0, G.W, G.H);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff8e1";
      ctx.font = "900 44px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.fillText(String(g.score), G.W / 2, 150);
      ctx.font = "700 20px sans-serif";
      ctx.fillText("タップでもう1回", G.W / 2, 200);
      ctx.textAlign = "left";
    },
    makeResult(g) {
      const nt = G.nextTitle(g.score);
      let bestLine;
      if (this.newBest && !this._startBest) bestLine = "はじめての記録！";
      else if (this.newBest) bestLine = `ベスト更新！(これまで ${this._startBest})`;
      else bestLine = `ベスト ${this.best}(あと ${this.best - g.score + 1} で更新)`;
      return {
        score: g.score,
        title: G.titleOf(g.score),
        newBest: this.newBest,
        bestLine,
        nextLine: nt ? `次の称号「${nt.name}」まで あと ${nt.need}` : "最高の称号に到達！",
        gates: g.gates,
        date: this.today(),
      };
    },
    // 画像に描く結果の札(画像を保存する時だけ使う)
    drawCardImage(ctx, x0, y0, w, h) {
      const r = this.result;
      ctx.fillStyle = "#fff8e1";
      this.roundRect(ctx, x0, y0, w, h, 24);
      ctx.strokeStyle = "#b8412c";
      ctx.lineWidth = 8;
      ctx.stroke();
      const cx = x0 + w / 2;
      const line = (text, y, font, color) => {
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.fillText(text, cx, y0 + y);
      };
      ctx.textAlign = "center";
      const mincho = "'Hiragino Mincho ProN', 'Yu Mincho', serif";
      line("ダチョウ走", 60, `800 36px ${mincho}`, "#3a2a20");
      line(String(r.score), 190, "900 130px 'IBM Plex Mono', ui-monospace, monospace", "#b8412c");
      line(`称号「${r.title}」`, 265, `800 44px ${mincho}`, "#3a2a20");
      line(r.bestLine, 330, "700 30px sans-serif", r.newBest ? "#b8412c" : "#5a3f28");
      line(r.nextLine, 378, "600 28px sans-serif", "#5a3f28");
      line(`門を ${r.gates} 回くぐった / ${r.date}`, 424, "500 24px sans-serif", "#5a3f28");
      line(`でばっぐ神社 ${this.siteHost}`, 482, `800 28px ${mincho}`, "#b8412c");
      ctx.textAlign = "left";
    },
    roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill();
    },
    today() {
      const d = new Date();
      return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    },

    // 終わった画面を画像にする。共有できる端末ではシェアシート、それ以外は保存
    saveImage() {
      if (!this.result) return;
      // ゲーム画面(上)と結果の札(下)を1枚にまとめる
      const c = document.createElement("canvas");
      c.width = 1200;
      c.height = 1330;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#1c1a26";
      ctx.fillRect(0, 0, c.width, c.height);
      // ゲーム画面は「タップでもう1回」を除いて描き直す
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, 1200, 750);
      ctx.clip();
      ctx.scale(1200 / G.W, 750 / G.H);
      const now = performance.now();
      this.drawWorld(ctx, this.game, now);
      this.drawHud(ctx, this.game, now);
      ctx.restore();
      this.drawCardImage(ctx, 60, 790, 1080, 510);
      if (!c.toBlob) return;
      c.toBlob(async (blob) => {
        if (!blob) return;
        const name = `ostrich-${this.result.score}.png`;
        try {
          const file = new File([blob], name, { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
            return;
          }
        } catch (e) {
          // シェアをやめた / 使えない → 保存にする
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
  computed: {
    siteHost() {
      return (this.siteUrl || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    },
  },
};
</script>

<style scoped>
.ostrich {
  max-width: 760px;
  margin: 0 auto;
}
.os-wrap {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
}
.os-canvas {
  display: block;
  width: 100%;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
}
.os-card {
  margin: 14px auto 0;
  max-width: 460px;
  background: #fff8e1;
  color: #3a2a20;
  border: 4px solid #b8412c;
  border-radius: 14px;
  padding: 14px 12px 12px;
  text-align: center;
}
.os-card-name,
.os-card-title,
.os-card-site {
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-weight: 800;
}
.os-card-name {
  font-size: 1rem;
}
.os-card-score {
  font: 900 3.4rem/1.1 "IBM Plex Mono", ui-monospace, monospace;
  color: #b8412c;
}
.os-card-title {
  font-size: 1.35rem;
  margin-top: 2px;
}
.os-card-best {
  margin-top: 6px;
  font-weight: 700;
  color: #5a3f28;
}
.os-card-best.hot {
  color: #b8412c;
}
.os-card-next,
.os-card-meta {
  font-size: 0.9rem;
  color: #5a3f28;
}
.os-card-meta {
  font-size: 0.8rem;
  margin-top: 2px;
}
.os-card-site {
  margin-top: 8px;
  color: #b8412c;
}
.os-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 12px;
}
.os-help {
  text-align: center;
  font-size: 0.85rem;
  opacity: 0.75;
  margin-top: 8px;
}
</style>
