<template>
  <div class="text-center">
    <!-- 参拝の儀式:大きな👏🏻を2回タップ(二拍手)して参拝する。
         ページを開いただけでは参拝APIを叩かない(誤爆・リロード参拝の根絶)。 -->
    <div class="container py-5" v-if="ritual">
      <h1 class="mt-4 mb-2">参拝</h1>
      <p class="text-muted mb-4">御神体の前で二拍手を打つのじゃ</p>
      <div class="clap-stage mx-auto my-4">
        <span
          v-for="ring in rings"
          :key="ring"
          class="clap-ring"
          aria-hidden="true"
        ></span>
        <button
          type="button"
          class="clap-btn"
          :class="{ 'clap-pop': claps > 0 }"
          :key="'clap-' + popKey"
          aria-label="参拝する(2回タップ)"
          @click="onClap"
        >
          👏🏻
        </button>
      </div>
      <div class="fs-4 clap-hint" :class="{ 'clap-hint-hot': claps > 0 }">
        {{ claps > 0 ? "もう一拍!" : "👏🏻 を2回タップして参拝" }}
      </div>
    </div>

    <div class="container" v-if="status && !ritual">
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
    <!-- 通信失敗(ネットワーク瞬断・サーバーエラー)。儀式はやり直させない -->
    <div class="container py-5" v-if="isError && !ritual">
      <div class="fs-1">「むむ、うまく声が届かなかったようじゃ。」</div>
      <div class="fs-4 mt-4">
        通信に失敗しました。少し待ってからもう一度お試しください。
      </div>
      <button
        type="button"
        class="btn btn-lg btn-accent mt-4"
        @click="onRetry"
      >
        もう一度参拝する
      </button>
    </div>
    <!-- 参拝前(儀式中)・結果未確定のうちは共有UIや導線を出さない -->
    <template v-if="!ritual && result">
      <div class="my-5">
        <Share
          title="参拝したことをSNSで報告しよう"
          :url="shareUrl"
          :message="shareMessage"
          :text="result === 'success' ? shareText : ''"
        ></Share>
      </div>
      <div>
        <nuxt-link class="btn btn-lg btn-accent me-2" to="/omikuji">
          おみくじを引く
        </nuxt-link>
        <nuxt-link class="btn btn-lg btn-outline-light" to="/dashboard">
          マイページを見る
        </nuxt-link>
      </div>
    </template>
    <transition name="loading-fade">
      <Loading v-if="isLoading" :messages="loadingMessages"></Loading>
    </transition>
  </div>
</template>

