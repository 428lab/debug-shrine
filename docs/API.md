# API仕様書

## 共通仕様

- APIのURLは https://api.domain/{version}/
- CORS対応はサーバー側で行う。
- Firebase Hostingでオリジンの設定を行う。

## ユーザーログイン・登録

POST：`/update`

GitHubのアクティビティを取得、firestoreを更新(backend)

### 必須パラメータ

- firebase.Authトークン

### レスポンス

status:200のみ

## アクティビティの取得・更新

POST：`/activities`

ユーザーアクティビティの取得

### 必須パラメータ

- Authトークン

### レスポンス

- activities_count: 参拝可否を返す。ない場合は0
- github_update: 現在更新中か、更新してるなら1, してないなら0
- last_action: 最終の貢献日時、ない場合は空白文字列

## 参拝

POST：`sanpaiGo`

### レスポンス(抜粋)

- msg: ボーナスタイムの内訳。土日・祝日・年末年始・4/28 のイベントや 4/28 の 428lab への
  貢献があったときだけ入り、無ければ空文字。
  例: `ボーナスタイム: よつやの日 ×4 2件 / 年末年始 ×3 1件 / 土日・祝日 ×2 3件 / 428lab ×2 2件`
  (固定順、0件の項は出さない。計算式は docs/backend.md「ボーナスタイム」)

## マイページ情報取得

POST：`/mypage`

### 必須パラメータ

- Authトークン

### レスポンス

- あれこれ
