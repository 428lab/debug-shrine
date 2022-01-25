<template>
  <div>
    <div class="py-5 my-5"></div>
    <div class="fixed-bottom">
      <div class="bg-dark">
        <div class="container">
          <div class="py-2 text-center">
            <div class="d-md-flex justify-content-between align-items-center">
              <nav id="footer-nav" class="py-2">
                <ul>
                  <li class="px-2"><nuxt-link to="/">トップ</nuxt-link></li>
                  <li class="px-2">
                    <nuxt-link to="/terms">利用規約</nuxt-link>
                  </li>
                  <li class="px-2">
                    <nuxt-link to="/privacy-policy">
                      プライバシーポリシー
                    </nuxt-link>
                  </li>
                </ul>
              </nav>
              <!-- SNSリンク -->
              <div class="py-2">
                <a
                  class="btn bg-twitter text-white"
                  href="https://twitter.com/debug_shrine"
                  target="_blank"
                >
                  <i class="fab fa-twitter fa-lg fa-fw"></i>
                  Twitter
                </a>
                <a
                  class="ms-3 btn bg-github text-white"
                  href="https://github.com/428lab/debug-shrine"
                  target="_blank"
                >
                  <i class="fab fa-github fa-lg fa-fw"></i>
                  GitHub
                </a>
                <!-- <a class="d-inline-block" href="https://428lab.net/" target="_blank">
                <img src="/brandlogo/lab_icon.svg" alt="" width="40px" />
              </a>
              <a class="ms-3 d-inline-block" href="https://blog.428lab.net/" target="_blank">
                <img src="/brandlogo/hatena_icon.svg" alt="" width="40px" />
              </a>
              <a class="ms-3 d-inline-block" href="https://twitter.com/lab_428" target="_blank">
                <img src="/brandlogo/twitter.svg" alt="" width="40px" />
              </a>
              <a class="ms-3 d-inline-block" href="https://www.facebook.com/%E5%9B%9B%E8%B0%B7%E3%83%A9%E3%83%9C-102455797824507/" target="_blank">
                <img src="/brandlogo/facebook.svg" alt="" width="40px" />
              </a> -->
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="footer-rights">
        <div class="py-2 text-right container-lg">
          &copy; <a href="https://428lab.net/" target="_blank">428lab.</a>
        </div>
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

nav#footer-nav > ul > li + li {
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
