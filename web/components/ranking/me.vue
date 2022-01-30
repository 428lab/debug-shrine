<template>
  <div class="my-4 p-3 text-start your-ranking rounded" v-if="isLogin">
    <table>
      <tr>
        <td>あなたの順位</td>
        <td>：</td>
        <td>{{ getMyRanking.rank }} 位</td>
      </tr>
      <tr>
        <td>せんとうりょく</td>
        <td>：</td>
        <td>{{ getMyRanking.battle_point }} bp</td>
      </tr>
    </table>
  </div>
</template>

<script>
import { mapGetters } from "vuex";

export default {
  async beforeMount() {
    if(this.isLogin){
      let ranking = await this.$axios.get("/my_ranking?screen_name=" + this.user.screen_name);
      this.$store.commit("setMyRanking", ranking.data);
    }
  },
  computed: {
    ...mapGetters(["isLogin", "user", "getMyRanking"]),
  },
};
</script>

<style scoped>
.your-ranking {
  background-color: #000000;
}
</style>
