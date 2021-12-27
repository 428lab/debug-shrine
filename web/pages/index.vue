<template>
  <div>
    <div class="container py-5">
      <h1>でばっぐ神社とは</h1>
      <div>あらましをここに書く。</div>
      <div class="text-center mt-5">
        <button @click="GitHubAuth" class="btn btn-lg btn-primary">
          GitHubでログインして<br />
          参拝する
        </button>
      </div>
    </div>
    <div class="bg-github py-5">
      <div class="container">
        <div class="row align-items-center">
          <div class="col resizeimage">
            <img src="/github.svg" class="img-fluid" />
          </div>
          <div class="col resizeimage">
            <img src="/activity.svg" class="img-fluid" />
          </div>
          <div class="col resizeimage">
            <img src="/shrine.png" class="img-fluid" />
          </div>
        </div>
        <div>
          <h1 class="text-white">GitHub Avtivityと連携</h1>
        </div>
      </div>
    </div>
    <div class="container py-5">
      <h1>レーダーチャートであなたの活動を可視化</h1>
    </div>
    <div class="container py-5">
      <h1>プロフィールがそのまま名刺になる</h1>
    </div>
    <div class="py-5 px-5">
      <div class="text-center">
        <button @click="GitHubAuth" class="btn btn-lg btn-primary">
          GitHubでログインして<br />
          参拝する
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { getAuth, GithubAuthProvider, signInWithPopup } from "firebase/auth";
import { mapGetters } from "vuex";

export default {
  // middlewareでセッションチェックを行い、GitHubのログインチェックをしない
  middleware: ["auth"],
  data() {
    return {};
  },
  methods: {
    GitHubAuth() {
      const provider = new GithubAuthProvider();
      const auth = getAuth();
      signInWithPopup(auth, provider)
        .then((result) => {
          console.log(result);
          let userData = {
            github_id: result.user.providerData[0].uid,
            display_name: result.user.displayName,
            screen_name: result._tokenResponse.screenName,
            image_path: result.user.photoURL,
          };
          // console.log(userData);
          this.$store.commit("login", userData);
          this.$axios.post("register", userData);
          this.$router.push({ path: "/omikuji" });
        })
        .catch((error) => {
          console.error(error);
        });
    },
  },
  computed: {
    ...mapGetters(["isLogin"]),
  },
};
</script>

<style scoped>
.resizeimage img {
  width: 100%;
}
</style>
