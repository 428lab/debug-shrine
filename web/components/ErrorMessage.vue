<template>
  <div class="outline">
    <div class="outer">
      <div class="inner">
        <div class="container p-5 text-center">
        <img
          src="/torii.svg"
          alt="でばっぐ神社"
          class="w-75"
          style="max-width: 500px"
        />
        <div class="loading-outline">
          <div class="loading-icon"></div>
        </div>
        <div class="fs-2 mt-4">ブンセキチュウ...</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {
  disableBodyScroll,
  enableBodyScroll,
  clearAllBodyScrollLocks,
} from "body-scroll-lock";
export default {
  mounted() {
    const page = document.querySelector("#page");
    disableBodyScroll(page);
  },

  beforeDestory() {
    clearAllBodyScrollLocks();
  },
};
</script>

<style scoped>
.outline {
  width: 100%;
  height: 100vh;
  transition: all 1s;
  background-color: #444;

  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
}

.outer {
  /* position: relative; */
}

.inner {
  width: 100%;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translateY(-50%) translateX(-50%);
  -webkit-transform: translateY(-50%) translateX(-50%);
}

.loading-outline {
  display: flex;
  height: 150px;
  justify-content: center;
  align-items: center;
  margin: 0;
}

.loading-icon {
  box-sizing: border-box;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  box-shadow:
    0 -30px 0 #eee,     /*  上  */
    21px -21px 0 #ddd,  /* 右上 */
    30px 0 0 #ccc,      /*  右  */
    21px 21px 0 #bbb,   /* 右下 */
    0 30px 0 #aaa,      /*  下  */
    -21px 21px 0 #999,  /* 左下 */
    -30px 0 0 #666,     /*  左  */
    -21px -21px 0 #000; /* 左上 */
  animation: rotate 1s steps(8) 0s infinite;
}

@keyframes rotate {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>