<template>
  <div>
    <div class="ranking-tabs d-flex mb-3" role="tablist">
      <button
        type="button"
        class="ranking-tab"
        :class="{ active: mode === 'battle' }"
        @click="mode = 'battle'"
      >
        ⚔️ せんとうりょく
      </button>
      <button
        type="button"
        class="ranking-tab"
        :class="{ active: mode === 'points' }"
        @click="mode = 'points'"
      >
        🪙 ぽいんと
      </button>
    </div>
    <div class="p-3 text-start card-shrine" v-if="isLogin">
      <div class="fs-5 mb-3">あなたの順位</div>
      <table v-if="myCurrentRanking">
        <tr>
          <td>あなたの順位</td>
          <td>：</td>
          <td>{{ myCurrentRanking.rank }} 位</td>
        </tr>
        <tr>
          <td>{{ metricLabel }}</td>
          <td>：</td>
          <td>{{ myCurrentValue }} {{ unit }}</td>
        </tr>
      </table>
      <div class="" v-else>まだランキングに反映されていないようです</div>
    </div>
    <div class="text-start mt-3">
      <div class="card card-shrine ranking-card">
        <div class="card-header ranking-header">{{ metricLabel }}ランキング</div>
        <div class="list-group list-group-flush">
          <nuxt-link
            class="
              list-group-item list-group-item-action
              d-flex
              align-items-center
            "
            v-for="item in rankingView"
            :key="item.screen_name"
            :to="`/u/` + item.screen_name"
          >
            <div class="me-3">{{ item.rank }} 位</div>
            <div class="me-2">
              <img
                :src="item.image_path"
                class="rounded-icon"
                height="30px"
                alt=""
              />
            </div>
            <div class="flex-fill me-2">{{ item.display_name }}</div>
            <div class="me-2">{{ itemValue(item) }} {{ unit }}</div>
            <div><i class="fas fa-fw fa-chevron-right"></i></div>
          </nuxt-link>
          <div
            v-if="rankingView.length === 0"
            class="list-group-item ranking-empty"
          >
            ランキング集計中です。しばらくお待ちください。
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapGetters } from "vuex";

export default {
  props: {
    pagenation: { type: Boolean, default: false },
    max: { type: Number, default: 100 },
  },
  data() {
    return {
      // battle = せんとうりょく(battle_point) / points = ぽいんと(exp)
      mode: "battle",
      ranking: [],
      pointsRanking: [],
      myRanking: {},
      myPointRanking: null,
      latestUpdate: null,
    }
  },
  async beforeMount() {
    let params = {};
    if (this.isLogin) {
      params.screen_name = this.user.screen_name;
    }
    // Go版(rankingGo)はコールドスタートが短くランキング表示が速くなるため
    // 使用する(Node版のrankingとレスポンス形式は同一。docs/backend.md参照)。
    // 取得先は rankingBaseUrl(Hosting CDN オリジン)を優先し、ランキング
    // レスポンスをエッジでキャッシュさせて関数・Firestoreへの到達を減らす。
    // 未設定なら従来どおり apiUrl 経由(関数直叩き)にフォールバックする。
    // 戦闘力・ぽいんとの両ランキングを1レスポンスで受け取る(タブ切替は
    // 取得済みデータの表示切替のみで、再フェッチしない)。
    let response = await this.$axios.get("/rankingGo", {
      baseURL: this.$config.rankingBaseUrl || this.$config.apiUrl,
      params: params,
    });
    this.ranking = response.data.ranking;
    this.pointsRanking = response.data.points_ranking || [];
    this.myRanking = response.data.my_rank;
    this.myPointRanking = response.data.my_point_rank;
    this.latestUpdate = response.data.latest_update;
  },
  computed: {
    ...mapGetters(["isLogin", "user"]),
    isBattleMode() {
      return this.mode === "battle";
    },
    metricLabel() {
      return this.isBattleMode ? "せんとうりょく" : "ぽいんと";
    },
    unit() {
      return this.isBattleMode ? "bp" : "pt";
    },
    currentRanking() {
      return this.isBattleMode ? this.ranking : this.pointsRanking;
    },
    myCurrentRanking() {
      return this.isBattleMode ? this.myRanking : this.myPointRanking;
    },
    myCurrentValue() {
      if (!this.myCurrentRanking) return "";
      return this.isBattleMode
        ? this.myCurrentRanking.battle_point
        : this.myCurrentRanking.point;
    },
    rankingView() {
      return this.currentRanking.slice(0, this.max);
    },
  },
  methods: {
    itemValue(item) {
      return this.isBattleMode ? item.battle_point : item.point;
    },
  },
};
</script>

<style scoped>
/* 実績カード群と同じダークカードでランキングを組む
   (Bootstrapのcard/list-group既定は白背景のため暗色を明示する) */
.ranking-header {
  background-color: rgba(255, 255, 255, 0.04);
  color: var(--color-text);
  font-weight: 700;
  border-bottom: 1px solid var(--color-surface-border);
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
.ranking-empty {
  color: var(--color-text-muted, #9a9a9a);
  font-size: 0.9rem;
}

/* せんとうりょく/ぽいんと切替タブ(ピル型。ダークカードに馴染む配色) */
.ranking-tabs {
  gap: 8px;
}
.ranking-tab {
  background: transparent;
  border: 1px solid var(--color-surface-border);
  color: var(--color-text-muted, #9a9a9a);
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 0.9rem;
  transition: background-color 0.15s, color 0.15s;
}
.ranking-tab:hover {
  color: var(--color-text);
}
.ranking-tab.active {
  background: rgba(255, 196, 120, 0.15);
  border-color: rgba(255, 196, 120, 0.6);
  color: var(--color-text);
  font-weight: 700;
}
</style>
