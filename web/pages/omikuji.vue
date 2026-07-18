<template>
  <div class="text-center container py-5 content-narrow">
    <h1 class="mb-2">おみくじ</h1>
    <p class="text-muted">8時間に1回、ITの運勢を占えるぞ。</p>

    <!-- 状態取得中(ローディング表現はLoadingコンポーネントに統一) -->
    <Loading v-if="state === 'loading'" message="お伺いを立てています"></Loading>

    <!-- エラー -->
    <div v-else-if="state === 'error'" class="my-5">
      <div class="alert alert-warning">
        うまく引けませんでした。時間をおいて試してください。
      </div>
      <button class="btn btn-outline-secondary" @click="fetchStatus">
        再読み込み
      </button>
    </div>

    <!-- 引ける -->
    <div v-else-if="state === 'available'" class="my-5">
      <div class="omikuji-box mx-auto mb-4"><i class="fas fa-torii-gate"></i></div>
      <button class="btn btn-lg btn-accent px-5" @click="startScene">
        おみくじを引く
      </button>
      <div v-if="result" class="mt-3 text-muted small">
        （前回の結果は下に表示されています）
      </div>
      <ResultCard v-if="result" :result="result" class="mt-4" />
    </div>

    <!-- 結果表示(引いた直後 / クールダウン中の前回結果) -->
    <div v-else-if="result" class="my-4">
      <ResultCard :result="result" />

      <div v-if="state === 'cooldown'" class="mt-4 text-muted">
        次に引けるまで <span class="fw-bold">{{ remainingText }}</span>
      </div>

      <div class="mt-4">
        <Share
          title="おみくじの結果をSNSで報告しよう"
          :url="shareUrl"
          :message="shareMessage"
          :text="shareText"
        ></Share>
      </div>

      <div class="mt-4">
        <nuxt-link class="btn btn-outline-light" to="/dashboard">
          マイページで称号を確認
        </nuxt-link>
      </div>
    </div>

    <!-- クールダウン中で前回結果が無い場合 -->
    <div v-else-if="state === 'cooldown'" class="my-5 text-muted">
      次に引けるまで <span class="fw-bold">{{ remainingText }}</span>
    </div>

    <!-- 物理乱数(kuda)が枯渇・停止中。疑似乱数では引かない -->
    <div v-else-if="state === 'empty'" class="my-5">
      <div class="fs-1"><i class="fas fa-atom"></i></div>
      <div class="fs-4 mt-3">
        「御籤の源(物理乱数)が尽きておる…<br class="d-md-none" />しばし待たれよ。」
      </div>
      <p class="text-muted mt-2 small">
        この神社のおみくじは量子ゆらぎと放射性崩壊の実測値だけで引かれます。
        エントロピーが補充されるまでお待ちください。
      </p>
      <button class="btn btn-outline-secondary mt-2" @click="fetchStatus">
        もう一度確かめる
      </button>
    </div>

    <!-- 抽選演出(鈴の緒 → 連鎖 → 狐が選ぶ)。全画面オーバーレイ -->
    <OmikujiScene
      v-if="state === 'animating'"
      :target-tier="pendingResult && pendingResult.tier"
      @rang="onRang"
      @landed="onLanded"
    />
  </div>
</template>

