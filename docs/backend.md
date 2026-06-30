# backend

## ログイン時
firebase.auth.onOperation ?
- ログイン時に最終更新更新
- Githubのデータをfirebase.firestoreに更新
    - 更新中はAPI`activities`の`github_update`が1

## アカウント作成時
firebase.auth.onCreate

- firebase.firestoreにユーザーページ用のデータを書き込み

## `/update`
GitHubのアクティビティを取得して更新

## `/activities`
ユーザーのアクティビティを返答  
更新中なら更新中とする

## `/mypage`
ユーザー自身のページ  
称号などユーザーが編集するデータとか?

## 能力解析キャッシュ (`userData.status`)

マイページ／プロフィール表示は `status` エンドポイントを呼ぶ。解析結果は
`userData.status` に保存され、存在すればそれを即返却する(高速)。未保存の場合のみ
`github_activities` を全件読み込んで `user_performance` でフル再計算し、結果を保存する
(重い同期処理)。`sanpai` 成功時にも `status` と `last_activity_created_at` を更新する。

### `statusCacheBackfill` (スケジュール関数)

過去に参拝済み(`last_sanpai` あり)だが解析キャッシュ(`status`)が未保存のレガシー
ユーザーは、マイページ初回表示でフル再計算が走り遅くなる。これを事前解消するための
スケジュール関数。

- 対象: 直近半年以内に `last_sanpai`(参拝=活動)があり、かつ `status` を持たないユーザーのみ
  (`where("last_sanpai", ">=", 半年前)` で休眠ユーザーを除外し全件走査も回避)
- 1 実行あたり最大 `MAX_PER_RUN` 件まで処理(タイムアウト回避のため上限あり)
- 各対象ユーザーの解析を `status` エンドポイント／`sanpai` と同一ロジックで計算し、
  `status` と `last_activity_created_at` を追記更新する(既存データは削除しない)
- 冪等。全レガシーユーザーの埋め込み完了後はスキップのみで何もしない

