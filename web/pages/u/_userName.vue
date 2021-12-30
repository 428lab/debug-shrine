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
                <div>たいりょく{{ status.hp }}</div>
                <div>ちから：{{ status.power }}</div>
                <div>かしこさ：{{ status.intelligence }}</div>
                <div>しゅびりょく：{{ status.defence }}</div>
                <div>すばやさ：{{ status.agility }}</div>
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
                class="bg-primary text-center d-inline-block p-1 debug-title"
              >
                <small>でばっぐのうりょく</small>
              </div>
              <RadarChart :chartData="chartData" :chartConfig="chartOptions" />
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
    <div class="text-center text-md-end mt-3">
      <Share title="プロフィールをSNSでシェアしよう" :url="shareUrl"></Share>
    </div>
  </main>
</template>

<script>
import RadarChart from "@/components/charts/powerChart.vue";

export default {
  components: { RadarChart },
  async asyncData({ $axios, route }) {
    let response = await $axios.get("status?user=" + route.params.userName);
    // if(!response){
    //   console.log("ユーザー情報なし")
    // };
    let userChart = [];
    userChart.push(response.data.chart.hp);
    userChart.push(response.data.chart.power);
    userChart.push(response.data.chart.intelligence);
    userChart.push(response.data.chart.defence);
    userChart.push(response.data.chart.agility);
    var median = function(arr, fn) {
        var half = (arr.length/2)|0;
        var temp = arr.sort(fn);

        if (temp.length%2) {
            return temp[half];
        }

        return (temp[half-1] + temp[half])/2;
    };
    var userChartTemp = userChart.concat()
    var max = median(userChartTemp)*2
    return {
      user: {
        nickName: response.data.user.display_name,
        screenName: response.data.user.screen_name,
        profileImage: response.data.user.github_image_path,
      },
      status: {
        level: response.data.level,
        points: response.data.points,
        total: response.data.total,
        hp: response.data.hp,
        power: response.data.power,
        intelligence: response.data.intelligence,
        defence: response.data.defence,
        agility: response.data.agility,
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
      chartOptions: {
        display: false,
        min: 0,
        max: max,
      },
    };
  },
  computed: {
    shareUrl() {
      return this.$config.baseUrl + "/u/" + this.$route.params.userName;
    }
  }
};
</script>

<style scoped>
.profile-outline {
  background-color: #000;
  border-radius: 15px;
}

.debug-title {
  border-radius: 5px;
}
</style>