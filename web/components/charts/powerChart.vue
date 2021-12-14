<script>
import { Radar } from 'vue-chartjs';

export default {
  extends: Radar,
  data: function() {
    return {
      options: {
        animation: {
          // アニメーション実行時間（ms）
          duration: 1000,
          // イージング指定（https://easings.net/）
          easing: "easeInOutCirc"
        },
        legend: {
          // 凡例を表示しない
          display: false
        },
        tooltips: {
          // ツールチップを表示しない
          enabled: false
        },
        scale: {
          ticks: {
            // メモリ線を表示しない
            display: false,
            // 0からの表示を有効可
            beginAtZero: true,
            // 最小値を0に固定
            min: 0,
            // 最大値を100に固定
            max: 100
          }
        }
      }
    }
  },
  props:['chartData'],
  mounted() {
    this.renderChart(this.chartData, this.options);
  }
}
</script>
