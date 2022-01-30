<template>
  <main class="container p-3">
    <div class="fs-1">ランキング</div>
    <ranking-me></ranking-me>
    <ranking-all></ranking-all>
  </main>
</template>

<script>
import RankingAll from "@/components/ranking/all";
import RankingMe from "@/components/ranking/me";

export default {
  components: { RankingAll, RankingMe },
};
</script>
