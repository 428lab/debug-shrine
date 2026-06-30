<template>
  <div class="levelup">
    <div class="levelup-glow"></div>
    <div class="levelup-body">
      <div class="levelup-title">LEVEL UP!</div>
      <div class="levelup-levels">
        <span class="levelup-from">Lv.{{ from }}</span>
        <span class="levelup-arrow">▶</span>
        <span class="levelup-to">Lv.{{ to }}</span>
      </div>
    </div>
  </div>
</template>

<script>
// レベルアップ時に派手に表示するバナー。レベルが上がった時だけ親で v-if 表示する。
export default {
  props: {
    from: { type: Number, default: 0 },
    to: { type: Number, default: 0 },
  },
};
</script>

<style scoped>
.levelup {
  position: relative;
  margin: 1.5rem auto;
  padding: 1.5rem 1rem;
  max-width: 600px;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(135deg, #ff9800, #ff5252, #e91e63);
  box-shadow: 0 0 30px rgba(255, 152, 0, 0.7);
  animation: levelup-pop 0.6s cubic-bezier(0.18, 0.89, 0.32, 1.28) both;
}

.levelup-glow {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.55) 0%,
    rgba(255, 255, 255, 0) 60%
  );
  animation: levelup-shine 2.5s linear infinite;
  pointer-events: none;
}

.levelup-body {
  position: relative;
  z-index: 1;
  color: #fff;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}

.levelup-title {
  font-size: 2.6rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  animation: levelup-blink 0.9s ease-in-out infinite alternate;
}

.levelup-levels {
  margin-top: 0.5rem;
  font-size: 1.8rem;
  font-weight: 700;
}

.levelup-arrow {
  margin: 0 0.6rem;
  color: #fff200;
}

.levelup-to {
  font-size: 2.2rem;
  color: #fff200;
}

@keyframes levelup-pop {
  0% {
    transform: scale(0.3) rotate(-6deg);
    opacity: 0;
  }
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
}

@keyframes levelup-blink {
  0% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.08);
  }
}

@keyframes levelup-shine {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
