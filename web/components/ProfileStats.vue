<template>
  <div class="profile-stats p-3 rounded">
    <div class="d-flex justify-content-between align-items-center flex-wrap mb-2">
      <h2 class="stats-title fs-6 mb-0"><i class="fas fa-fw fa-chart-bar"></i> 参拝の記録</h2>
    </div>

    <div v-if="state === 'loading'" class="stats-sub py-3">
      記録を紐解いています<span class="dots"></span>
    </div>
    <div v-else-if="state === 'error'" class="py-2">
      <span class="stats-sub">記録を読み込めませんでした。</span>
      <button class="btn btn-sm btn-outline-light ms-2" @click="fetchStats">
        再読み込み
      </button>
    </div>
    <template v-else>
      <!-- 数値タイル -->
      <div class="tiles">
        <div class="tile">
          <div class="tile-value">{{ stats.sanpai.total_count.toLocaleString() }}</div>
          <div class="tile-label">累計参拝</div>
        </div>
        <div class="tile">
          <div class="tile-value">
            {{ stats.sanpai.current_streak
            }}<span class="tile-unit">日</span>
            <span v-if="stats.sanpai.current_streak >= 3"><i class="fas fa-fire streak-fire"></i></span>
          </div>
          <div class="tile-label">連続参拝中</div>
        </div>
        <div class="tile">
          <div class="tile-value">{{ stats.sanpai.longest_streak }}<span class="tile-unit">日</span></div>
          <div class="tile-label">最長ストリーク</div>
        </div>
        <div class="tile">
          <div class="tile-value tile-date">{{ stats.sanpai.first_sanpai || "-" }}</div>
          <div class="tile-label">初参拝</div>
        </div>
      </div>

      <!-- 称号(未達成はグレー表示でコレクション欲を煽る) -->
      <div class="stats-sub mt-3 mb-1">
        称号 <span class="ms-1">{{ achievedCount }}/{{ stats.badges.length }}</span>
      </div>
      <div class="badges">
        <span
          v-for="b in stats.badges"
          :key="b.id"
          class="badge-chip"
          :class="{ locked: !b.achieved }"
          :title="b.desc + (b.achieved ? '' : '(未達成)')"
        >
          <i v-if="b.icon" class="fas fa-fw" :class="b.icon"></i
          ><span v-else>{{ b.emoji }}</span>
          {{ b.label }}
        </span>
      </div>

      <!-- おみくじ統計(記録があるときだけ) -->
      <template v-if="stats.omikuji.total_count > 0">
        <div class="stats-sub mt-3 mb-1">
          おみくじ {{ stats.omikuji.total_count }}回
        </div>
        <div class="badges">
          <span
            v-for="tier in tierOrder"
            v-if="stats.omikuji.tiers[tier]"
            :key="tier"
            class="badge-chip tier-chip"
          >
            {{ tierEmoji[tier] }} {{ tier }} ×{{ stats.omikuji.tiers[tier] }}
          </span>
        </div>
      </template>
    </template>
  </div>
</template>

<script>
// ポートフォリオ用の参拝統計(累計・ストリーク・称号・おみくじ統計)。
// データ源は profileStatsGo(sanpai_logs / omikuji_logs の集計)。
export default {
  props: {
    screenName: { type: String, required: true },
  },
  data() {
    return {
      state: "loading", // loading | loaded | error
      stats: null,
      tierOrder: ["超吉", "大吉", "中吉", "小吉", "末吉", "凶", "大凶"],
      tierEmoji: {
        超吉: "🌟",
        大吉: "🎉",
        中吉: "😊",
        小吉: "🙂",
        末吉: "😌",
        凶: "😰",
        大凶: "💀",
      },
    };
  },
  computed: {
    achievedCount() {
      return this.stats.badges.filter((b) => b.achieved).length;
    },
  },
  async mounted() {
    await this.fetchStats();
  },
  methods: {
    async fetchStats() {
      this.state = "loading";
      try {
        // 草(sanpaiHistoryGo)と同じく Hosting CDN 経由でエッジキャッシュさせる。
        const res = await this.$axios.get("/profileStatsGo", {
          baseURL: this.$config.rankingBaseUrl || this.$config.apiUrl,
          params: { user: this.screenName },
        });
        this.stats = res.data;
        this.state = "loaded";
      } catch (e) {
        this.state = "error";
      }
    },
  },
};
</script>

<style scoped>
/* ストリーク継続中の炎(元の🔥に合わせて琥珀で彩色) */
.streak-fire {
  color: var(--color-accent);
}

.profile-stats {
  background: var(--color-surface);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.stats-title {
  font-weight: 700;
}
.stats-sub {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

/* 数値タイル */
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
}
.tile {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 10px 12px;
  text-align: center;
}
.tile-value {
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1.2;
}
.tile-value.tile-date {
  font-size: 1.05rem;
  padding-top: 0.35rem;
}
.tile-unit {
  font-size: 0.9rem;
  font-weight: 400;
  margin-left: 1px;
}
.tile-label {
  color: var(--color-text-muted);
  font-size: 0.8rem;
  margin-top: 2px;
}

/* 称号チップ */
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.badge-chip {
  background: rgba(255, 196, 120, 0.12);
  border: 1px solid rgba(255, 196, 120, 0.4);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 0.85rem;
  white-space: nowrap;
}
.badge-chip.locked {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.12);
  color: #777;
  filter: grayscale(1);
  opacity: 0.7;
}
.badge-chip.tier-chip {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
}

/* 読み込み中の「...」 */
.dots::after {
  content: "";
  animation: stats-dots 1.2s steps(4, end) infinite;
}
@keyframes stats-dots {
  0% {
    content: "";
  }
  25% {
    content: "・";
  }
  50% {
    content: "・・";
  }
  75% {
    content: "・・・";
  }
  100% {
    content: "";
  }
}
</style>
