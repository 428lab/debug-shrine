<template>
  <div class="">
    <div class="container pt-5 mt-5">
      <div class="row">
        <div class="col-12 col-md-6 col-lg-8 mb-5">
          <img src="/torii.svg" alt="でばっぐ神社" class="main-logo" style="" />
          <!-- <div class="text-end mt-4" style="">
            <nuxt-link to="/about" class="">でばっぐ神社とは ></nuxt-link>
          </div> -->
        </div>
        <div class="col-12 col-md-6 col-lg-4 mb-5 text-center align-self-end">
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
            <div>
              <button
                @click="sanpai"
                class="btn btn-lg btn-primary"
                :disabled="false"
              >
                参拝する
              </button>
            </div>
            <div class="mt-4 p-2 d-inline-block">
              <div class="rounded border p-2 w-100 mb-2" v-if="isLogin">
                <img
                  :src="user.image_path"
                  class="rounded-icon img-fluid"
                  width="30px"
                />
                {{ user.display_name }} でログイン中
              </div>
              <a
                href="javascript:void(0)"
                class="btn btn-secondary"
                @click="logout"
                >ログアウト</a
              >
              <nuxt-link to="/dashboard" class="btn text-white"
                >マイページへ ></nuxt-link
              >
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="bg-dark">
      <div class="container py-4 mt-4">
        <div class="row flex-row-reverse">
          <div class="col-12 col-md-6 col-lg-4 px-4">
            <p class="fs-2">ランキング</p>
            <ranking max="10" class="mt-3"></ranking>
            <div class="text-end px-4 mt-3 mb-4">
              <nuxt-link to="/ranking">
                ランキングの続き <i class="fas fa-fw fa-chevron-right"></i>
              </nuxt-link>
            </div>
          </div>
          <div class="col-12 col-md-6 col-lg-8 px-4 mb-4">
            <p class="fs-2">でばっぐ神社とは</p>
            <p class="fs-4">
              <span class="text-danger"
                ><strong>露御読把和流（ろおどはわる）</strong></span
              >をご神体とする仮想神社。<br />
              参拝するためには<strong
                >GitHubへの<span class="text-danger">コントリビューション</span
                >が必須</strong
              >である。<br />
              参拝することで御神体の御業により、参拝者の能力が具体化される。<br />
              自身の能力を把握することで改善の円環に身を投じることができよう。<br />
            </p>
            <div class="text-end px-4 mt-3">
              <nuxt-link to="/about" class=""
                >もっと詳しく <i class="fas fa-fw fa-chevron-right"></i
              ></nuxt-link>
            </div>
            <p class="fs-2 mt-3">開発コミュニティ</p>
            <div class="">
              <a href="https://discord.gg/HTdSVdgEXJ" target="_blank" class="btn btn-lg bg-discord text-white mt-2 me-2">
                <i class="fab fa-discord fa-fw fa-lg"></i> 四谷ラボ Discord
              </a>
              <a href="https://github.com/428lab" target="_blank" class="btn btn-lg bg-github text-white mt-2">
                <i class="fab fa-github fa-fw fa-lg"></i> 四谷ラボ GitHub
              </a>
            </div>
            <p class="fs-2 mt-3">でばっぐ神社リポジトリ</p>
            <div class="mt-2">
              <a href="https://github.com/428lab/debug-shrine" target="_blank">
                <i class="fab fa-github fa-fw fa-lg"></i> 428lab/debug-shrine
              </a>
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
  onAuthStateChanged,
} from "firebase/auth";
import { mapGetters } from "vuex";
import Ranking from "@/components/ranking";

export default {
  layout: "single",
  components: {
    Ranking,
  },
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
      this.$store.commit("setToken", user.accessToken);
    });
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
            getAuth()
              .currentUser.getIdToken()
              .then((token) => {
                this.$store.commit("setToken", token);
                this.$axios.post("register", userData, {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                });
              })
              .catch((e) => {
                console.log(e);
              });
          })
          .catch((error) => {
            console.error(error);
          });
      }
    },
    sanpai() {
      this.$router.push({ path: "/sanpai" });
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
.main-logo {
  width: 100%;
  max-width: 600px;
}
</style>
