<template>
  <div class="text-center">
    <div class="container" v-if="status">
      <transition name="result-fade">
      <div v-if="result === 'success'">
        <div class="p-5">
          <img
            src="/sanpai/success_01.png"
            alt="でばっぐ神社"
            class="w-100"
            width="1500"
            height="730"
            style="max-width: 700px; height: auto"
          />
        </div>
        <div class="fs-1">「殊勝なことじゃ。きっと良きことがあるぞよ。」</div>
        <div class="fs-4 mt-4">{{ status.msg }}</div>

        <LevelUpBanner
          v-if="isLevelUp"
          :from="status.levelBefore"
          :to="status.levelAfter"
        />

        <!-- ポイントの変化 -->
        <div class="result-block mt-4">
          <div class="fs-5">獲得ポイント</div>
          <div class="fs-2 result-line">
            <span class="text-muted">{{ status.pointsBefore.toLocaleString() }}</span>
            <span class="result-arrow">→</span>
            <CountUp
              :from="status.pointsBefore"
              :value="status.pointsAfter"
              :delay="300"
              suffix=" pt"
            />
            <span class="badge bg-success ms-2">+{{ status.get }}</span>
          </div>
        </div>

        <!-- 戦闘力の変化 -->
        <div class="result-block mt-4">
          <div class="fs-5">戦闘力</div>
          <div class="fs-2 result-line">
            <span class="text-muted">{{ status.powerBefore.toLocaleString() }}</span>
            <span class="result-arrow">→</span>
            <CountUp
              :from="status.powerBefore"
              :value="status.powerAfter"
              :delay="600"
            />
            <span v-if="powerDelta > 0" class="badge bg-danger ms-2">
              +{{ powerDelta }}
            </span>
          </div>
        </div>

        <!-- 今回の参拝でのアクティビティ差分 -->
        <div class="result-block mt-4">
          <div class="d-flex justify-content-center result-activity">
            <div class="mx-3">
              <div class="fs-6">更新リポジトリ</div>
              <div class="fs-3">
                <CountUp :value="status.updatedRepoCount" :delay="900" />
              </div>
            </div>
            <div class="mx-3">
              <div class="fs-6">アクション</div>
              <div class="fs-3">
                <CountUp :value="status.actionCount" :delay="900" />
              </div>
            </div>
          </div>
        </div>

        <!-- SNS投稿用テキスト -->
        <div class="my-5 mx-auto" style="max-width: 600px">
          <ShareText title="SNSで自慢しよう" :text="shareText"></ShareText>
        </div>
      </div>
      <div v-else-if="result === 'expire'">
        <div class="px-5">
          <img
            src="/sanpai/expire_01.png"
            alt="でばっぐ神社"
            class="w-100"
            width="795"
            height="723"
            style="max-width: 700px; height: auto"
          />
        </div>
        <div class="fs-1">
          「おっと、参拝のペースが早すぎるようじゃ。そう逸るでない。」
        </div>
        <div class="fs-4 mt-4">追加のポイントはありませんでした</div>
      </div>
      <div v-else-if="result === 'noaction'">
        <div class="px-5">
          <img
            src="/sanpai/noaction_01.png"
            alt="でばっぐ神社"
            class="w-100"
            width="800"
            height="749"
            style="max-width: 700px; height: auto"
          />
        </div>
        <div class="fs-1">
          「まずはぎっとはぶでコントリビュートするのじゃ。」
        </div>
        <div class="fs-4 mt-4">追加のポイントはありませんでした</div>
      </div>
      </transition>
    </div>
    <!-- v-if="result === 'success'" -->
    <div class="my-5">
      <Share
        title="参拝したことをSNSで報告しよう"
        :url="shareUrl"
        :message="shareMessage"
      ></Share>
    </div>
    <nuxt-link class="btn btn-lg btn-primary" to="/dashboard">
      マイページを見る
    </nuxt-link>
    <transition name="loading-fade">
      <Loading v-if="isLoading" :messages="loadingMessages"></Loading>
    </transition>
  </div>
</template>

<script>
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { mapGetters } from "vuex";

