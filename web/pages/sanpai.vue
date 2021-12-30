<template>
  <div class="text-center">
    <div class="container" v-if="status">
      <div class="p-5">
        <img
          src="/torii.svg"
          alt="でばっぐ神社"
          class="w-100"
          style="max-width: 700px"
        />
      </div>
      <div v-if="result === 'success'">
        <div class="fs-1">参拝ありがとう！</div>
        <div class="fs-4 mt-4">ポイントを獲得しました</div>
        <div class="fs-4">＋{{ status.exp.get }} exp</div>
      </div>
      <div v-else-if="result === 'expire'">
        <div class="fs-1">おっと、参拝のペースが早すぎるようです</div>
        <div class="fs-4 mt-4">追加のポイントはありませんでした</div>
      </div>
      <div v-else-if="result === 'noaction'">
        <div class="fs-1">新規のアクティビティがないようです</div>
        <div class="fs-4 mt-4">追加のポイントはありませんでした</div>
      </div>
      <div class="fs-5 mt-3">LEVEL {{ status.level }}</div>
      <div class="p-4">
        <div class="progress">
          <div
            class="progress-bar p-2"
            role="progressbar"
            :style="`width:` + (status.exp.total / status.exp.next) * 100 + `%`"
            :aria-valuenow="status.exp.total"
            aria-valuemin="0"
            :aria-valuemax="status.exp.next"
          >
            {{ status.exp.total }} exp
          </div>
        </div>
        <p class="text-end w-100 mt-2">NEXT：{{ status.exp.next }} exp</p>
      </div>
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
    <Loading v-if="isLoading"></Loading>
  </div>
</template>

<script>
import { mapGetters } from "vuex";

export default {
  middleware: ["auth"],
  data() {
    return {
      isLoading: true,
      isError: false,
      result: "",
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
    if (response) {
      this.status.level = response.data.level;
      this.status.exp.next = response.data.next_exp;
      this.status.exp.get = response.data.add_exp;
      this.status.exp.total = response.data.exp;
      this.result = response.data.status;
      this.isLoading = false;
    } else {
      this.isError = true;
      this.isLoading = false;
    }
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
