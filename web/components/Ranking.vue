<template>
  <div>
    <div v-if="showTabs" class="d-flex flex-wrap gap-2 mb-3">
      <div class="ranking-seg" role="tablist">
        <button
          type="button"
          class="seg-btn"
          :class="{ active: metric === 'battle' }"
          @click="metric = 'battle'"
        >
          <i class="fas fa-fw fa-fist-raised"></i> せんとうりょく
        </button>
        <button
          type="button"
          class="seg-btn"
          :class="{ active: metric === 'points' }"
          @click="metric = 'points'"
        >
          <i class="fas fa-fw fa-coins"></i> ぽいんと
        </button>
      </div>
      <div class="ranking-seg" role="tablist">
        <button
          v-for="p in periodOptions"
          :key="p.key"
          type="button"
          class="seg-btn"
          :class="{ active: period === p.key }"
          @click="period = p.key"
        >
          {{ p.label }}
        </button>
      </div>
    </div>

    <!-- 読み込み中。ここで空データを描くと「記録が無い」の赤い注記が一瞬出て
         しまうため、取得が終わるまでは何も判定しない -->
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
      <button class="btn btn-sm btn-ghost mt-2" @click="fetchRanking">
        再読み込み
      </button>
    </div>

    <template v-else>
    <!-- 期間の記録がまだ無いときは黙って空を出さず、トータルを見せる。
         見ているものが選択中のタブと違うので、赤字で目立たせる -->
    <div v-if="fellBack" class="notice-danger mb-3">
      <i class="fas fa-fw fa-exclamation-triangle"></i>
      まだ{{ periodLabel }}の記録が溜まっていないため、トータルを表示しています。
    </div>

    <!-- あなたの順位は 1 行で -->
    <div
      class="p-3 card-shrine d-flex flex-wrap gap-3 align-items-baseline"
      v-if="isLogin"
    >
      <span class="fw-bold">あなたの順位</span>
      <template v-if="myCurrentRanking">
        <span class="fs-5 num">{{ myCurrentRanking.rank }} 位</span>
        <span class="text-muted num">{{ myCurrentValue }} {{ unit }}</span>
      </template>
      <span v-else class="text-muted">まだランキングに反映されていないようです</span>
    </div>
    <div class="card card-shrine ranking-card mt-3">
      <div class="card-header ranking-header">
        {{ headerLabel }}
        <div v-if="headerNote" class="ranking-note">{{ headerNote }}</div>
      </div>
      <div>
        <nuxt-link
          class="rank-row"
          :class="{
            'is-top': item.rank <= 3,
            'is-me': user && item.screen_name === user.screen_name,
          }"
          v-for="item in rankingView"
          :key="item.screen_name"
          :to="`/u/` + item.screen_name"
        >
          <span class="rank-no">{{ item.rank }} 位</span>
          <img :src="item.image_path" class="rank-ava" alt="" />
          <span class="rank-name">{{ item.display_name }}</span>
          <span class="rank-val"
            >{{ itemValue(item) }}<small>{{ unit }}</small></span
          >
          <i class="fas fa-chevron-right rank-ch"></i>
        </nuxt-link>
        <div v-if="rankingView.length === 0" class="ranking-empty p-3">
          ランキング集計中です。しばらくお待ちください。
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<script>
import { mapGetters } from "vuex";

