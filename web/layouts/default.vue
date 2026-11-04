<template>
  <div class="h-min-100vh d-flex flex-column">
    <CommonHeader />
    <!-- 本文の最下端からフッターまでの余白(48px)はここで一括して取る -->
    <div class="flex-fill pb-5"><Nuxt /></div>
    <CommonFooter />
  </div>
</template>
