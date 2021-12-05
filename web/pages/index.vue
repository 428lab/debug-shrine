<template>
  <div class="text-center">
    <div class="my-5 px-5 outer">
      <img src="/shrine.png" alt="" class="img-fluid shrine">
      <div class="inner">
        <button @click="GitHubAuth" class="btn btn-lg btn-success py-4 px-5">
          GitHubにログインして<br>
          おみくじを引く
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { getAuth, GithubAuthProvider, signInWithPopup } from "firebase/auth";

export default {
  data () {
    return {
    }
  },
  methods: {
    GitHubAuth () {
      const provider = new GithubAuthProvider()
      const auth = getAuth()
      signInWithPopup(auth, provider)
        .then((result) => {
          this.$store.commit('login', "is_login")
          // resultはAPIアクセス
          // その結果をもっておみくじを引く
          this.$router.push({ path: '/omikuji' })
        }).catch((error) => {
          console.error(error)
        })
    }
  }
}

</script>

<style scoped>
.shrine {
  opacity: 0.3;
}
.outer {
  position: relative;
}
.inner{
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  margin: auto;
  width: 80%;
  height: 3.2rem;}
</style>
