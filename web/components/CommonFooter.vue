<template>
  <div class="bg-dark">
    <div class="container-lg">
      <div class="py-4 text-center">
        <!-- ロゴ -->
        <div class="py-2">
          <img src="https://placehold.jp/300x100.png?text=logo" alt="でばっぐ神社">
        </div>
        <!-- フッターナビゲーション -->
        <nav id="footer-nav" class="container-sm py-2">
          <ul>
            <li class="px-2"><nuxt-link to="/">トップ</nuxt-link></li>
            <li class="px-2"><nuxt-link to="/terms">利用規約</nuxt-link></li>
            <li class="px-2"><nuxt-link to="/privacy-policy">プライバシーポリシー</nuxt-link></li>
          </ul>
        </nav>
        <!-- SNSリンク -->
        <div class="py-2">
          <img src="https://placehold.jp/300x50.png?text=logo" alt="でばっぐ神社">
        </div>
      </div>
    </div>
    <div class="footer-rights">
      <div class="py-2 text-right container-lg">
        &copy;428lab.
      </div>
    </div>
  </div>
</template>

<style>
nav#footer-nav > ul {
  list-style-type: none;
  list-style-position: outside;
  font-size: 0.8rem;
  margin: 0;
  padding: 0;
}

nav#footer-nav > ul > li {
  display: inline-block;
  text-decoration: none;
}

nav#footer-nav > ul > li+ li {
  border-left: 1px solid #adb5bd;
}

nav#footer-nav > ul > li > a {
  text-decoration: none;
}

.footer-rights {
  background-color: black;
}

.footer-rights > div {
  font-size: 0.8rem;
  text-align: right;
}
</style>
