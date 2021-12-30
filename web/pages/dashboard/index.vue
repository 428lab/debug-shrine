<template>
  <main class="container p-3">
    <div class="d-md-flex justify-content-between align-items-end">
      <div class="fs-1">マイページ</div>
      <div class="text-end mt-2">
        <nuxt-link :to="`/u/` + user.screen_name"
          >公開プロフィールを確認 ></nuxt-link
        >
      </div>
      <div class="text-end mt-2">
        <a href="javascript:void(0)" @click="logout">ログアウト ></a>
      </div>
    </div>
    <div class="p-3 profile-outline mt-3">
      <div class="row">
        <div class="col-12 col-md-6 col-lg-8 mb-4">
          <div class="p-3 bg-dark">
            <div class="d-lg-flex align-items-center">
              <div class="fs-4 me-4">{{ user.display_name }}</div>
              <div class="align-items-center">
                <img src="/brandlogo/github.svg" width="16px" alt="" />
                <span class="">{{ user.screen_name }}</span>
              </div>
            </div>
            <div class="d-flex mt-3">
              <div class="w-35">
                <img
                  :src="user.image_path"
                  alt="userName"
                  class="rounded-icon img-fluid w-100"
                />
              </div>
              <div class="ms-4 flex-fill">
                <div class="">れべる：{{ profile.level }}</div>
                <div class="">ぽいんと：{{ profile.point }}</div>
                <div class="S">せんとうりょく：{{ profile.total }}</div>
                <div class="progress mt-2">
                  <div
                    class="progress-bar p-2"
                    role="progressbar"
                    :style="
                      `width:` + (profile.total / profile.next) * 100 + `%`
                    "
                    :aria-valuenow="profile.total"
                    aria-valuemin="0"
                    :aria-valuemax="profile.next"
                  >
                    {{ profile.exp }} exp
                  </div>
                </div>
                <p class="text-end w-100 mt-2">NEXT {{ profile.next }} exp</p>
                <table class="mt-3">
                  <tr>
                    <td>たいりょく</td>
                    <td>：</td>
                    <td class="text-end">{{ profile.hp }}</td>
                  </tr>
                  <tr>
                    <td>ちから</td>
                    <td>：</td>
                    <td class="text-end">{{ profile.power }}</td>
                  </tr>
                  <tr>
                    <td>かしこさ</td>
                    <td>：</td>
                    <td class="text-end">{{ profile.intelligence }}</td>
                  </tr>
                  <tr>
                    <td>しゅびりょく</td>
                    <td>：</td>
                    <td class="text-end">{{ profile.defence }}</td>
                  </tr>
                  <tr>
                    <td>すばやさ</td>
                    <td>：</td>
                    <td class="text-end">{{ profile.agility }}</td>
                  </tr>
                </table>
                <!-- <div>たいりょく：{{ profile.hp }}</div>
                <div>ちから：{{ profile.power }}</div>
                <div>かしこさ：{{ profile.intelligence }}</div>
                <div>しゅびりょく：{{ profile.defence }}</div>
                <div>すばやさ：{{ profile.agility }}</div>                 -->
              </div>
            </div>
          </div>
        </div>
        <div class="col-12 col-md-6 col-lg-4">
          <div class="bg-primary rounded p-2 text-center">
            でばっぐのうりょく
          </div>
          <RadarChart :chartData="chartData" :chartConfig="chartOptions" />
        </div>
      </div>
    </div>
    <div class="text-center text-md-end mt-3">
      <Share title="プロフィールをSNSでシェアしよう" :url="shareUrl"></Share>
    </div>
  </main>
</template>

<script>
import { mapGetters } from "vuex";
import RadarChart from "@/components/charts/powerChart.vue";

export default {
  middleware: ["auth"],
  components: { RadarChart },
  async asyncData({ $axios, store }) {
    let response = await $axios.get(
      "status?user=" + store.state.user.screen_name
    );
    // 登録してなかったらエラーが出るのでエラー対応よろ
    let userChart = [];
    console.log(response.data);
    userChart.push(response.data.chart.hp);
    userChart.push(response.data.chart.power);
    userChart.push(response.data.chart.intelligence);
    userChart.push(response.data.chart.defence);
    userChart.push(response.data.chart.agility);
    var median = function (arr, fn) {
      var half = (arr.length / 2) | 0;
      var temp = arr.sort(fn);

      if (temp.length % 2) {
        return temp[half];
      }

      return (temp[half - 1] + temp[half]) / 2;
    };
    var userChartTemp = userChart.concat();
    var max = median(userChartTemp) * 2;

    return {
      profile: {
        total: response.data.total,
        exp: response.data.total,
        point: response.data.points,
        level: response.data.level,
        hp: response.data.hp,
        power: response.data.power,
        intelligence: response.data.intelligence,
        defence: response.data.defence,
        agility: response.data.agility,
        next: response.data.next_exp,
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
    shareUrl() {
      return this.$config.baseUrl + "/u/" + this.user.screen_name;
    },
    progressWidth() {
      return this.profile.exp.total / this.profile.next;
    },
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