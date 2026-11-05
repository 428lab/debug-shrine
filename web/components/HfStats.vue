<template>
  <!-- Hugging Face の実績。公開プロフィールではひも付けた人だけ出す。
       マイページ(editable)では、ひも付けの入力欄も出す。 -->
  <div v-if="editable || (state === 'loaded' && data.linked)" class="hf-stats p-3 rounded">
    <div class="d-flex justify-content-between align-items-center flex-wrap mb-2">
      <h2 class="hf-title fs-6 mb-0"><span class="hf-logo" aria-hidden="true">🤗</span> Hugging Faceの実績</h2>
      <div v-if="state === 'loaded' && data.linked" class="hf-sub">
        <a :href="`https://huggingface.co/${data.hf_user}`" target="_blank" rel="noopener">@{{ data.hf_user }}</a>
        <span v-if="fetchedAtText"> · {{ fetchedAtText }}</span>
      </div>
    </div>

    <div v-if="state === 'loading'" class="hf-sub py-3">
      Hugging Faceの実績を集めています<span class="dots"></span>
    </div>
    <div v-else-if="state === 'error'" class="py-2">
      <span class="notice-danger"><i class="fas fa-fw fa-exclamation-triangle"></i> Hugging Faceの実績を読み込めませんでした。</span>
      <button class="btn btn-sm btn-outline-light mt-2" @click="fetchStats(true)">再読み込み</button>
    </div>

    <template v-else-if="data.linked && data.stats">
      <div class="tiles">
        <div class="tile">
          <div class="tile-value">{{ data.stats.models.toLocaleString() }}</div>
          <div class="tile-label">モデル</div>
        </div>
        <div class="tile">
          <div class="tile-value">{{ data.stats.datasets.toLocaleString() }}</div>
          <div class="tile-label">データセット</div>
        </div>
        <div class="tile">
          <div class="tile-value">{{ data.stats.spaces.toLocaleString() }}</div>
          <div class="tile-label">Space</div>
        </div>
        <div class="tile">
          <div class="tile-value"><i class="fas fa-heart"></i> {{ data.stats.likes_total.toLocaleString() }}</div>
          <div class="tile-label">いいね</div>
        </div>
        <div class="tile">
          <div class="tile-value"><i class="fas fa-download"></i> {{ shortNumber(data.stats.downloads_total) }}</div>
          <div class="tile-label">ダウンロード(累計)</div>
        </div>
      </div>

      <template v-if="data.stats.recent && data.stats.recent.length > 0">
        <div class="hf-sub mt-3 mb-1">最近更新したもの</div>
        <ul class="recent">
          <li v-for="r in data.stats.recent" :key="r.kind + r.id">
            <a :href="r.url" target="_blank" rel="noopener" class="recent-name">{{ r.id }}</a>
            <span class="kind">{{ kindLabel(r.kind) }}</span>
            <span class="hf-sub ms-auto">
              <span v-if="r.downloads > 0"><i class="fas fa-download"></i> {{ shortNumber(r.downloads) }}</span>
              <span v-if="r.likes > 0" class="ms-2"><i class="fas fa-heart"></i> {{ r.likes }}</span>
              <span class="ms-2">{{ dateText(r.last_modified) }}</span>
            </span>
          </li>
        </ul>
      </template>

      <div v-if="editable" class="mt-3">
        <button class="btn btn-sm btn-outline-light" :disabled="saving" @click="link('')">ひも付けを外す</button>
      </div>
    </template>

    <!-- マイページ: ひも付け -->
    <div v-else-if="editable" class="link-form">
      <p v-if="data.mismatch" class="notice-danger mb-2">
        <i class="fas fa-fw fa-exclamation-triangle"></i>
        @{{ data.hf_user }} のプロフィールの GitHub username が {{ screenName }} ではなくなったので、表示を止めています。
      </p>
      <p class="hf-sub mb-2">
        Hugging Face の
        <a href="https://huggingface.co/settings/profile" target="_blank" rel="noopener">Profile Settings</a>
        の「GitHub username」に <b>{{ screenName }}</b> を入れてから、Hugging Face のユーザー名を入力してください。
        GitHub の名前が一致したら、あなたのアカウントとしてひも付けます(ランキングには入りません)。
      </p>
      <form class="d-flex gap-2" @submit.prevent="link(hfUser)">
        <input v-model.trim="hfUser" class="form-control form-control-sm" placeholder="Hugging Face のユーザー名" autocomplete="off" autocapitalize="off" spellcheck="false" />
        <button class="btn btn-sm btn-light text-nowrap" type="submit" :disabled="saving || !hfUser">{{ saving ? "確認中" : "ひも付ける" }}</button>
      </form>
      <p v-if="saveError" class="notice-danger mt-2 mb-0">{{ saveError }}</p>
    </div>
  </div>
