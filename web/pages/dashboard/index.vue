<template>
  <main class="container p-3">
    <div class="d-md-flex justify-content-between align-items-end" v-if="!isLoading">
      <h1 class="fs-1 flex-fill mb-0">マイページ</h1>
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
                <div class="">せんとうりょく：{{ profile.total }}</div>
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
          <div class="mb-3">前回の参拝：{{ profile.last_sanpai }}</div>
          <div class="p-2 text-center label-accent">
            でばっぐのうりょく
          </div>
          <RadarChart :chartData="chartData" />
        </div>
      </div>
      <!-- ポートフォリオ: 参拝の記録(累計・ストリーク・称号)/GitHub実績/草 -->
      <ProfileStats
        v-if="user && user.screen_name"
        class="mt-4"
        :screen-name="user.screen_name"
      />
      <GithubStats
        v-if="user && user.screen_name"
        class="mt-4"
        :screen-name="user.screen_name"
      />
      <SanpaiGrass
        v-if="user && user.screen_name"
        class="mt-4"
        :screen-name="user.screen_name"
      />
      <!-- README埋め込みバッジ(自分のプロフィールへの導線をGitHubに貼れる) -->
      <div v-if="user && user.screen_name" class="badge-section p-3 rounded mt-4">
        <div class="fw-bold mb-2">🔖 READMEに貼れるバッジ</div>
        <p class="badge-note mb-2">
          GitHubのプロフィールREADMEに貼ると、レベルと戦闘力のバッジから
          公開プロフィールへ飛べます。
        </p>
        <img :src="badgeUrl" alt="でばっぐ神社バッジ" height="20" class="mb-3" />
        <ShareText title="" :text="badgeMarkdown"></ShareText>
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
    // Go版(statusGo)はコールドスタートが短くマイページ表示が速くなるため使用する
    // (Node版のstatusとレスポンス形式は同一。docs/backend.md参照)
    let response = await this.$axios.get(
      `statusGo?user=${this.user.screen_name}`
    );
    // 登録してなかったらエラーが出るのでエラー対応よろ
    // レーダーは絶対値でなく「最も高い能力に対する割合(%)」で描く。
    // 最強能力=100%=外周で、全能力同値なら満点の五角形になる
    // (powerChart.vue のスケール0〜100%・OGPカードと同じ正規化)。
    const chart = response.data.chart;
    const raw = [chart.hp, chart.power, chart.intelligence, chart.defence, chart.agility];
    const chartMax = Math.max(...raw);
    this.chartData.datasets[0].data =
      chartMax > 0 ? raw.map((v) => Math.round((v / chartMax) * 100)) : raw;

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
    // README用バッジ。画像はbadgeGo(SVG)、リンク先は公開プロフィール。
    badgeUrl() {
      return this.$config.baseUrl + "badgeGo?user=" + this.user.screen_name;
    },
    badgeMarkdown() {
      return `[![でばっぐ神社](${this.badgeUrl})](${this.shareUrl})`;
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

.badge-section {
  background: var(--color-surface);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.badge-note {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.debug-title {
  border-radius: 10px;
}
</style>
