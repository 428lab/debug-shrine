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

## `sanpai` レスポンスの変化情報

参拝結果画面で「変化」を表示するため、`sanpai` 成功時のレスポンスに以下を含める。

- `points_before` / `points_after` … ポイント(経験値)の参拝前後
- `power_before` / `power_after` … 戦闘力(status.total)の参拝前後
- `level_before` / `level_after` … レベルの参拝前後(いずれも戦闘力から `get_level` で算出)
- `updated_repo_count` … 今回の参拝で更新したリポジトリ数(新着アクティビティの distinct repo)
- `action_count` … 今回のアクション数(新着アクティビティの総件数。ポイント算出の元と同じ)
  - GitHub Events API は 2025-10-07 に PushEvent payload から `commits` / `size` を
    削除しコミット数が取得できないため、event 種別を問わない新着件数を用いる。

`expire` / `noaction` 時はこれらの変化情報は含まない。

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

## `status` エンドポイントのGo移植 (`statusGo`)

マイページ表示のレイテンシーをさらに削減するため、`status` エンドポイントを
Go(Cloud Run functions)で再実装し、`statusGo` という別関数名でデプロイしている
(実装は `app/functions-go/`、設計の詳細は同ディレクトリの README を参照)。

- Go は Node.js よりコールドスタートが大幅に短い(目安: Go 100〜300ms
  vs Node.js 300〜800ms)。解析キャッシュ導入でウォーム時のレイテンシーは
  既に改善済みだが、コールドスタート自体はランタイム由来のオーバーヘッドが
  残るため、まずこの `status` エンドポイントから移植した。
- `firebase-functions` SDK自体はGoを未サポートのため、Firebase Functionsとは
  別に `gcloud functions deploy --gen2 --runtime=go125` で同一GCPプロジェクトに
  直接デプロイしている(CI: `.github/workflows/dev-deploy.yml`)。
- 既存の `status`(Node)とは意図的に別関数として共存させ、フロントエンドの
  呼び出し先切替タイミングを制御できるようにしている(切替・Node側削除は
  別途提案のうえ実施)。
- Node版との入出力の等価性は、Firestoreエミュレータに同一データを投入し、
  両ハンドラの応答を比較して確認済み。

### 既知の挙動差異(Node側の未修正バグに起因)

`status` キャッシュ(`userData.status`)は存在するが `last_sanpai`(トップレベル)が
存在しないユーザー(一度も参拝せずプロフィールを2回以上表示した場合に発生し得る)に
対して、Node版は `undefined.toDate()` を呼び出して例外になる既存バグがある
(本移植の対象外につき、Node側は修正していない)。Go版はこの場合 `last_sanpai` を
空文字として返す(クラッシュしない)。

## `sanpai` エンドポイントのGo移植 (`sanpaiGo`)

参拝処理(書き込み系のメインエンドポイント)についても `statusGo` と同じ方針で
Go(Cloud Run functions)に移植し、`sanpaiGo` という別関数名でデプロイしている
(実装は `app/functions-go/sanpai.go`)。挙動はNode版(`exports.sanpai`)と同一にする
ことを優先し、独自の改善は入れていない。

- Firebase IDトークンの検証には Firebase Admin Go SDK
  (`firebase.google.com/go/v4/auth`)を使用する。`firebase-functions` の
  `functions.config()` はGo未対応のため使えず、GitHub OAuth Appの
  `client_id`/`client_secret` はデプロイ時に環境変数(`GITHUB_CLIENT_ID` /
  `GITHUB_CLIENT_SECRET`)として注入する。値自体は新規のGitHub Secretsを
  増やさず、CI(`.github/workflows/dev-deploy.yml`)が
  `firebase functions:config:get github` で既存の設定値を取得し、
  ログに出さないよう `::add-mask::` でマスクした上で
  `gcloud functions deploy --set-env-vars` に渡している。
- 参拝のクールダウン時間(Node版 `sanpai.next_time`: prod 300秒 / dev 60秒)も
  同様にプロジェクトIDでの分岐ではなく、環境変数 `SANPAI_NEXT_TIME_SECONDS` で
  デプロイ時に明示的に指定する(dev: 60。prod移植時は300を設定すること)。
- 増分計算(`compute_performance_increment`)・`raw_user_data_from_status`・
  `latest_activity_created_at` は `app/functions-go/internal/performance/` に
  Node版と同一ロジックとしてポート済み。全件計算と増分計算が一致することは
  プロパティテスト(`performance_test.go` の `TestIncrementEqualsFullCalculation_*`、
  各2000/1000ケースをランダム生成して検証)で確認している。
- Firestoreへの書き込み(アクティビティのバッチ登録、`sanpai_logs` 追記、
  `last_sanpai`/`exp`/`status`/`last_activity_created_at` の更新)は、Firestore
  エミュレータ + モックGitHub APIサーバーを使ったGoテスト(`sanpai_test.go`。
  `FIRESTORE_EMULATOR_HOST` 未設定時は自動スキップし通常のCIには影響しない)で、
  初回参拝・増分参拝・クールダウン中・新着なし・未登録の各分岐を確認済み。

### 既知の挙動(Node側からそのまま引き継いだ、あえて修正していない点)

- **参拝可能ユーザーのなりすまし**: `sanpai` はFirebase IDトークンを検証するが、
  トークンの `uid` とリクエストボディの `github_id`/`screen_name` が一致するかは
  Node版・Go版いずれもチェックしていない(有効なトークンさえあれば理論上は
  任意の`github_id`を指定できてしまう、既存の設計)。本移植のスコープ外につき
  修正していない。
- **`exp` 表示キャッシュの非原子性**: `exp` フィールド自体は
  `FieldValue.increment`(Go: `firestore.Increment`)で原子的に更新するが、
  キャッシュ用の `status.points` はハンドラ内で読み取った古い `exp` に
  加算した値を使っており、同一ユーザーからの並行リクエストがあると理論上
  わずかにズレ得る(Node版に元からある非トランザクションな実装をそのまま
  踏襲。修正しない)。
- **GitHub取得失敗時のレスポンス**: GitHub Events APIの取得に失敗した場合、
  Node版は例外を握りつぶした `undefined` を後続処理に渡した結果、外側の
  try/catchで `{"status":"missing server error."}` になる。Go版もこの場合に
  同じレスポンスを返すよう実装している(意図的な仕様ではなく結果的な挙動の
  踏襲)。
- **リクエストボディが不正なJSONの場合のステータスコード**: Node版は
  Expressのbody-parserが不正なJSONを検出するとハンドラに到達する前に
  `400`を返すが、Go版はデコードエラーを「パラメータ不足」として扱い
  `200 {"status":"failed parameter"}` を返す。現在のフロントエンドは常に
  正しいJSONを送るため実害はない、ごく稀なエッジケースの差異。

### 意図的に移植しなかった機能

- **期間限定ボーナス(`get_bonus_mag`/`msg`)**: Node版には「2022/1/1〜1/3は
  ポイント3倍」という一度きりのキャンペーンロジックがある。判定基準の
  `date_now` はNode側の実装上コールドスタート時刻に固定されるため、対象期間
  (2022年)を過ぎた現在は常に等倍(`bonus_mag=1`, `msg=""`)にしかならず、
  将来にわたって再度trueになることもない。そのためGo版(`sanpaiGo`)では
  意図的に移植せず、`msg` は常に空文字を返す。仮に同種の期間限定キャンペーンを
  再度行う場合は、Go版にも該当ロジックを別途追加すること。

