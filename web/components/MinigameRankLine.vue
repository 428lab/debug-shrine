<template>
  <!-- ミニゲームの結果の下: 今回の順位(週間・月間・歴代)とランキングへのリンク。
       state は minigameOnline.js の mgSend -->
  <div class="mg-rank" :class="{ compact }">
    <div v-if="state === 'sending'" class="mg-rank-note">
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      ランキングに記録しています
    </div>
    <div v-else-if="state === 'done' && ranks" class="mg-rank-list">
      <span v-for="p in periods" :key="p.key" class="mg-rank-item" :class="{ hot: ranks[p.key] && ranks[p.key].new_best }">
        <span class="mg-rank-period">{{ p.label }}</span>
        <b>{{ ranks[p.key] ? ranks[p.key].rank : "-" }}</b> 位
        <span v-if="ranks[p.key] && ranks[p.key].new_best" class="mg-rank-new">更新!</span>
      </span>
    </div>
    <div v-else-if="state === 'off'" class="mg-rank-note">
      <nuxt-link to="/">ログイン</nuxt-link>するとランキングに載ります
    </div>
    <div v-else-if="state === 'rejected'" class="mg-rank-note">この記録はランキングに載せられませんでした</div>
    <div v-else-if="state === 'error'" class="mg-rank-note">ランキングに記録できませんでした</div>
    <!-- 送っている間は出さない(ページを移ると、記録の前の順位を見ることになる) -->
    <nuxt-link v-if="state !== 'sending'" :to="to" class="btn btn-sm btn-ghost mg-rank-btn">
      <i class="fas fa-fw fa-crown"></i> ランキング
    </nuxt-link>
  </div>
</template>

<script>
export default {
  props: {
    state: { type: String, default: "idle" },
    ranks: { type: Object, default: null },
    to: { type: [String, Object], required: true },
    // 狭い所(神楽ビートのはじめの画面)では上の余白を詰める
    compact: { type: Boolean, default: false },
  },
  data() {
    return {
      periods: [
        { key: "week", label: "週間" },
        { key: "month", label: "月間" },
        { key: "all", label: "歴代" },
      ],
    };
  },
};
</script>

<style scoped>
.mg-rank {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 14px;
  margin: 10px auto 0;
  max-width: 480px;
  color: #e8d6b0;
  font-size: 0.9rem;
}
.mg-rank.compact {
  margin-top: 0;
}
.mg-rank.compact .mg-rank-btn {
  padding: 2px 10px;
}
.mg-rank-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 14px;
}
.mg-rank-item b {
  font-size: 1.2rem;
  color: #fff6dc;
}
.mg-rank-item.hot b {
  color: #ffd84a;
}
.mg-rank-period {
  font-size: 0.75rem;
  margin-right: 2px;
  opacity: 0.8;
}
.mg-rank-new {
  font-size: 0.7rem;
  font-weight: 700;
  color: #ffd84a;
  margin-left: 2px;
}
.mg-rank-note a {
  color: #ffd84a;
}
.mg-rank-btn {
  white-space: nowrap;
}
</style>
