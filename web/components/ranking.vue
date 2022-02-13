<template>
  <div>
    <div class="p-3 text-start bg-black rounded" v-if="isLogin">
      <div class="fs-5 mb-3">あなたの順位</div>
      <table v-if="getRanking.myRanking">
        <tr>
          <td>あなたの順位</td>
          <td>：</td>
          <td>{{ getRanking.myRanking.rank }} 位</td>
        </tr>
        <tr>
          <td>せんとうりょく</td>
          <td>：</td>
          <td>{{ getRanking.myRanking.battle_point }} bp</td>
        </tr>
      </table>
      <div class="" v-else>まだランキングに反映されていないようです</div>
    </div>
    <div class="text-start mt-3">
      <div class="card border-primary">
        <div class="card-header bg-primary">せんとうりょくランキング</div>
        <div class="list-group list-group-flush text-dark">
          <nuxt-link
            class="
              list-group-item list-group-item-action
              d-flex
              text-dark
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
    pagenation: false,
    max: 100,
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
    let response = await this.$axios.get("/ranking", { params: params });
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
.bg-black {
  background-color: #000000;
}
</style>