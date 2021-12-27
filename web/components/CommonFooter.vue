<template>
  <div>
    <div class="py-5"></div>
    <div class="text-center text-white p-3 mt-5 bg-dark fixed-bottom">
      <div class="container">
        <div class="d-md-flex justify-content-center">
          <nuxt-link class="p-2 footer-link" to="/terms"> 利用規約 </nuxt-link>
          <nuxt-link class="p-2 footer-link" to="/policy"> 免責事項 </nuxt-link>
          <nuxt-link class="p-2 footer-link" to="/privacy">
            プライバシーポリシー
          </nuxt-link>
        </div>
        <div class="mt-3">
          Copyright 2021 -
          <a href="https://428lab.net" target="_blank">四谷ラボ</a>
        </div>
      </div>
    </div>
    <!-- <div class="text-center text-white bg-dark p-3 fixed-bottom-md">
      <div class="container">

        <div>
          Copyright 2021 - 四谷ラボ
        </div>
      </div>
    </div> -->
  </div>
</template>

<style>
.footer-link {
  font-size: 0.9rem;
}
</style>
