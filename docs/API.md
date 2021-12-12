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

## マイページ情報取得

POST：`/mypage`

### 必須パラメータ

- Authトークン

### レスポンス

- あれこれ
