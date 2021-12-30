<template>
  <div class="text-center">
    <div class="container pt-4">
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
            <template v-if="!isLogin">
              GitHubと連携して<br class="d-md-none" />
            </template>
            参拝する
          </button>
        </div>
        <div v-if="isLogin" class="mt-4 p-2 d-inline-block text-end">
          <div class="rounded border p-2 d-inline-block">
            <img
              :src="user.image_path"
              class="rounded-icon img-fluid"
              width="24px"
            />
            {{ user.display_name }} でログイン中
          </div>
          <div class="mt-4 d-flex justify-content-between">
            <div>
              <a href="javascript:void(0)" class="" @click="logout"
                >ログアウト</a
              >
            </div>
            <div>
              <nuxt-link to="/dashboard">マイページへ ></nuxt-link>
            </div>
          </div>
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
      if (this.isLogin) {
        //認証済み
        this.$router.push({ path: "/sanpai" });
      } else {
        //未認証
        signInWithPopup(auth, provider)
          .then((result) => {
            console.log(result);
            let userData = {
              github_id: result.user.providerData[0].uid,
              display_name: result.user.displayName,
              screen_name: result._tokenResponse.screenName,
              image_path: result.user.photoURL,
            };

            if (!userData.display_name) {
              userData.display_name = userData.screen_name;
            }
            this.$store.commit("login", userData);
            this.$axios
              .post("register", userData)
              .then((result) => {
                this.$router.push({ path: "/sanpai" });
              })
              .catch((e) => {
                console.log("missing register");
                console.log(e);
              });
          })
          .catch((error) => {
            console.error(error);
          });
      }
    },
    logout() {
      this.$store.dispatch("logout");
    },
  },
  computed: {
    ...mapGetters(["isLogin", "user"]),
  },
};
</script>

<style scoped>
.resizeimage img {
  width: 100%;
}
</style>
