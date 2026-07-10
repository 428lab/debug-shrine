<script>
import { Radar, mixins } from "vue-chartjs";

export default {
  extends: Radar,
  mixins: [mixins.reactiveProp],
  data: function () {
    return {
      options: {
        animation: {
          duration: 0,
        },
        legend: {
          display: false,
        },
        tooltips: {
          enabled: false,
        },
        scale: {
          ticks: {
            display: false,
            min: 0,
            // 値は絶対値ではなく「最も高い能力に対する割合(%)」(呼び出し側で正規化)。
            // 最強能力=100%=外周、全能力同値なら満点の五角形になる。
            // OGPカード(ogpimage の radarMaxPercent)と同じ値にすること。
            max: 100,
          },
          gridLines: { color: "rgba(255, 255, 255, 0.7)" },
          angleLines: { color: "rgba(255, 255, 255, 0.7)" },
        },
      },
    };
  },
  props: ["chartData"],
  mounted() {
    // this.options.scale.ticks = this.chartConfig
    this.renderChart(this.chartData, this.options);
  },
};
</script>
