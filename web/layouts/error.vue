<template>
  <div class="outline">
    <div class="outer">
      <div class="inner">
        <div class="container py-5 text-center">
          <img
            src="/torii.svg"
            alt="でばっぐ神社"
            class="w-75"
            style="max-width: 500px"
          />
          <div class="fs-2 mt-5" v-if="error.statusCode === 404">このページは存在しません</div>
          <div class="fs-2 mt-5" v-else>エラーが発生しました</div>
          <div class="fs-1"><strong>{{ error.statusCode }}</strong></div>
          <div class="fs-4 mt-2">
            <a href="/" class="btn btn-lg btn-success">トップに戻る</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  layout: 'single',
  props: ['error']
}
</script>

<style scoped>
.outline {
  width: 100%;
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
}

.inner {
  width: 100%;
  position: absolute;
  top: 44%;
  left: 50%;
  transform: translateY(-50%) translateX(-50%);
  -webkit-transform: translateY(-50%) translateX(-50%);
}

</style>