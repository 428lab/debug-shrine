<template>
  <div class="text-center container py-5" style="max-width: 640px">
    <h1 class="mb-2">おみくじ</h1>
    <p class="text-muted">8時間に1回、ITの運勢を占えるぞ。</p>

    <!-- 状態取得中 -->
    <div v-if="state === 'loading'" class="my-5">
      <div class="spinner-border" role="status"></div>
      <div class="mt-3 text-muted">お伺いを立てています...</div>
    </div>

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
      <div class="omikuji-box mx-auto mb-4">⛩️</div>
      <button
        class="btn btn-lg btn-danger px-5"
        :disabled="drawing"
        @click="draw"
      >
        {{ drawing ? "抽選中..." : "おみくじを引く" }}
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
        ></Share>
      </div>
    </div>

    <!-- クールダウン中で前回結果が無い場合 -->
    <div v-else-if="state === 'cooldown'" class="my-5 text-muted">
      次に引けるまで <span class="fw-bold">{{ remainingText }}</span>
    </div>
  </div>
</template>

<script>
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { mapGetters } from "vuex";
import ResultCard from "@/components/OmikujiResult";

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
  components: { ResultCard },
  data() {
    return {
      state: "loading", // loading | available | cooldown | error
      result: null,
      remaining: 0, // 次に引けるまでの秒
      drawing: false,
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
    async draw() {
      if (this.drawing) return;
      this.drawing = true;
      const token = await this.getToken();
      if (!token) {
        this.drawing = false;
        return;
      }
      try {
        const res = await this.$axios.post(
          "omikujiGo",
          { github_id: this.user.github_id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        this.applyResponse(res.data);
      } catch (e) {
        this.state = "error";
      } finally {
        this.drawing = false;
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
  },
};
</script>

<style scoped>
.omikuji-box {
  width: 120px;
  height: 120px;
  line-height: 120px;
  font-size: 64px;
  border-radius: 12px;
  background: radial-gradient(circle at 50% 40%, #5a5050, #2b2b2b 70%);
  box-shadow: 0 0 18px rgba(255, 180, 90, 0.4);
}
</style>
