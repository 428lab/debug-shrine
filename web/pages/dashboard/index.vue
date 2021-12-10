<template>
  <main class="container">
    <div class="bg-light p-5 row align-items-center">
      <div class="col border-end">
        <div class="row">
          <div class="col-3">
            <img :src="user.photoURL" alt="userName" class="w-100 rounded">
          </div>
          <div class="col-9">
            <p class="fs-3">{{ user.userNickname }}</p>
            <div class="badge bg-secondary">新人コントリビューター</div>
            <div class="badge bg-secondary">称号２</div>
          </div>
        </div>
      </div>
      <div class="col">
        <p class="fs-5">RANK {{ user.level }}</p>
        <div class="progress">
          <div class="progress-bar progress-bar-striped" role="progressbar" style="width: 10%" aria-valuenow="10" aria-valuemin="0" aria-valuemax="100">{{ user.experiencePoint }}exp</div>
        </div>
        <p class="text-end w-100">NEXT 2234EXP</p>
      </div>
    </div>
    <div class="row">
      <div class="col-3 my-2 py-0 ps-0 pe-2">
        <div class="list-group">
          <a href="#" class="list-group-item list-group-item-action active" aria-current="true">
            DASHBOARD
          </a>
          <a href="#" class="list-group-item list-group-item-action">Profile Setting</a>
          <a href="#" class="list-group-item list-group-item-action">Acount Setting</a>
        </div>
      </div>
      <div class="col">
        <div class="row my-2 gap-2">
          <div class="col-4 bg-light p-3 rounded">
            <h5>つよさ</h5>
            <RadarChart :chartData="chartData" :options="options" />
          </div>
          <div class="col bg-light p-3 rounded">
            <h5>ポイント獲得履歴</h5>
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
            </div>
          </div>
        </div>
        <div class="row my-2">
          <div class="col bg-light p-3 rounded">
            <h5>アクティビティ</h5>

          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script>
import { getAuth, getMultiFactorResolver, onAuthStateChanged, ProviderId } from 'firebase/auth';
import RadarChart from '@/components/charts/powerChart.vue';

export default {
  components: { RadarChart },
  data() {
    return {
      user: {
        // ユーザー名（未使用）
        userName: "",
        // ユーザーニックネーム
        userNickname: "",
        // ユーザー画像URL
        photoURL: "",
        // 経験値
        experiencePoint: 0,
        // レベル
        level: 0,
        // ポイント
        point: 0,
        // 称号
        titles: [
          "newContributor",
          "newContributor"
        ]
      },
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
        animation: {
          // アニメーション実行時間（ms）
          duration: 1000,
          // イージング指定（https://easings.net/）
          easing: "easeInOutCirc"
        },
        legend: {
          // 凡例を表示しない
          display: false
        },
        tooltips: {
          // ツールチップを表示しない
          enabled: false
        },
        scale: {
          ticks: {
            // メモリ線を表示しない
            display: false,
            // 0からの表示を有効可
            beginAtZero: true,
            // 最小値を0に固定
            min: 0,
            // 最大値を100に固定
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
            this.user.userNickname = profile.displayName;
            this.user.photoURL = profile.photoURL;
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
