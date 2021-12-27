<template>
  <main class="container p-3">
    <div class="p-3 profile-outline">
      <div class="bg-dark p-4 ">
        <div>
          <span class="">{{ user.nickName }}</span>
          <span class="ms-3">{{ user.screenName }}</span>
        </div>
        <div class="flex mt-3">
          <img :src="user.profileImage" alt="" class="w-35 img-fluid" />
        </div>
        <div class="mt-3">
          <div>れべる：{{ status.level }}</div>
          <div>ポイント：{{ status.points }}</div>
          <div>せんとうりょく：{{ status.total }}</div>
        </div>
      </div>
      <div class="row mt-4">
        <div class="col-8">
          <div class="bg-primary text-center d-inline-block p-2 debug-title">
            <small>でばっぐ<br />のうりょく</small>
          </div>
          <RadarChart :chartData="chartData" />
        </div>
        <div class="col-4 align-items-center">
          <img src="/profile_parts.png" class="img-fluid" alt="" />
        </div>
      </div>
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
            pointStyle: "dash",
          },
        ],
      },
    };
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