<script>
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { mapGetters } from "vuex";
import ResultCard from "@/components/OmikujiResult";
import OmikujiScene from "@/components/OmikujiScene";

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
  components: { ResultCard, OmikujiScene },
  data() {
    return {
      state: "loading", // loading | available | animating | cooldown | empty(物理乱数枯渇) | error
      result: null,
      pendingResult: null, // 演出中に保持(着地まで表示しない)
      remaining: 0, // 次に引けるまでの秒
      timerId: null,
    };
  },
  async mounted() {
    await this.fetchStatus();
  },
  beforeDestroy() {
    if (this.timerId) clearInterval(this.timerId);
  },
  methods: {
    async getToken() {
      const auth = getAuth();
      const currentUser = await resolveCurrentUser(auth);
      if (!currentUser) {
        this.$store.dispatch("logout");
        return null;
      }
      const token = await currentUser.getIdToken();
      this.$store.commit("setToken", token);
      return token;
    },
    // 引かずに現在の状態(引ける/クールダウン+前回結果)を取得する。
    async fetchStatus() {
      this.state = "loading";
      const token = await this.getToken();
      if (!token) return;
      try {
        const res = await this.$axios.post(
          "omikujiGo",
          { github_id: this.user.github_id, peek: true },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        this.applyResponse(res.data);
      } catch (e) {
        this.state = "error";
      }
    },
    // 「引く」→ 演出(鈴の緒儀式)を開始。実際の抽選は鈴が鳴った時(onRang)。
    startScene() {
      if (this.state === "animating") return;
      this.pendingResult = null;
      this._pendingRemaining = 0;
      this.state = "animating";
    },
    // 鈴が鳴った → サーバーで抽選。成功なら結果を保持し、演出(狐)が着地してから表示。
    async onRang() {
      const token = await this.getToken();
      if (!token) {
        this.state = "error";
        return;
      }
      try {
        const res = await this.$axios.post(
          "omikujiGo",
          { github_id: this.user.github_id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const d = res.data;
        if (d.status === "success") {
          this._pendingRemaining = d.remaining_seconds || 0;
          this.pendingResult = d.result; // targetTier が埋まり、狐が本命へ走る
        } else {
          // cooldown / failed など:演出を畳んで通常表示へ
          this.applyResponse(d);
        }
      } catch (e) {
        this.state = "error";
      }
    },
    // 狐が本命ビンに着地 → 結果を確定表示。
    onLanded() {
      if (this.pendingResult) {
        this.result = this.pendingResult;
        this.remaining = this._pendingRemaining || 0;
        this.pendingResult = null;
        this.state = "cooldown";
        this.startTimer();
      } else {
        // 演出が結果より先に終わった(スキップ等)→ サーバー状態を取り直す
        this.fetchStatus();
      }
    },
    applyResponse(d) {
      if (d.status === "success") {
        this.result = d.result;
        this.remaining = d.remaining_seconds || 0;
        this.state = "cooldown";
        this.startTimer();
      } else if (d.status === "cooldown") {
        this.result = d.result || null;
        this.remaining = d.remaining_seconds || 0;
        this.state = "cooldown";
        this.startTimer();
      } else if (d.status === "available") {
        this.state = "available";
      } else if (d.status === "no_entropy") {
        // 物理乱数(kuda)が枯渇・停止中。クールダウンは消費されていないので
        // 補充され次第また引ける。
        this.state = "empty";
      } else {
        // not registered / failed など
        this.state = "error";
      }
    },
    startTimer() {
      if (this.timerId) clearInterval(this.timerId);
      this.timerId = setInterval(() => {
        this.remaining -= 1;
        if (this.remaining <= 0) {
          clearInterval(this.timerId);
          this.timerId = null;
          this.remaining = 0;
          // 引ける状態へ。前回結果は残しつつボタンを出す。
          this.state = "available";
        }
      }, 1000);
    },
  },
  computed: {
    ...mapGetters(["user"]),
    remainingText() {
      const s = Math.max(0, this.remaining);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      if (h > 0) return `${h}時間${m}分`;
      if (m > 0) return `${m}分${sec}秒`;
      return `${sec}秒`;
    },
    shareUrl() {
      return this.$config.baseUrl;
    },
    shareMessage() {
      if (!this.result) return "でばっぐ神社でおみくじを引いたよ。";
      return `でばっぐ神社のITおみくじは【${this.result.tier}】「${this.result.fortune}」でした。`;
    },
    // コピペ用の全文(参拝の shareText と同じ流儀)。項目ごとの文章まで含める。
    shareText() {
      if (!this.result) return "";
      const emoji = {
        超吉: "🌟",
        大吉: "🎉",
        中吉: "😊",
        小吉: "🙂",
        末吉: "😌",
        凶: "😰",
        大凶: "💀",
      }[this.result.tier] || "🔮";
      const lines = [
        `⛩️でばっぐ神社のITおみくじは${emoji}【${this.result.tier}】でした`,
        `「${this.result.fortune}」`,
        ...(this.result.lines || []).map((l) => `・${l.category}: ${l.text}`),
        "#でばっぐ神社",
        this.shareUrl,
      ];
      return lines.join("\n");
    },
  },
};
</script>

<style scoped>
.omikuji-box {
  width: 120px;
  height: 120px;
  line-height: 120px;
  font-size: 64px;
  color: var(--color-accent);
  border-radius: 12px;
  background: radial-gradient(circle at 50% 40%, #5a5050, #2b2b2b 70%);
  box-shadow: 0 0 18px rgba(255, 180, 90, 0.4);
}
</style>
