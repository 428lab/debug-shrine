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
          <!-- 看板娘らぼみ(セリフの口調は docs/character.md 参照) -->
          <div class="labomi-stage">
            <div v-if="labomiLine" class="labomi-bubble" role="note">
              {{ labomiLine }}
            </div>
            <img
              src="/labomi/labomi_01.png"
              alt="らぼみ(でばっぐ神社の巫女)"
              class="labomi-img"
              width="360"
              height="480"
            />
          </div>
          <div class="mt-4" v-if="!isLogin">
            <button
              @click="GitHubAuth"
              class="btn btn-lg btn-accent"
              :disabled="false"
            >
              GitHubと連携して<br class="d-md-none" />参拝しよう
            </button>
          </div>
          <div class="mt-4" v-else>
            <div>
              <button
                @click="sanpai"
                class="btn btn-lg btn-accent me-2"
                :disabled="false"
              >
                参拝する
              </button>
              <nuxt-link to="/omikuji" class="btn btn-lg btn-outline-light">
                おみくじを引く
              </nuxt-link>
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
            <h2 class="section-title mb-3"><i class="fas fa-fw fa-trophy"></i> ランキング</h2>
            <ranking max="10" class="mt-3"></ranking>
            <div class="text-end px-4 mt-3 mb-4">
              <nuxt-link to="/ranking">
                ランキングの続き <i class="fas fa-fw fa-chevron-right"></i>
              </nuxt-link>
            </div>
          </div>
          <div class="col-12 col-md-6 col-lg-8 px-4 mb-4">
            <h2 class="section-title mb-3"><i class="fas fa-fw fa-torii-gate"></i> でばっぐ神社とは</h2>
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
            <h2 class="section-title mt-5 mb-3"><i class="fas fa-fw fa-comments"></i> 開発コミュニティ</h2>
            <div class="">
              <a href="https://discord.gg/HTdSVdgEXJ" target="_blank" class="btn btn-lg bg-discord text-white mt-2 me-2">
                <i class="fab fa-discord fa-fw fa-lg"></i> 四谷ラボ Discord
              </a>
              <a href="https://github.com/428lab" target="_blank" class="btn btn-lg bg-github text-white mt-2">
                <i class="fab fa-github fa-fw fa-lg"></i> 四谷ラボ GitHub
              </a>
            </div>
            <h2 class="section-title mt-5 mb-3"><i class="fas fa-fw fa-box"></i> でばっぐ神社リポジトリ</h2>
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
        <button @click="GitHubAuth" class="btn btn-lg btn-accent">
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
import Ranking from "@/components/Ranking";

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
      // らぼみの吹き出し。SSR/CSRの差異を避けるため mounted で選ぶ(初期は空)。
      labomiLine: "",
    };
  },
  mounted() {
    this.pickLabomiLine();
  },
  watch: {
    // ログイン状態が変わったら(認証復元含む)セリフプールを切り替える
    isLogin() {
      this.pickLabomiLine();
    },
  },
  async beforeMount() {
    const auth = getAuth();
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        this.$store.dispatch("logout");
        return;
      }
      const token = await user.getIdToken();
      this.$store.commit("setToken", token);
    });
  },
  methods: {
    // らぼみのセリフ(オタクに優しいギャル。口調は docs/character.md 準拠)。
    // 表示のたびにランダムで1つ選び、再訪の楽しみにする。
    pickLabomiLine() {
      const guest = [
        "GitHubと連携して参拝してこ!あーしが見ててあげるから!",
        "でばっぐ神社へようこそ〜!参拝すると戦闘力出るの、ちょーウケるよww",
        "コントリビュートしてから来た?してないなら…ガン萎えだわ〜",
      ];
      const member = [
        "おかえり〜!今日も参拝してくの?えらすぎ、最高かよ!",
        "連続参拝続いてる?なんとかなるっしょ!って思ったら草枯れるからね?",
        "おみくじ引いた?物理乱数だから文句は宇宙に言って〜www",
      ];
      const pool = this.isLogin ? member : guest;
      this.labomiLine = pool[Math.floor(Math.random() * pool.length)];
    },
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
                // Go版(registerGo)はコールドスタートが短くログイン直後の登録が
                // 速くなるため使用する(Node版のregisterとレスポンス形式は同一。
                // docs/backend.md参照)
                this.$axios.post("registerGo", userData, {
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

/* 看板娘らぼみ */
.labomi-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.labomi-bubble {
  position: relative;
  background: #fdfaf3;
  color: #3a2f28;
  border-radius: 14px;
  padding: 10px 14px;
  max-width: 320px;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.55;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}
/* 吹き出しのしっぽ(下向き) */
.labomi-bubble::after {
  content: "";
  position: absolute;
  bottom: -9px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  border-top: 10px solid #fdfaf3;
}
.labomi-img {
  margin-top: 14px;
  /* 元画像 360x480(3:4)。高さ基準で可変にする */
  height: clamp(200px, 30vw, 280px);
  width: auto;
  filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.45));
  animation: labomi-float 3.2s ease-in-out infinite;
  user-select: none;
  -webkit-user-drag: none;
}
@keyframes labomi-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .labomi-img {
    animation: none;
  }
}
</style>
