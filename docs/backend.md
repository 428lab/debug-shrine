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

### `IssuesEvent` 加点バグの修正(Go移植に合わせて Node版も修正)

能力解析(`performance.js` / `internal/performance`)の `IssuesEvent` の加点は、
移植前は `switch (item.payload)` のように payload そのものを文字列
"opened"/"closed" と比較していた。しかし GitHub Events API の `payload` は
オブジェクトで、開閉種別は `payload.action`("opened"/"closed"/"reopened"/
"labeled"/... の文字列)に入る(公式ドキュメント API version 2022-11-28、
および実データで確認済み)。このため比較は決して一致せず、**Issue のオープン
(intelligence+3)・クローズ(defence+5)が一度も加点されていなかった**。

移植を機に `payload.action` を参照するよう Go/Node 両実装を修正した。影響として、
Issue 活動のあるユーザーは intelligence/defence/total(戦闘力・ランキング)が
本来の値に増える。既にキャッシュ済みの `status` は下記 `status_version` の仕組みで
自動的に再計算される(データ破壊はしない)。

### 解析ロジックのバージョン管理と自己修復キャッシュ (`status_version`)

上記のように `performance` の計算ロジックを修正すると、修正前に保存された `status`
キャッシュは古い(誤った)値のまま残る。これを再計算なしに放置すると誤った戦闘力・
ランキングが表示され続けるため、キャッシュにロジックのバージョン印を持たせて自己修復する。

- 計算ロジックのバージョンを定数として持つ:
  Go は `performance.StatusLogicVersion`、Node は `performance.js` の `STATUS_LOGIC_VERSION`
  (両者は必ず一致させる)。**計算式を変えたら必ずインクリメントする。**
  現在は `1`(`IssuesEvent` 修正を含むロジック)。
- `status` を書き込む処理(`status`/`sanpai`/`statusCacheBackfill`、および Node の `userOGP`)は
  同時にユーザードキュメントのトップレベル `status_version` に現行バージョンを刻む。
  `status` オブジェクト自体には含めない(API レスポンス形状は不変)。
- キャッシュを使うか再計算するかの判定は全経路で共通ヘルパで行う
  (Go: `statusCacheIsCurrent`、Node: `status_cache_is_current`)。
  `status` が存在し **かつ** `status_version >= 現行バージョン` のときのみキャッシュを再利用し、
  それ以外(未保存、または `status_version` が古い=フィールドが無く 0/undefined 扱い)は
  フル再計算して現行バージョンを刻んで書き戻す。
- `sanpai` の増分計算は基準キャッシュが現行バージョンのときだけ行う。古いバージョンの
  キャッシュを基準に増分すると過去分の誤りを「現行バージョン」として固定化してしまうため、
  その場合は増分せず全件再計算して基準ごと作り直す。
- 結果として、修正前の旧キャッシュは①参拝(`sanpai`)時、②マイページ/OGP 表示時、
  ③`statusCacheBackfill`(直近半年アクティブなユーザーを1実行10件ずつ)で順次
  再計算され、破壊的操作(キャッシュ全削除など)なしに正しい値へ収束する。

### `statusCacheBackfill` (スケジュール関数)

過去に参拝済み(`last_sanpai` あり)だが解析キャッシュ(`status`)が未保存のレガシー
ユーザーは、マイページ初回表示でフル再計算が走り遅くなる。これを事前解消するための
スケジュール関数。

- 対象: 直近半年以内に `last_sanpai`(参拝=活動)があり、かつ `status` が未保存
  **または `status_version` が現行より古い**ユーザー
  (`where("last_sanpai", ">=", 半年前)` で休眠ユーザーを除外し全件走査も回避)
- 1 実行あたり最大 `MAX_PER_RUN` 件まで処理(タイムアウト回避のため上限あり)
- 各対象ユーザーの解析を `status` エンドポイント／`sanpai` と同一ロジックで計算し、
  `status`・`status_version`・`last_activity_created_at` を追記更新する(既存データは削除しない)
- 冪等。全ユーザーが現行バージョンで埋まった後はスキップのみで何もしない

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

### `last_sanpai` 未設定時のクラッシュバグの修正(Go/Node両方)

`status` キャッシュ(`userData.status`)は存在するが `last_sanpai`(トップレベル)が
存在しないユーザー(一度も参拝せずプロフィールを2回以上表示した場合に発生し得る)に
対して、移植前のNode版は `undefined.toDate()` を呼び出して例外になるバグがあった。
移植に合わせて、この場合は status 未保存時のフル計算パスと同じく
「参拝していないようです」を返すよう Go版・Node版の両方を修正した(未参拝ユーザーの
正しい表示。クラッシュしない)。

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
  ローカルでは `FIRESTORE_EMULATOR_HOST` 未設定時は自動スキップされるが、
  CIでは `firebase emulators:exec` でFirestoreエミュレータを起動した状態で
  `go test ./...` を実行しているためスキップされず検証される)で、
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
  Expressのbody-parserがルートハンドラ本体(メソッド判定・認証チェックより
  前)で不正なJSONを検出し`400`を返す。Go版も`decodeJSONBody`ヘルパーで
  同じ順序(メソッド判定・認証チェックより前)にボディをパースし、失敗時に
  `400`を返すことで挙動を揃えている(空ボディの場合はエラーにせず`{}`相当
  として扱う点もExpressのbody-parserと同じ)。

