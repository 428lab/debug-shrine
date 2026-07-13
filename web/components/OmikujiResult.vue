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

      <!-- 物理乱数の出自(kudaで引いたときだけ表示) -->
      <div v-if="isPhysical" class="entropy">
        <div>⚛️ この御籤は量子ゆらぎと放射性崩壊(物理乱数)が決めました</div>
        <div class="entropy-batches">
          <span v-for="b in result.entropy.batches" :key="b" class="entropy-batch">{{
            b
          }}</span>
        </div>
      </div>
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
    // kuda(物理乱数)で引いた結果のみ true。導入前の保存結果には entropy が無い。
    isPhysical() {
      return (
        this.result.entropy &&
        this.result.entropy.source === "physical" &&
        Array.isArray(this.result.entropy.batches)
      );
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

/* 物理乱数の出自 */
.entropy {
  border-top: 1px dashed rgba(0, 0, 0, 0.12);
  margin: 0 16px;
  padding: 10px 0 14px;
  color: #8a7f74;
  font-size: 0.74rem;
  line-height: 1.5;
}
.entropy-batches {
  margin-top: 4px;
}
.entropy-batch {
  display: inline-block;
  font-family: SFMono-Regular, Consolas, Menlo, monospace;
  font-size: 0.68rem;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  padding: 1px 6px;
  margin-right: 4px;
  word-break: break-all;
}

/* レア度ごとの縁取り */
.t-chokichi { border-color: #ff5eab; }
.t-daikichi { border-color: #e0b400; }
.t-daikyo { border-color: #333; }

.reveal-enter-active { transition: opacity 0.5s ease, transform 0.5s ease; }
.reveal-enter { opacity: 0; transform: translateY(14px) scale(0.98); }
.reveal-enter-to { opacity: 1; transform: translateY(0) scale(1); }
</style>
