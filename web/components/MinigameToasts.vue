<template>
  <!-- 「実績解除!」の通知。画面の上に出す(押しても下のゲームの邪魔をしない) -->
  <div class="mg-toasts" aria-live="polite">
    <transition-group name="mg-toast">
      <div v-for="t in toasts" :key="t.key" class="mg-toast">
        <div class="mg-toast-icon"><i class="fas fa-fw" :class="t.icon"></i></div>
        <div class="mg-toast-body">
          <div class="mg-toast-head">実績解除!</div>
          <div class="mg-toast-label">{{ t.label }}</div>
          <div class="mg-toast-desc">{{ t.desc }}</div>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<script>
export default {
  props: {
    toasts: { type: Array, default: () => [] },
  },
};
</script>

<style scoped>
.mg-toasts {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  width: min(360px, calc(100vw - 32px));
  z-index: 2000;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mg-toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(58, 30, 18, 0.96), rgba(28, 16, 12, 0.96));
  border: 2px solid #ffd84a;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4), 0 6px 22px rgba(255, 196, 60, 0.35);
  color: #fff6dc;
  overflow: hidden;
  position: relative;
}
/* 光が横切る */
.mg-toast::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: 40%;
  left: -50%;
  background: linear-gradient(100deg, transparent, rgba(255, 240, 180, 0.35), transparent);
  animation: mg-shine 1.1s 0.25s ease-out 1 forwards;
}
@keyframes mg-shine {
  to {
    left: 120%;
  }
}
.mg-toast-icon {
  flex: none;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #3a1e12;
  background: radial-gradient(circle at 35% 30%, #fff3b0, #ffd84a 55%, #c98f00);
  box-shadow: 0 0 12px rgba(255, 216, 74, 0.7);
}
.mg-toast-head {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #ffd84a;
}
.mg-toast-label {
  font-size: 1.05rem;
  font-weight: 900;
  line-height: 1.25;
}
.mg-toast-desc {
  font-size: 0.78rem;
  color: #e8d6b0;
}
.mg-toast-enter-active {
  transition: transform 0.35s cubic-bezier(0.2, 1.4, 0.4, 1), opacity 0.25s;
}
.mg-toast-leave-active {
  transition: transform 0.3s ease-in, opacity 0.3s;
}
.mg-toast-enter,
.mg-toast-leave-to {
  opacity: 0;
  transform: translateY(-24px) scale(0.92);
}
</style>
