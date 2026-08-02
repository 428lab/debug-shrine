<template>
  <div class="card card-shrine ranking-card">
    <div class="card-header ranking-header">
      {{ title }}
      <div class="ranking-note">{{ note }}</div>
    </div>
    <div class="list-group list-group-flush">
      <nuxt-link
        class="list-group-item list-group-item-action d-flex align-items-center"
        v-for="item in entries"
        :key="item.screen_name"
        :to="`/u/` + item.screen_name"
      >
        <div class="me-3">{{ item.rank }} 位</div>
        <div class="me-2">
          <img :src="item.image_path" class="rounded-icon" height="30px" alt="" />
        </div>
        <div class="flex-fill me-2">{{ item.display_name }}</div>
        <div class="me-2">{{ item.value }} {{ unit }}</div>
        <div><i class="fas fa-fw fa-chevron-right"></i></div>
      </nuxt-link>
      <div v-if="entries.length === 0" class="list-group-item ranking-empty">
        この期間は記録がありませんでした。
      </div>
    </div>
  </div>
</template>

<script>
// 締め済みランキングの表示(過去ランキングページ用)。
// 現在のランキング(Ranking.vue)と違い、切替もフォールバックも無い確定表示。
export default {
  props: {
    title: { type: String, required: true },
    note: { type: String, default: "" },
    unit: { type: String, required: true },
    entries: { type: Array, default: () => [] },
  },
};
</script>

<style scoped>
.ranking-header {
  background-color: rgba(255, 255, 255, 0.04);
  color: var(--color-text);
  font-weight: 700;
  border-bottom: 1px solid var(--color-surface-border);
}
.ranking-note {
  color: var(--color-text-muted, #9a9a9a);
  font-size: 0.78rem;
  font-weight: 400;
}
.ranking-card .list-group-item {
  background-color: transparent;
  color: var(--color-text);
  border-color: var(--color-surface-border);
}
.ranking-card .list-group-item-action:hover,
.ranking-card .list-group-item-action:focus {
  background-color: rgba(255, 255, 255, 0.06);
  color: var(--color-text);
}
.ranking-empty {
  color: var(--color-text-muted, #9a9a9a);
  font-size: 0.9rem;
}
</style>
