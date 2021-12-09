<template>
  <div class="text-center">
    <p>
    {{ title }}<br>
    {{ message }}
    </p>
    <p>
      {{ omikujiNo }}
    </p>
    <div>SNSで結果をシェア</div>
    <button>Twitter</button>
    <button>Facebook</button>
    <button>LINE</button>
  </div>
</template>

<script>
export default {
  data() {
    return {
      title: "",
      message: "",
      omikujiNo: 0
    }
  },
  mounted() {
    // おみくじID取得
    const omikujiId = this.$route.params.key;

    // おみくじデータ読み込み
    const omikujiData = require('~/assets/json/omikuji.json');

    // おみくじ番号の生成
    const omikujiNo = omikujiId % omikujiData.length;
    console.log(omikujiData[omikujiNo].title);

    this.title = omikujiData[omikujiNo].title;
    this.message = omikujiData[omikujiNo].message;
    this.omikujiNo = omikujiNo;
  },
}
</script>
