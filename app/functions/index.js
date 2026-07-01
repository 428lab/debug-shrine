// でばっぐ神社の Cloud Functions は functions-go (Go / gen2 Cloud Run) へ全面移植済み。
//
// 旧 Node 実装(status / sanpai / register / ranking / userOGP / ogpRewrite と、
// スケジュール4本 rankingUpdate / rankingCache / statusCacheBackfill / scheduledOgpDelete)は
// すべて Go 版(statusGo など)へ置き換わり、フロントエンドの $axios 呼び出しおよび
// firebase.json の hosting rewrite(/u/* -> ogpRewriteGo)も Go 版のみを参照する。
//
// この codebase は関数を一切 export しないため、`firebase deploy` 実行時に
// 既存の旧 Node 関数は prune(削除)される。Go 版(gcloud で個別デプロイした gen2 関数)は
// firebase の管理対象外のため prune されない。
//
// 旧 Node 実装のソースは git 履歴に保全されており、必要になれば復元できる。
