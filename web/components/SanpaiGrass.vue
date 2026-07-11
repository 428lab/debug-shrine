<template>
  <div class="sanpai-grass p-3 rounded">
    <div class="d-flex justify-content-between align-items-center flex-wrap mb-2">
      <h2 class="grass-title fs-6 mb-0">⛩️ 参拝の草</h2>
      <div v-if="state === 'loaded'" class="grass-sub">
        直近1年: {{ recent.totalCount }}回参拝
      </div>
    </div>

    <!-- 直近1年 -->
    <div v-if="state === 'loading'" class="grass-sub py-3">
      草を数えています<span class="dots"></span>
    </div>
    <div v-else-if="state === 'error'" class="py-2">
      <span class="grass-sub">参拝履歴を読み込めませんでした。</span>
      <button class="btn btn-sm btn-outline-light ms-2" @click="fetchRecent">
        再読み込み
      </button>
    </div>
    <template v-else>
      <GrassGrid
        :since="recent.since"
        :until="recent.until"
        :days="recent.days"
      />
      <div class="d-flex justify-content-end align-items-center mt-1 legend">
        <span class="grass-sub me-1">少</span>
        <span v-for="lv in [0, 1, 2, 3, 4]" :key="lv" class="legend-cell" :class="'lv-' + lv"></span>
        <span class="grass-sub ms-1">多</span>
      </div>

      <!-- 全期間(明示的な解析ボタンでのみ取得。5年分の読み取りが走るため) -->
      <div class="mt-3">
        <button
          v-if="allState === 'idle'"
          class="btn btn-sm btn-outline-light"
          @click="loadAll"
        >
          📜 全期間を解析する
        </button>
        <div v-else-if="allState === 'loading'" class="grass-sub py-2">
          全期間の参拝を解析しています<span class="dots"></span>
        </div>
        <div v-else-if="allState === 'error'" class="py-2">
          <span class="grass-sub">全期間の解析に失敗しました。</span>
          <button class="btn btn-sm btn-outline-light ms-2" @click="loadAll">
            もう一度
          </button>
        </div>
        <template v-else>
          <div class="all-summary rounded p-2 mb-3">
            <span class="me-3">初参拝: <strong>{{ all.firstSanpai || "-" }}</strong></span>
            <span class="me-3">累計参拝: <strong>{{ all.totalCount }}回</strong></span>
            <span>累計獲得: <strong>{{ all.totalPoints.toLocaleString() }}pt</strong></span>
          </div>
          <div v-if="allYears.length === 0" class="grass-sub">
            まだ参拝の記録がありません。
          </div>
          <div v-for="y in allYears" :key="y.year" class="mb-3">
            <div class="grass-sub mb-1">
              {{ y.year }}年 <span class="ms-2">{{ y.count }}回参拝</span>
            </div>
            <GrassGrid :since="y.since" :until="y.until" :days="y.days" />
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<script>
// 参拝履歴のヒートマップ(草)。sanpaiHistoryGo から日別集計を取得して表示する。
// デフォルトは直近1年、「全期間を解析する」ボタンで初参拝まで遡って年別に出す。
import GrassGrid from "@/components/GrassGrid";
const { splitYearRanges } = require("@/utils/sanpaiGrass");

export default {
  components: { GrassGrid },
  props: {
    screenName: { type: String, required: true },
  },
  data() {
    return {
      state: "loading", // loading | loaded | error
      recent: { days: [], totalCount: 0, since: "", until: "" },
      allState: "idle", // idle | loading | loaded | error
      all: { firstSanpai: "", totalCount: 0, totalPoints: 0 },
      allYears: [], // [{year, since, until, days, count}]
    };
  },
  async mounted() {
    await this.fetchRecent();
  },
  methods: {
    // 取得先は rankingGo と同じく Hosting CDN オリジン(rankingBaseUrl)を優先し、
    // 公開データをエッジでキャッシュさせる。未設定なら関数直叩きにフォールバック。
    async fetchHistory(params) {
      const res = await this.$axios.get("/sanpaiHistoryGo", {
        baseURL: this.$config.rankingBaseUrl || this.$config.apiUrl,
        params: params,
      });
      return res.data;
    },
    async fetchRecent() {
      this.state = "loading";
      try {
        const d = await this.fetchHistory({ user: this.screenName });
        this.recent = {
          days: d.days || [],
          totalCount: d.total_count || 0,
          since: d.since,
          until: d.until,
        };
        this.state = "loaded";
      } catch (e) {
        this.state = "error";
      }
    },
    async loadAll() {
      this.allState = "loading";
      try {
        const d = await this.fetchHistory({ user: this.screenName, all: 1 });
        const days = d.days || [];
        this.all = {
          firstSanpai: d.first_sanpai || "",
          totalCount: d.total_count || 0,
          totalPoints: d.total_points || 0,
        };
        if (days.length > 0) {
          this.allYears = splitYearRanges(d.first_sanpai || d.since, d.until).map(
            (range) => {
              const prefix = range.year + "-";
              const yearDays = days.filter((day) => day.date.indexOf(prefix) === 0);
              return {
                year: range.year,
                since: range.since,
                until: range.until,
                days: yearDays,
                count: yearDays.reduce((sum, day) => sum + day.count, 0),
              };
            }
          );
        } else {
          this.allYears = [];
        }
        this.allState = "loaded";
      } catch (e) {
        this.allState = "error";
      }
    },
  },
};
</script>

<style scoped>
.sanpai-grass {
  background: var(--color-surface);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.grass-title {
  font-weight: 700;
}
.grass-sub {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.all-summary {
  background: rgba(255, 255, 255, 0.05);
  font-size: 0.9rem;
}

/* 凡例(GrassGridのセルと同じ配色) */
.legend-cell {
  width: 11px;
  height: 11px;
  border-radius: 2px;
  margin: 0 1.5px;
  display: inline-block;
}
.legend-cell.lv-0 {
  background: #1b2028;
  outline: 1px solid rgba(255, 255, 255, 0.05);
  outline-offset: -1px;
}
.legend-cell.lv-1 {
  background: #0e4429;
}
.legend-cell.lv-2 {
  background: #006d32;
}
.legend-cell.lv-3 {
  background: #26a641;
}
.legend-cell.lv-4 {
  background: #39d353;
}

/* 読み込み中の「...」 */
.dots::after {
  content: "";
  animation: grass-dots 1.2s steps(4, end) infinite;
}
@keyframes grass-dots {
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
