<template>
  <div class="text-center">
    <div class="container py-4">
      <div class="p-5">
        <img
          src="/torii.svg"
          alt="でばっぐ神社"
          class="w-100"
          style="max-width: 700px"
        />
        <div class="text-end mt-4" style="max-width: 700px">
          <nuxt-link to="/about" class="">でばっぐ神社とは ></nuxt-link>
        </div>
      </div>
    </div>
    <div class="bg-github py-4">
      <div class="container">
        <div class="row align-items-center">
          <div class="col-2"></div>
          <div class="col-3 resizeimage">
            <img src="/brandlogo/github.svg" class="img-fluid" />
          </div>
          <div class="col-2 resizeimage">
            <img src="/activity.svg" class="img-fluid" />
          </div>
          <div class="col-3 resizeimage">
            <img src="/shrine.png" class="img-fluid" />
          </div>
          <div class="col-2"></div>
        </div>
        <div class="mt-4">
          <button @click="GitHubAuth" class="btn btn-lg btn-primary">
            GitHubと連携して<br class="d-md-none" />
            参拝する
          </button>
          <!-- GitHubと連携して参拝しよう -->
        </div>
      </div>
    </div>
    <!-- <div class="container py-5">
      <h1>レーダーチャートであなたの活動を可視化</h1>
    </div>
    <div class="container py-5">
      <h1>プロフィールがそのまま名刺になる</h1>
    </div> -->
    <!-- <div class="py-5 px-5">
      <div class="text-center">
        <button @click="GitHubAuth" class="btn btn-lg btn-primary">
          GitHubでログインして<br />
          参拝する
        </button>
      </div>
    </div> -->
  </div>
</template>

<script>
import {
  getAuth,
  GithubAuthProvider,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { mapGetters } from "vuex";

export default {
  // middlewareでセッションチェックを行い、GitHubのログインチェックをしない
  middleware: ["auth"],
  layout: "single",
  data() {
    return {};
  },
  methods: {
    GitHubAuth() {
      const provider = new GithubAuthProvider();
      const auth = getAuth();
      signInWithPopup(auth, provider)
        // signInWithRedirect(auth, provider)
        .then((result) => {
          console.log(result);
          let userData = {
            github_id: result.user.providerData[0].uid,
            display_name: result.user.displayName,
            screen_name: result._tokenResponse.screenName,
            image_path: result.user.photoURL,
          };
          this.$store.commit("login", userData);
          this.$axios.post("register", userData);
          this.$router.push({ path: "/sanpai" });
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
