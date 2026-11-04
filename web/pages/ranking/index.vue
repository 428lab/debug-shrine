<template>
  <main class="container pt-4 pt-lg-5 content-wide">
    <h1 class="fs-2 mb-3">ランキング</h1>
    <ranking></ranking>
    <div class="mt-3">
      <nuxt-link to="/ranking/history" class="link-more">
        過去のランキング <i class="fas fa-fw fa-chevron-right"></i>
      </nuxt-link>
    </div>
  </main>
</template>

<script>
import Ranking from "@/components/Ranking";

export default {
  components: { Ranking },
};
</script>
