<template>
  <div class="text-center">
    <div class="container py-5" v-if="status">
      <h1>参拝ありがとう！</h1>
      <h2>ポイントを獲得しました</h2>
      <h2>＋{{ status.exp.get }} exp</h2>
      <p class="fs-5">LEVEL {{ status.level }}</p>
      <div class="progress">
        <div
          class="progress-bar p-2"
          role="progressbar"
          :style="`width:` + (status.exp.total / status.exp.next) * 100 + `%`"
          :aria-valuenow="status.exp.total"
          aria-valuemin="0"
          :aria-valuemax="status.exp.next"
        >
          {{ status.exp.total }}exp
        </div>
      </div>
      <p class="text-end w-100">NEXT {{ status.exp.next }}exp</p>
    </div>
    <!-- <button class="btn btn-lg btn-primary" @click="sanpai">
      マイページを見る
    </button> -->
    <nuxt-link class="btn btn-lg btn-primary" to="/dashboard">
      マイページを見る
    </nuxt-link>
    <!-- <div id="testLabel">Testing</div>
    <div id="drawhere"></div> -->
    <!-- debug:{{ JSON.stringify(debug) }} -->
  </div>
</template>

<script>
import { mapGetters } from "vuex";

export default {
  data() {
    return {
      isLoading: true,
      status: {
        level: 0,
        exp: {
          next: 0,
          get: 0,
          total: 0,
        },
      },
    };
  },
  async mounted() {
    let payload = {
      github_id: this.user.github_id,
    };
    let response = await this.$axios.post("sanpai", payload);
    this.status.level = response.data.level;
    this.status.exp.next = response.data.next_exp;
    this.status.exp.get = response.data.add_exp;
    this.status.exp.total = response.data.exp;
    this.isLoading = false;
  },
  methods: {
    sanpai() {
      this.$router.push("/result/" + "0123456789");
    },
  },
  computed: {
    ...mapGetters(["user"]),
  },
};
</script>
