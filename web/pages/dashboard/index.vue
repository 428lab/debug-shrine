<template>
  <main class="container p-3">
    <div class="d-md-flex justify-content-between align-items-end">
      <div class="fs-1 flex-fill">マイページ</div>
      <div class="text-end mt-2 ms-3">
        <nuxt-link :to="`/u/` + user.screen_name"
          >公開プロフィールを確認 ></nuxt-link
        >
      </div>
      <div class="text-end mt-2 ms-3">
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
          <div class="text-center text-md-end mt-3">
            <Share
              title="プロフィールをSNSでシェアしよう"
              :url="shareUrl"
              :message="shareMessage"
            ></Share>
          </div>
        </div>
        <div class="col-12 col-md-6 col-lg-4">
          <div class="mb-3">前回の参拝：{{ formattedLastSanpai }}</div>
          <div class="bg-primary rounded p-2 text-center">
            でばっぐのうりょく
          </div>
          <RadarChart :chartData="chartData" :chartConfig="chartOptions" />
        </div>
      </div>
    </div>
    <Loading v-if="isLoading" message="ヨミコミチュウ..."></Loading>
  </main>
</template>

<script>
import { mapGetters } from "vuex";
import RadarChart from "@/components/charts/powerChart.vue";

export default {
  middleware: ["auth"],
  components: { RadarChart },
  data() {
    return {
      isLoading: true,
      profile: {},
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
            data: {},
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
        max: 150,
      },
    };
  },
  async mounted() {
    let response = await this.$axios.get(
      `status?user=${this.user.screen_name}`
    );
    // 登録してなかったらエラーが出るのでエラー対応よろ
    let userChart = [];
    userChart.push(response.data.chart.hp);
    userChart.push(response.data.chart.power);
    userChart.push(response.data.chart.intelligence);
    userChart.push(response.data.chart.defence);
    userChart.push(response.data.chart.agility);

    this.profile.total = response.data.total;
    this.profile.exp = response.data.total;
    this.profile.point = response.data.points;
    this.profile.level = response.data.level;
    this.profile.hp = response.data.hp;
    this.profile.power = response.data.power;
    this.profile.intelligence = response.data.intelligence;
    this.profile.defence = response.data.defence;
    this.profile.agility = response.data.agility;
    this.profile.next = response.data.next_exp;
    this.profile.last_sanpai = response.data.last_sanpai;
    if(response){
      this.isLoading = false;
    }
    // this.chartData.datasets[0].data = userChart;
  },
  methods: {
    logout: function () {
      this.$store.dispatch("logout");
    },
  },
  computed: {
    ...mapGetters(["user"]),
    shareUrl() {
      return this.$config.baseUrl + "u/" + this.user.screen_name;
    },
    shareMessage() {
      return "これが" + this.user.display_name + "の でばっぐのうりょくだ！";
    },
    progressWidth() {
      return this.profile.exp.total / this.profile.next;
    },
    formattedLastSanpai() {
      return this.profile.last_sanpai;
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
