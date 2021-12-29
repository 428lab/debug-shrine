<template>
  <main class="container p-3">
    <div class="p-3 profile-outline">
      <div class="row">
        <div class="col-12 col-md-6 col-lg-8 mb-4">
          <div class="p-3 bg-dark">
            <div class="d-flex align-items-end">
              <div class="fs-4 me-4">{{ user.display_name }}</div>
              <div class="fs-5">{{ user.screen_name }}</div>
            </div>
            <div class="d-flex mt-3">
              <div class="w-35">
                <img
                  :src="user.image_path"
                  alt="userName"
                  class="profile-icon img-fluid w-100"
                />
              </div>
              <div class="ms-4 flex-fill">
                <div class="fs-5">れべる：{{ profile.level }}</div>
                <div class="progress mt-2">
                  <div
                    class="progress-bar p-2"
                    role="progressbar"
                    style="width: 30%"
                    aria-valuenow="10"
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                    {{ profile.exp }} exp
                  </div>
                </div>
                <p class="text-end w-100 mt-2">NEXT {{ profile.next }} exp</p>
              </div>
            </div>
          </div>
        </div>
        <div class="col-12 col-md-6 col-lg-4">
          <div class="bg-primary rounded p-2 text-center">
            でばっぐのうりょく
          </div>
          <RadarChart :chartData="chartData" />
        </div>
      </div>
    </div>
  </main>
</template>

<script>
import { mapGetters } from "vuex";
import RadarChart from "@/components/charts/powerChart.vue";

export default {
  middleware: "auth",
  components: { RadarChart },
  async asyncData({ $axios }) {
    let response = await $axios.get("status?user=ShinoharaTa");
    let userChart = [];
    console.log(response.data);
    userChart.push(response.data.chart.hp);
    userChart.push(response.data.chart.power);
    userChart.push(response.data.chart.intelligence);
    userChart.push(response.data.chart.defence);
    userChart.push(response.data.chart.agility);
    return {
      profile: {
        exp: response.data.total,
        point: response.data.total,
        level: response.data.level,
      },
      chartData: {
        labels: [
          "たいりょく",
          "ちから",
          "かしこさ",
          "しゅびりょく",
          "すばやさ",
        ],
        datasets: [
          {
            type: "radar",
            data: userChart,
            fill: true,
            backgroundColor: "rgba(255, 99, 132, 0.6)",
            borderWidth: 0,
            pointStyle: "dash",
          },
        ],
      },
    };
  },
  methods: {
    logout: function () {
      this.$store.dispatch("logout");
    },
  },
  mounted() {
    console.log(this.user);
  },
  computed: {
    ...mapGetters(["user"]),
  },
};
</script>

<style scoped>
.profile-outline {
  background-color: #000;
  border-radius: 15px;
}

.debug-title {
  border-radius: 10px;
}
</style>