</template>

<script>
// データ源は hfStatsGo(Hugging Face の公開 API を Firestore に 6 時間キャッシュ)。
// ひも付けは hfStatsGo への POST。HF のプロフィールの GitHub 名と、ログイン中の
// GitHub アカウントが一致した時だけ認める(サーバー側で確かめる)。
import { getAuth, onAuthStateChanged } from "firebase/auth";

function resolveCurrentUser(auth) {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

const KIND_LABELS = { model: "モデル", dataset: "データセット", space: "Space" };

export default {
  props: {
    screenName: { type: String, required: true },
    // マイページでひも付けを編集する時だけ
    githubId: { type: String, default: "" },
    editable: { type: Boolean, default: false },
  },
  data() {
    return {
      state: "loading", // loading | loaded | error
      data: { linked: false },
      hfUser: "",
      saving: false,
      saveError: "",
    };
  },
  computed: {
    fetchedAtText() {
      if (!this.data.fetched_at) return "";
      const d = new Date(this.data.fetched_at);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")} 時点`;
    },
  },
  async mounted() {
    await this.fetchStats(this.editable);
  },
  methods: {
    kindLabel(kind) {
      return KIND_LABELS[kind] || kind;
    },
    shortNumber(n) {
      if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
      if (n >= 1e4) return (n / 1e3).toFixed(0) + "k";
      return n.toLocaleString();
    },
    dateText(iso) {
      if (!iso) return "";
      const d = new Date(iso);
      return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    },
    // bustCache: マイページでは CDN の古い応答を掴まないように取り直す
    async fetchStats(bustCache) {
      this.state = "loading";
      try {
        const params = { user: this.screenName };
        if (bustCache) params._ = Date.now();
        const res = await this.$axios.get("/hfStatsGo", {
          baseURL: this.$config.rankingBaseUrl || this.$config.apiUrl,
          params,
        });
        this.data = res.data || { linked: false };
        if (this.data.hf_user && !this.hfUser) this.hfUser = this.data.hf_user;
        this.state = "loaded";
      } catch (e) {
        this.state = "error";
      }
    },
    // hfUser が空ならひも付けを外す
    async link(hfUser) {
      this.saving = true;
      this.saveError = "";
      try {
        const currentUser = await resolveCurrentUser(getAuth());
        if (!currentUser) throw new Error("ログインし直してください");
        const token = await currentUser.getIdToken();
        const res = await this.$axios.post(
          "hfStatsGo",
          { github_id: this.githubId, hf_user: hfUser },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.data.status !== "success") throw new Error(res.data.message || "ひも付けられませんでした");
        if (hfUser) {
          this.data = res.data.result;
        } else {
          this.data = { linked: false };
          this.hfUser = "";
        }
      } catch (e) {
        this.saveError = (e && e.message) || "ひも付けられませんでした。時間をおいて試してください。";
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<style scoped>
.hf-stats {
  background: var(--color-surface);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.hf-title {
  font-weight: 700;
}
.hf-logo {
  margin-right: 2px;
}
.hf-sub {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.hf-sub a,
.link-form a {
  color: inherit;
  text-decoration: underline;
}
/* 数値タイル(GitHubの実績と同じ見た目) */
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px;
}
.tile {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 10px 12px;
  text-align: center;
}
.tile-value {
  font-size: 1.4rem;
  font-weight: 800;
  line-height: 1.2;
}
.tile-label {
  color: var(--color-text-muted);
  font-size: 0.8rem;
  margin-top: 2px;
}
.recent {
  list-style: none;
  padding: 0;
  margin: 0;
}
.recent li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 8px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.recent-name {
  color: var(--color-text);
  font-weight: 600;
  word-break: break-all;
}
.kind {
  font-size: 0.72rem;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(255, 210, 30, 0.15);
  color: #ffd21e;
}
.dots::after {
  content: "";
  animation: hf-dots 1.2s steps(4) infinite;
}
@keyframes hf-dots {
  0% {
    content: "";
  }
  25% {
    content: ".";
  }
  50% {
    content: "..";
  }
  75% {
    content: "...";
  }
}
</style>
