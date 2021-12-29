<template>
  <div class="text-center">
    <div class="container py-5">
      <h1>参拝ありがとう！</h1>
      <h2>ポイントを獲得しました</h2>
      <h2>＋20 exp</h2>
      <p class="fs-5">LEVEL {{ 20 }}</p>
      <div class="progress">
        <div
          class="progress-bar p-2"
          role="progressbar"
          style="width: 30%"
          aria-valuenow="10"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          {{ 20 }}exp
        </div>
      </div>
      <p class="text-end w-100">NEXT 2234EXP</p>
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
  async asyncData({ $axios, store }) {
    console.log(store.getters['user']);
    let payload = {
      github_id: store.getters['user'].github_id,
    }
    response = await $axios.post("sanpai", payload);
    console.log(response);
    return {
      isLoading: true,
    };
  },
  mounted() {},
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
