<template>
  <main class="container py-3 mg-ranking">
    <div class="mb-2"><nuxt-link to="/games">&lt; ミニゲーム一覧</nuxt-link></div>
    <h1 class="h4 mb-3">ミニゲームのランキング</h1>

    <div class="ranking-seg mb-2" role="tablist">
      <button
        v-for="g in gameOptions"
        :key="g.id"
        type="button"
        class="seg-btn"
        :class="{ active: game === g.id }"
        @click="set({ game: g.id })"
      >
        {{ g.name }}
      </button>
    </div>
    <template v-if="game === 'rhythm'">
      <div class="ranking-seg mb-2 seg-wrap" role="tablist">
        <button
          v-for="s in songOptions"
          :key="s.id"
          type="button"
          class="seg-btn"
          :class="{ active: song === s.id }"
          @click="set({ song: s.id })"
        >
          {{ s.title }}
        </button>
      </div>
      <div class="ranking-seg mb-2" role="tablist">
        <button
          v-for="l in levelOptions"
          :key="l.id"
          type="button"
          class="seg-btn"
          :class="{ active: level === l.id }"
          @click="set({ level: l.id })"
        >
          {{ l.label }}
        </button>
      </div>
    </template>
    <div class="ranking-seg mb-3" role="tablist">
      <button
        v-for="p in periodOptions"
        :key="p.key"
        type="button"
        class="seg-btn"
        :class="{ active: period === p.key }"
        @click="set({ period: p.key })"
      >
        {{ p.label }}
      </button>
    </div>

    <div v-if="state === 'loading'" class="p-3 card-shrine">
      <div class="loading-inline">
        <span class="spinner-border" role="status" aria-hidden="true"></span>
        ランキングを読み込んでいます
      </div>
    </div>
    <div v-else-if="state === 'error'">
      <span class="notice-danger">
        <i class="fas fa-fw fa-exclamation-triangle"></i>
        ランキングを読み込めませんでした。
      </span>
      <button class="btn btn-sm btn-outline-light mt-2" @click="load">再読み込み</button>
    </div>
    <template v-else>
      <div class="p-3 card-shrine mb-3">
        <template v-if="isLogin">
          <div v-if="me">
            あなたの順位 <b class="fs-5">{{ me.rank }}</b> 位 ・ {{ me.score.toLocaleString() }} 点
          </div>
          <div v-else>まだこのランキングに記録がありません。遊ぶと載ります。</div>
        </template>
        <div v-else><nuxt-link to="/">ログイン</nuxt-link>して遊ぶと、ランキングに載ります。</div>
      </div>
      <div class="card card-shrine ranking-card">
        <div class="card-header ranking-header">
          {{ headerLabel }}
          <div class="ranking-note">{{ periodNote }}</div>
        </div>
        <div class="list-group list-group-flush">
          <nuxt-link
            v-for="item in entries"
            :key="item.screen_name"
            class="list-group-item list-group-item-action d-flex align-items-center"
            :class="{ mine: user && item.screen_name === user.screen_name }"
            :to="`/u/` + item.screen_name"
          >
            <div class="me-3 rank" :class="'rank-' + item.rank">{{ item.rank }} 位</div>
            <div class="me-2">
              <img :src="item.image_path" class="rounded-icon" height="30" width="30" alt="" />
            </div>
            <div class="flex-fill me-2 name">{{ item.display_name || item.screen_name }}</div>
            <div class="me-2 score">{{ item.score.toLocaleString() }} 点</div>
            <div><i class="fas fa-fw fa-chevron-right"></i></div>
          </nuxt-link>
          <div v-if="entries.length === 0" class="list-group-item ranking-empty">
            まだ記録がありません。一番乗りのチャンス!
          </div>
        </div>
      </div>
      <div class="mt-3">
        <nuxt-link :to="playPath" class="btn btn-warning">{{ gameName }}で遊ぶ</nuxt-link>
      </div>
    </template>
  </main>
</template>

<script>
// ミニゲームのランキング(サーバーは minigameGo)。ゲーム・曲・難易度・期間は URL の query に持つ
// (結果画面の「ランキング」から、遊んだ曲・難易度を開ける)。
import { mapGetters } from "vuex";
import Songs from "@/components/rhythmSongs";
import Chart from "@/components/rhythmChart";

const GAMES = [
  { id: "ostrich", name: "韋駝天", path: "/games/ostrich" },
  { id: "rhythm", name: "神楽ビート", path: "/games/rhythm" },
  { id: "typo", name: "誤字祓い", path: "/games/typo" },
];
const PERIODS = [
  { key: "week", label: "週間" },
  { key: "month", label: "月間" },
  { key: "all", label: "歴代" },
];

