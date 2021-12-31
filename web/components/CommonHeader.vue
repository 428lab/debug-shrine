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
      <div class="d-flex nav-item" v-if="isLogin">
        <nuxt-link class="nav-link active" aria-current="page" to="/dashboard"
          >マイページ</nuxt-link
        >
      </div>
      <!-- <ul class="navbar-nav mb-2 mb-lg-0" v-if="isLogin">
        <li class="nav-item">
          <nuxt-link class="nav-link active" aria-current="page" to="/dashboard"
            >マイページ</nuxt-link
          >
        </li>
        <li class="nav-item">
          <button class="btn btn-secondary" @click="logout">ログアウト</button>
        </li>
      </ul> -->
    </div>
  </nav>
</template>

<script>
import { mapGetters } from "vuex";

export default {
  data() {
    return {};
  },
  mounted() {},
  methods: {
    logout() {
      this.$store.dispatch("logout");
    },
  },
  computed: {
    ...mapGetters(["isLogin"]),
  },
};
</script>
