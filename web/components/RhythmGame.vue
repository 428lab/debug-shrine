<template>
  <!-- リズムゲーム本体。譜面は rhythmChart.js、曲と音は rhythmSong.js / rhythmAudio.js。
       ハイスコアはこの端末にだけ保存する(DB には送らない)。 -->
  <div class="rg" @dblclick.prevent>
    <div ref="wrap" class="rg-wrap">
      <canvas
        ref="canvas"
        class="rg-canvas"
        @pointerdown.prevent="onPointerDown"
        @pointerup.prevent="onPointerUp"
        @pointercancel.prevent="onPointerUp"
        @touchstart.prevent
        @touchend.prevent
        @dblclick.prevent
        @contextmenu.prevent
      ></canvas>

      <!-- はじめの画面 -->
      <div v-if="phase === 'title'" class="rg-over">
        <div class="rg-title">{{ title }}</div>
        <div class="rg-sub">鈴・太鼓・柏手を、曲に合わせて叩け</div>
        <div class="rg-levels">
          <button
            v-for="(lv, id) in levels"
            :key="id"
            type="button"
            class="btn btn-lg rg-level"
            :class="'rg-level-' + id"
            @click="start(id)"
          >
            {{ lv.label }}
            <small>ベスト {{ best[id] || 0 }}</small>
          </button>
        </div>
        <div class="rg-help">
          スマホ: 下の 3 か所をタップ / PC: D・F・J キー<br />
          長い音符は押したまま。iPhone は消音スイッチをオフに
        </div>
      </div>

      <!-- 一時停止 -->
      <div v-if="phase === 'paused'" class="rg-over" @click="resume">
        <div class="rg-title">一時停止中</div>
        <div class="rg-sub">タップで再開</div>
      </div>
    </div>

    <!-- 結果の札(そのままスクショ・画像保存で共有しやすい) -->
    <div v-if="phase === 'result' && result" class="rg-card">
      <div class="rg-card-name">{{ title }}・{{ result.levelLabel }}</div>
      <div class="rg-card-rank">{{ result.rank }}</div>
      <div class="rg-card-score">{{ result.score.toLocaleString() }}</div>
      <div v-if="result.badge" class="rg-card-badge">{{ result.badge }}</div>
      <div class="rg-card-best" :class="{ hot: result.newBest }">{{ result.bestLine }}</div>
      <div class="rg-card-counts">
        <span class="c-kiwami">極 {{ result.counts.kiwami }}</span>
        <span class="c-ryo">良 {{ result.counts.ryo }}</span>
        <span class="c-ka">可 {{ result.counts.ka }}</span>
        <span class="c-fuka">不可 {{ result.counts.fuka }}</span>
      </div>
      <div class="rg-card-meta">最大コンボ {{ result.maxCombo }} / {{ result.date }}</div>
      <div class="rg-card-site">でばっぐ神社 {{ siteHost }}</div>
    </div>
    <div v-if="phase === 'result'" class="rg-actions">
      <button type="button" class="btn btn-warning" @click="start(level)">もう1回</button>
      <button type="button" class="btn btn-outline-light" @click="toTitle">難易度を選ぶ</button>
      <button type="button" class="btn btn-outline-light" @click="saveImage">
        <i class="fas fa-download fa-fw"></i> 画像を保存
      </button>
    </div>
  </div>
</template>

<script>
import Song from "@/components/rhythmSong";
import Chart from "@/components/rhythmChart";
import Audio from "@/components/rhythmAudio";

const W = 420; // 論理の幅(高さは画面の縦横比で決める)
const LEAD = 2.0; // 曲が始まるまでの間(音符が遠くから来る時間)
const VISIBLE = 1.5; // この秒数先の音符まで見える
const KEYS = { KeyD: 0, KeyF: 1, KeyJ: 2 };
const LANE_COLOR = ["#ffd84a", "#ef5b3f", "#f4f1ea"];
const JUDGE_TEXT = { kiwami: "極", ryo: "良", ka: "可", fuka: "不可" };
const JUDGE_COLOR = { kiwami: "#ffd84a", ryo: "#ff7a52", ka: "#c9b8a0", fuka: "#7a7a88" };
const BEST_KEY = "debug-shrine:rhythm:best";

