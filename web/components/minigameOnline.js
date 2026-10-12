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
    this._mg = { defs: [], have: new Set(), shown: new Set(), ready: false, toastSeq: 0, timers: [] };
  },
  mounted() {
    this.mgLoad();
  },
  beforeDestroy() {
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
      const key = ++this._mg.toastSeq;
      this.mgToasts.push({ key, id: def.id, label: def.label, icon: def.icon, desc: def.desc });
      const t = setTimeout(() => {
        this.mgToasts = this.mgToasts.filter((x) => x.key !== key);
      }, TOAST_MS + (this.mgToasts.length - 1) * 600);
      this._mg.timers.push(t);
    },
    // 終わった時に呼ぶ。body は minigameGo の POST(github_id は足す)
    async mgSubmit(body) {
      const u = this.mgUser;
      if (!u || !u.github_id) {
        this.mgSend = "off";
        return;
      }
      this.mgSend = "sending";
      try {
        const fu = await currentUser();
        if (!fu) {
          this.mgSend = "off";
          return;
        }
        const token = await fu.getIdToken();
        const res = await this.$axios.post(
          ENDPOINT,
          Object.assign({ github_id: u.github_id }, body),
          { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }
        );
        const d = res.data || {};
        if (d.status === "success") {
          this.mgRanks = d.ranks || null;
          this.mgSend = "done";
          for (const a of d.unlocked || []) {
            this._mg.have.add(a.id);
            // ゲーム中に出したものは出さない
            if (!this._mg.shown.has(a.id)) {
              this._mg.shown.add(a.id);
              this.mgToast(a);
            }
          }
        } else if (d.status === "rejected") {
          this.mgSend = "rejected";
        } else {
          this.mgSend = "error";
        }
      } catch (e) {
        this.mgSend = "error";
      }
    },
  },
};
