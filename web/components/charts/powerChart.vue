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
            // 値は絶対値ではなく「5能力合計に占める割合(%)」(呼び出し側で正規化)。
            // バランス型は各軸20%の五角形、1能力が合計の半分を超える超特化は
            // 頂点に張り付く。OGPカード(ogpimage の radarMaxPercent)と同じ値にすること。
            max: 50,
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
