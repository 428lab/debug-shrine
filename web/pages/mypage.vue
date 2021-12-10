<template>
  <main class="container">
    <div class="bg-light p-5 row align-items-center">
      <div class="col border-end">
        <div class="row">
          <div class="col-3">
            <img :src="photoURL" alt="userName" class="w-100 rounded">
          </div>
          <div class="col-9">
            <p class="fs-3">{{ userName }}</p>
          </div>
        </div>
      </div>
      <div class="col">
        <p class="fs-5">RANK 12</p>
        <div class="progress">
          <div class="progress-bar progress-bar-striped" role="progressbar" style="width: 10%" aria-valuenow="10" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
        <p class="text-end w-100">NEXT 2234EXP</p>
      </div>
    </div>
    <div class="row my-2 gap-2">
      <div class="col-3 bg-light p-2 rounded">
        <h5>つよさ</h5>
        <RadarChart :chartData="chartData" :options="options" />
      </div>
      <div class="col bg-light p-2 rounded">
        <h5>ポイント獲得履歴</h5>
      </div>
    </div>
    <div class="row my-2">
      <div class="col bg-light p-2 rounded">
        <h5>アクティビティ</h5>
      </div>
    </div>
  </main>
</template>

<script>
import { getAuth, onAuthStateChanged, ProviderId } from 'firebase/auth';
import RadarChart from '@/components/charts/powerChart.vue';

export default {
  components: { RadarChart },
  data() {
    return {
      userName: "",
      userNickname: "",
      photoURL: "",
      chartData: {
        labels: ["ちから", "たいりょく", "しゅびりょく", "きようさ", "すばやさ", "かしこさ"],
        datasets: [{
          type: "radar",
          data: [50, 30, 40, 20, 45, 25],
          fill: true,
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          borderColor: 'rgb(255, 99, 132)',
          pointBackgroundColor: 'rgb(255, 99, 132)',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: 'rgb(255, 99, 132)'
        }]
      },
      options: {
        pointLabels: {
          display: false
        },
        scale: {
          ticks: {
            beginAtZero: true,
            min: 0,
            max: 100
          }
        }
      }
    }
  },
  mounted() {
    // gituhubユーザ情報取得
    const auth = getAuth();

    onAuthStateChanged(auth, (user) => {
      // サインイン状態の確認
      if ( user ) {
        // サインインしている場合
        user.providerData.forEach((profile) => {
          // プロバイダーデータの取得
          if (profile.providerId == "github.com") {
            this.userName = profile.displayName;
            this.photoURL = profile.photoURL;
          }
        });
      } else {
        // 非ログイン時 トップページへリダイレクト
        redirect('/');
      }
    });
  }
}
</script>