### 意図的に移植しなかった機能

- **期間限定ボーナス(`get_bonus_mag`/`msg`)**: Node版には「2022/1/1〜1/3は
  ポイント3倍」という一度きりのキャンペーンロジックがある。判定基準の
  `date_now` はNode側の実装上コールドスタート時刻に固定されるため、対象期間
  (2022年)を過ぎた現在は常に等倍(`bonus_mag=1`, `msg=""`)にしかならず、
  将来にわたって再度trueになることもない。そのためGo版(`sanpaiGo`)では
  意図的に移植せず、`msg` は常に空文字を返す。仮に同種の期間限定キャンペーンを
  再度行う場合は、Go版にも該当ロジックを別途追加すること。

## `ranking` エンドポイントのGo移植 (`rankingGo`)

ランキング表示(`app/functions-go/ranking.go`)をNode版(`exports.ranking`)と
同一の入出力になるよう移植している。`cache_data/ranking_cache` を読み、上位100件と
(指定があれば)自分の順位を返す。

- `latest_update` は Node版が Firestore の `Timestamp` オブジェクトをそのまま
  `response.json()` した際の `{"_seconds":..., "_nanoseconds":...}` という形状を
  再現している(`@google-cloud/firestore` の `Timestamp` は `toJSON` を実装して
  おらず、プライベートでない `_seconds`/`_nanoseconds` フィールドがそのまま
  シリアライズされるため)。フロントエンド(`web/components/ranking.vue`)は
  現状この値を表示に使っていない。
- `screen_name` 未指定、または指定した `screen_name` がランキングに存在しない
  場合は、Node版と同様に `my_rank` キー自体をレスポンスに含めない
  (`omitempty`)。
- `cache_data/ranking_cache` が未作成の場合(`rankingUpdate` スケジュール関数が
  一度も実行されていない状態)、Node版はここで例外化する処理を特にcatchして
  いないため、Go版も同様に internal error(500)として扱う。ドキュメント自体は
  存在するが `ranking` フィールドが欠落している場合も同様に internal error
  として扱う(Node版は`.slice()`呼び出しで例外化するのに対し、Go版が
  `{"ranking":null}`を200で返すと壊れたキャッシュを黙って正常応答してしまう
  ため、あえてエラーとして扱っている)。

## `register` エンドポイントのGo移植 (`registerGo`)

ユーザー登録(`app/functions-go/register.go`)をNode版(`exports.register`)と
同一の入出力になるよう移植している。Firebase IDトークンを検証し、
`users/{github_id}` が無ければ新規作成、あれば `auth_user_uid` の有無に応じて
`updated`/`registered` を返す。

- POST以外のメソッドは Node版と同じく `400 {"status":"missing request"}` を返す
  (`sanpai`/`status` は同じ状況でも既定の200を返すため関数ごとに挙動が異なる点に注意。
  これはNode版に元からある不整合をそのまま踏襲したもの)。

## `ogpRewrite` エンドポイントのGo移植 (`ogpRewriteGo`)

プロフィールページのOGPメタタグ書き換え(`app/functions-go/ogp_rewrite.go`)を
Node版(`exports.ogpRewrite`)と同一の入出力になるよう移植している。Firebase
Hostingの `/u/*` リライト経由で呼ばれ、SPAのビルド済みHTML(`base_url`)を取得して
OGP/Twitterカード用のメタタグを書き換える。

- `base_url`・`GCLOUD_PROJECT` はNode版では `functions.config().func.base_url` /
  `process.env.GCLOUD_PROJECT` から取得しているが、Go版はデプロイ時に
  環境変数 `FUNC_BASE_URL` / `OGP_PROJECT_ID` として明示的に渡す
  (`FUNC_BASE_URL` は `sanpaiGo` のGitHub資格情報と同様、CIが
  `firebase functions:config:get func` から取得する)。
- **既知の挙動(Node側の既存バグをそのまま踏襲)**: リクエストパスに `/u/` を
  含まない場合、Node版は `req_path.match("/u/(.+)")` が `null` を返した後の
  分岐で `null.length` を参照して例外化する(意図せず到達しないコード)。
  Firebase Hostingの `/u/*` リライト経由でのみ呼ばれる前提のため実運用では
  到達しないが、Go版もこの場合は正常系として扱わず internal error(500)を返す。
- `userOGP` で生成するOGP画像そのもの(Canvas/Chart.jsによる画像合成)は
  今回のGo移植の対象外(下記「Go移植を見送った機能」参照)。

