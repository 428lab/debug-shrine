<template>
  <div class="text-start">
    <div class="card border-primary">
      <div class="card-header bg-primary">せんとうりょくランキング</div>
      <div class="list-group list-group-flush text-dark">
        <nuxt-link
          class="list-group-item d-flex text-dark"
          v-for="item in rankingView"
          :key="item.id"
          :to="`/u/` + item.screen_name"
        >
          <div class="me-3">{{ item.rank }} 位</div>
          <div class="flex-fill me-3">{{ item.display_name }}</div>
          <div class="me-3">{{ item.battle_point }} bp</div>
          <div><i class="fas fa-fw fa-chevron-right"></i></div>
        </nuxt-link>
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
  async beforeMount() {
    let ranking = await this.$axios.get("/ranking");
    this.$store.commit("setRanking", ranking.data);
  },
  computed: {
    ...mapGetters(["getRanking", "getMyRanking"]),
    rankingView() {
      return this.getRanking.slice(0, this.max);
    },
  },
};
</script>
