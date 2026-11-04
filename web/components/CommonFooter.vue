<template>
  <footer class="mt-auto site-footer">
    <div class="container">
      <div
        class="d-md-flex justify-content-between align-items-center py-3 text-center text-md-start"
      >
        <nav id="footer-nav" class="py-2">
          <!-- トップ(index)はヘッダーが無いので、主要ページへの入口をここにも置く -->
          <ul>
            <li><nuxt-link to="/">トップ</nuxt-link></li>
            <li><nuxt-link to="/about">でばっぐ神社とは</nuxt-link></li>
            <li><nuxt-link to="/ranking">ランキング</nuxt-link></li>
            <li><nuxt-link to="/games">ミニゲーム</nuxt-link></li>
            <li><nuxt-link to="/terms">利用規約</nuxt-link></li>
            <li>
              <nuxt-link to="/privacy-policy">プライバシーポリシー</nuxt-link>
            </li>
          </ul>
        </nav>
        <!-- SNSリンク -->
        <div class="py-2 d-flex gap-2 justify-content-center">
          <a
            class="btn btn-icon"
            href="https://x.com/debug_shrine"
            target="_blank"
            aria-label="X"
          >
            <IconX />
          </a>
          <a
            class="btn btn-icon"
            href="https://github.com/428lab/debug-shrine"
            target="_blank"
            aria-label="GitHub"
          >
            <i class="fab fa-github fa-fw"></i>
          </a>
        </div>
      </div>
      <div class="footer-rights pb-3 text-center text-md-end">
        &copy; <a href="https://428lab.net/" target="_blank">428lab.</a>
      </div>
    </div>
  </footer>
</template>

<style>
.site-footer {
  border-top: 1px solid var(--color-line-soft);
}

nav#footer-nav > ul {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  justify-content: center;
  list-style-type: none;
  font-size: 0.85rem;
  margin: 0;
  padding: 0;
}
@media (min-width: 768px) {
  nav#footer-nav > ul {
    justify-content: flex-start;
  }
}

nav#footer-nav > ul > li > a {
  color: var(--color-text-muted);
  text-decoration: none;
}
nav#footer-nav > ul > li > a:hover {
  color: var(--color-text);
}

.footer-rights {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
</style>
