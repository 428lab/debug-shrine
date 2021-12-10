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
            <div class="badge bg-secondary">新人コントリビューター</div>
            <div class="badge bg-secondary">称号２</div>
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
  </main>
</template>
