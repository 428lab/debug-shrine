<template>
  <div class="container py-3">
    <div class="mb-2"><nuxt-link to="/games">&lt; ミニゲーム一覧</nuxt-link></div>
    <RhythmGame :title="title" :site-url="$config.baseUrl" />
  </div>
</template>

<script>
import RhythmGame from "@/components/RhythmGame.vue";

// ミニゲーム: リズムゲーム(和のテイストのボカロ系の曲に合わせて、鈴・太鼓・柏手を叩く)。
// ログインしなくても遊べる。ハイスコアはこの端末にだけ保存する。
export default {
  components: { RhythmGame },
  data() {
    return { title: "神楽ビート" };
  },
  head() {
    return { title: `${this.title} | でばっぐ神社` };
  },
};
</script>
