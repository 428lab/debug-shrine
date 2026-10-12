// ミニゲームのランキングと実績(サーバーは minigameGo。docs/backend.md「ランキングと実績」)。
//
// 3 つのゲーム(韋駝天・誤字祓い・神楽ビート)が mixins: [MinigameOnline] で使う。
// - ログインしている時だけ: 開いた時に実績の一覧と持っている実績を読み、
//   遊んでいる間は mgLive() で点数・コンボの実績をその場で判定して「実績解除!」を出す。
//   終わったら mgSubmit() で結果を送り、期間ごとの順位と、新しく取った実績を受け取る
// - ログインしていない時は何も送らない(結果の所に「ログインするとランキングに載ります」)
import { getAuth, onAuthStateChanged } from "firebase/auth";

const ENDPOINT = "minigameGo";
const TOAST_MS = 4200;
const RETRY_MS = 2200; // too_fast(続けての送信)の時に待ってから 1 回だけ送り直す

// ランキングのページへのリンク
export function rankingLink(game, song, level) {
  const q = { game };
  if (game === "rhythm") {
    if (song) q.song = song;
    if (level) q.level = level;
  }
  return { path: "/games/ranking", query: q };
}

function currentUser() {
  const auth = getAuth();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (u) => {
      off();
      resolve(u);
    });
  });
}

export default {
  data() {
    return {
      mgToasts: [], // 表示中の「実績解除!」
      // 送信の状態: idle | off(ログインしていない)| sending | done | rejected | error
      mgSend: "idle",
      mgRanks: null, // { all|week|month: { rank, best, new_best } }
    };
  },
  computed: {
    mgUser() {
      return this.$store && this.$store.getters.user;
    },
  },
  created() {
    // 毎フレーム見るものは data に入れない
    // run: 遊んだ回の番号(前の回の送信の返事が、次の回の結果を上書きしないように)
    // shown: この回に通知した実績(送信が失敗しても、次の回にまた取れば通知する)
    this._mg = { defs: [], have: new Set(), shown: new Set(), ready: false, toastSeq: 0, timers: [], run: 0, dead: false };
  },
  mounted() {
    this.mgLoad();
  },
  beforeDestroy() {
    this._mg.dead = true;
    for (const t of this._mg.timers) clearTimeout(t);
  },
  methods: {
    async mgLoad() {
      const u = this.mgUser;
      if (!u || !u.github_id) return;
      try {
        const res = await this.$axios.get(ENDPOINT, { params: { achievements: 1, me: u.github_id } });
        const d = res.data || {};
        if (d.status !== "success") return;
        this._mg.defs = d.defs || [];
        this._mg.have = new Set(d.achievements || []);
        this._mg.ready = true;
      } catch (e) {
        // 読めなくても遊べる(その場の「実績解除!」が出ないだけ。送信の時に記録はされる)
      }
    },
    // 遊び始めた時(前の回の結果を消す)
    mgReset() {
      this._mg.run++;
      this._mg.shown = new Set();
      this.mgSend = "idle";
      this.mgRanks = null;
    },
    // 遊んでいる間に呼ぶ。values は { "typo.score": 1234, "typo.max_combo": 12 } のような今の値
    mgLive(game, values) {
      const m = this._mg;
      if (!m.ready) return;
      for (const d of m.defs) {
        if (!d.live || d.game !== game || m.have.has(d.id) || m.shown.has(d.id)) continue;
        const v = values[d.metric];
        if (v != null && v >= d.min) {
          m.shown.add(d.id);
          this.mgToast(d);
        }
      }
    },
    mgToast(def) {
      if (this._mg.dead) return;
      const key = ++this._mg.toastSeq;
      this.mgToasts.push({ key, id: def.id, label: def.label, icon: def.icon, desc: def.desc });
      const t = setTimeout(() => {
        this.mgToasts = this.mgToasts.filter((x) => x.key !== key);
      }, TOAST_MS + (this.mgToasts.length - 1) * 600);
      this._mg.timers.push(t);
    },
    // 終わった時に呼ぶ。body は minigameGo の POST(github_id は足す)
    async mgSubmit(body) {
      const m = this._mg;
      const run = m.run;
      const shown = m.shown;
      // 返事を待つ間に次の回が始まったり、ページを離れたりしたら、画面の状態は触らない
      const current = () => run === m.run && !m.dead;
      const u = this.mgUser;
      if (!u || !u.github_id) {
        this.mgSend = "off";
        return;
      }
      this.mgSend = "sending";
      try {
        const fu = await currentUser();
        if (!fu) {
          if (current()) this.mgSend = "off";
          return;
        }
        const payload = Object.assign({ github_id: u.github_id }, body);
        let d = await this.mgPost(fu, payload);
        if (d.status === "too_fast") {
          await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
          if (m.dead) return;
          d = await this.mgPost(fu, payload);
        }
        if (d.status === "success") {
          // 持っている実績はサーバーのものに合わせる
          m.have = new Set(d.achievements || []);
          for (const a of d.unlocked || []) {
            // この回のゲーム中に出したものは出さない
            if (!shown.has(a.id)) {
              shown.add(a.id);
              this.mgToast(a);
            }
          }
          if (!current()) return;
          this.mgRanks = d.ranks || null;
          this.mgSend = "done";
        } else if (current()) {
          this.mgSend = d.status === "rejected" ? "rejected" : "error";
        }
      } catch (e) {
        if (current()) this.mgSend = "error";
      }
    },
    async mgPost(fu, payload) {
      const token = await fu.getIdToken();
      const res = await this.$axios.post(ENDPOINT, payload, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 20000,
      });
      return res.data || {};
    },
  },
};
