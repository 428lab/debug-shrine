<template>
  <main class="container pt-4 pt-lg-5">
    <!-- 読み込み失敗。Loading を閉じて理由と戻り先を出す(共有 URL からの流入で行き止まりにしない) -->
    <div v-if="loadError" class="content-wide">
      <h1 class="fs-2 mb-3">@{{ $route.params.userName }}</h1>
      <div class="notice-danger">
        <i class="fas fa-fw fa-exclamation-triangle"></i>
        {{
          loadError === "notfound"
            ? "このユーザーは見つかりませんでした。URL が古いか、まだ参拝していない可能性があります。"
            : "公開プロフィールを読み込めませんでした。時間をおいてもう一度お試しください。"
        }}
      </div>
      <div class="d-flex flex-wrap gap-2 mt-4">
        <nuxt-link to="/" class="btn btn-lg btn-accent">トップへ戻る</nuxt-link>
        <nuxt-link to="/ranking" class="btn btn-lg btn-ghost">ランキングを見る</nuxt-link>
      </div>
    </div>
    <template v-else-if="!isLoading">
      <div class="d-flex align-items-center gap-3 mb-3">
        <img :src="profile.profileImage" alt="" class="avatar-lg" />
        <div class="min-w-0">
          <h1 class="fs-2 mb-0">{{ profile.nickName }}</h1>
          <a
            :href="`https://github.com/` + profile.screenName"
            class="small"
            target="_blank"
          >
            <i class="fab fa-github fa-fw"></i>{{ profile.screenName }}
          </a>
        </div>
      </div>
      <div class="row">
        <div class="col-12 col-lg-8 mb-3 mb-lg-0">
          <div class="card-shrine p-3 h-100">
            <div class="stat-tiles">
              <div class="tile"><small>れべる</small><b>{{ status.level }}</b></div>
              <div class="tile"><small>ぽいんと</small><b>{{ status.points }}</b></div>
              <div class="tile"><small>せんとうりょく</small><b>{{ status.total }}</b></div>
            </div>
            <div class="stat-tiles mt-3">
              <div class="tile"><small>たいりょく</small><b>{{ status.hp }}</b></div>
              <div class="tile"><small>ちから</small><b>{{ status.power }}</b></div>
              <div class="tile"><small>かしこさ</small><b>{{ status.intelligence }}</b></div>
              <div class="tile"><small>しゅびりょく</small><b>{{ status.defence }}</b></div>
              <div class="tile"><small>すばやさ</small><b>{{ status.agility }}</b></div>
            </div>
            <div class="mt-3 small text-muted">前回の参拝：{{ status.last_sanpai }}</div>
            <div v-if="!isLogin" class="mt-3">
              <nuxt-link to="/" class="btn btn-lg btn-accent"
                >コントリビュートして自分の能力を分析！
              </nuxt-link>
            </div>
            <Share
              v-if="$route.params.userName === (user ? user.screen_name : false)"
              class="mt-3"
              align="start"
              title="プロフィールをSNSでシェアしよう"
              :url="shareUrl"
              :message="shareMessage"
            ></Share>
          </div>
        </div>
        <div class="col-12 col-lg-4">
          <div class="card-shrine p-3 h-100 d-flex flex-column text-center">
            <div class="p-2 label-accent">でばっぐのうりょく</div>
            <div class="radar-box mx-auto w-100">
              <RadarChart :chartData="chartData" />
            </div>
            <div class="mt-auto pt-2">
              <img src="/428lab.svg" alt="428lab" height="24" />
            </div>
          </div>
        </div>
      </div>
      <!-- ポートフォリオ: 参拝の記録(累計・ストリーク・称号)/GitHub実績/草 -->
      <ProfileStats class="mt-3" :screen-name="$route.params.userName" />
      <GithubStats class="mt-3" :screen-name="$route.params.userName" />
      <SanpaiGrass class="mt-3" :screen-name="$route.params.userName" />
    </template>
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
          content: `${this.$config.apiUrl}userOGPGo?user=${this.$route.params.userName}`,
        },
        { hid: "og:title", name: "og:title", content: "でばっぐ神社" },
      ],
    };
  },
  components: { RadarChart },
  data() {
    return {
      isLoading: true,
      // 読み込み失敗の理由。"" / "notfound"(404) / "failed"
      loadError: "",
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
    // Go版(statusGo)はコールドスタートが短く表示が速くなるため使用する
    // (Node版のstatusとレスポンス形式は同一。docs/backend.md参照)
    let response;
    try {
      response = await this.$axios.get("statusGo?user=" + this.$route.params.userName);
    } catch (e) {
      // 未登録(404)・通信断で全画面の Loading が消えないままにならないよう、
      // 閉じてから理由を出す
      const statusCode = e.response && e.response.status;
      this.loadError = statusCode === 404 ? "notfound" : "failed";
      this.isLoading = false;
      return;
    }
    // レーダーは絶対値でなく「最も高い能力に対する割合(%)」で描く。
    // 最強能力=100%=外周で、全能力同値なら満点の五角形になる
    // (powerChart.vue のスケール0〜100%・OGPカードと同じ正規化)。
    const chart = response.data.chart;
    const raw = [chart.hp, chart.power, chart.intelligence, chart.defence, chart.agility];
    const chartMax = Math.max(...raw);
    this.chartData.datasets[0].data =
      chartMax > 0 ? raw.map((v) => Math.round((v / chartMax) * 100)) : raw;

    // dataの空オブジェクトへの後付けプロパティ追加はVue 2では検知されず、
    // computed(shareMessage等)が初回値のまま固定される。オブジェクトごと
    // 差し替えてリアクティブにする(#165)。
    this.profile = {
      nickName: response.data.user.display_name,
      screenName: response.data.user.screen_name,
      profileImage: response.data.user.github_image_path,
    };
    this.status = {
      level: response.data.level,
      points: response.data.points,
      total: response.data.total,
      hp: response.data.hp,
      power: response.data.power,
      intelligence: response.data.intelligence,
      defence: response.data.defence,
      agility: response.data.agility,
      last_sanpai: response.data.last_sanpai,
    };
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
.radar-box {
  max-width: 320px;
}
.min-w-0 {
  min-width: 0;
}
</style>
