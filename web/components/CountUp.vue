<template>
  <span>{{ prefix }}{{ displayText }}{{ suffix }}</span>
</template>

<script>
// 数値を from から value までアニメーションで増加表示する汎用コンポーネント。
// 参拝結果のポイント・戦闘力など、複数箇所で再利用する。
export default {
  props: {
    value: { type: Number, default: 0 },
    from: { type: Number, default: 0 },
    duration: { type: Number, default: 1200 },
    delay: { type: Number, default: 0 },
    prefix: { type: String, default: "" },
    suffix: { type: String, default: "" },
  },
  data() {
    return {
      current: this.from,
      rafId: null,
      timerId: null,
    };
  },
  computed: {
    displayText() {
      return this.current.toLocaleString();
    },
  },
  mounted() {
    this.start(this.from, this.value);
  },
  watch: {
    value(newVal) {
      this.start(this.current, newVal);
    },
  },
  beforeDestroy() {
    this.stop();
  },
  methods: {
    stop() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      if (this.timerId) clearTimeout(this.timerId);
      this.rafId = null;
      this.timerId = null;
    },
    start(start, end) {
      this.stop();
      this.current = start;
      this.timerId = setTimeout(() => {
        const startTime = performance.now();
        const diff = end - start;
        const tick = (now) => {
          const progress = Math.min((now - startTime) / this.duration, 1);
          // easeOutCubic でゆっくり止まる
          const eased = 1 - Math.pow(1 - progress, 3);
          this.current = Math.round(start + diff * eased);
          if (progress < 1) {
            this.rafId = requestAnimationFrame(tick);
          } else {
            this.current = end;
          }
        };
        this.rafId = requestAnimationFrame(tick);
      }, this.delay);
    },
  },
};
</script>
