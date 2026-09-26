<template>
  <div class="container py-3">
    <h1 class="h4 text-center mb-3">ミニゲーム</h1>
    <div class="games">
      <nuxt-link v-for="g in games" :key="g.path" :to="g.path" class="game-card">
        <div class="game-name">{{ g.name }}</div>
        <div class="game-desc">{{ g.desc }}</div>
      </nuxt-link>
    </div>
  </div>
</template>

<script>
// ミニゲームの一覧。ゲームを増やしたら games に足す(ページは pages/games/<id>.vue)。
// ログインしなくても遊べる。
export default {
  data() {
    return {
      games: [
        {
          path: "/games/ostrich",
          name: "ダチョウ走",
          desc: "走って跳んで羽ばたいて、鳥居をくぐれ。どこまで走れる？",
        },
      ],
    };
  },
  head() {
    return { title: "ミニゲーム | でばっぐ神社" };
  },
};
</script>

<style scoped>
.games {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  max-width: 760px;
  margin: 0 auto;
}
.game-card {
  display: block;
  padding: 16px;
  border-radius: 12px;
  background: #fff8e1;
  border: 3px solid #b8412c;
  color: #3a2a20;
  text-decoration: none;
}
.game-card:hover {
  background: #fff3cf;
}
.game-name {
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-weight: 800;
  font-size: 1.3rem;
  color: #b8412c;
}
.game-desc {
  margin-top: 4px;
  font-size: 0.9rem;
}
</style>
