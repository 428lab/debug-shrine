<template>
  <div class="grass-scroll" ref="scroll">
    <div class="grass-inner">
      <!-- 月ラベル(週の列位置に合わせて絶対配置) -->
      <div class="month-row" :style="{ width: cellsWidth + 'px' }">
        <span
          v-for="m in grid.monthLabels"
          :key="m.week + '-' + m.label"
          class="month-label"
          :style="{ left: m.week * pitch + 'px' }"
          >{{ m.label }}</span
        >
      </div>
      <div class="grid-row">
        <!-- 曜日ラベル(月・水・金のみ表示) -->
        <div class="weekday-col">
          <span v-for="(w, i) in weekdays" :key="i" class="weekday">{{
            w
          }}</span>
        </div>
        <!-- 週=列、日=行 -->
        <div class="weeks">
          <div v-for="(week, wi) in grid.weeks" :key="wi" class="week-col">
            <span
              v-for="cell in week"
              :key="cell.date"
              class="cell"
              :class="cell.inRange ? 'lv-' + levelFor(cell.count) : 'lv-out'"
              :title="cellTitle(cell)"
            ></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
// 1つの草グリッド(期間分)を描画する。直近1年と年別表示(全期間)で共用。
const { buildGrassGrid, levelFor } = require("@/utils/sanpaiGrass");

export default {
  props: {
    since: { type: String, required: true }, // "YYYY-MM-DD"
    until: { type: String, required: true },
    days: { type: Array, default: () => [] }, // [{date, count, points}]
  },
  data() {
    return {
      // セル11px + 隙間3px。月ラベルの位置計算(CSSと合わせる)に使う。
      pitch: 14,
      weekdays: ["", "月", "", "水", "", "金", ""],
    };
  },
  computed: {
    grid() {
      return buildGrassGrid(this.since, this.until, this.days);
    },
    cellsWidth() {
      return this.grid.weeks.length * this.pitch;
    },
  },
  mounted() {
    // 直近(右端)が見える位置から始める(モバイルで左端=1年前始まりだと
    // 最初に見えるのが古い草になってしまう)。
    this.$refs.scroll.scrollLeft = this.$refs.scroll.scrollWidth;
  },
  methods: {
    levelFor,
    cellTitle(cell) {
      if (!cell.inRange) return "";
      if (cell.count <= 0) return `${cell.date}: 参拝なし`;
      return `${cell.date}: ${cell.count}回参拝 (+${cell.points}pt)`;
    },
  },
};
</script>

<style scoped>
.grass-scroll {
  overflow-x: auto;
  padding-bottom: 4px;
}
.grass-inner {
  display: inline-block;
}

/* 月ラベル */
.month-row {
  position: relative;
  height: 16px;
  margin-left: 26px; /* 曜日ラベル幅ぶん */
}
.month-label {
  position: absolute;
  top: 0;
  font-size: 10px;
  color: #9a9a9a;
  white-space: nowrap;
}

.grid-row {
  display: flex;
}

/* 曜日ラベル */
.weekday-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 26px;
  flex: 0 0 auto;
}
.weekday {
  height: 11px;
  line-height: 11px;
  font-size: 10px;
  color: #9a9a9a;
}

/* 草本体 */
.weeks {
  display: flex;
  gap: 3px;
}
.week-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cell {
  width: 11px;
  height: 11px;
  border-radius: 2px;
  flex: 0 0 auto;
}
/* 濃淡はGitHubのダークテーマ準拠(サイト背景が暗いため) */
.lv-out {
  background: transparent;
}
.lv-0 {
  background: #1b2028;
  outline: 1px solid rgba(255, 255, 255, 0.05);
  outline-offset: -1px;
}
.lv-1 {
  background: #0e4429;
}
.lv-2 {
  background: #006d32;
}
.lv-3 {
  background: #26a641;
}
.lv-4 {
  background: #39d353;
}
</style>
