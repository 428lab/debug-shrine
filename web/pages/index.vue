<template>
  <div class="text-center">
    <div class="container py-5 justify-content-center">
      <div class="row">
        <div class="col-2 col-md-3 col-lg-4"></div>
        <div class="col-8 col-md-6 col-lg-4">
          <div class="">
            <img src="/torii.svg" alt="でばっぐ神社" class="w-100" style="" />
            <div class="text-end mt-4" style="">
              <nuxt-link to="/about" class="">でばっぐ神社とは ></nuxt-link>
            </div>
          </div>
        </div>
        <div class="col-2 col-md-3 col-lg-4"></div>
      </div>
    </div>
    <div class="bg-github py-4">
      <div class="container">
        <div class="row py-3">
          <div class="col-2 col-md-3 col-lg-4"></div>
          <div class="col-8 col-md-6 col-lg-4">
            <div class="row align-items-center">
              <div class="col-4 resizeimage">
                <i class="fab fa-github fa-4x"></i>
                <!-- <img src="/brandlogo/github.svg" class="img-fluid" /> -->
              </div>
              <div class="col-4 resizeimage">
                <img src="/activity.svg" class="img-fluid w-75" />
              </div>
              <div class="col-4 resizeimage">
                <img src="/shrine.png" class="img-fluid" />
              </div>
            </div>
          </div>
          <div class="col-2 col-md-3 col-lg-4"></div>
        </div>
        <div class="mt-4" v-if="!isLogin">
          <button
            @click="GitHubAuth"
            class="btn btn-lg btn-primary"
            :disabled="false"
          >
            GitHubと連携して<br class="d-md-none" />参拝しよう
          </button>
        </div>
        <div class="mt-4" v-else>
          <button
            @click="sanpai"
            class="btn btn-lg btn-primary"
            :disabled="false"
          >
            参拝する
          </button>
        </div>
        <div v-if="isLogin" class="mt-4 p-2 d-inline-block">
          <div class="rounded border p-2 w-100 mb-2" v-if="isLogin">
            <img
              :src="user.image_path"
              class="rounded-icon img-fluid"
              width="30px"
            />
            {{ user.display_name }} でログイン中
          </div>
          <nuxt-link to="/dashboard" class="btn text-white"
            >マイページへ ></nuxt-link
          >
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
  onAuthStateChanged,
} from "firebase/auth";
import { mapGetters } from "vuex";

export default {
  layout: "single",
  data() {
    return {
      buttons: {
        sanpai: false,
      },
    };
  },
  async beforeMount() {
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        this.$store.dispatch("logout");
        return;
      }
      this.$store.commit('setToken', user.refreshToken);
    });
    let ranking = await this.$axios.get("/ranking");
    let my_ranking = await this.$axios.get("/my_ranking?screen_name=1");
    console.log(ranking.data);
    console.log(my_ranking.data);
  },
  methods: {
    GitHubAuth() {
      this.buttons.sanpai = true;
      const provider = new GithubAuthProvider();
      const auth = getAuth();
      if (this.isLogin) {
        //認証済み
        this.$router.push({ path: "/sanpai" });
      } else {
        //未認証
        signInWithPopup(auth, provider)
          .then((result) => {
            let userData = {
              github_id: result.user.providerData[0].uid,
              display_name: result.user.displayName,
              screen_name: result._tokenResponse.screenName,
              image_path: result.user.photoURL,
            };

            if (!userData.display_name) {
              userData.display_name = userData.screen_name;
            }
            this.$store.commit("setUser", userData);
            getAuth().currentUser.getIdToken()
              .then(token => {
                this.$store.commit("setToken", token);
                this.$axios.post("register",
                userData,
                {
                  headers: {
                    Authorization: `Bearer ${token}`
                  }
                })
              })
              .catch(e=>{
                console.log(e)
              })

          })
          .catch((error) => {
            console.error(error);
          });
      }
    },
    sanpai() {
      this.$router.push({ path: "/sanpai" });
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
