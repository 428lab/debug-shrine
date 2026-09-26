<template>
  <div class="container py-3">
    <div class="mb-2"><nuxt-link to="/games">&lt; ミニゲーム一覧</nuxt-link></div>
    <h1 class="h4 text-center mb-3">韋駝天 <small class="fs-6 opacity-75">いだてん</small></h1>
    <OstrichRun :site-url="$config.baseUrl" />
  </div>
</template>

<script>
import OstrichRun from "@/components/OstrichRun.vue";

// ミニゲーム「韋駝天」。ログインしなくても遊べる。ハイスコアはこの端末にだけ保存する。
export default {
  components: { OstrichRun },
  head() {
    return { title: "韋駝天 | でばっぐ神社" };
  },
};
</script>
