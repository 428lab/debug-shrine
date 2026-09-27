<template>
  <div class="container py-3">
    <div class="mb-2"><nuxt-link to="/games">&lt; ミニゲーム一覧</nuxt-link></div>
    <TypoGame :site-url="$config.baseUrl" />
  </div>
</template>

<script>
import TypoGame from "@/components/TypoGame.vue";

// ミニゲーム: 誤字祓い(落ちてくる誤字の、間違っている文字をタップして、らぼみがお祓いで直す)。
// ログインしなくても遊べる。ハイスコアはこの端末にだけ保存する。
export default {
  components: { TypoGame },
  head() {
    return { title: "誤字祓い | でばっぐ神社" };
  },
};
</script>
