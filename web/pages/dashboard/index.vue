<template>
  <main class="container pt-4 pt-lg-5">
    <!-- 読み込み失敗。Loading を閉じて理由と戻り先を出す(行き止まりにしない) -->
    <div v-if="loadError" class="content-wide">
      <h1 class="fs-2 mb-3">マイページ</h1>
      <div class="notice-danger">
        <i class="fas fa-fw fa-exclamation-triangle"></i>
        {{
          loadError === "notfound"
            ? "参拝者の情報が見つかりませんでした。トップページからログインし直してください。"
            : "マイページを読み込めませんでした。時間をおいてもう一度お試しください。"
        }}
      </div>
      <div class="d-flex flex-wrap gap-2 mt-4">
        <nuxt-link to="/" class="btn btn-lg btn-accent">トップへ戻る</nuxt-link>
        <nuxt-link to="/ranking" class="btn btn-lg btn-ghost">ランキングを見る</nuxt-link>
      </div>
    </div>
    <template v-else>
      <div
        class="d-flex flex-wrap align-items-baseline gap-3 mb-3"
        v-if="!isLoading"
      >
        <h1 class="fs-2 mb-0 me-auto">マイページ</h1>
        <nuxt-link :to="`/u/` + user.screen_name" class="link-more small"
          >公開プロフィールを確認 <i class="fas fa-fw fa-chevron-right"></i
        ></nuxt-link>
      </div>
      <div class="row">
        <div class="col-12 col-lg-8 mb-3 mb-lg-0">
          <div class="card-shrine p-3 h-100">
            <div class="d-flex align-items-center gap-3">
              <img
                :src="user.image_path"
                alt=""
                class="avatar-lg"
              />
              <div class="min-w-0">
                <div class="fs-5 fw-bold">{{ user.display_name }}</div>
                <div class="small text-muted">
                  <i class="fab fa-github fa-fw"></i>{{ user.screen_name }}
                </div>
              </div>
            </div>
            <div class="stat-tiles mt-3">
              <div class="tile"><small>れべる</small><b>{{ profile.level }}</b></div>
              <div class="tile"><small>ぽいんと</small><b>{{ profile.point }}</b></div>
              <div class="tile"><small>せんとうりょく</small><b>{{ profile.total }}</b></div>
            </div>
            <div class="progress mt-3">
              <div
                class="progress-bar p-2"
                role="progressbar"
                :style="`width:` + progressPercent + `%`"
                :aria-valuenow="profile.total"
                aria-valuemin="0"
                :aria-valuemax="profile.next"
              >
                {{ profile.exp }} exp
              </div>
            </div>
            <div class="small text-muted text-end mt-1 num">NEXT {{ profile.next }} exp</div>
            <div class="stat-tiles mt-3">
              <div class="tile"><small>たいりょく</small><b>{{ profile.hp }}</b></div>
              <div class="tile"><small>ちから</small><b>{{ profile.power }}</b></div>
              <div class="tile"><small>かしこさ</small><b>{{ profile.intelligence }}</b></div>
              <div class="tile"><small>しゅびりょく</small><b>{{ profile.defence }}</b></div>
              <div class="tile"><small>すばやさ</small><b>{{ profile.agility }}</b></div>
            </div>
            <Share
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
            <div class="mt-auto pt-2 small text-muted">
              前回の参拝：{{ profile.last_sanpai }}
            </div>
          </div>
        </div>
      </div>
      <!-- ポートフォリオ: 参拝の記録(累計・ストリーク・称号)/GitHub実績/草 -->
      <ProfileStats
        v-if="user && user.screen_name"
        class="mt-3"
        :screen-name="user.screen_name"
      />
      <GithubStats
        v-if="user && user.screen_name"
        class="mt-3"
        :screen-name="user.screen_name"
        :github-id="user.github_id"
        editable
      />
      <SanpaiGrass
        v-if="user && user.screen_name"
        class="mt-3"
        :screen-name="user.screen_name"
      />
      <!-- README埋め込みバッジ(自分のプロフィールへの導線をGitHubに貼れる) -->
      <div v-if="user && user.screen_name" class="card-shrine p-3 mt-3">
        <div class="fw-bold mb-2"><i class="fas fa-fw fa-bookmark"></i> READMEに貼れるバッジ</div>
        <p class="badge-note mb-2">
          GitHubのプロフィールREADMEに貼ると、レベルと戦闘力のバッジから
          公開プロフィールへ飛べます。
        </p>
        <img :src="badgeUrl" alt="でばっぐ神社バッジ" height="20" class="mb-3" />
        <ShareText title="" :text="badgeMarkdown"></ShareText>
      </div>
    </template>
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
      // 読み込み失敗の理由。"" / "notfound"(404) / "failed"
      loadError: "",
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
    let response;
    try {
      response = await this.$axios.get(
        `statusGo?user=${this.user.screen_name}`
      );
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

    // profile は丸ごと差し替える。1つずつ代入すると Vue 2 が検知できず
    // (空オブジェクトへの後付けプロパティはリアクティブにならない)、
    // progressPercent がデータ到着前の初回描画で評価した値のまま固まる。
    // 進捗バーは v-if="!isLoading" の外にあるため必ず先に描画され、そのとき
    // next が undefined で 100% を返していた = レベルに関係なく常に満タン。
    this.profile = {
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
      // 進捗バーの起点(今のレベルの下限)
      levelStart: response.data.level_start_exp,
      last_sanpai: response.data.last_sanpai,
    };
    if(response){
      this.isLoading = false;
    }
  },
  computed: {
    ...mapGetters(["user"]),
    // 進捗バーの割合。「今のレベルの中でどこまで進んだか」を出す。
    //
    // 以前は 累計 / 次レベル で出していたため、レベルが上がるほど分子と分母が
    // 近づき、レベル帯の先頭にいてもバーがほぼ満タンに見えていた
    // (Lv54 の下限 50759 でも 50759/55293 = 92%)。
    //
    // 未取得(読み込み中)は0%。ここで100を返すと、データが来るまで満タンの
    // バーを見せることになる。頭打ち(最高レベルで next が伸びない)のときだけ
    // 100%にする。0除算・100%超えもここで防ぐ。
    progressPercent() {
      const next = Number(this.profile.next);
      const total = Number(this.profile.total);
      const start = Number(this.profile.levelStart) || 0;
      if (!next || !isFinite(next) || !isFinite(total)) return 0;
      if (next <= start) return 100;
      const ratio = (total - start) / (next - start);
      return Math.max(0, Math.min(100, ratio * 100));
    },
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
  },
};
</script>

<style scoped>
.badge-note {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.radar-box {
  max-width: 320px;
}
.min-w-0 {
  min-width: 0;
}
</style>
