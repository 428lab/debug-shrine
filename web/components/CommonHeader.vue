<template>
  <nav class="navbar navbar-expand-lg navbar-dark site-header">
    <div class="container">
      <nuxt-link class="navbar-brand" to="/"
        ><img
          src="/favicon512.png"
          height="32px"
          class="me-2"
        />でばっぐ神社</nuxt-link
      >
      <!-- 主機能の「参拝する」は常設。スマホではハンバーガーの外(ブランドの右)に出す -->
      <nuxt-link
        v-if="isLogin"
        to="/sanpai"
        class="btn btn-accent btn-sm ms-auto me-2 d-lg-none"
        >参拝する</nuxt-link
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
            <nuxt-link class="nav-link" to="/">ホーム</nuxt-link>
          </li>
          <li class="nav-item">
            <nuxt-link class="nav-link" to="/about">でばっぐ神社とは</nuxt-link>
          </li>
          <li class="nav-item">
            <nuxt-link class="nav-link" to="/ranking"
              >ランキング</nuxt-link
            >
          </li>
          <li class="nav-item">
            <nuxt-link class="nav-link" to="/games">ミニゲーム</nuxt-link>
          </li>
        </ul>
        <ul class="navbar-nav align-items-lg-center mb-2 mb-lg-0" v-if="isLogin">
          <li class="nav-item">
            <nuxt-link class="nav-link" to="/omikuji">{{
              omikujiLabel
            }}</nuxt-link>
          </li>
          <li class="nav-item">
            <nuxt-link class="nav-link" to="/dashboard">マイページ</nuxt-link>
          </li>
          <li class="nav-item">
            <button class="btn btn-ghost btn-sm my-1 ms-lg-2" @click="logout">
              ログアウト
            </button>
          </li>
          <li class="nav-item d-none d-lg-block ms-lg-2">
            <nuxt-link to="/sanpai" class="btn btn-accent btn-sm"
              >参拝する</nuxt-link
            >
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
    // 残り時間はページを開かなくても減っていく。30秒ごとに見直して、
    // 引けるようになったらリンクの文言を戻す。
    this.omikujiTimerId = setInterval(this.refreshOmikuji, 30 * 1000);
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
