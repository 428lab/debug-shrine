<template>
  <div class="text-center">
    <button @click="GitHubAuth" class="btn btn-success" href="/omikuji">
      GitHubにログインして<br>
      おみくじを引く
    </button>
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
          console.log(result)
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
