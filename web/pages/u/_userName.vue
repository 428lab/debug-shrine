<template>
  <main class="container p-3">
    <div class="p-3 profile-outline">
      <div class="row">
        <div class="col-12 col-md-5 col-xl-8 mb-4 mb-md-0">
          <div class="p-3 bg-dark h-100 rounded">
            <div class="d-lg-flex align-items-center">
              <div class="fs-4 me-4">{{ user.nickName }}</div>
            </div>
            <div class="d-flex mt-3 d-md-block">
              <div class="w-35 mb-3 me-3">
                <img
                  :src="user.profileImage"
                  alt=""
                  class="rounded-icon img-fluid w-100"
                />
              </div>
              <div class="ms-4flex-fill">
                <a
                  :href="`https://github.com/` + user.screenName"
                  class="d-flex align-items-center"
                >
                  <img src="/brandlogo/github.svg" height="20px" alt="" />
                  <span class="ms-2">{{ user.screenName }} ></span>
                </a>
                <div class="mt-3">れべる：{{ status.level }}</div>
                <div>ポイント：{{ status.points }}</div>
                <div>せんとうりょく：{{ status.total }}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-12 col-md-7 col-xl-4">
          <div class="row">
            <div class="d-none d-md-block col-9">
              <img src="/torii.svg" alt="" class="img-fluid w-75" />
            </div>
            <div class="d-none d-md-block col-3">
              <img src="/428lab.svg" alt="" class="img-fluid h-100" />
            </div>
            <div class="col-8 col-md-12 mt-md-4">
              <div
                class="bg-primary text-center d-inline-block p-2 debug-title"
              >
                <small>でばっぐ<br class="d-md-none" />のうりょく</small>
              </div>
              <RadarChart :chartData="chartData" />
            </div>
            <div class="col-4 align-items-center d-md-none">
              <img
                src="/ProfileParts/profile_parts.png"
                class="img-fluid"
                alt=""
              />
            </div>
          </div>
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
    userChart.push(response.data.intelligence);
    userChart.push(response.data.defence);
    userChart.push(response.data.agility);
    // userChart.push(0);
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