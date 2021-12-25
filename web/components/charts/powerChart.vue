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
          display: false
        },
        tooltips: {
          enabled: false
        },
        scale: {
          ticks: {
            display: false,
            beginAtZero: true,
            min: 0,
            max: 100
          }
        }
      }
    }
  },
  props:['chartData', 'chartConfig'],
  mounted() {
    this.renderChart(this.chartData, this.options);
  }
}
</script>
