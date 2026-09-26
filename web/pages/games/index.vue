<template>
  <div class="container py-3">
    <h1 class="h4 text-center mb-3">ミニゲーム</h1>
    <div class="games">
      <nuxt-link v-for="g in games" :key="g.path" :to="g.path" class="game-card">
        <img :src="g.icon" alt="" class="game-icon" width="72" height="72" />
        <div class="game-text">
          <div class="game-name">
            {{ g.name }}<span v-if="g.kana" class="game-kana">{{ g.kana }}</span>
          </div>
          <div class="game-desc">{{ g.desc }}</div>
        </div>
      </nuxt-link>
    </div>
  </div>
</template>

<script>
// ミニゲームの一覧。ゲームを増やしたら games に足す(ページは pages/games/<id>.vue、
// アイコンは static/games/<id>.svg)。
// ログインしなくても遊べる。
export default {
  data() {
    return {
      games: [
        {
          path: "/games/ostrich",
          icon: "/games/ostrich.svg",
          name: "韋駝天",
          kana: "いだてん",
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
  display: flex;
  gap: 14px;
  align-items: center;
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
.game-icon {
  flex: none;
  width: 72px;
  height: 72px;
  border-radius: 16px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}
.game-text {
  min-width: 0;
}
.game-name {
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-weight: 800;
  font-size: 1.3rem;
  color: #b8412c;
}
.game-kana {
  margin-left: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #5a3f28;
}
.game-desc {
  margin-top: 4px;
  font-size: 0.9rem;
}
</style>