<script>
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { mapGetters } from "vuex";
import {
  saveSanpaiResult,
  loadRestorableSanpaiResult,
} from "~/utils/sanpaiSession";

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
      // 👏🏻の儀式(二拍手)が済むまで参拝APIは叩かない
      ritual: true,
      claps: 0,
      lastClapAt: 0,
      clapTimerId: null,
      popKey: 0, // 拍手のたびにボタンを再マウントしてバウンスを再生する
      rings: [], // 波紋リング(拍手ごとに追加)
      isLoading: false,
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
  mounted() {
    // SWの自動リロード・PWA再起動・タブ退避復帰などで再マウントされた場合、
    // クールダウン内なら儀式をやり直させず完了画面を復元する。儀式画面に
    // 戻すと二拍手→サーバー判定でexpireの悪循環になる(#198)
    const saved = loadRestorableSanpaiResult(Date.now());
    if (saved) {
      this.ritual = false;
      this.result = "success";
      this.status = { ...this.status, ...saved };
      return;
    }
    // 儀式〜参拝完了まではSWの自動リロードを保留させる(#198)
    this.setSwReloadBlocked(true);
  },
  beforeDestroy() {
    if (this.clapTimerId) clearTimeout(this.clapTimerId);
    this.setSwReloadBlocked(false);
  },
  methods: {
    // 二拍手の判定。dblclick はモバイルで不安定なため click を自前でカウントする。
    // 700ms 以内に2回タップで参拝実行。間が空いたら1拍目からやり直し。
    onClap() {
      if (!this.ritual || this.claps >= 2) return; // 実行後の再入防止
      const now = Date.now();
      if (this.claps === 1 && now - this.lastClapAt <= 700) {
        this.claps = 2;
        if (this.clapTimerId) clearTimeout(this.clapTimerId);
        this.pop();
        // 2拍目のバウンスを見せてから参拝へ
        setTimeout(() => {
          this.ritual = false;
          this.isLoading = true;
          this.doSanpai();
        }, 350);
        return;
      }
      this.claps = 1;
      this.lastClapAt = now;
      this.pop();
      if (this.clapTimerId) clearTimeout(this.clapTimerId);
      this.clapTimerId = setTimeout(() => {
        this.claps = 0; // 時間切れ:改めて2回必要
      }, 700);
    },
    // 通信失敗後の再試行。儀式(二拍手)は済んでいるのでAPIだけやり直す
    onRetry() {
      this.isError = false;
      this.isLoading = true;
      this.setSwReloadBlocked(true);
      this.doSanpai();
    },
    // sw-update.client.js が公開するガード。儀式〜参拝API実行中の
    // SW自動リロードを保留する(#198)
    setSwReloadBlocked(blocked) {
      const guard = typeof window !== "undefined" && window.$swReloadGuard;
      if (guard) guard.blocked = blocked;
    },
    // 拍手のフィードバック(バウンス再生+波紋リング追加)
    pop() {
      this.popKey += 1;
      this.rings.push(this.popKey);
      if (this.rings.length > 3) this.rings.shift();
    },
    async doSanpai() {
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
      // Go版(sanpaiGo)はコールドスタートが短く参拝処理が速くなるため使用する
      // (Node版のsanpaiとレスポンス形式は同一。docs/backend.md参照)
      let response;
      try {
        response = await this.$axios.post("sanpaiGo",
          payload,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
      } catch (e) {
        // ログアウトは認証エラー(401/403)のときだけ。ネットワーク瞬断や5xxで
        // ログアウトさせると、再サインイン→再参拝→expireの悪循環になる(#198)
        const statusCode = e.response && e.response.status;
        if (statusCode === 401 || statusCode === 403) {
          this.$store.dispatch("logout");
        } else {
          this.isError = true;
        }
        this.isLoading = false;
        return;
      }
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
      if (d.status === "success") {
        // クールダウン内の再マウントで完了画面を復元できるよう保存(#198)
        saveSanpaiResult({ ...this.status }, d.next_time, Date.now());
      }
    },
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
/* 👏🏻 二拍手UI */
.clap-stage {
  position: relative;
  width: 220px;
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.clap-btn {
  width: 200px;
  height: 200px;
  border: none;
  border-radius: 50%;
  font-size: 96px;
  line-height: 1;
  cursor: pointer;
  background: radial-gradient(circle at 50% 40%, #5a5050, #2b2b2b 70%);
  box-shadow: 0 0 22px rgba(255, 180, 90, 0.45);
  /* ダブルタップズーム・300ms遅延・長押し選択を抑止 */
  touch-action: manipulation;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  animation: clap-idle 2.4s ease-in-out infinite;
}
.clap-btn:active {
  transform: scale(0.94);
}
/* 待機中はふわっと呼吸して「押せる」ことを示す */
@keyframes clap-idle {
  0%,
  100% {
    box-shadow: 0 0 16px rgba(255, 180, 90, 0.35);
  }
  50% {
    box-shadow: 0 0 30px rgba(255, 180, 90, 0.7);
  }
}
/* 拍手した瞬間のバウンス(popKeyで再マウントして毎回再生) */
.clap-pop {
  animation: clap-bounce 0.35s ease-out;
}
@keyframes clap-bounce {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.18);
  }
  70% {
    transform: scale(0.96);
  }
  100% {
    transform: scale(1);
  }
}
/* 拍手のたびに外へ広がる波紋 */
.clap-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 200px;
  height: 200px;
  margin: -100px 0 0 -100px;
  border: 3px solid rgba(255, 196, 120, 0.9);
  border-radius: 50%;
  pointer-events: none;
  animation: clap-ring-pulse 0.7s ease-out forwards;
}
@keyframes clap-ring-pulse {
  0% {
    transform: scale(1);
    opacity: 0.9;
  }
  100% {
    transform: scale(1.7);
    opacity: 0;
  }
}
.clap-hint {
  user-select: none;
}
.clap-hint-hot {
  color: #ffcf6b;
  font-weight: 700;
}

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
