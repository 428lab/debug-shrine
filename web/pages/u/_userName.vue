<template>
  <main class="container p-3">
    <div class="p-3 profile-outline" v-if="!isLoading">
      <div class="row">
        <div class="col-12 col-md-5 col-xl-8 mb-4 mb-md-0">
          <div class="p-3 bg-dark h-100 rounded">
            <div class="d-lg-flex align-items-center">
              <div class="fs-4 me-4">{{ profile.nickName }}</div>
            </div>
            <div class="d-flex mt-3 d-md-block">
              <div class="w-35 mb-3 me-3">
                <img
                  :src="profile.profileImage"
                  alt=""
                  class="rounded-icon img-fluid w-100"
                />
              </div>
              <div class="ms-4flex-fill">
                <a
                  :href="`https://github.com/` + profile.screenName"
                  class="d-flex align-items-center"
                  target="_blank"
                >
                  <i class="fab fa-github fa-fw"></i>
                  {{ profile.screenName }}
                </a>
                <div class="mt-3">れべる：{{ status.level }}</div>
                <div>ポイント：{{ status.points }}</div>
                <table class="mt-3">
                  <tr>
                    <td>せんとうりょく</td>
                    <td>：</td>
                    <td class="text-end">{{ status.total }}</td>
                  </tr>
                  <tr>
                    <td>たいりょく</td>
                    <td>：</td>
                    <td class="text-end">{{ status.hp }}</td>
                  </tr>
                  <tr>
                    <td>ちから</td>
                    <td>：</td>
                    <td class="text-end">{{ status.power }}</td>
                  </tr>
                  <tr>
                    <td>かしこさ</td>
                    <td>：</td>
                    <td class="text-end">{{ status.intelligence }}</td>
                  </tr>
                  <tr>
                    <td>しゅびりょく</td>
                    <td>：</td>
                    <td class="text-end">{{ status.defence }}</td>
                  </tr>
                  <tr>
                    <td>すばやさ</td>
                    <td>：</td>
                    <td class="text-end">{{ status.agility }}</td>
                  </tr>
                </table>
              </div>
            </div>
            <div class="py-3">前回の参拝：{{ status.last_sanpai }}</div>
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
    <div v-if="!isLogin" class="text-center">
      <nuxt-link
        to="/"
        class="btn btn-lg btn-primary mt-3 d-block d-md-inline-block"
        >コントリビュートして<br class="d-md-none" />自分の能力を分析！
      </nuxt-link>
    </div>
    <div
      class="text-center text-md-end mt-3"
      v-if="$route.params.userName === (user ? user.screen_name : false)"
    >
      <Share
        title="プロフィールをSNSでシェアしよう"
        :url="shareUrl"
        :message="shareMessage"
      ></Share>
    </div>
    <Loading v-if="isLoading" message="ヨミコミチュウ..."></Loading>
  </main>
</template>

<script>
import { mapGetters } from "vuex";
import RadarChart from "@/components/charts/powerChart.vue";

export default {
  head() {
    const title = `${this.$route.params.userName}の でばっぐのうりょく | でばっぐ神社`;
    const description = `これが${this.$route.params.userName}の でばっぐのうりょくだ！`;
    return {
      title: `${this.$route.params.userName}の でばっぐのうりょく | でばっぐ神社`,
      meta: [
        { hid: "description", name: "description", content: description },
        {
          hid: "og:description",
          property: "og:description",
          content: description,
        },
        {
          hid: "og:image",
          property: "og:image",
          content: `${this.$config.apiUrl}userOGP?user=${this.$route.params.userName}`,
        },
        { hid: "og:title", name: "og:title", content: "でばっぐ神社" },
      ],
    };
  },
  components: { RadarChart },
  data() {
    return {
      isLoading: true,
      profile: {},
      status: {},
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
            data: [],
            fill: true,
            backgroundColor: "rgba(255, 99, 132, 0.6)",
            borderWidth: 0,
            pointStyle: "dash",
          },
        ],
      },
    };
  },
  async mounted() {
    if (!this.$route.params.userName) {
      this.$nuxt.error({ statusCode: 404 });
      return;
    }
    let response = await this.$axios.get("status?user=" + this.$route.params.userName);
    let userChart = [];
    userChart.push(response.data.chart.hp);
    userChart.push(response.data.chart.power);
    userChart.push(response.data.chart.intelligence);
    userChart.push(response.data.chart.defence);
    userChart.push(response.data.chart.agility);
    this.chartData.datasets[0].data = userChart;

    this.profile.nickName = response.data.user.display_name;
    this.profile.screenName = response.data.user.screen_name;
    this.profile.profileImage = response.data.user.github_image_path;
    this.status.level = response.data.level;
    this.status.points = response.data.points;
    this.status.total = response.data.total;
    this.status.hp = response.data.hp;
    this.status.power = response.data.power;
    this.status.intelligence = response.data.intelligence;
    this.status.defence = response.data.defence;
    this.status.agility = response.data.agility;
    this.status.last_sanpai = response.data.last_sanpai;
    if(response){
      this.isLoading = false;
    }
  },
  computed: {
    ...mapGetters(["user", "isLogin"]),
    shareUrl() {
      return this.$config.baseUrl + "u/" + this.$route.params.userName;
    },
    shareMessage() {
      return "これが" + this.profile.nickName + "の でばっぐのうりょくだ！";
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
  border-radius: 5px;
}
</style>
