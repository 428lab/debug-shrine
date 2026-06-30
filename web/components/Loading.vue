<template>
  <div class="outline">
    <div class="inner">
      <div class="container p-5 text-center loading-scene">
        <!-- 舞い上がる光の粒 -->
        <div class="particles">
          <span
            v-for="(p, i) in particles"
            :key="i"
            class="particle"
            :style="p"
          ></span>
        </div>

        <!-- ふわふわ浮く鳥居 -->
        <div class="torii-wrap">
          <img
            src="/torii.svg"
            alt="でばっぐ神社"
            class="torii"
            style="max-width: 420px"
          />
        </div>

        <!-- 順番に灯る提灯(進捗感) -->
        <div class="lanterns">
          <span
            v-for="n in 5"
            :key="n"
            class="lantern"
            :style="{ animationDelay: ((n - 1) * 0.18).toFixed(2) + 's' }"
          ></span>
        </div>

        <!-- 巡回するメッセージ -->
        <transition name="msg" mode="out-in">
          <div class="fs-2 mt-4 loading-message" :key="currentMessage">
            {{ currentMessage }}<span class="loading-dots"></span>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    // 単一メッセージ(後方互換)。messages 未指定時に使う。
    message: { type: String, default: "" },
    // 複数メッセージを渡すと一定間隔で巡回表示する。
    messages: { type: Array, default: () => [] },
    interval: { type: Number, default: 1600 },
  },
  data() {
    return {
      index: 0,
      timerId: null,
      // 位置・遅延・大きさをずらした光の粒。決定的な値で生成。
      particles: Array.from({ length: 16 }).map((_, i) => ({
        left: (3 + ((i * 61) % 94)) + "%",
        width: (4 + (i % 3) * 3) + "px",
        height: (4 + (i % 3) * 3) + "px",
        animationDelay: ((i % 8) * 0.45).toFixed(2) + "s",
        animationDuration: (3.5 + (i % 5) * 0.6).toFixed(1) + "s",
      })),
    };
  },
  computed: {
    currentMessage() {
      if (this.messages && this.messages.length > 0) {
        return this.messages[this.index % this.messages.length];
      }
      return this.message;
    },
  },
  mounted() {
    if (this.messages && this.messages.length > 1) {
      this.timerId = setInterval(() => {
        this.index = (this.index + 1) % this.messages.length;
      }, this.interval);
    }
  },
  beforeDestroy() {
    if (this.timerId) clearInterval(this.timerId);
  },
};
</script>

<style scoped>
.outline {
  width: 100%;
  height: 100vh;
  transition: all 1s;
  background: radial-gradient(circle at 50% 35%, #5a5050, #2b2b2b 70%);

  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
  overflow: hidden;
}

.inner {
  width: 100%;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translateY(-50%) translateX(-50%);
  -webkit-transform: translateY(-50%) translateX(-50%);
}

.loading-scene {
  position: relative;
}

/* 鳥居 */
.torii-wrap {
  position: relative;
  display: inline-block;
  animation: torii-float 2.6s ease-in-out infinite;
}
.torii {
  width: 75%;
  filter: drop-shadow(0 0 14px rgba(255, 196, 120, 0.75));
  animation: torii-glow 2.2s ease-in-out infinite alternate;
}

@keyframes torii-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-14px);
  }
}
@keyframes torii-glow {
  0% {
    filter: drop-shadow(0 0 8px rgba(255, 196, 120, 0.5));
  }
  100% {
    filter: drop-shadow(0 0 22px rgba(255, 150, 90, 0.95));
  }
}

/* 光の粒 */
.particles {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.particle {
  position: absolute;
  bottom: -20px;
  border-radius: 50%;
  background: radial-gradient(circle, #ffe6a8, #ff9a3c);
  box-shadow: 0 0 8px rgba(255, 180, 90, 0.9);
  opacity: 0;
  animation-name: particle-rise;
  animation-timing-function: ease-in;
  animation-iteration-count: infinite;
}

@keyframes particle-rise {
  0% {
    transform: translateY(0) scale(0.6);
    opacity: 0;
  }
  15% {
    opacity: 1;
  }
  80% {
    opacity: 0.9;
  }
  100% {
    transform: translateY(-340px) scale(1.1);
    opacity: 0;
  }
}

/* 提灯(順に灯る) */
.lanterns {
  display: flex;
  justify-content: center;
  gap: 14px;
  margin-top: 18px;
}
.lantern {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #6b5b4b;
  animation: lantern-on 1.5s ease-in-out infinite;
}

@keyframes lantern-on {
  0%,
  100% {
    background: #6b5b4b;
    box-shadow: none;
    transform: scale(1);
  }
  40% {
    background: #ffcf6b;
    box-shadow: 0 0 14px rgba(255, 196, 100, 0.95);
    transform: scale(1.25);
  }
}

/* メッセージ */
.loading-message {
  color: #fff;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  min-height: 2.2em;
}
.loading-dots::after {
  content: "";
  animation: dots 1.2s steps(4, end) infinite;
}
@keyframes dots {
  0% {
    content: "";
  }
  25% {
    content: "・";
  }
  50% {
    content: "・・";
  }
  75% {
    content: "・・・";
  }
  100% {
    content: "";
  }
}

/* メッセージ切替フェード */
.msg-enter-active,
.msg-leave-active {
  transition: opacity 0.35s, transform 0.35s;
}
.msg-enter {
  opacity: 0;
  transform: translateY(10px);
}
.msg-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
