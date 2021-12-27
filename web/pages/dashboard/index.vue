<template>
  <main class="container p-3">
    <div class="bg-light p-3">
      <div class="row">
        <div class="col-3">
          <img :src="user.imagePath" alt="userName" class="w-100 rounded" />
        </div>
        <div class="col-9">
          <p class="fs-3">{{ user.userNickname }}</p>
          <div class="badge bg-secondary">新人コントリビューター</div>
          <div class="badge bg-secondary">称号２</div>
        </div>
      </div>
    </div>
    <div class="bg-light mt-3 p-3">
      <p class="fs-5">RANK {{ user.level }}</p>
      <div class="progress">
        <div
          class="progress-bar p-2"
          role="progressbar"
          style="width: 30%"
          aria-valuenow="10"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          {{ user.experiencePoint }}exp
        </div>
      </div>
      <p class="text-end w-100">NEXT 2234EXP</p>
    </div>
    <div class="bg-light mt-3 p-3 rounded">
      <h5>つよさ</h5>
      <RadarChart :chartData="chartData" />
    </div>
    <div class="col bg-light p-3 rounded">
      <!-- <h5>ポイント獲得履歴</h5>
            <div class="list-group list-group-flush">
              <div class="list-group list-group-flush">
                <div class="list-group-item">
                  <div class="d-flex w-100 justify-content-between">
                    <h5 class="mb-1">Created commit</h5>
                    <small class="text-muted">3 days ago</small>
                  </div>
                  <p class="mb-1 small">
                    <i>アイコン</i> +10pt
                    <i>アイコン</i> +10exp
                  </p>
                  <small class="text-muted">428lab/debug-shrine</small>
                </div>
              </div>
            </div> -->
    </div>
  </main>
</template>

<script>
import {
  getAuth,
  getMultiFactorResolver,
  onAuthStateChanged,
  ProviderId,
} from "firebase/auth";
import RadarChart from "@/components/charts/powerChart.vue";

export default {
  middleware: "auth",
  components: { RadarChart },
  async asyncData({ $axios }) {
    let response = await $axios.get("status?user=ShinoharaTa");
    // console.log(userResponse.data);
    // responseData = userResponse.data;
    let userChart = [];
    userChart.push(response.data.hp);
    userChart.push(response.data.power);
    userChart.push(response.data.agility);
    userChart.push(response.data.defence);
    userChart.push(response.data.intelligence);
    userChart.push(0);
    // let status = {
    //   level: response.level,
    //   point: response.point,
    // };

    return {
      user: {
        userName: "ShinoharaTa",
        userNickname: "T.Shinohara",
        imagePath: "https://placehold.jp/150x150.png",
        exp: 0,
        level: 0,
        point: 0,
        titles: ["newContributor", "newContributor"],
      },
      chartData: {
        labels: [
          "たいりょく",
          "ちから",
          "きようさ",
          "しゅびりょく",
          "すばやさ",
          "かしこさ",
        ],
        datasets: [
          {
            type: "radar",
            data: userChart,
            fill: true,
            backgroundColor: "rgba(255, 99, 132, 0.2)",
            borderWidth: 0,
            pointStyle: "dash"
          },
        ],
      },
    };
  },
  async beforeMount() {
    // gituhubユーザ情報取得
    // const auth = getAuth();
    // let screenName = "";
    // onAuthStateChanged(auth, (user) => {
    //   if (user) {
    //     screenName = user.reloadUserInfo.screenName;
    //     // return user;
    //     // サインインしている場合
    //     // user.providerData.forEach((profile) => {

    //     // プロバイダーデータの取得
    //     // if (profile.providerId == "github.com") {
    //     // console.log(profile);
    //     // this.user.userNickname = profile.displayName;
    //     // this.user.photoURL = profile.photoURL;
    //     // }
    //     // });
    //     console.log(screenName);

    //     // if(user)
    //     // console.log(this.user.userNickname);
    //   }
    // });
  },
  methods: {
    logout: function () {
      this.$store.dispatch("logout");
    },
  },
};
</script>
