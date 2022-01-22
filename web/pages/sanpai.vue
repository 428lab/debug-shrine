<template>
  <div class="text-center">
    <div class="container" v-if="status">
      <div v-if="result === 'success'">
        <div class="p-5">
          <img
            src="/sanpai/success_01.png"
            alt="でばっぐ神社"
            class="w-100"
            style="max-width: 700px"
          />
        </div>
        <div class="fs-1">「殊勝なことじゃ。きっと良きことがあるぞよ。」</div>
        <div class="fs-4 mt-4">{{ status.msg }}</div>
        <div class="fs-4 mt-4">ポイントを獲得しました</div>
        <div class="fs-4">＋{{ status.get }} pt</div>
      </div>
      <div v-else-if="result === 'expire'">
        <div class="px-5">
          <img
            src="/sanpai/expire_01.png"
            alt="でばっぐ神社"
            class="w-100"
            style="max-width: 700px"
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
            style="max-width: 700px"
          />
        </div>
        <div class="fs-1">
          「まずはぎっとはぶでコントリビュートするのじゃ。」
        </div>
        <div class="fs-4 mt-4">追加のポイントはありませんでした</div>
      </div>
    </div>
    <nuxt-link class="btn btn-lg btn-primary" to="/dashboard">
      マイページを見る
    </nuxt-link>
    <Loading v-if="isLoading"></Loading>
  </div>
</template>

<script>
import { getAuth } from "firebase/auth";
import { mapGetters } from "vuex";

export default {
  middleware: ["auth"],
  data() {
    return {
      isLoading: true,
      isError: false,
      result: "",
      status: {
        level: 0,
        point: 0,
        get: 0,
      },
    };
  },
  async mounted() {
    let payload = {
      github_id: this.user.github_id,
      screen_name: this.user.screen_name,
    };
    let response = await this.$axios.post("sanpai",
      payload,
      {
        headers: {
          Authorization: `Bearer ${this.token}`
        }
      })
      .catch(e=>{
        this.$store.dispatch('logout');
        this.isLoading = false;
      })
    if (response) {
      console.log("response",response)
      this.status.level = response.data.level;
      this.status.get = response.data.add_exp;
      this.status.point = response.data.exp;
      this.status.msg = response.data.msg;
      this.result = response.data.status;
      this.isLoading = false;
    } else {
      this.isError = true;
      this.isLoading = false;
    }
  },
  methods: {
    sanpai() {
      this.$router.push("/result/" + "0123456789");
    },
    auth() {
      return new Promise(resolve => {
          firebase.auth().onAuthStateChanged(user => {
            resolve()
          })
        })
    },
  },
  computed: {
    ...mapGetters(["user", "token"]),
  },
};
</script>