// 認証状態の復元は非同期のため、最初に確定したユーザーを待ち受ける
function resolveCurrentUser(auth) {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

export default {
  middleware: ["auth"],
  data() {
    return {
      isLoading: true,
      isError: false,
      result: "",
      loadingMessages: [
        "ブンセキチュウ...",
        "コミットをかぞえています",
        "御神木にお伺いを立てています",
        "バグを祓っています",
        "戦闘力をはかっています",
        "おみくじを準備しています",
      ],
      status: {
        level: 0,
        point: 0,
        get: 0,
        msg: "",
        pointsBefore: 0,
        pointsAfter: 0,
        powerBefore: 0,
        powerAfter: 0,
        levelBefore: 0,
        levelAfter: 0,
        updatedRepoCount: 0,
        actionCount: 0,
      },
    };
  },
  async mounted() {
    const auth = getAuth();
    const currentUser = await resolveCurrentUser(auth);
    if (!currentUser) {
      // 本当に未ログイン
      this.$store.dispatch("logout");
      this.isLoading = false;
      return;
    }
    // IDトークンは発行から1時間で失効するため、送信直前に再取得する
    // (失効していれば Firebase SDK が自動でリフレッシュする)
    const token = await currentUser.getIdToken();
    this.$store.commit("setToken", token);

    let payload = {
      github_id: this.user.github_id,
      screen_name: this.user.screen_name,
    };
    let response = await this.$axios.post("sanpai",
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      .catch(e=>{
        this.$store.dispatch('logout');
        this.isLoading = false;
      })
    if (response) {
      const d = response.data;
      this.status.level = d.level;
      this.status.get = d.add_exp;
      this.status.point = d.exp;
      this.status.msg = d.msg;
      this.status.pointsBefore = d.points_before != null ? d.points_before : 0;
      this.status.pointsAfter = d.points_after != null ? d.points_after : d.exp;
      this.status.powerBefore = d.power_before != null ? d.power_before : 0;
      this.status.powerAfter = d.power_after != null ? d.power_after : 0;
      this.status.levelBefore = d.level_before != null ? d.level_before : 0;
      this.status.levelAfter = d.level_after != null ? d.level_after : d.level;
      this.status.updatedRepoCount = d.updated_repo_count != null ? d.updated_repo_count : 0;
      this.status.actionCount = d.action_count != null ? d.action_count : 0;
      this.result = d.status;
      this.isLoading = false;
    } else {
      this.isError = true;
      this.isLoading = false;
    }
  },
  computed: {
    ...mapGetters(["user"]),
    powerDelta() {
      return this.status.powerAfter - this.status.powerBefore;
    },
    isLevelUp() {
      return this.status.levelAfter > this.status.levelBefore;
    },
    shareUrl() {
      return this.$config.baseUrl;
    },
    shareMessage() {
      return "でばっぐ神社に参拝して、" + this.status.get + "ポイント獲得しました。";
    },
    shareText() {
      const lines = [
        "⛩️でばっぐ神社に参拝しました",
        `獲得ポイント: +${this.status.get} pt (合計 ${this.status.pointsAfter} pt)`,
        `戦闘力: ${this.status.powerBefore} → ${this.status.powerAfter}` +
          (this.powerDelta > 0 ? ` (+${this.powerDelta})` : ""),
        `レベル: Lv.${this.status.levelAfter}` +
          (this.isLevelUp ? `（${this.status.levelBefore}からレベルアップ！）` : ""),
        `更新リポジトリ: ${this.status.updatedRepoCount} / アクション: ${this.status.actionCount}`,
        "#でばっぐ神社",
        this.shareUrl,
      ];
      return lines.join("\n");
    },
  },
};
</script>

<style scoped>
.result-arrow {
  margin: 0 0.6rem;
  color: #888;
}
.result-line {
  font-weight: 700;
}
.result-activity > div {
  min-width: 130px;
}

/* 結果ブロックのフェードイン(下からふわっと) */
.result-fade-enter-active {
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.result-fade-enter {
  opacity: 0;
  transform: translateY(16px);
}
.result-fade-enter-to {
  opacity: 1;
  transform: translateY(0);
}

/* ローディング表示のフェードアウト */
.loading-fade-leave-active {
  transition: opacity 0.45s ease;
}
.loading-fade-leave-to {
  opacity: 0;
}
</style>
