<template>
  <main class="container p-3">
    <h1 class="fs-1 mb-0">過去のランキング</h1>
    <p class="history-lead mt-2 mb-3">
      締め切った週・月の最終結果です。順位はもう変わりません。
    </p>

    <div class="ranking-seg mb-3" role="tablist">
      <button
        v-for="t in periodTypes"
        :key="t.key"
        type="button"
        class="seg-btn"
        :class="{ active: periodType === t.key }"
        @click="selectType(t.key)"
      >
        {{ t.label }}
      </button>
    </div>

    <div v-if="listState === 'loading'" class="p-3 text-start card-shrine">
      <div class="loading-inline">
        <span class="spinner-border" role="status" aria-hidden="true"></span>
        過去のランキングを読み込んでいます
      </div>
    </div>
    <div v-else-if="listState === 'error'" class="text-start">
      <span class="notice-danger">
        <i class="fas fa-fw fa-exclamation-triangle"></i>
        過去のランキングを読み込めませんでした。
      </span>
      <button class="btn btn-sm btn-outline-light mt-2" @click="fetchList">
        再読み込み
      </button>
    </div>
    <div v-else-if="periods.length === 0" class="p-3 text-start card-shrine">
      <div class="history-empty">
        まだ締め切った{{ periodTypeLabel }}がありません。最初の締めをお待ちください。
      </div>
    </div>

    <template v-else>
      <!-- 期間の選択。締め済みの期間だけが並ぶ(新しい順) -->
      <div class="period-list mb-3">
        <button
          v-for="p in periods"
          :key="p.period_key"
          type="button"
          class="period-btn"
          :class="{ active: p.period_key === selectedKey }"
          @click="selectPeriod(p.period_key)"
        >
          {{ p.label }}
        </button>
      </div>

      <div v-if="detailState === 'loading'" class="p-3 text-start card-shrine">
        <div class="loading-inline">
          <span class="spinner-border" role="status" aria-hidden="true"></span>
          結果を読み込んでいます
        </div>
      </div>
      <div v-else-if="detailState === 'error'" class="text-start">
        <span class="notice-danger">
          <i class="fas fa-fw fa-exclamation-triangle"></i>
          この期間の結果を読み込めませんでした。
        </span>
        <button class="btn btn-sm btn-outline-light mt-2" @click="fetchDetail">
          再読み込み
        </button>
      </div>
      <template v-else-if="detail">
        <div class="row">
          <div class="col-12 col-lg-6 mb-3">
            <ArchiveBoard
              title="せんとうりょく"
              note="期間中に伸びたせんとうりょく"
              unit="bp"
              :entries="detail.battle_top"
            />
          </div>
          <div class="col-12 col-lg-6 mb-3">
            <ArchiveBoard
              title="ぽいんと"
              note="期間中に獲得したぽいんと"
              unit="pt"
              :entries="detail.points_top"
            />
          </div>
        </div>
      </template>
    </template>

    <div class="mt-3">
      <nuxt-link to="/ranking">
        今のランキングへ <i class="fas fa-fw fa-chevron-right"></i>
      </nuxt-link>
    </div>
  </main>
</template>

<script>
import ArchiveBoard from "@/components/ArchiveBoard";

export default {
  components: { ArchiveBoard },
  data() {
    return {
      periodTypes: [
        { key: "week", label: "週間" },
        { key: "month", label: "月間" },
      ],
      periodType: "week",
      listState: "loading", // loading | loaded | error
      periods: [],
      selectedKey: "",
      detailState: "loading",
      detail: null,
      // 期間ごとの結果は変わらないので、一度取ったら使い回す。
      cache: {},
    };
  },
  computed: {
    periodTypeLabel() {
      const t = this.periodTypes.find((x) => x.key === this.periodType);
      return t ? t.label : "";
    },
    baseURL() {
      return this.$config.rankingBaseUrl || this.$config.apiUrl;
    },
  },
  async mounted() {
    await this.fetchList();
  },
  methods: {
    async selectType(key) {
      if (this.periodType === key) return;
      this.periodType = key;
      this.periods = [];
      this.selectedKey = "";
      this.detail = null;
      await this.fetchList();
    },
    async fetchList() {
      this.listState = "loading";
      try {
        const res = await this.$axios.get("/rankingArchiveGo", {
          baseURL: this.baseURL,
          params: { type: this.periodType },
        });
        this.periods = res.data.periods || [];
        this.listState = "loaded";
        if (this.periods.length > 0) {
          await this.selectPeriod(this.periods[0].period_key);
        }
      } catch (e) {
        this.listState = "error";
      }
    },
    async selectPeriod(key) {
      this.selectedKey = key;
      await this.fetchDetail();
    },
    async fetchDetail() {
      const cacheKey = this.periodType + "_" + this.selectedKey;
      if (this.cache[cacheKey]) {
        this.detail = this.cache[cacheKey];
        this.detailState = "loaded";
        return;
      }
      this.detailState = "loading";
      try {
        const res = await this.$axios.get("/rankingArchiveGo", {
          baseURL: this.baseURL,
          params: { type: this.periodType, period: this.selectedKey },
        });
        this.detail = res.data;
        this.cache[cacheKey] = res.data;
        this.detailState = "loaded";
      } catch (e) {
        this.detailState = "error";
      }
    },
  },
};
</script>

<style scoped>
.history-lead,
.history-empty {
  color: var(--color-text-muted, #9a9a9a);
  font-size: 0.9rem;
}

/* 指標・期間の切替はランキング本体と同じセグメント型に揃える */
.ranking-seg {
  display: inline-flex;
  border: 1px solid var(--color-surface-border);
  border-radius: 0.5rem;
  overflow: hidden;
  background-color: var(--color-surface);
}
.seg-btn {
  background: transparent;
  border: none;
  color: var(--color-text-muted, #9a9a9a);
  padding: 8px 18px;
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

/* 期間の一覧は数が増えるので折り返しのチップにする */
.period-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.period-btn {
  background: var(--color-surface);
  border: 1px solid var(--color-surface-border);
  border-radius: 0.5rem;
  color: var(--color-text-muted, #9a9a9a);
  padding: 6px 12px;
  font-size: 0.85rem;
}
.period-btn:hover {
  color: var(--color-text);
}
.period-btn.active {
  background: rgba(255, 196, 120, 0.15);
  border-color: rgba(255, 196, 120, 0.6);
  color: var(--color-text);
  font-weight: 700;
}
</style>
