<template>
  <main class="container p-3">
    <div class="p-3 card text-white">
      <div>
        <span class="h1">{{ user.nickName }}</span
        ><span class="h4">{{ user.screenName }}</span>
      </div>
      <div class="flex">
        <img :src="user.profileImage" alt="" class="w-25 img-fluid" />
      </div>
      <div class="mt-2">
        <div>れべる：{{ status.level }}</div>
        <div>ポイント：{{ status.points }}</div>
        <div>せんとうりょく：{{ status.total }}</div>
      </div>
      <RadarChart :chartData="chartData" />
    </div>
  </main>
</template>

<script>
import RadarChart from "@/components/charts/powerChart.vue";

export default {
  components: { RadarChart },
  async asyncData({ $axios }) {
    let response = await $axios.get("status?user=ShinoharaTa");
    console.log(response.data);
    let userChart = [];
    userChart.push(response.data.hp);
    userChart.push(response.data.power);
    userChart.push(response.data.agility);
    userChart.push(response.data.defence);
    userChart.push(response.data.intelligence);
    userChart.push(0);
    return {
      user: {
        nickName: "T.Shinohara",
        screenName: "ShinoharaTa",
        profileImage: "https://placehold.jp/150x150.png",
      },
      status: {
        level: response.data.level,
        points: response.data.points,
        total: response.data.total,
      },
      chartData: {
        labels: [
          "たいりょく",
          "ちから",
          "きようさ",
          "しゅびりょく",
          "すばやさ",
          "かしこさ",
        ],
        datasets: [
          {
            type: "radar",
            data: userChart,
            fill: true,
            backgroundColor: "rgba(255, 99, 132, 0.6)",
            borderWidth: 0,
            pointStyle: "dash"
            // borderColor: "rgb(255, 99, 132, 0.2)",
            // pointBackgroundColor: "rgb(255, 99, 132)",
            // pointBorderColor: "#fff",
            // pointHoverBackgroundColor: "#fff",
            // pointHoverBorderColor: "rgb(255, 99, 132)",
          },
        ],
      },
    };
  },
};
</script>

<style scoped>
.container {
  background-color: #888;
}

.card {
  background-color: #000;
}
</style>