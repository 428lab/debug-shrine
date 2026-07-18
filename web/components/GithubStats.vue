<template>
  <div class="github-stats p-3 rounded">
    <div class="d-flex justify-content-between align-items-center flex-wrap mb-2">
      <h2 class="gh-title fs-6 mb-0"><i class="fab fa-github fa-fw"></i> GitHubの実績</h2>
      <div v-if="state === 'loaded'" class="gh-sub">
        {{ fetchedAtText }}
      </div>
    </div>

    <div v-if="state === 'loading'" class="gh-sub py-3">
      GitHubの実績を集めています<span class="dots"></span>
    </div>
    <div v-else-if="state === 'error'" class="py-2">
      <span class="gh-sub">GitHubの実績を読み込めませんでした。</span>
      <button class="btn btn-sm btn-outline-light ms-2" @click="fetchStats">
        再読み込み
      </button>
    </div>
    <template v-else>
      <!-- 数値タイル -->
      <div class="tiles">
        <div class="tile">
          <div class="tile-value">{{ stats.public_repos.toLocaleString() }}</div>
          <div class="tile-label">
            公開リポジトリ
            <span v-if="stats.fork_count > 0" class="tile-note">
              (オリジナル{{ stats.original_count }})
            </span>
          </div>
        </div>
        <div class="tile">
          <div class="tile-value"><i class="fas fa-star"></i> {{ stats.stars_total.toLocaleString() }}</div>
          <div class="tile-label">獲得スター</div>
        </div>
        <div class="tile">
          <div class="tile-value">{{ stats.followers.toLocaleString() }}</div>
          <div class="tile-label">フォロワー</div>
        </div>
        <div class="tile">
          <div class="tile-value">{{ githubYears }}<span class="tile-unit">年</span></div>
          <div class="tile-label">GitHub歴</div>
        </div>
      </div>

      <!-- 言語割合(本人作リポジトリの主要言語) -->
      <template v-if="languageShares.length > 0">
        <div class="gh-sub mt-3 mb-1">使用言語(リポジトリ数の割合)</div>
        <div class="lang-bar" role="img" aria-label="使用言語の割合">
          <span
            v-for="l in languageShares"
            :key="l.name"
            class="lang-seg"
            :style="{ width: l.percent + '%', background: l.color }"
            :title="`${l.name} ${l.percent}% (${l.count}リポジトリ)`"
          ></span>
        </div>
        <div class="lang-legend mt-1">
          <span v-for="l in languageShares" :key="l.name" class="lang-item">
            <span class="lang-dot" :style="{ background: l.color }"></span>
            {{ l.name }} <span class="gh-sub">{{ l.percent }}%</span>
          </span>
        </div>
      </template>

      <!-- 代表リポジトリ(本人のピン留め or スター上位の自動選出) -->
      <template v-if="stats.top_repos.length > 0 || editable">
        <div class="d-flex align-items-center mt-3 mb-1">
          <div class="gh-sub">
            {{ stats.top_repos_source === "pinned" ? "ピン留めリポジトリ" : "代表リポジトリ" }}
          </div>
          <button
            v-if="editable && !pickerOpen"
            class="btn btn-sm btn-outline-light ms-2 pick-btn"
            @click="pickerOpen = true"
          >
            <i class="fas fa-fw fa-thumbtack"></i> 選ぶ
          </button>
        </div>
        <RepoPicker
          v-if="pickerOpen"
          class="mb-2"
          :screen-name="screenName"
          :github-id="githubId"
          :initial-pinned="pinnedNames"
          @saved="onPinsSaved"
          @close="pickerOpen = false"
        />
        <div class="repo-grid">
          <a
            v-for="r in stats.top_repos"
            :key="r.name"
            :href="r.html_url"
            target="_blank"
            rel="noopener"
            class="repo-card rounded"
          >
            <div class="repo-name">
              <i class="fas fa-book fa-fw"></i> {{ r.name }}
            </div>
            <div class="repo-desc">{{ r.description || "説明なし" }}</div>
            <div class="repo-meta">
              <span v-if="r.language" class="me-3">
                <span class="lang-dot" :style="{ background: langColor(r.language) }"></span>
                {{ r.language }}
              </span>
              <span class="me-3"><i class="fas fa-star"></i> {{ r.stars.toLocaleString() }}</span>
              <span v-if="r.forks > 0"><i class="fas fa-code-branch"></i> {{ r.forks.toLocaleString() }}</span>
            </div>
          </a>
        </div>
      </template>
    </template>
  </div>
</template>

<script>
// GitHubの公開実績(リポジトリ数・スター・言語割合・代表リポジトリ)。
// データ源は githubStatsGo(GitHub公開APIをFirestoreに6時間キャッシュ)。

// GitHub の言語カラー(主要どころのみ。無い言語はグレー)
const LANG_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Go: "#00ADD8",
  Ruby: "#701516",
  Java: "#b07219",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  PHP: "#4F5D95",
  Rust: "#dea584",
  Dart: "#00B4AB",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Shell: "#89e051",
  PowerShell: "#012456",
  Perl: "#0298c3",
  Haskell: "#5e5086",
  Elixir: "#6e4a7e",
  Scala: "#c22d40",
  Lua: "#000080",
  R: "#198CE7",
  "Objective-C": "#438eff",
  "Jupyter Notebook": "#DA5B0B",
  Dockerfile: "#384d54",
};
const OTHER_COLOR = "#8b949e";

