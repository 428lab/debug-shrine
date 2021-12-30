<script>
import { Radar } from "vue-chartjs";

export default {
  extends: Radar,
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
          },
          gridLines: { color: "rgba(255, 255, 255, 0.7)" },
          angleLines: { color: "rgba(255, 255, 255, 0.7)" },
        },
      },
    };
  },
  props: ["chartData", "chartConfig"],
  mounted() {
    this.options.scale.ticks = this.chartConfig
    this.renderChart(this.chartData, this.options);
  },
};
</script>
