<template>
  <transition name="reveal">
    <div class="result-card mx-auto" :class="tierClass" :key="result.id">
      <div class="tier-badge">{{ result.tier }}</div>
      <div class="fortune fs-4 my-3">{{ result.fortune }}</div>
      <table class="lines mx-auto">
        <tr v-for="(l, i) in result.lines" :key="i">
          <th class="cat">{{ l.category }}</th>
          <td class="txt">{{ l.text }}</td>
        </tr>
      </table>
    </div>
  </transition>
</template>

<script>
export default {
  props: {
    result: { type: Object, required: true },
  },
  computed: {
    tierClass() {
      const map = {
        超吉: "t-chokichi",
        大吉: "t-daikichi",
        中吉: "t-chukichi",
        小吉: "t-shokichi",
        末吉: "t-suekichi",
        凶: "t-kyo",
        大凶: "t-daikyo",
      };
      return (this.result && map[this.result.tier]) || "";
    },
  },
};
</script>

<style scoped>
.result-card {
  max-width: 480px;
  border-radius: 14px;
  padding: 1.5rem 1.25rem;
  border: 2px solid #ddd;
  background: #fff;
}
.tier-badge {
  display: inline-block;
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  padding: 0.1em 0.6em;
  border-radius: 8px;
  color: #fff;
  background: #6b6b6b;
}
.fortune {
  font-weight: 700;
}
.lines {
  border-collapse: collapse;
}
.lines th,
.lines td {
  padding: 6px 10px;
  vertical-align: top;
  text-align: left;
  border-top: 1px solid #eee;
}
.lines .cat {
  white-space: nowrap;
  color: #888;
  font-weight: 600;
  font-size: 0.9rem;
}

/* レア度ごとの配色 */
.t-chokichi {
  border-color: #ff5eab;
  background: linear-gradient(180deg, #fff, #ffeaf5);
}
.t-chokichi .tier-badge {
  background: linear-gradient(90deg, #ff8a3c, #ff3ca0, #8a3cff);
}
.t-daikichi {
  border-color: #e0b400;
  background: linear-gradient(180deg, #fff, #fff8e0);
}
.t-daikichi .tier-badge {
  background: #e0a800;
}
.t-chukichi .tier-badge {
  background: #d17a00;
}
.t-shokichi .tier-badge {
  background: #4a9e5a;
}
.t-suekichi .tier-badge {
  background: #6b8ea3;
}
.t-kyo {
  border-color: #9a9a9a;
}
.t-kyo .tier-badge {
  background: #6b6b6b;
}
.t-daikyo {
  border-color: #444;
  background: linear-gradient(180deg, #fff, #efeaea);
}
.t-daikyo .tier-badge {
  background: #333;
}

.reveal-enter-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}
.reveal-enter {
  opacity: 0;
  transform: translateY(14px) scale(0.98);
}
.reveal-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}
</style>
