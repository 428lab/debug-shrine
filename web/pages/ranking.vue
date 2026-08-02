<template>
  <main class="container p-3">
    <h1 class="fs-1 mb-0">ランキング</h1>
    <ranking></ranking>
    <div class="mt-3">
      <nuxt-link to="/ranking/history">
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
