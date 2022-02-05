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
            max: 150,
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
