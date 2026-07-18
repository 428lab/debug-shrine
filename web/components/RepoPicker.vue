<template>
  <div class="repo-picker rounded p-3">
    <div class="d-flex justify-content-between align-items-center mb-2">
      <div class="picker-title"><i class="fas fa-fw fa-thumbtack"></i> 表示するリポジトリを選ぶ</div>
      <button class="btn btn-sm btn-outline-light" @click="$emit('close')">
        閉じる
      </button>
    </div>
    <p class="picker-sub mb-2">
      最大{{ maxPins }}件まで。選んだ順に表示されます。公開ページへの反映には最大1時間かかることがあります。
    </p>

    <div v-if="state === 'loading'" class="picker-sub py-3">
      リポジトリ一覧を取得しています<span class="dots"></span>
    </div>
    <div v-else-if="state === 'error'" class="py-2">
      <span class="picker-sub">一覧を取得できませんでした(GitHub APIの制限の可能性)。</span>
      <button class="btn btn-sm btn-outline-light ms-2" @click="fetchCandidates">
        もう一度
      </button>
    </div>
    <template v-else>
      <input
        v-model="filter"
        type="text"
        class="form-control form-control-sm mb-2"
        placeholder="リポジトリ名で絞り込み"
      />
      <div class="candidates rounded">
        <label
          v-for="repo in filteredCandidates"
          :key="repo.name"
          class="candidate d-flex align-items-center"
          :class="{ selected: selectedIndex(repo.name) >= 0 }"
        >
          <input
            type="checkbox"
            class="me-2"
            :checked="selectedIndex(repo.name) >= 0"
            :disabled="selectedIndex(repo.name) < 0 && selected.length >= maxPins"
            @change="toggle(repo.name)"
          />
          <span class="candidate-order me-2" v-if="selectedIndex(repo.name) >= 0"
            >{{ selectedIndex(repo.name) + 1 }}</span
          >
          <span class="candidate-name flex-fill">
            {{ repo.name }}
            <span v-if="repo.fork" class="picker-sub">(fork)</span>
          </span>
          <span class="picker-sub"><i class="fas fa-star"></i> {{ repo.stars }}</span>
        </label>
        <div v-if="filteredCandidates.length === 0" class="picker-sub p-2">
          該当するリポジトリがありません。
        </div>
      </div>

      <div class="d-flex align-items-center mt-3 flex-wrap gap-2">
        <button
          class="btn btn-sm btn-accent me-2"
          :disabled="saveState === 'saving'"
          @click="save(selected)"
        >
          {{ saveState === "saving" ? "保存中..." : `この${selected.length}件を表示する` }}
        </button>
        <button
          class="btn btn-sm btn-outline-light me-2"
          :disabled="saveState === 'saving'"
          @click="save([])"
        >
          おまかせ(スター上位)に戻す
        </button>
        <span v-if="saveState === 'error'" class="picker-error">{{
          saveError
        }}</span>
      </div>
    </template>
  </div>
</template>

<script>
// 代表リポジトリのピン留め編集パネル(マイページ専用)。
// 候補一覧はブラウザから直接GitHub公開APIで取得(CORS可・低頻度なので
// 未認証の60req/hで十分)。保存はpinnedReposGoがGitHubで実在・所有を検証する。
import { getAuth, onAuthStateChanged } from "firebase/auth";

function resolveCurrentUser(auth) {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

export default {
  props: {
    screenName: { type: String, required: true },
    githubId: { type: String, required: true },
    // 現在のピン(リポジトリ名の配列)。初期選択に使う。
    initialPinned: { type: Array, default: () => [] },
  },
  data() {
    return {
      maxPins: 6,
      state: "loading", // loading | loaded | error
      candidates: [], // [{name, stars, fork}]
      filter: "",
      selected: [...this.initialPinned], // 選択順を保持したリポジトリ名
      saveState: "idle", // idle | saving | error
      saveError: "",
    };
  },
  computed: {
    filteredCandidates() {
      const q = this.filter.trim().toLowerCase();
      if (!q) return this.candidates;
      return this.candidates.filter((r) => r.name.toLowerCase().includes(q));
    },
  },
  async mounted() {
    await this.fetchCandidates();
  },
  methods: {
    selectedIndex(name) {
      return this.selected.indexOf(name);
    },
    toggle(name) {
      const i = this.selected.indexOf(name);
      if (i >= 0) {
        this.selected.splice(i, 1);
      } else if (this.selected.length < this.maxPins) {
        this.selected.push(name);
      }
    },
    async fetchCandidates() {
      this.state = "loading";
      try {
        const repos = [];
        for (let page = 1; page <= 3; page++) {
          const res = await fetch(
            `https://api.github.com/users/${encodeURIComponent(
              this.screenName
            )}/repos?per_page=100&type=owner&sort=pushed&page=${page}`
          );
          if (!res.ok) throw new Error(`github api: ${res.status}`);
          const batch = await res.json();
          repos.push(...batch);
          if (batch.length < 100) break;
        }
        this.candidates = repos
          .map((r) => ({ name: r.name, stars: r.stargazers_count, fork: r.fork }))
          .sort((a, b) => b.stars - a.stars);
        this.state = "loaded";
      } catch (e) {
        this.state = "error";
      }
    },
    async save(names) {
      this.saveState = "saving";
      this.saveError = "";
      try {
        const auth = getAuth();
        const currentUser = await resolveCurrentUser(auth);
        if (!currentUser) throw new Error("not logged in");
        const token = await currentUser.getIdToken();
        const res = await this.$axios.post(
          "pinnedReposGo",
          { github_id: this.githubId, repos: names },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.data.status !== "success") {
          throw new Error(res.data.message || "保存に失敗しました");
        }
        this.saveState = "idle";
        this.$emit("saved", res.data.pinned_repos || []);
      } catch (e) {
        this.saveState = "error";
        this.saveError =
          (e && e.message) || "保存に失敗しました。時間をおいて試してください。";
      }
    },
  },
};
</script>

<style scoped>
.repo-picker {
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed rgba(255, 255, 255, 0.2);
}
.picker-title {
  font-weight: 700;
}
.picker-sub {
  color: var(--color-text-muted, #9a9a9a);
  font-size: 0.82rem;
}
.picker-error {
  color: #ff8080;
  font-size: 0.85rem;
}

.candidates {
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.candidate {
  padding: 6px 10px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin: 0;
  font-size: 0.9rem;
}
.candidate:hover {
  background: rgba(255, 255, 255, 0.05);
}
.candidate.selected {
  background: rgba(255, 196, 120, 0.1);
}
.candidate-order {
  display: inline-block;
  min-width: 1.4em;
  text-align: center;
  background: rgba(255, 196, 120, 0.85);
  color: #2b211b;
  font-weight: 700;
  font-size: 0.75rem;
  border-radius: 999px;
}
.candidate-name {
  word-break: break-all;
}

.dots::after {
  content: "";
  animation: picker-dots 1.2s steps(4, end) infinite;
}
@keyframes picker-dots {
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