function loadBest() {
  try {
    return JSON.parse(window.localStorage.getItem(BEST_KEY)) || {};
  } catch (e) {
    return {};
  }
}
function saveBest(b) {
  try {
    window.localStorage.setItem(BEST_KEY, JSON.stringify(b));
  } catch (e) {
    // 保存できない環境では、その場のベストだけ
  }
}

export default {
  props: {
    title: { type: String, default: "リズムゲーム" },
    siteUrl: { type: String, default: "" },
  },
  data() {
    return {
      phase: "title", // title | play | paused | result
      level: "easy",
      levels: Chart.LEVELS,
      best: {},
      result: null,
    };
  },
  computed: {
    siteHost() {
      return (this.siteUrl || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    },
  },
  created() {
    // 曲・譜面・遊んでいる状態は毎フレーム書き換わるので data に入れない
    this.song = Song.buildSong();
    this.kicks = this.song.events.filter((e) => e.inst === "kick" || e.inst === "taiko").map((e) => e.t);
    this.st = null;
  },
  mounted() {
    this.best = loadBest();
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("visibilitychange", this.onVisibility);
    // スマホでダブルタップしても拡大しないように(このページにいる間だけ)。
    // CSS の touch-action が効かない古い iOS 向けに、素早い 2 回目のタップも打ち消す
    this._prevTouchAction = document.documentElement.style.touchAction;
    document.documentElement.style.touchAction = "manipulation";
    this._lastTouchEnd = 0;
    this._onTouchEnd = (e) => {
      const now = Date.now();
      if (now - this._lastTouchEnd < 350 && e.cancelable) e.preventDefault();
      this._lastTouchEnd = now;
    };
    document.addEventListener("touchend", this._onTouchEnd, { passive: false });
    this._raf = requestAnimationFrame(this.frame);
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("visibilitychange", this.onVisibility);
    document.removeEventListener("touchend", this._onTouchEnd);
    document.documentElement.style.touchAction = this._prevTouchAction || "";
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this.engine) this.engine.silence();
    if (this.ctx) this.ctx.close();
  },
  methods: {
    resize() {
      const c = this.$refs.canvas;
      const wrap = this.$refs.wrap;
      if (!c || !wrap) return;
      const w = wrap.clientWidth;
      // 遊んでいる間は、幅が変わらない限り大きさを変えない(iOS のアドレスバーの出入りで
      // 判定の線が動かないように)
      if (this.phase === "play" && w === this._w) return;
      this._w = w;
      const h = Math.min(window.innerHeight * 0.78, w * 1.7);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.style.height = h + "px";
      wrap.style.height = h + "px";
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      this._scale = c.width / W;
      this._H = (W * h) / w;
    },

    // ---- 音と時刻 ----
    ensureCtx() {
      if (!this.ctx) {
        try {
          if (navigator.audioSession) navigator.audioSession.type = "playback";
        } catch (e) {
          // 対応していない環境
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC({ latencyHint: "interactive" });
      }
      if (this.ctx.state !== "running") this.ctx.resume();
      return this.ctx;
    },
    // 今、耳に届いている曲の時刻(秒)。出力の遅れを差し引く
    heardTime(perfNow) {
      const ctx = this.ctx;
      const st = this.st;
      if (!ctx || !st) return -LEAD;
      // 音が止まっている間(一時停止・電話などの中断)は、止まった currentTime を使う。
      // getOutputTimestamp は止まる直前の値を返し続けるので、足し算すると時刻だけ進んでしまう
      if (ctx.state === "running" && ctx.getOutputTimestamp) {
        const ts = ctx.getOutputTimestamp();
        const now = perfNow != null ? perfNow : performance.now();
        if (ts && ts.contextTime > 0 && ts.performanceTime > 0 && now - ts.performanceTime < 100) {
          return ts.contextTime + (now - ts.performanceTime) / 1000 - st.startAt;
        }
      }
      return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) - st.startAt;
    },

    // ---- 遊ぶ ----
    start(level) {
      const ctx = this.ensureCtx();
      if (this.engine) this.engine.silence();
      this.level = level;
      this.chart = Chart.buildChart(this.song, level);
      this.engine = Audio.createEngine(ctx);
      const startAt = this.engine.startSong(this.song, 0, LEAD);
      const notes = this.chart.notes.map((n) => Object.assign({}, n, { judged: null, tail: null, holding: false }));
      const holds = notes.filter((n) => n.end != null).length;
      this.st = {
        startAt,
        notes,
        total: notes.length + holds,
        counts: { kiwami: 0, ryo: 0, ka: 0, fuka: 0 },
        combo: 0,
        maxCombo: 0,
        next: 0, // まだ判定していない一番早い音符
        held: [null, null, null], // レーンごとの長押し中の音符
        pressed: [0, 0, 0], // レーンを押した時刻(光らせる)
        pops: [], // 判定の文字
        parts: [], // 火花
        petals: [],
      };
      this._kickIdx = 0;
      this._startedAt = performance.now();
      this.result = null;
      this.phase = "play";
    },
    toTitle() {
      if (this.engine) this.engine.silence();
      this.engine = null;
      this.st = null;
      this.phase = "title";
    },
    resume() {
      if (this.phase !== "paused") return;
      // 音が本当に動き出してから遊びに戻る(先に戻ると、止まっていた間の音符が一気に不可になる)
      const ctx = this.ensureCtx();
      this._resuming = true;
      const p = ctx.resume ? ctx.resume() : null;
      const go = () => {
        this._resuming = false;
        if (this.phase === "paused") this.phase = "play";
      };
      if (p && p.then) p.then(go, go);
      else go();
    },
    onVisibility() {
      if (document.hidden && this.phase === "play" && this.ctx) this.pause();
    },
    // 一時停止。押していた長押しは、その時点で離したことにする(止まっている間の指やキーは分からない)
    pause() {
      if (this.phase !== "play") return;
      const t = this.heardTime();
      if (this.st) for (let lane = 0; lane < 3; lane++) if (this.st.held[lane]) this.endHold(lane, t);
      if (this._pointers) this._pointers = {};
      // 音の状態に関わらず止める(止まっていても後で勝手に動き出すことがある: 遅れて届く resume、
      // iOS の中断明けの自動復帰)。こちらから止めておけば、再開の操作まで鳴らない
      if (this.ctx && this.ctx.state !== "closed") this.ctx.suspend();
      this.phase = "paused";
    },

    // ---- 入力 ----
    laneAt(clientX) {
      const r = this.$refs.canvas.getBoundingClientRect();
      return Math.max(0, Math.min(2, Math.floor(((clientX - r.left) / r.width) * 3)));
    },
    onPointerDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (this.phase !== "play") return;
      const lane = this.laneAt(e.clientX);
      this._pointers = this._pointers || {};
      this._pointers[e.pointerId] = lane;
      // 画面の外で離しても pointerup が届くように
      try {
        e.target.setPointerCapture(e.pointerId);
      } catch (err) {
        // 対応していない環境
      }
      this.press(lane, e.timeStamp, "p" + e.pointerId);
    },
    onPointerUp(e) {
      const lane = this._pointers && this._pointers[e.pointerId];
      if (lane == null) return;
      delete this._pointers[e.pointerId];
      this.release(lane, e.timeStamp, "p" + e.pointerId);
    },
    onKeyDown(e) {
      if (!(e.code in KEYS)) return;
      const tag = (e.target && e.target.tagName) || "";
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      e.preventDefault();
      if (e.repeat || this.phase !== "play") return;
      this.press(KEYS[e.code], e.timeStamp, "k" + e.code);
    },
    onKeyUp(e) {
      if (!(e.code in KEYS) || this.phase !== "play") return;
      this.release(KEYS[e.code], e.timeStamp, "k" + e.code);
    },
    // 入力の時刻(イベントの timeStamp は performance.now と同じ時計)
    // who: 押した指やキー。長押しは、始めた指(キー)が離れた時だけ終わる
    press(lane, stamp, who = "x") {
      const st = this.st;
      if (!st) return;
      const t = this.heardTime(stamp);
      st.pressed[lane] = performance.now();
      // このレーンで、判定の幅に入っている一番早い未判定の音符
      let hit = null;
      for (let i = st.next; i < st.notes.length; i++) {
        const n = st.notes[i];
        if (n.t - t > Chart.WINDOWS.ka) break;
        if (n.lane === lane && !n.judged && Math.abs(n.t - t) <= Chart.WINDOWS.ka) {
          hit = n;
          break;
        }
      }
      if (!hit) return;
      const j = Chart.judge(hit.t - t);
      this.applyJudge(hit, j, lane);
      if (hit.end != null) {
        hit.holding = true;
        hit.who = who;
        st.held[lane] = hit;
      }
    },
    release(lane, stamp, who = "x") {
      const st = this.st;
      if (!st) return;
      const n = st.held[lane];
      if (!n || n.who !== who) return; // 別の指が離れただけなら長押しは続く
      this.endHold(lane, this.heardTime(stamp));
    },
    endHold(lane, t) {
      const st = this.st;
      const n = st.held[lane];
      if (!n) return;
      st.held[lane] = null;
      n.holding = false;
      // 終わりの 0.12 秒前までに離したら、長押しは失敗
      if (n.tail == null) this.applyTail(n, t >= n.end - 0.12 ? "kiwami" : "fuka", lane);
    },
    applyJudge(n, j, lane) {
      const st = this.st;
      n.judged = j;
      st.counts[j]++;
      if (j === "fuka") {
        st.combo = 0;
      } else {
        st.combo++;
        st.maxCombo = Math.max(st.maxCombo, st.combo);
        this.engine.sfx(Chart.LANES[lane], j);
        this.spark(lane, j);
      }
      st.pops.push({ lane, j, at: performance.now() });
    },
    applyTail(n, j, lane) {
      const st = this.st;
      n.tail = j;
      st.counts[j]++;
      if (j === "fuka") st.combo = 0;
      else {
        st.combo++;
        st.maxCombo = Math.max(st.maxCombo, st.combo);
        this.spark(lane, j);
      }
    },

    // ---- 毎フレーム ----
    frame(now) {
      this._raf = requestAnimationFrame(this.frame);
      // 一時停止中に音が勝手に動き出したら(遅れて届いた resume など)止め直す
      if (this.phase === "paused" && !this._resuming && this.ctx && this.ctx.state === "running") this.ctx.suspend();
      if (this.phase === "play") this.update(now);
      this.draw(now);
    },
    update(now) {
      const st = this.st;
      // 電話などで音が止められた(visibilitychange が来ない)時も一時停止にする
      if (this.ctx && this.ctx.state !== "running" && now - (this._startedAt || 0) > 1000) {
        this.pause();
        return;
      }
      const t = this.heardTime(now);
      // 叩かれずに過ぎた音符は不可
      while (st.next < st.notes.length) {
        const n = st.notes[st.next];
        if (!n.judged && t - n.t > Chart.WINDOWS.ka) this.applyJudge(n, "fuka", n.lane);
        if (n.judged) st.next++;
        else break;
      }
      // 長押しは終わりまで押し続けたら成功
      for (let lane = 0; lane < 3; lane++) {
        const n = st.held[lane];
        if (n && t >= n.end) {
          st.held[lane] = null;
          n.holding = false;
          this.applyTail(n, "kiwami", lane);
        }
      }
      // 長押しを始めずに過ぎたものの終わりは不可
      for (const n of st.notes) {
        if (n.end != null && n.tail == null && !n.holding && n.judged && t > n.end) this.applyTail(n, "fuka", n.lane);
      }
      if (t > this.song.duration - 1.5 && st.next >= st.notes.length) this.finish();
    },
    finish() {
      const st = this.st;
      const score = Chart.scoreOf(st.counts, st.total);
      const prev = this.best[this.level] || 0;
      const newBest = score > prev;
      if (newBest) {
        this.best = Object.assign({}, this.best, { [this.level]: score });
        saveBest(this.best);
      }
      let badge = "";
      if (st.counts.fuka === 0 && st.counts.ka === 0 && st.counts.ryo === 0) badge = "全極(オール極)!";
      else if (st.counts.fuka === 0) badge = "フルコンボ!";
      const d = new Date();
      this.result = {
        levelLabel: Chart.LEVELS[this.level].label,
        score,
        rank: Chart.rankOf(score),
        counts: Object.assign({}, st.counts),
        maxCombo: st.maxCombo,
        badge,
        newBest,
        bestLine: newBest ? (prev ? `ベスト更新!(これまで ${prev.toLocaleString()})` : "はじめての記録!") : `ベスト ${prev.toLocaleString()}`,
        date: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
      };
      this.phase = "result";
    },

    // ---- 演出 ----
    spark(lane, j) {
      const st = this.st;
      const x = this.laneX(lane, 0);
      const y = this.hitY();
      const n = j === "kiwami" ? 16 : 9;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * (0.1 + 0.8 * Math.random());
        const v = 120 + Math.random() * 260;
        st.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: j === "kiwami" ? "#ffd84a" : LANE_COLOR[lane], at: performance.now() });
      }
      if (j === "kiwami" && st.combo % 10 === 0) {
        for (let i = 0; i < 6; i++) st.petals.push({ x: Math.random() * W, y: -10, vx: 20 + Math.random() * 40, vy: 60 + Math.random() * 60, r: Math.random() * 6, at: performance.now() });
      }
    },
    hitY() {
      return this._H - 110;
    },
    horizonY() {
      return this._H * 0.14;
    },
    // 奥行き d(0 = 判定の線、1 = 一番奥)の見え方
    persp(d) {
      const k = 3;
      return 1 / (1 + k * d);
    },
    yAt(d) {
      const s0 = this.persp(1);
      const f = (1 - this.persp(d)) / (1 - s0); // 0(手前)〜1(奥)
      return this.hitY() - (this.hitY() - this.horizonY()) * f;
    },
    laneX(lane, d) {
      const s = this.persp(d);
      const laneW = 118;
      return W / 2 + (lane - 1) * laneW * s;
    },
    draw(now) {
      const c = this.$refs.canvas;
      if (!c || !this._H) return;
      const g = c.getContext("2d");
      const H = this._H;
      g.setTransform(this._scale, 0, 0, this._scale, 0, 0);
      const st = this.st;
      const playing = st && (this.phase === "play" || this.phase === "paused" || this.phase === "result");
      const t = playing ? this.heardTime(now) : -LEAD;

      // 拍に合わせて脈打つ(キック・和太鼓)
      let pulse = 0;
      if (playing) {
        for (let i = this._kickIdx || 0; i < this.kicks.length && this.kicks[i] <= t; i++) this._kickIdx = i;
        const k = this.kicks[this._kickIdx || 0];
        if (k != null && t >= k) pulse = Math.exp(-(t - k) * 9);
      }
      const inChorus = playing && this.song.sections.some((s) => s.name.startsWith("chorus") && t >= s.start && t < s.start + s.bars * this.song.bar);

      // 背景
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0b0910");
      bg.addColorStop(0.55, inChorus ? "#2a0f12" : "#170d14");
      bg.addColorStop(1, "#060508");
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      // 奥の光(脈打つ)
      const glow = g.createRadialGradient(W / 2, this.horizonY(), 4, W / 2, this.horizonY(), 260);
      glow.addColorStop(0, `rgba(255,120,60,${0.25 + 0.35 * pulse})`);
      glow.addColorStop(1, "rgba(255,120,60,0)");
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);

      // レーン(奥へすぼまる台形)
      const edges = [-0.5, 0.5, 1.5, 2.5];
      g.strokeStyle = "rgba(255,216,74,0.35)";
      g.lineWidth = 1.5;
      for (const e of edges) {
        g.beginPath();
        g.moveTo(this.laneX(e, 1), this.yAt(1));
        g.lineTo(this.laneX(e, 0), this.hitY() + 60);
        g.stroke();
      }
      // 押したレーンを光らせる
      if (st) {
        for (let lane = 0; lane < 3; lane++) {
          const age = (now - st.pressed[lane]) / 1000;
          const held = st.held[lane];
          const a = held ? 0.35 : Math.max(0, 0.3 - age);
          if (a <= 0) continue;
          g.fillStyle = LANE_COLOR[lane];
          g.globalAlpha = a;
          g.beginPath();
          g.moveTo(this.laneX(lane - 0.5, 1), this.yAt(1));
          g.lineTo(this.laneX(lane + 0.5, 1), this.yAt(1));
          g.lineTo(this.laneX(lane + 0.5, 0), this.hitY() + 60);
          g.lineTo(this.laneX(lane - 0.5, 0), this.hitY() + 60);
          g.fill();
          g.globalAlpha = 1;
        }
      }

      // 奥から迫る鳥居(1 小節ごと)
      if (playing) {
        const bar = this.song.bar;
        const first = Math.ceil(t / bar);
        for (let b = first + 3; b >= first; b--) {
          const d = (b * bar - t) / (VISIBLE * 1.6);
          if (d < 0 || d > 1) continue;
          this.drawTorii(g, d, inChorus && b % 2 === 0 ? 0.9 : 0.45);
        }
      }

      // 判定の線と受け皿
      g.strokeStyle = `rgba(255,216,74,${0.6 + 0.4 * pulse})`;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(this.laneX(-0.5, 0), this.hitY());
      g.lineTo(this.laneX(2.5, 0), this.hitY());
      g.stroke();
      const labels = ["鈴", "太鼓", "柏手"];
      for (let lane = 0; lane < 3; lane++) {
        const x = this.laneX(lane, 0);
        g.strokeStyle = LANE_COLOR[lane];
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(x, this.hitY(), 26, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = "rgba(255,248,225,0.75)";
        g.font = "700 15px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
        g.textAlign = "center";
        g.fillText(labels[lane], x, this.hitY() + 58);
      }

      // 音符
      if (st) {
        for (let i = st.next; i < st.notes.length; i++) {
          const n = st.notes[i];
          if (n.t - t > VISIBLE) break;
          if (n.end != null && n.judged) continue; // 頭を叩いた長押しは下でまとめて描く
          this.drawNote(g, n, t);
        }
        // 長押し中・判定済みでも尾が残っているもの
        for (const n of st.notes) if (n.end != null && n.judged && n.tail == null && n.judged !== "fuka") this.drawNote(g, n, t);
      }

      // 火花・花びら・判定の文字・コンボ
      if (st) this.drawEffects(g, now);

      // コンボが続くと画面の縁が金色に燃える
      if (st && st.combo >= 20) {
        const a = Math.min(0.55, (st.combo - 20) / 80 + 0.2) * (0.7 + 0.3 * pulse);
        const edge = g.createLinearGradient(0, 0, 18, 0);
        edge.addColorStop(0, `rgba(255,200,60,${a})`);
        edge.addColorStop(1, "rgba(255,200,60,0)");
        g.fillStyle = edge;
        g.fillRect(0, 0, 18, H);
        const edge2 = g.createLinearGradient(W, 0, W - 18, 0);
        edge2.addColorStop(0, `rgba(255,200,60,${a})`);
        edge2.addColorStop(1, "rgba(255,200,60,0)");
        g.fillStyle = edge2;
        g.fillRect(W - 18, 0, 18, H);
      }

      // 点数
      if (st) {
        g.textAlign = "right";
        g.fillStyle = "#fff8e1";
        g.font = "700 18px 'IBM Plex Mono', ui-monospace, monospace";
        g.fillText(Chart.scoreOf(st.counts, st.total).toLocaleString(), W - 14, 30);
        g.textAlign = "left";
        g.font = "600 12px sans-serif";
        g.fillStyle = "rgba(255,248,225,0.7)";
        const sec = this.song.sections.filter((s) => t >= s.start).pop();
        g.fillText(sec ? sec.label : "", 14, 28);
        // 曲の進み
        g.fillStyle = "rgba(255,255,255,0.12)";
        g.fillRect(0, 0, W, 3);
        g.fillStyle = "#ffd84a";
        g.fillRect(0, 0, W * Math.max(0, Math.min(1, t / this.song.duration)), 3);
      }
    },
    drawTorii(g, d, alpha) {
      const s = this.persp(d);
      const y = this.yAt(d);
      const half = 200 * s;
      const h = 170 * s;
      g.globalAlpha = alpha * (1 - d * 0.7);
      g.fillStyle = "#b8412c";
      g.fillRect(W / 2 - half * 0.82, y - h, 12 * s, h);
      g.fillRect(W / 2 + half * 0.82 - 12 * s, y - h, 12 * s, h);
      g.fillRect(W / 2 - half * 0.9, y - h + 26 * s, half * 1.8, 8 * s);
      g.fillStyle = "#1c1216";
      g.fillRect(W / 2 - half, y - h - 12 * s, half * 2, 14 * s);
      g.globalAlpha = 1;
    },
    drawNote(g, n, t) {
      const d = (n.t - t) / VISIBLE;
      const color = LANE_COLOR[n.lane];
      // 長押しの帯
      if (n.end != null) {
        const d0 = Math.max(0, d);
        const d1 = Math.min(1, (n.end - t) / VISIBLE);
        if (d1 > d0) {
          g.fillStyle = n.holding ? "rgba(255,216,74,0.6)" : "rgba(255,216,74,0.28)";
          g.beginPath();
          g.moveTo(this.laneX(n.lane - 0.18, d0), this.yAt(d0));
          g.lineTo(this.laneX(n.lane + 0.18, d0), this.yAt(d0));
          g.lineTo(this.laneX(n.lane + 0.18, d1), this.yAt(d1));
          g.lineTo(this.laneX(n.lane - 0.18, d1), this.yAt(d1));
          g.fill();
        }
        if (n.judged) return; // 頭はもう叩いた
      }
      if (d < -0.15 || d > 1) return;
      const s = this.persp(Math.max(0, d));
      const x = this.laneX(n.lane, Math.max(0, d));
      const y = this.yAt(Math.max(0, d));
      const r = 22 * s;
      // 光
      const gl = g.createRadialGradient(x, y, r * 0.2, x, y, r * 1.8);
      gl.addColorStop(0, color);
      gl.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.55;
      g.fillStyle = gl;
      g.beginPath();
      g.arc(x, y, r * 1.8, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      // 本体(鈴 = 金の丸、太鼓 = 朱の太鼓、柏手 = 白い菱)
      g.fillStyle = color;
      g.strokeStyle = "#1c1216";
      g.lineWidth = 2 * s;
      g.beginPath();
      if (n.lane === 2) {
        g.moveTo(x, y - r);
        g.lineTo(x + r, y);
        g.lineTo(x, y + r);
        g.lineTo(x - r, y);
        g.closePath();
      } else {
        g.arc(x, y, r, 0, Math.PI * 2);
      }
      g.fill();
      g.stroke();
      if (n.lane === 1) {
        g.fillStyle = "#f3ead8";
        g.beginPath();
        g.arc(x, y, r * 0.55, 0, Math.PI * 2);
        g.fill();
      } else if (n.lane === 0) {
        g.fillStyle = "#1c1216";
        g.fillRect(x - r * 0.5, y + r * 0.1, r, r * 0.16);
      }
    },
    drawEffects(g, now) {
      const st = this.st;
      st.parts = st.parts.filter((p) => now - p.at < 500);
      for (const p of st.parts) {
        const u = (now - p.at) / 1000;
        g.globalAlpha = Math.max(0, 1 - u / 0.5);
        g.fillStyle = p.color;
        g.fillRect(p.x + p.vx * u - 2, p.y + p.vy * u + 500 * u * u - 2, 4, 4);
      }
      st.petals = st.petals.filter((p) => now - p.at < 3000);
      for (const p of st.petals) {
        const u = (now - p.at) / 1000;
        g.globalAlpha = Math.max(0, 1 - u / 3);
        g.fillStyle = "#f6b3c3";
        g.beginPath();
        g.ellipse(p.x + p.vx * u + Math.sin(u * 3 + p.r) * 12, p.y + p.vy * u, 5, 3, u * 2 + p.r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      st.pops = st.pops.filter((p) => now - p.at < 450);
      for (const p of st.pops) {
        const u = (now - p.at) / 450;
        g.globalAlpha = 1 - u * u;
        g.fillStyle = JUDGE_COLOR[p.j];
        g.font = `900 ${p.j === "kiwami" ? 30 : 24}px 'Hiragino Mincho ProN', 'Yu Mincho', serif`;
        g.textAlign = "center";
        g.fillText(JUDGE_TEXT[p.j], this.laneX(p.lane, 0), this.hitY() - 42 - u * 18);
      }
      g.globalAlpha = 1;
      if (st.combo >= 5) {
        g.textAlign = "center";
        g.fillStyle = st.combo >= 50 ? "#ffd84a" : "#fff8e1";
        g.font = "900 44px 'IBM Plex Mono', ui-monospace, monospace";
        g.fillText(String(st.combo), W / 2, this._H * 0.42);
        g.font = "700 13px sans-serif";
        g.fillText("コンボ", W / 2, this._H * 0.42 + 20);
      }
      g.textAlign = "left";
    },

    // 結果の札を画像にする(共有できる端末ではシェアシート)
    saveImage() {
      const r = this.result;
      if (!r) return;
      const c = document.createElement("canvas");
      c.width = 1080;
      c.height = 1080;
      const g = c.getContext("2d");
      const bg = g.createLinearGradient(0, 0, 0, 1080);
      bg.addColorStop(0, "#1c1216");
      bg.addColorStop(1, "#0b0910");
      g.fillStyle = bg;
      g.fillRect(0, 0, 1080, 1080);
      g.strokeStyle = "#b8412c";
      g.lineWidth = 14;
      g.strokeRect(40, 40, 1000, 1000);
      g.textAlign = "center";
      const mincho = "'Hiragino Mincho ProN', 'Yu Mincho', serif";
      const line = (text, y, font, color) => {
        g.font = font;
        g.fillStyle = color;
        g.fillText(text, 540, y);
      };
      line(`${this.title}・${r.levelLabel}`, 170, `800 54px ${mincho}`, "#fff8e1");
      line(r.rank, 400, `900 220px ${mincho}`, "#ffd84a");
      line(r.score.toLocaleString(), 540, "900 96px 'IBM Plex Mono', ui-monospace, monospace", "#fff8e1");
      if (r.badge) line(r.badge, 620, "800 44px sans-serif", "#ff7a52");
      line(`極 ${r.counts.kiwami}  良 ${r.counts.ryo}  可 ${r.counts.ka}  不可 ${r.counts.fuka}`, 720, "700 40px sans-serif", "#efe6d2");
      line(`最大コンボ ${r.maxCombo}  /  ${r.date}`, 790, "500 34px sans-serif", "#c9b8a0");
      line(r.bestLine, 860, "700 36px sans-serif", r.newBest ? "#ffd84a" : "#c9b8a0");
      line(`でばっぐ神社 ${this.siteHost}`, 980, `800 40px ${mincho}`, "#b8412c");
      c.toBlob(async (blob) => {
        if (!blob) return;
        const name = `rhythm-${r.score}.png`;
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
.rg {
  max-width: 520px;
  margin: 0 auto;
  touch-action: manipulation; /* ボタンを素早く押してもダブルタップ拡大しない */
}
.rg-wrap {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid #b8412c;
}
.rg-canvas {
  display: block;
  width: 100%;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
.rg-over {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: rgba(8, 6, 10, 0.72);
  color: #fff8e1;
  text-align: center;
  padding: 16px;
}
.rg-title {
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-weight: 900;
  font-size: 2.2rem;
  color: #ffd84a;
  text-shadow: 0 0 18px rgba(255, 120, 60, 0.6);
}
.rg-sub {
  font-weight: 700;
}
.rg-levels {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}
.rg-level {
  display: flex;
  flex-direction: column;
  min-width: 96px;
  color: #fff;
  font-weight: 800;
  font-size: 1.3rem;
}
.rg-level small {
  font-size: 0.75rem;
  font-weight: 600;
  opacity: 0.85;
}
.rg-level-easy {
  background: #b8412c;
}
.rg-level-normal {
  background: #7a2e22;
  border: 1px solid #e0a53a;
}
.rg-level-hard {
  background: #3a1f5a;
  border: 1px solid #ffd84a;
}
.rg-help {
  font-size: 0.8rem;
  opacity: 0.75;
}
.rg-card {
  margin: 14px auto 0;
  max-width: 460px;
  background: linear-gradient(#1c1216, #0b0910);
  color: #fff8e1;
  border: 4px solid #b8412c;
  border-radius: 14px;
  padding: 14px 12px;
  text-align: center;
}
.rg-card-name,
.rg-card-rank,
.rg-card-site {
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-weight: 900;
}
.rg-card-rank {
  font-size: 4rem;
  line-height: 1.1;
  color: #ffd84a;
}
.rg-card-score {
  font: 900 2.2rem "IBM Plex Mono", ui-monospace, monospace;
}
.rg-card-badge {
  color: #ff7a52;
  font-weight: 800;
}
.rg-card-best {
  color: #c9b8a0;
  font-weight: 700;
}
.rg-card-best.hot {
  color: #ffd84a;
}
.rg-card-counts {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 6px;
  font-weight: 700;
}
.c-kiwami {
  color: #ffd84a;
}
.c-ryo {
  color: #ff7a52;
}
.c-ka {
  color: #c9b8a0;
}
.c-fuka {
  color: #7a7a88;
}
.rg-card-meta {
  font-size: 0.8rem;
  opacity: 0.75;
  margin-top: 4px;
}
.rg-card-site {
  margin-top: 8px;
  color: #b8412c;
}
.rg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 12px;
}
</style>