import RepoPicker from "@/components/RepoPicker";

export default {
  components: { RepoPicker },
  props: {
    screenName: { type: String, required: true },
    // マイページ(本人)でのみ true: ピン留めの編集UIを出す
    editable: { type: Boolean, default: false },
    // 編集(pinnedReposGoへの保存)に使う。editable時のみ必要
    githubId: { type: String, default: "" },
  },
  data() {
    return {
      state: "loading", // loading | loaded | error
      stats: null,
      pickerOpen: false,
    };
  },
  computed: {
    // 現在ピン留め表示中のリポジトリ名(編集パネルの初期選択)
    pinnedNames() {
      if (!this.stats || this.stats.top_repos_source !== "pinned") return [];
      return (this.stats.top_repos || []).map((r) => r.name);
    },
    githubYears() {
      if (!this.stats.account_created_at) return "-";
      const ms = Date.now() - new Date(this.stats.account_created_at).getTime();
      return Math.max(0, Math.floor(ms / (365.25 * 24 * 3600 * 1000)));
    },
    // 上位6言語+その他に丸めてパーセント化
    languageShares() {
      const langs = this.stats.languages || [];
      const total = langs.reduce((s, l) => s + l.count, 0);
      if (total === 0) return [];
      const top = langs.slice(0, 6);
      const otherCount = langs.slice(6).reduce((s, l) => s + l.count, 0);
      const shares = top.map((l) => ({
        name: l.name,
        count: l.count,
        percent: Math.round((l.count / total) * 100),
        color: this.langColor(l.name),
      }));
      if (otherCount > 0) {
        shares.push({
          name: "その他",
          count: otherCount,
          percent: Math.round((otherCount / total) * 100),
          color: OTHER_COLOR,
        });
      }
      return shares;
    },
    fetchedAtText() {
      if (!this.stats.fetched_at) return "";
      const d = new Date(this.stats.fetched_at);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(
        d.getMinutes()
      ).padStart(2, "0")} 時点`;
    },
  },
  async mounted() {
    await this.fetchStats();
  },
  methods: {
    langColor(name) {
      return LANG_COLORS[name] || OTHER_COLOR;
    },
    // 保存成功 → サーバー検証済みのピンで即時反映(公開ページはCDN失効後に追従)
    onPinsSaved(pinned) {
      if (pinned.length > 0) {
        this.stats = {
          ...this.stats,
          top_repos: pinned,
          top_repos_source: "pinned",
        };
      } else {
        // ピン解除はスター上位に戻る。CDNの古い応答を掴まないよう
        // キャッシュバスター付きで取り直す
        this.fetchStats(true);
      }
      this.pickerOpen = false;
    },
    async fetchStats(bustCache) {
      this.state = "loading";
      try {
        const params = { user: this.screenName };
        if (bustCache) params._ = Date.now();
        const res = await this.$axios.get("/githubStatsGo", {
          baseURL: this.$config.rankingBaseUrl || this.$config.apiUrl,
          params: params,
        });
        this.stats = res.data;
        this.state = "loaded";
      } catch (e) {
        this.state = "error";
      }
    },
  },
};
</script>

<style scoped>
.github-stats {
  background: var(--color-surface);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.gh-title {
  font-weight: 700;
}
.gh-sub {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

/* 数値タイル(ProfileStatsと同じ見た目) */
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
}
.tile {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 10px 12px;
  text-align: center;
}
.tile-value {
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1.2;
}
.tile-unit {
  font-size: 0.9rem;
  font-weight: 400;
  margin-left: 1px;
}
.tile-label {
  color: var(--color-text-muted);
  font-size: 0.8rem;
  margin-top: 2px;
}
.tile-note {
  font-size: 0.75rem;
}

/* 言語割合バー */
.lang-bar {
  display: flex;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
}
.lang-seg {
  height: 100%;
  min-width: 2px;
}
.lang-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 0.85rem;
}
.lang-item {
  white-space: nowrap;
}
.lang-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: baseline;
}

/* 代表リポジトリ */
.repo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
}
.repo-card {
  display: block;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 10px 12px;
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s;
}
.repo-card:hover {
  border-color: rgba(255, 196, 120, 0.6);
  color: inherit;
}
.repo-name {
  font-weight: 700;
}
.repo-desc {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  margin: 4px 0 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.repo-meta {
  font-size: 0.85rem;
  color: #c9c9c9;
}

/* 読み込み中の「...」 */
.dots::after {
  content: "";
  animation: gh-dots 1.2s steps(4, end) infinite;
}
@keyframes gh-dots {
  0% {
    content: "";
  }
  25% {
    content: "・";
  }
  50% {
    content: "・・";
  }
  75% {
    content: "・・・";
  }
  100% {
    content: "";
  }
}
</style>