## スケジュール関数のGo移植

`rankingUpdate`/`rankingCache`/`statusCacheBackfill`/`scheduledOgpDelete` は
いずれも Pub/Sub(Cloud Scheduler)トリガーで、ユーザーがブラウザで結果を
待つものではないためコールドスタート短縮による体感速度の改善効果は無いが、
実行時間短縮による課金削減とコード基盤の統一を目的にGoへ移植した
(`rankingUpdateGo`/`rankingCacheGo`/`statusCacheBackfillGo`/`scheduledOgpDeleteGo`)。
他のGo移植と同様、Node版とは別関数名・別Pub/Subトピック・別Cloud Schedulerジョブで
完全に独立してデプロイしており、安定稼働を確認してからNode版を停止する。

- **`rankingUpdateGo`**: 全ユーザーを `status.total` 降順で取得し、同点は同順位に
  なるよう順位を付け直して `cache_data/ranking_cache` に書き込む。
  Node版は `orderBy` 済みの配列に対して `sort((a,b)=>b.battlePoint-a.battlePoint)`
  を再度呼んでいるが、`battlePoint`(camelCase)は存在しないフィールド名の
  タイプミスで常に `NaN` を返す比較関数になっており、V8の配列ソートの挙動上
  実質的に無意味な処理(既存のFirestoreクエリ順をそのまま維持するno-op)に
  なっている。Go版はこの無意味な再ソートを行わず、Firestoreクエリの結果順を
  そのまま使う(観測できる出力はNode版と同一)。
  また `orderBy("status.total", ...)` はFirestoreの仕様上、対象フィールドを
  持たないドキュメント(status未計算のユーザー)を自動的に除外するため、
  Node版で起こり得る `.status.total` のundefined参照は発生しない。
- **`rankingCacheGo`**: 全ユーザーのうち `point_ranking/{id}` が未作成のものに
  初期値(`rank:0`)を作成する。Node版は `snapshot.forEach(async (item) => {...})`
  という非同期コールバックをawaitしないfire-and-forgetな実装になっており、
  理論上は全ユーザー分の書き込みが完了する前に関数の実行が終了したとみなされ得る
  (書き込み欠落のリスクがある)。これは意図された仕様ではなく実装上の不備と
  判断し、Go版では各ユーザーの処理を順番に確実に完了させる。書き込まれる
  データの内容自体(既存ユーザーはスキップ、無いユーザーはrank:0で作成)は同一。
- **`statusCacheBackfillGo`**: `status`/`statusGo` と同じ集計ロジック
  (`loadActivities`/`performance.UserPerformance`等)を再利用しており、
  直近6ヶ月以内に参拝したユーザーのうちstatus未計算のものを1回の実行につき
  最大10件だけ計算してキャッシュする、という挙動はNode版と同一。
- **`scheduledOgpDeleteGo`**: Cloud Storageの `ogps/` プレフィックス配下の
  ファイルを全て削除する。Node版は `bucket.deleteFiles({prefix:"ogps/"})` の
  戻り値をawait/returnしておらず、削除失敗時の挙動は実質的に不可視な
  fire-and-forgetになっている(このジョブ自体は1時間毎に再実行される
  冪等なクリーンアップ処理のため実害は無い)。Go版は1ファイルの削除失敗を
  ログに残しつつ他のファイルの削除は継続する(ジョブ全体を失敗させない)。
- デプロイ方法(Pub/Subトリガー・Cloud Scheduler設定)は
  `app/functions-go/README.md` を参照。

## Go移植を見送った機能

- **`userOGP`(OGP画像生成)**: `canvas`/`chartjs-node-canvas` によるサーバーサイド
  画像合成(ユーザーアイコンの切り抜き・レーダーチャート描画・PNG合成)を行っており、
  Node.jsの画像処理ライブラリに強く依存している。Goで同等の結果を得るには
  画像合成・チャート描画を別のライブラリで一から実装し直す必要があり、
  他のエンドポイントとは技術的な難易度・作業量が大きく異なる。加えて、
  Node版はCanvas(Cairo)とChart.jsが担う画像のレンダリング(アンチエイリアス・
  フォント描画・チャート描画アルゴリズム)に依存しており、Go側で別の描画
  ライブラリを使う場合、ピクセル単位で完全に同一の画像を出力することは
  現実的に不可能(見た目が近い画像は作れても「Node版と挙動が同一」とは
  言えない)。これは本移植プロジェクト全体の設計原則(挙動をNode版と
  同一にすることを優先する)と相性が悪く、他のエンドポイントより
  慎重な検討が必要と判断し、今回は見送った。また `userOGP` は生成結果を
  Storageにキャッシュし、ブラウザがOGP画像を非同期に取得する経路
  (SNSクローラー向け)であり、`ogpRewrite`のようにページの初期表示を
  ブロックしないため、レイテンシー改善の優先度も他のエンドポイントより低い。
  必要になった場合に改めて設計を提案する。