export default {
  props: {
    pagenation: { type: Boolean, default: false },
    max: { type: Number, default: 100 },
    // トップページのように幅が狭い場所ではタブを出さず、既定の組み合わせだけ
    // 見せる(6タブが並んで窮屈になるのを避ける)。
    showTabs: { type: Boolean, default: true },
    defaultMetric: { type: String, default: "battle" },
    defaultPeriod: { type: String, default: "week" },
  },
  data() {
    return {
      // battle = せんとうりょく / points = ぽいんと
      metric: this.defaultMetric,
      // total / week / month
      period: this.defaultPeriod,
      periodOptions: [
        { key: "total", label: "トータル" },
        { key: "week", label: "週間" },
        { key: "month", label: "月間" },
      ],
      state: "loading", // loading | loaded | error
      ranking: [],
      pointsRanking: [],
      myRanking: null,
      myPointRanking: null,
      // periods["battle_week"] = { ranking: [...], my_rank: {...} }
      periods: {},
      latestUpdate: null,
    };
  },
  async beforeMount() {
    await this.fetchRanking();
  },
  computed: {
    ...mapGetters(["isLogin", "user"]),
    isBattleMetric() {
      return this.metric === "battle";
    },
    metricLabel() {
      return this.isBattleMetric ? "せんとうりょく" : "ぽいんと";
    },
    unit() {
      return this.isBattleMetric ? "bp" : "pt";
    },
    periodLabel() {
      const found = this.periodOptions.find((p) => p.key === this.period);
      return found ? found.label : "";
    },
    totalRanking() {
      return this.isBattleMetric ? this.ranking : this.pointsRanking;
    },
    // 選択中の期間ランキング(トータル以外)。未集計なら空配列。
    selectedPeriodRanking() {
      if (this.period === "total") return this.totalRanking;
      const p = this.periods[this.metric + "_" + this.period];
      return (p && p.ranking) || [];
    },
    // 週間・月間を選んでいるのに記録がまだ無い状態。この間はトータルを見せる
    // (せんとうりょくの期間ランキングは基準値が溜まるまで空になるため)。
    fellBack() {
      return this.period !== "total" && this.selectedPeriodRanking.length === 0;
    },
    currentRanking() {
      return this.fellBack ? this.totalRanking : this.selectedPeriodRanking;
    },
    myCurrentRanking() {
      if (this.period === "total" || this.fellBack) {
        return this.isBattleMetric ? this.myRanking : this.myPointRanking;
      }
      const p = this.periods[this.metric + "_" + this.period];
      return (p && p.my_rank) || null;
    },
    myCurrentValue() {
      if (!this.myCurrentRanking) return "";
      return this.itemValue(this.myCurrentRanking);
    },
    headerLabel() {
      const prefix =
        this.period === "total" || this.fellBack ? "" : this.periodLabel;
      return prefix + this.metricLabel + "ランキング";
    },
    // せんとうりょくの期間ランキングは「伸びた分」なので、絶対値と誤解されない
    // ように注記する。
    headerNote() {
      if (this.fellBack || this.period === "total") return "";
      return this.isBattleMetric
        ? this.periodLabel + "で伸びたせんとうりょく"
        : this.periodLabel + "に獲得したぽいんと";
    },
    rankingView() {
      return this.currentRanking.slice(0, this.max);
    },
  },
  methods: {
    // Go版(rankingGo)はコールドスタートが短くランキング表示が速くなるため
    // 使用する(Node版のrankingとレスポンス形式は同一。docs/backend.md参照)。
    // 取得先は rankingBaseUrl(Hosting CDN オリジン)を優先し、ランキング
    // レスポンスをエッジでキャッシュさせて関数・Firestoreへの到達を減らす。
    // 未設定なら従来どおり apiUrl 経由(関数直叩き)にフォールバックする。
    // トータル・週間・月間の全ランキングを1レスポンスで受け取る(タブ切替は
    // 取得済みデータの表示切替のみで、再フェッチしない)。
    async fetchRanking() {
      this.state = "loading";
      try {
        const params = {};
        if (this.isLogin) {
          params.screen_name = this.user.screen_name;
        }
        const response = await this.$axios.get("/rankingGo", {
          baseURL: this.$config.rankingBaseUrl || this.$config.apiUrl,
          params: params,
        });
        this.ranking = response.data.ranking || [];
        this.pointsRanking = response.data.points_ranking || [];
        this.myRanking = response.data.my_rank;
        this.myPointRanking = response.data.my_point_rank;
        this.periods = response.data.periods || {};
        this.latestUpdate = response.data.latest_update;
        this.state = "loaded";
      } catch (e) {
        this.state = "error";
      }
    },
    // トータルは battle_point / point、期間ランキングは value を持つ。
    itemValue(item) {
      if (item.value !== undefined) return item.value;
      return this.isBattleMetric ? item.battle_point : item.point;
    },
  },
};
</script>

<style scoped>
/* 実績カード群と同じダークカードでランキングを組む
   (Bootstrapのcard/list-group既定は白背景のため暗色を明示する) */
.ranking-card {
  overflow: hidden;
}
.ranking-header {
  background-color: var(--color-surface-raised);
  color: var(--color-text);
  font-weight: 700;
  border-bottom: 1px solid var(--color-surface-border);
}
.ranking-note {
  color: var(--color-text-muted, #9a9a9a);
  font-size: 0.78rem;
  font-weight: 400;
}
.ranking-empty {
  color: var(--color-text-muted, #9a9a9a);
  font-size: 0.9rem;
}

/* 指標(せんとうりょく/ぽいんと)と期間(トータル/週間/月間)の切替。
   セグメント型。card-shrineと同じ角丸0.5rem・ボーダー・背景色で、
   周囲のカードUIと揃える */
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
</style>
