<template>
  <transition name="reveal">
    <div class="omikuji-paper mx-auto" :class="'t-' + meta.key" :key="result.id">
      <div class="paper-top" :style="{ background: meta.accent }">
        <div class="tier-emoji">{{ meta.emoji }}</div>
        <div class="tier-name">{{ result.tier }}</div>
      </div>

      <div class="fortune">「{{ result.fortune }}」</div>

      <ul class="lines">
        <li v-for="(l, i) in result.lines" :key="i">
          <span class="cat" :style="{ background: meta.accent }">{{ l.category }}</span>
          <span class="txt">{{ l.text }}</span>
        </li>
      </ul>
    </div>
  </transition>
</template>

<script>
const META = {
  超吉: { key: "chokichi", emoji: "🌟", accent: "linear-gradient(90deg,#ff8a3c,#ff3ca0,#8a3cff)" },
  大吉: { key: "daikichi", emoji: "🎉", accent: "#e0a800" },
  中吉: { key: "chukichi", emoji: "😊", accent: "#d97a1e" },
  小吉: { key: "shokichi", emoji: "🙂", accent: "#3f9e5a" },
  末吉: { key: "suekichi", emoji: "😌", accent: "#5f86a0" },
  凶: { key: "kyo", emoji: "😰", accent: "#6b6b6b" },
  大凶: { key: "daikyo", emoji: "💀", accent: "#333" },
};

export default {
  props: {
    result: { type: Object, required: true },
  },
  computed: {
    meta() {
      return META[this.result.tier] || { key: "chukichi", emoji: "🔮", accent: "#888" };
    },
  },
};
</script>

<style scoped>
.omikuji-paper {
  max-width: 400px;
  border-radius: 14px;
  overflow: hidden;
  background: #fdfaf3;
  color: #3a2f28; /* 濃色。全体白文字(common.css)に負けないよう明示 */
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(0, 0, 0, 0.08);
  text-align: left;
}

/* レア度ヘッダー */
.paper-top {
  padding: 16px 12px 14px;
  text-align: center;
  color: #fff;
}
.tier-emoji {
  font-size: 2rem;
  line-height: 1;
}
.tier-name {
  font-size: 2.2rem;
  font-weight: 900;
  letter-spacing: 0.14em;
  margin-top: 4px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
}

/* お告げ(総合運の一言) */
.fortune {
  color: #2b211b;
  font-weight: 800;
  font-size: 1.15rem;
  line-height: 1.6;
  text-align: center;
  padding: 18px 18px 8px;
}

/* 項目ごとの文章 */
.lines {
  list-style: none;
  margin: 0;
  padding: 6px 16px 20px;
}
.lines li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px dashed rgba(0, 0, 0, 0.12);
}
.lines .cat {
  flex: 0 0 auto;
  min-width: 3.6em;
  text-align: center;
  color: #fff;
  font-weight: 700;
  font-size: 0.8rem;
  padding: 3px 8px;
  border-radius: 999px;
  margin-top: 2px;
}
.lines .txt {
  color: #3a2f28;
  font-size: 0.98rem;
  line-height: 1.55;
}

/* レア度ごとの縁取り */
.t-chokichi { border-color: #ff5eab; }
.t-daikichi { border-color: #e0b400; }
.t-daikyo { border-color: #333; }

.reveal-enter-active { transition: opacity 0.5s ease, transform 0.5s ease; }
.reveal-enter { opacity: 0; transform: translateY(14px) scale(0.98); }
.reveal-enter-to { opacity: 1; transform: translateY(0) scale(1); }
</style>
