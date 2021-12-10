<script>
import { Radar } from 'vue-chartjs';

export default {
  extends: Radar,
  props:['chartData', 'options'],
  mounted() {
    this.renderChart(this.chartData, this.options);
  }
}
</script>
