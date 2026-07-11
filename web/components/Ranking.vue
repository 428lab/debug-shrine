<template>
  <div>
    <div class="p-3 text-start card-shrine" v-if="isLogin">
      <div class="fs-5 mb-3">あなたの順位</div>
      <table v-if="myRanking">
        <tr>
          <td>あなたの順位</td>
          <td>：</td>
          <td>{{ myRanking.rank }} 位</td>
        </tr>
        <tr>
          <td>せんとうりょく</td>
          <td>：</td>
          <td>{{ myRanking.battle_point }} bp</td>
        </tr>
      </table>
      <div class="" v-else>まだランキングに反映されていないようです</div>
    </div>
    <div class="text-start mt-3">
      <div class="card card-shrine ranking-card">
        <div class="card-header ranking-header">せんとうりょくランキング</div>
        <div class="list-group list-group-flush">
          <nuxt-link
            class="
              list-group-item list-group-item-action
              d-flex
              align-items-center
            "
            v-for="item in rankingView"
            :key="item.id"
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
            <div class="me-2">{{ item.battle_point }} bp</div>
            <div><i class="fas fa-fw fa-chevron-right"></i></div>
          </nuxt-link>
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
      ranking: [],
      myRanking: {},
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
    let response = await this.$axios.get("/rankingGo", {
      baseURL: this.$config.rankingBaseUrl || this.$config.apiUrl,
      params: params,
    });
    this.ranking = response.data.ranking;
    this.myRanking = response.data.my_rank;
    this.latestUpdate = response.data.latest_update;
  },
  computed: {
    ...mapGetters(["isLogin", "user"]),
    rankingView() {
      return this.ranking.slice(0, this.max);
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
</style>