export default {
  data() {
    return {
      gameOptions: GAMES,
      songOptions: Songs.SONGS.map((s) => ({ id: s.id, title: s.title })),
      levelOptions: Object.keys(Chart.LEVELS).map((id) => ({ id, label: Chart.LEVELS[id].label })),
      periodOptions: PERIODS,
      state: "loading",
      entries: [],
      me: null,
      seq: 0,
    };
  },
  computed: {
    ...mapGetters(["user", "isLogin"]),
    game() {
      const g = this.$route.query.game;
      return GAMES.some((x) => x.id === g) ? g : "ostrich";
    },
    song() {
      const s = this.$route.query.song;
      return this.songOptions.some((x) => x.id === s) ? s : this.songOptions[0].id;
    },
    level() {
      const l = this.$route.query.level;
      return this.levelOptions.some((x) => x.id === l) ? l : "hard";
    },
    period() {
      const p = this.$route.query.period;
      return PERIODS.some((x) => x.key === p) ? p : "week";
    },
    board() {
      return this.game === "rhythm" ? `rhythm-${this.song}-${this.level}` : this.game;
    },
    gameName() {
      return GAMES.find((g) => g.id === this.game).name;
    },
    playPath() {
      return GAMES.find((g) => g.id === this.game).path;
    },
    headerLabel() {
      const p = PERIODS.find((x) => x.key === this.period).label;
      if (this.game !== "rhythm") return `${this.gameName} ${p}ランキング`;
      const s = this.songOptions.find((x) => x.id === this.song).title;
      const l = this.levelOptions.find((x) => x.id === this.level).label;
      return `${this.gameName}「${s}」${l} ${p}ランキング`;
    },
    periodNote() {
      if (this.period === "week") return "月曜 0 時(日本時間)に新しい週になります";
      if (this.period === "month") return "毎月 1 日 0 時(日本時間)に新しい月になります";
      return "これまでのベスト";
    },
  },
  watch: {
    board() {
      this.load();
    },
    period() {
      this.load();
    },
  },
  mounted() {
    this.load();
  },
  methods: {
    set(q) {
      // 選んでいるタブをもう一度押した時の「同じ所への移動」は無視する
      this.$router.replace({ query: Object.assign({}, this.$route.query, q) }).catch(() => {});
    },
    async load() {
      const seq = ++this.seq;
      this.state = "loading";
      try {
        const params = { board: this.board, period: this.period };
        if (this.user && this.user.github_id) params.me = this.user.github_id;
        const res = await this.$axios.get("minigameGo", { params });
        if (seq !== this.seq) return;
        const d = res.data || {};
        if (d.status !== "success") throw new Error(d.message || "failed");
        this.entries = d.entries || [];
        this.me = d.me || null;
        this.state = "done";
      } catch (e) {
        if (seq !== this.seq) return;
        this.state = "error";
      }
    },
  },
  head() {
    return { title: "ミニゲームのランキング | でばっぐ神社" };
  },
};
</script>

<style scoped>
.ranking-header {
  background-color: rgba(255, 255, 255, 0.04);
  color: var(--color-text);
  font-weight: 700;
  border-bottom: 1px solid var(--color-surface-border);
}
.ranking-note {
  color: var(--color-text-muted, #9a9a9a);
  font-size: 0.78rem;
  font-weight: 400;
}
.ranking-card .list-group-item {
  background-color: transparent;
  color: var(--color-text);
  border-color: var(--color-surface-border);
}
.ranking-card .list-group-item-action:hover,
.ranking-card .list-group-item-action:focus {
  background-color: rgba(255, 255, 255, 0.06);
  color: var(--color-text);
}
.ranking-card .list-group-item.mine {
  background-color: rgba(255, 196, 120, 0.12);
}
.ranking-empty {
  color: var(--color-text-muted, #9a9a9a);
  font-size: 0.9rem;
}
.rank {
  min-width: 3em;
  font-variant-numeric: tabular-nums;
}
.rank-1 {
  color: #ffd84a;
  font-weight: 900;
}
.rank-2 {
  color: #d9dde3;
  font-weight: 700;
}
.rank-3 {
  color: #e0a46a;
  font-weight: 700;
}
.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.score {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ranking-seg {
  display: inline-flex;
  max-width: 100%;
  border: 1px solid var(--color-surface-border);
  border-radius: 0.5rem;
  overflow: hidden;
  background-color: var(--color-surface);
}
.seg-wrap {
  flex-wrap: wrap;
}
/* タブの段は 1 段ずつ(横に並べると、どれがどの切り替えか分からない) */
.ranking-seg {
  display: flex;
  width: fit-content;
}
.seg-btn {
  background: transparent;
  border: none;
  color: var(--color-text-muted, #9a9a9a);
  padding: 8px 14px;
  font-size: 0.9rem;
  transition: background-color 0.15s, color 0.15s;
}
.seg-btn + .seg-btn {
  border-left: 1px solid var(--color-surface-border);
}
.seg-btn:hover {
  color: var(--color-text);
}
.seg-btn.active {
  background: rgba(255, 196, 120, 0.15);
  color: var(--color-text);
  font-weight: 700;
}
</style>
