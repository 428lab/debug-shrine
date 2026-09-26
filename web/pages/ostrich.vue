<template>
  <div class="container py-3">
    <h1 class="h4 text-center mb-3">ダチョウ走</h1>
    <OstrichRun :site-url="$config.baseUrl" />
  </div>
</template>

<script>
import OstrichRun from "@/components/OstrichRun.vue";

// ミニゲーム「ダチョウ走」。ログインしなくても遊べる。ハイスコアはこの端末にだけ保存する。
export default {
  components: { OstrichRun },
  head() {
    return { title: "ダチョウ走 | でばっぐ神社" };
  },
};
</script>
