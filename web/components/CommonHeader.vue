<template>
  <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
    <div class="container-fluid">
      <nuxt-link class="navbar-brand" to="/"
        ><img
          src="/favicon512.png"
          height="32px"
          class="me-2"
        />でばっぐ神社</nuxt-link
      >
      <button
        class="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#navbarSupportedContent"
        aria-controls="navbarSupportedContent"
        aria-expanded="false"
        aria-label="Toggle navigation"
      >
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarSupportedContent">
        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
          <li class="nav-item">
            <nuxt-link class="nav-link active" to="/">Home</nuxt-link>
          </li>
          <li class="nav-item">
            <nuxt-link class="nav-link active" to="/about">でばっぐ神社とは</nuxt-link>
          </li>
          <li class="nav-item">
            <nuxt-link class="nav-link active" to="/ranking"
              >ランキング</nuxt-link
            >
          </li>
          <!-- <li class="nav-item">
            <a class="nav-link" href="#">Link</a>
          </li> -->
        </ul>
        <ul class="navbar-nav mb-2 mb-lg-0" v-if="isLogin">
          <li class="nav-item">
            <nuxt-link class="nav-link active" to="/omikuji">{{
              omikujiLabel
            }}</nuxt-link>
          </li>
          <li class="nav-item">
            <nuxt-link
              class="nav-link active"
              aria-current="page"
              to="/dashboard"
              >マイページ</nuxt-link
            >
          </li>
          <li class="nav-item">
            <button class="btn btn-secondary" @click="logout">
              ログアウト
            </button>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<script>
import { mapGetters } from "vuex";
import { loadOmikujiRemaining } from "@/utils/omikujiCooldown";

export default {
  data() {
    return {
      // おみくじの残り秒(0なら引ける)。開く前に分かるようにリンクの文言へ出す。
      omikujiRemaining: 0,
      omikujiTimerId: null,
    };
  },
  mounted() {
    this.refreshOmikuji();
    // 残り時間はページを開かなくても減っていく。1分ごとに見直して、
    // 引けるようになったらリンクの文言を戻す。
    this.omikujiTimerId = setInterval(this.refreshOmikuji, 60 * 1000);
  },
  beforeDestroy() {
    if (this.omikujiTimerId) clearInterval(this.omikujiTimerId);
  },
  methods: {
    logout() {
      this.$store.dispatch("logout");
    },
    refreshOmikuji() {
      this.omikujiRemaining = loadOmikujiRemaining(
        this.user && this.user.github_id,
        Date.now()
      );
    },
  },
  computed: {
    ...mapGetters(["isLogin", "user"]),
    // 引けないと分かっているときは「前回のおみくじ」。押す前に、引けるのか
    // 前回の結果を見に行くだけなのかが分かる。
    omikujiLabel() {
      return this.omikujiRemaining > 0 ? "前回のおみくじ" : "おみくじ";
    },
  },
  watch: {
    // ログイン直後やアカウント切替でユーザーが変わったら取り直す
    // (キーに github_id が入っているため)。
    user() {
      this.refreshOmikuji();
    },
    // ページ遷移のたびに見直す(おみくじを引いた直後に文言が変わる)。
    $route() {
      this.refreshOmikuji();
    },
  },
};
</script>
