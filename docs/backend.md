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
- `status` を書き込む処理(`status`/`sanpai`/`statusCacheBackfill`/`userOGP`。
  Go版は `statusGo`/`sanpaiGo`/`statusCacheBackfillGo`/`userOGPGo`)は
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

#### 旧フォーマットの `status` キャッシュのデコード(Go版の注意点)

Go版(`sanpaiGo`/`statusGo`/`userOGPGo`/`statusCacheBackfillGo`)はユーザードキュメントを
struct へ `DataTo` でデコードするが、**`status`(キャッシュ)を struct に含めて一括デコード
してはならない**。旧バージョンの `status` は現行の Go struct(`firestoreStatus`)と
フィールドの型が一致しないことがある(代表例: 旧 `status.user` はオブジェクトではなく
ユーザー名の**文字列**。他にトップレベル `exp` が小数、`status.last_sanpai` が Timestamp 等)。
`DataTo` はドキュメント全体を一度にデコードするため、`status` を struct に含めると
この型不一致でデコード**全体**が失敗し、`status` を参照しない再計算経路まで巻き添えで落ちる。

- 影響(修正前): 旧キャッシュを持つ移行ユーザーは
  - 参拝時に `runSanpai` 冒頭の `DataTo` が失敗 → `sanpai` が `missing server error`(HTTP 200・
    `add_exp` 無し)を返し、フロントの共有テキストが「参拝して、**undefined**ポイント獲得しました」に
    なる/結果が表示されない。
  - マイページ/OGP(`statusGo`/`userOGPGo`)も同じ `DataTo` で 500。
  - **自己修復役の `statusCacheBackfillGo` 自身が、走査中の最初の旧ユーザーで `DataTo` が失敗して
    ジョブ全体が中断**し、以降のユーザーが永久に修復されず不具合が固定化する。
- 対策(根本対応): 各 struct から `status` フィールドを外し、`status` は
  `decodeCurrentStatusCache(snapshot, status_version)` で**現行バージョンのときだけ**
  厳密デコードする。旧バージョン(または未設定)のときはデコードせず `nil` を返し、
  呼び出し側は「有効なキャッシュ無し」とみなして必ず全件再計算する(＝上記の自己修復に乗る)。
  現行バージョンのキャッシュは必ず Go が現行フォーマットで書いたものなので型不一致は起きない。
- 参拝結果の before/after 表示に使う参拝前の戦闘力(`power_before`)は、旧フォーマットの
  キャッシュからも取得できるよう `status.total` だけを型に寛容に読み取る
  (`statusTotalFromSnapshot`。Node版 `power_before = userData.status ? userData.status.total : 0`
  と同じ扱い)。
- なお `rankingUpdateGo`/`rankingCacheGo` は `status.total` のみを持つ狭い struct で
  デコードしており、旧フォーマットの `status.user` 等の影響を受けない(対策不要)。

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

## Node版 Cloud Functions の撤去(Go全面移行の完了)

すべてのエンドポイント/スケジュール関数が Go(gen2 Cloud Run functions)へ移植され、
フロントエンドの `$axios` 呼び出しと `firebase.json` の hosting rewrite(`/u/*` → `ogpRewriteGo`)も
Go 版のみを参照するようになったため、**旧 Node 実装(`app/functions/index.js`)を撤去した**。

- `app/functions/index.js` は関数を一切 export しない(移植済みを示すコメントのみ)。
  これにより `firebase deploy` 実行時、既存の旧 Node 関数(status/sanpai/register/ranking/
  userOGP/ogpRewrite とスケジュール4本)は prune(削除)される。
- Go 版(gcloud で個別デプロイした gen2 関数)は firebase の管理対象外のため prune されない。
- 旧 Node 実装のソースは git 履歴に保全されており、必要になれば復元できる。
- 撤去は「dev で prune → 動作確認 → 本番」の順で反映する。

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

### `status` レスポンスの `last_sanpai` の扱い(Go/Node両方)

`status` レスポンスの `last_sanpai` は、**キャッシュ利用/フル再計算のどちらの経路でも**
ユーザードキュメントのトップレベル `last_sanpai`(Timestamp)から生成する
(`YYYY年MM月DD日 HH:mm`)。`last_sanpai` が未設定(ゼロ値/`undefined`)のときだけ
「参拝していないようです」を返す。

- 未設定ユーザー(一度も参拝せずプロフィールを表示した場合など)に対して、移植前のNode版は
  `undefined.toDate()` を呼び出して例外になるバグがあった。これは Go版・Node版の両方で
  ガードして「参拝していないようです」を返すよう修正済み(クラッシュしない)。
- 以前はフル再計算経路のみ `last_sanpai` を固定文字列「参拝していないようです」にしていたため、
  **`status_version` 導入直後の既存(参拝済み)ユーザーは初回表示で必ずフル再計算経路を通り、
  参拝済みでも「参拝していないようです」と誤表示される**回帰があった(2回目以降は
  キャッシュ経路になり正しく表示)。フル再計算経路でもトップレベル `last_sanpai` から
  生成するよう両版を修正し、初回から正しい参拝日時を返す。

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

### ランキング応答のエッジキャッシュ (`Cache-Control`)

ランキングの元データ `cache_data/ranking_cache` は `rankingUpdateGo`(毎時
`0 * * * *`)が更新するだけで、それ以外では変化しない。にもかかわらず従来は
表示の度に関数実行 → Firestore 読み取りが走っていた。ユーザーが日本、関数と
Firestore が US(`us-central1`)にあるため、この毎回の往復が表示遅延の主因の
一つになっている。そこで応答に `Cache-Control` を付与し、CDN のエッジで
キャッシュさせて関数・Firestore への到達自体を減らす(`setRankingCacheHeaders`)。

- **グローバル応答(`screen_name` 無し)**: 全員共通なので共有キャッシュ可能。
  `public, max-age=60, s-maxage=300, stale-while-revalidate=600`。元データは
  最短でも毎時更新なので、エッジ最大5分の陳腐化は問題ない。トップ画面の
  ランキング埋め込みや未ログイン閲覧という最多経路がここに該当する。
- **個人化応答(`screen_name` 付き)**: `my_rank`(その利用者自身の順位)を
  含むため、共有キャッシュに載せると他人に別人の順位が返る事故になる。
  `private, no-store` としてどの階層にもキャッシュさせない。

エッジで実際にキャッシュさせるにはリクエストが CDN を通る必要がある。現状
フロントは各 Go 関数の直 URL(`API_URL`)を叩いており手前に CDN が無いため、
ランキング取得だけを Firebase Hosting のオリジン経由(`firebase.json` の
`/rankingGo` rewrite → `rankingGo`)に切り替える。フロントは取得先ベース URL
を `rankingBaseUrl`(`RANKING_BASE_URL` → 未設定時は `API_URL` にフォールバック)
から取り、本番では `RANKING_BASE_URL` に Hosting のオリジン(例
`https://d-shrine.jp`)を設定することでエッジキャッシュが有効になる。未設定の
dev/emulator では従来どおり関数を直叩きするため挙動は変わらない
(`Cache-Control` はブラウザキャッシュとしてはそのまま効く)。

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
- `og:image`/`twitter:image` は Go版のOGP画像生成関数 `userOGPGo` を指す
  (下記「`userOGP` エンドポイントのGo移植」参照)。`userOGPGo` は WebP(1200×630)を
  返すため、`og:image` の直後に `og:image:type=image/webp` と
  `og:image:width=1200`/`og:image:height=630` のメタタグを注入している。

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

## `userOGP` エンドポイントのGo移植 (`userOGPGo`)

OGP画像生成(`app/functions-go/userogp.go` + `internal/ogpimage`)を Go へ移植した
(`userOGPGo`)。Node版(`exports.userOGP` / `createOgp`)は `canvas` + `chartjs-node-canvas`
でベース画像にカードを合成していたが、Goネイティブ実装で再現している。画像描画ロジックは
再利用・単体テストしやすいよう `internal/ogpimage` パッケージに分離している
(パッケージ設計は `app/functions-go/internal/ogpimage/README.md` を参照)。

処理の流れは Node版と同じく「GCSに `ogps/{user}` のキャッシュがあればそのURLへ
リダイレクト、無ければ生成してアップロード後にリダイレクト」。生成時は
`screen_name` で Firestore を検索し、`status`(version判定つき)を解決してから
カードを合成する。

Node版との差分(意図的な改善):

- **アセット同梱**: ベース画像(`base.png`, 2500×1313)と Noto Sans JP フォントを
  `go:embed` でバイナリに同梱。Node版のように実行時にGCSから `base.png` を
  ダウンロードする往復が不要になり高速化する。
- **レーダーチャート**: `chartjs-node-canvas`(外部プロセス)ではなく Goネイティブ
  描画で再現(Chart.jsの radar 設定=5軸・min0/max150・stepSize10・色指定に対応)。
- **表示名/アイコンの取得元**: Node版は GitHub API(`get_user`)から `name`/`avatar_url`
  を取得していたが、Go版は Firestore の `display_name` / `image_path` を使用し、
  GitHub API への往復(レート制限リスク)を排除した。
- **余白クロップ**: 元の `base.png` は上下左右に暗い背景の余白が広く、そのまま
  OGPにするとカード=文字が小さく読みづらい。そこで **元解像度(2500×1313)で
  レンダリング → カード領域(塗り実測bbox+小マージン)を OG比(1200:630)でクロップ
  → 最後に一度だけ 1200×630 へ高品質縮小(CatmullRom)** する。縮小前にクロップ
  することで再拡大による画質劣化を避けつつ、余白除去でカード/文字が相対的に
  大きくなる。カードの外接矩形は `base.png` から実測した定数で、差し替え時は
  再計測が必要(`internal/ogpimage/ogpimage.go` に注記)。
- **出力形式**: PNG → **WebP(可逆VP8L, 純Go `nativewebp`)** に変更しファイルサイズを
  削減。キャッシュオブジェクトは `ogps/{user}.webp`(Content-Type: `image/webp`)。
  なお X(Twitter) は WebP の `og:image` でカードを生成しない場合があるため、
  X対応を優先する場合はエンコーダを差し替えてPNG出力に戻せる(変更は1箇所)。
- キャッシュ運用(`status_version` による自己修復)は `status`/`statusGo` と同一。
- デプロイ設定(メモリ512Mi・タイムアウト60s・`STORAGE_BUCKET_NAME`)は
  `app/functions-go/README.md` / `.github/workflows/dev-deploy.yml` を参照。

### OGP画像のQC

`internal/ogpimage` の `TestWriteQCArtifacts` は環境変数 `OGP_QC_OUT` が指すディレクトリに
サンプルOGP(PNG/WebP)を書き出す。CI(`dev-deploy`)ではこのテストを実行して生成物を
`actions/upload-artifact`(名前 `ogp-sample`)でアーティファクト化し、描画の破綻を
デプロイ前に目視確認できるようにしている。


## おみくじ機能 (`omikujiGo`)

8時間に1回だけ引ける、ITエンジニアあるある系のおみくじ。実装は
`app/functions-go/omikuji.go`(ロジック)と `omikuji_data.go`(文言データ)。

### 抽選はサーバーが決定し、演出は結果に合わせるだけ

物理演出(フロントの Plinko/ピタゴラ風抽選)でボールが落ちた場所で結果を
決めると、8時間制限もレア度も**クライアント任せ=改ざん可能**になる。そのため
**レア度(tier)と具体的な文言はすべて `omikujiGo` が決定**し、フロントの物理演出は
「サーバーが決めた tier のビンへボールが着地するよう誘導する」見た目担当に徹する。

### レア度と抽選

- レア度は7段階(超吉/大吉/中吉/小吉/末吉/凶/大凶)。`tierWeights` の重み付きで抽選する
  (重みは百分率に縛られず、合計は `tierWeightTotal()` で算出。後から調整可)。
- まず tier を重み付き抽選し、その tier の文言プール(全体で100個以上)から1件を一様に選ぶ。
  これにより「物理演出が当てるのは7ビンだけ(誘導が現実的)」「文言は100個以上」を両立する。
- `drawTierByValue(r)` / `pickEntryByValue(tier, r)` は乱数を引数(`r∈[0,1)`)で受け取り、
  テストで分布・網羅を決定的に検証できるようにしている。

### クールダウンと状態取得(peek)

- ユーザードキュメントに `last_omikuji`(引いた時刻)と `omikuji_result`(引いた結果。
  クールダウン中の再表示用)を保存する。参拝(`last_sanpai`)とは独立。
- クールダウン秒数は環境変数 `OMIKUJI_COOLDOWN_SECONDS`(本番=28800=8時間、dev=検証用に
  60秒。未設定時は28800)。
- リクエストボディに `peek:true` を渡すと**抽選せず**現在の状態だけ返す
  (`available` / `cooldown`+前回結果+残り秒)。フロントはページ表示時に peek で状態を取得し、
  「引く」ボタン押下時に peek 無しで実際に抽選する。おみくじには参拝のようなポイント等の
  ゲーム報酬は無く、フレーバー(占い)のみ。

### 引けるかどうかを開く前に伝える

引けるかどうかは**前回いつ引いたか**だけで決まり、それは前回引いた瞬間に確定して
いる。にもかかわらずどこにも覚えていなかったため、「おみくじ」を開くたびに
トークン取得 + `omikujiGo`(peek) の往復(関数がコールドなら数秒)を待たされ、
そのあとで初めて「まだ引けない」と分かっていた。

- `web/utils/omikujiCooldown.js` が**次に引ける時刻と前回の結果**を localStorage に
  持つ(キーに `github_id` を含め、アカウント切替で前の人のものを見せない)。
  純関数で `storage` を注入でき、`web/scripts/test-omikuji-cooldown.js` で検証する。
- **トップページ**: クールダウン中は「次のおみくじまで ◯時間◯分」を出し、
  ボタンを「前回のおみくじ」に変える。引ければ「おみくじを引く」に戻る。
  ここでは**サーバーに問い合わせない**(前回いつ引いたかだけで決まるため)。
- **おみくじページ**: マウント時に保存した状態を読み、**通信を待たずに**
  前回の結果とカウントダウンを出す。peek の応答が来たら上書きする(正はサーバー)。
  クールダウンが明けていて前回の結果だけある場合は、結果を添えてボタンを出す。
- **ヘッダ**: 同じく引けないときは「前回のおみくじ」表記。
- あくまで表示を先出しするだけで、**実際に引けるかは常にサーバーが決める**
  (端末の時計は書き換えられる)。残り時間は8時間(最長のクールダウン)で頭打ち。
  別端末では保存が無いので、従来どおり peek の応答から復元される。

### フロント

- `web/pages/omikuji.vue`(状態管理・API呼び出し)と `web/components/OmikujiResult.vue`
  (レア度別配色の結果カード)。ナビの「おみくじ」はログイン時のみ表示。
- Phase 1 は結果表示のみ。Phase 2 で matter.js(`matter-js`。既に依存にある)の
  Plinko/ピタゴラ誘導演出を追加する予定。

### デプロイ

- `omikujiGo` は HTTP 関数として dev/prod 両ワークフローでデプロイ(`sanpaiGo` と同型。
  GitHub認証情報は不要)。POST のため Hosting rewrite は付けず、フロントは関数を直叩きする。

## 参拝履歴(草グラフ)エンドポイント sanpaiHistoryGo

ユーザーページをポートフォリオとして使えるようにする取り組みの第一弾。
参拝履歴を GitHub のコントリビューショングラフ風のヒートマップ(草)で表示する。

### データ源と集計

- 参拝成功時に書かれる `users/{github_id}/sanpai_logs`(`add_point`, `timestamp`)を
  読み取り専用で集計する(**新規の書き込みは追加していない**。過去分の履歴が
  そのまま草になる)。expire/noaction の参拝はログが無いため草にならない
  (=実りのある参拝だけが生える)。
- 日付は **JST固定** で切る(`app/functions-go/sanpai_history.go` の
  `aggregateSanpaiDays`。純関数でユニットテスト済み)。
- レスポンスは日別集計(`{date, count, points}` の昇順配列)のみで、
  全期間でも高々1800日分程度と小さい。

### API

- `GET sanpaiHistoryGo?user={screen_name}` … 直近371日(53週)。
  `timestamp >= 開始日` の範囲クエリのみで読む量を抑える。
- `GET sanpaiHistoryGo?user={screen_name}&all=1` … 全期間(最古のログから)。
  履歴全量の読み取りが走るため、フロントは**明示的な「全期間を解析する」
  ボタンでのみ**呼ぶ(2021/12/31リリースから約5年分の履歴がある)。

### キャッシュ(ranking と同じ方針)

- 公開データで URL が `user`/`all` でキー分離されるため CDN の共有キャッシュに載せる。
  `app/firebase.json` に `/sanpaiHistoryGo` の Hosting rewrite を追加し、フロントは
  `rankingBaseUrl || apiUrl` 経由で取得(ranking.vue と同型)。
- デフォルト: `public, max-age=60, s-maxage=300, stale-while-revalidate=600`
  (参拝直後に草が生えるのが見えるよう短め)。
- 全期間: `public, max-age=300, s-maxage=3600, stale-while-revalidate=86400`
  (過去分はほぼ不変・重い読み取りの再実行を抑える)。

### フロント

- `web/components/sanpaiGrass.js` … 週折り返し・月ラベル・年分割の純関数
  (Node で決定論的に検証。omikujiFox.js と同じ流儀)。
- `web/components/GrassGrid.vue` … 1期間分のグリッド描画(直近1年と年別表示で共用。
  チャートライブラリ不使用のCSSグリッド)。
- `web/components/SanpaiGrass.vue` … 取得と状態管理。直近1年+「全期間を解析する」
  ボタンで年ごとの草を縦に並べる。設置場所は `/u/{userName}`(公開)と `/dashboard`。

## プロフィール統計(ストリーク・称号)エンドポイント profileStatsGo

ポートフォリオ第二弾。`GET profileStatsGo?user={screen_name}` が
sanpai_logs / omikuji_logs を集計して返す(表示: `web/components/ProfileStats.vue`、
設置は `/u/{userName}` と `/dashboard`)。

- **参拝統計**: 累計回数・累計ポイント・初参拝日・連続参拝ストリーク(現在/最長)。
  ストリークは草と同じ日別集計(JST)から `computeStreaks`(純関数)で算出。
  「今日まだ参拝していない」場合は昨日までの連続を継続中として数える。
- **おみくじ統計**: 抽選成功時に `users/{id}/omikuji_logs`(`entry_id`, `tier`,
  `timestamp`)を書くようにした(#156〜)。導入以前の抽選は遡れない。
- **称号(バッジ)**: 参拝回数・ストリーク・レベル・おみくじ結果から導出する17種
  (`badgeDefs`)。達成/未達成の全件を返し、フロントで未達成をグレー表示する。
  レベルは status キャッシュ(`status.level`)から読む。
- キャッシュ: 草のデフォルトと同じ
  `public, max-age=60, s-maxage=300, stale-while-revalidate=600`
  (`/profileStatsGo` の Hosting rewrite 経由)。

## GitHub実績統計エンドポイント githubStatsGo

ポートフォリオ第三弾。`GET githubStatsGo?user={screen_name}` がGitHub公開APIから
公開リポジトリ・スター・フォロワー等を取得・集計して返す
(表示: `web/components/GithubStats.vue`)。

- 取得: `GET /users/{login}`(followers/public_repos/created_at)+
  `GET /users/{login}/repos?per_page=100&type=owner`(最大3ページ=300件)。
  認証は sanpaiGo と同じOAuth App資格情報のBasic認証(5000req/h)。
- 集計(`aggregateGithubRepos`、純関数): スター/フォーク合計・言語割合
  (主要言語のリポジトリ数)・スター上位4件の代表リポジトリ。
  **フォークはリポジトリ数内訳のみに数え、スター・言語・代表からは除外**
  (本人の実績ではないため)。
- キャッシュ2段構え:
  - Firestore: ユーザードキュメントの `github_stats` + `github_stats_fetched_at` に
    **6時間**キャッシュ。GitHub障害時は期限切れでもstaleを返す(可用性優先)。
  - CDN: `public, max-age=300, s-maxage=3600, stale-while-revalidate=86400`
    (`/githubStatsGo` の Hosting rewrite 経由)。

## READMEバッジエンドポイント badgeGo

ポートフォリオ第四弾。`GET badgeGo?user={screen_name}` が shields.io 風の
フラットバッジ(SVG)を返す。GitHubのプロフィールREADMEに

```
[![でばっぐ神社](https://d-shrine.jp/badgeGo?user=X)](https://d-shrine.jp/u/X)
```

と貼ると「⛩(鳥居アイコン) でばっぐ神社 | Lv.42 戦闘力 9999」が表示される
(マイページにコピー用スニペットUIあり)。

- 値は status キャッシュ(`status.level`/`status.total`)から読むだけで、
  重い集計はしない。キャッシュ未計算は「参拝求ム」。
- **未登録ユーザーにも200で「未登録」バッジを返す**(README内の画像は
  非200だと壊れた画像アイコンになるため)。
- テキスト幅は ASCII≈7px・全角≈12px の近似で算出(shields実測値の代替)。
  鳥居アイコンは絵文字でなくSVGパスで描く(閲覧環境のフォント差の影響を受けない)。
- キャッシュ: `public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400`
  (未登録バッジのみ5分)。`/badgeGo` の Hosting rewrite 経由。

## レーダーチャート(でばっぐのうりょく)の割合表示

能力値は参拝で単調増加するため、絶対値の固定スケール(0-150)ではベテランが
全軸振り切った五角形になりバランスの形が見えなかった。そこで表示を
**「最も高い能力に対する割合(%)」** に正規化した(#159で合計比を導入、
#160で最大能力比に変更)。

- 割合 = round(能力値 / 最大能力値 × 100)。全て0(未参拝)は全軸0。
- 最強能力が100%=外周になり、**全能力が同値なら満点の五角形**になる。
  苦手分野だけが凹むので直感的(合計比だとバランス型が各軸20%の
  小さな五角形にしかならないため不採用)。スケールは0〜100%・グリッド20%刻み。
- 正規化は**描画側のみ**で行い、APIレスポンス・`status` キャッシュの `chart` は
  絶対値のまま(status_version のバンプ不要・後方互換)。
  - Web: `web/pages/dashboard/index.vue` / `web/pages/u/_userName.vue` で正規化、
    `web/components/charts/powerChart.vue` の max=100
  - OGPカード: `internal/ogpimage` の `chartPercentages`(純関数)+ `radarMaxPercent`
- OGP画像はGCSにキャッシュされるため、オブジェクト名を世代付き
  (`ogps/{user}_v3.webp`、`userogp.go` の `ogpObjectName`)にして旧カードを無効化。
  描画内容を変えるときはこの世代を上げること(旧世代は scheduled_ogp_delete が掃除)。

## おみくじの物理乱数化(kuda)

おみくじの抽選乱数を Go の `math/rand`(疑似乱数)から 428lab/kuda
(https://kuda.kojiran.workers.dev)の**物理エントロピー**に置き換えた。
kuda は ANU の量子真空ゆらぎ+ガイガーカウンター(放射性崩壊)をプールし、
`GET /drop` で1バイトずつ払い出す(消費したバイトは不可逆削除)。

### kudaの原則に対するこちらの振る舞い

- **引いた値の拒否(rejection sampling)はしない**。値→確率の写像は
  スケーリングのみ(`bytesToUnitFloat` / `byteToUnitFloat`)。
- **疑似乱数へフォールバックしない**。枯渇(503)・停止・タイムアウト時は
  `{status:"no_entropy"}` を返し、フロントは「御籤の源が尽きておる」を表示。
  このとき `last_omikuji` は書かない=クールダウンを消費しないので、
  補充後すぐ引き直せる。
- peek(状態確認)はkudaに触れない。バイトを消費するのは実際の抽選だけ。

### バイト割当とエントロピー収支

- 1回の抽選 = **3バイト**: tier に2バイト(重み合計100に対する量子化誤差
  ~0.003%)、文言に1バイト(レア度ごと15件のflavor用途)。
- kudaのプールは1日1024バイト(ANU cron)+home注入 ≒ 約340回/日の抽選。
  クールダウン8hの現ユーザー規模では十分。
- `/drop` は並列3コール・全体タイムアウト4秒(`kuda.go`)。

### 出自の記録・表示

- 結果(`omikuji_result` 保存含む)に `entropy: {source:"physical",
  batches:[...]}`(kudaのバッチラベル。重複除去済み)を付与し、
  結果カード下部に「⚛️ この御籤は量子ゆらぎと放射性崩壊(物理乱数)が
  決めました」+バッチを表示する。導入前の結果には entropy が無く非表示。
- `omikuji_logs` にも `entropy_batches` を記録(監査用)。
- 接続先は env `KUDA_BASE_URL`(dev/prod とも本番kudaを使用。テストは
  httptest モックで実プールを消費しない)。

## 代表リポジトリのピン留め(pinnedReposGo)

公開プロフィールの代表リポジトリ(通常はスター上位4件の自動選出)を、
本人が指定した最大6件に置き換えられる(GitHub本家のピン留め相当)。

- **保存**: `POST pinnedReposGo {github_id, repos:["name",...]}`(Bearer必須)。
  空配列 = ピン解除(自動選出へ戻る)。
- **認可は既存より一段厳しい**: IDトークンのUIDとユーザードキュメントの
  `auth_user_uid`(registerGoがログイン毎に維持)の一致を必須にする。
  不一致・未設定は403(書き込み系設定のため。他人のピンは書き換えられない)。
- **メタデータはサーバー検証**: 保存する各リポジトリを
  `GET /repos/{screen_name}/{name}` で検証し(存在+owner一致)、取得した
  実値(stars等)を `users/{id}.pinned_repos` に保存する。クライアント申告値は
  使わない(スター数の自称詐称防止)。フォークは本人の明示選択なので可。
- **表示**: `githubStatsGo` が毎リクエスト `pinned_repos` を読み、あれば
  `top_repos` を置き換えて `top_repos_source:"pinned"` を返す(無ければ
  `"stars"`)。github_stats の6hキャッシュとは独立なので、ピン変更は
  CDN(s-maxage=3600)の失効後、最大1時間で公開ページに反映される。
- **フロント**: マイページの GithubStats に `editable` を付け、
  `RepoPicker.vue` で編集。候補一覧はブラウザから直接GitHub公開APIを取得
  (CORS可・低頻度なので未認証60req/hで十分)。

## ぽいんとランキング(points_ranking)

戦闘力(`status.total`)ランキングに加えて、ぽいんと(ユーザーの `exp`。参拝で
加算される累計ポイント)のランキングを並設した。

- **集計**: 既存の毎時スケジュール関数 `rankingUpdateGo` を拡張。
  `users` を `exp` 降順でもう1クエリ発行し(戦闘力とは別軸のため。片方の
  フィールドしか持たないユーザーも各軸で正しく拾える)、同点同順位・飛び番の
  競技ランキング方式で順位を付けて、同じ `cache_data/ranking_cache`
  ドキュメントの `points_ranking` 配列に保存する。新しい関数・トピック・
  スケジューラは増やしていない。
  orderBy の仕様により `exp` を持たないユーザー(参拝経験ゼロ)は除外される。
- **配信**: `rankingGo` のレスポンスに `points_ranking`(トップ100)と
  `my_point_rank`(`?screen_name` 指定時のみ、全件走査)を追加。1レスポンスで
  両ランキングを返すのでリクエスト数・CDNキャッシュキーは増えない。既存
  クライアントは新フィールドを無視するだけで互換。
  `points_ranking` は後付けフィールドのため、旧キャッシュドキュメントに
  存在しない間(新rankingUpdateGoの初回実行まで最大1時間)はエラーではなく
  空配列を返す(`ranking` 欠落がエラー扱いなのとは意図的に非対称)。
- **エントリ形状**: `{display_name, screen_name, image_path, point, rank}`。
  値のフィールド名は `battle_point` に対して `point`(ダッシュボードの
  「ぽいんと」表示と同じ値)。
- **フロント**: `Ranking.vue` に「⚔️ せんとうりょく / 🪙 ぽいんと」のピル型
  タブを追加。タブ切替は取得済みデータの表示切替のみで再フェッチしない。
  「あなたの順位」カード・一覧・単位(bp/pt)が連動する。

## kuda APIキー対応

kudaがAPIキー認証を導入(移行期間中は `REQUIRE_API_KEY=0` でキー無しも可、
フリップ後は401)。おみくじのkudaクライアントを先行対応した。

- **認証**: `KUDA_API_KEY` 環境変数(`kuda_...`)が設定されていれば
  `Authorization: Bearer` ヘッダで送る。サーバー間通信なのでヘッダレーンのみ
  使用(半公開キー `kudaq_` の `?key=` クエリレーンは使わない)。
  併せて `X-Client-Id: debug-shrine` を送り、kuda側の統計・監査で識別可能にする。
- **キーの注入**: GitHub Secrets `DEV_KUDA_API_KEY` / `PROD_KUDA_API_KEY` →
  デプロイworkflowの omikujiGo `--set-env-vars`。Secret未設定なら空=無認証の
  互換動作のまま。
- **エラー方針は不変**: 401(キー無効)・429(日次クォータ超過)も503(枯渇)と
  同じ「引けない」(no_entropy)。疑似乱数フォールバックはしない。
- **クォータ注意**: kudaの新規キー既定は30滴/日。おみくじは3バイト/回なので
  既定のままだと1日10回で頭打ちになる。キー発行時(ダッシュボード・Nostr認証)に
  daily_quota を用途に合わせて引き上げること。

## 週間・月間ランキング(#211)

トータルに加えて暦週・暦月(JST)のランキングを出す。指標ごとに作り方が違う。

- **期間の区切り**: 週は月曜0:00、月は1日0:00(いずれもJST)。`periodBounds`
  が現在時刻から週初・月初とキー("2026-07-20" / "2026-07")を返す純関数。
- **ぽいんと**: `users/{id}/sanpai_logs` をコレクショングループで横断し、
  `timestamp >= 週初と月初の早い方` で絞って `add_point` を合計する
  (週が月をまたぐ場合は週初が月初より前になるため、早い方を下限にして
  1クエリで両方を賄う)。ログは2021年から残っているので遡って正確。
- **せんとうりょく**: `users/{id}/battle_logs` を同じ形で横断して合計する
  (#226)。参拝1回で伸びた分をイベントとして積んであるので、ぽいんとと同じ
  やり方で期間の値が出せる。
  - 記録は参拝時(`sanpai.go`)。増分パスでは「新しい total − 基準にした
    キャッシュの total」、全件再計算パスでは `ComputePerformanceIncrement` に
    ゼロ基準と新着イベントだけを渡して**新着イベント自身の寄与**を測る
    (キャッシュとの差はキャッシュの誤りの訂正や、過去の全活動を初めて
    集計した分まで含んでしまうため)
  - 0以下は積まない。ログが無い期間は空になり、フロントはトータルへ
    フォールバックする

以前は `status.total` の期間開始時点スナップショット
(`cache_data/battle_baseline`)との差分で出していたが、`status.total` は
スコアであると同時にマイページ表示用のキャッシュでもあり、`statusGo` の
書き戻し(キャッシュが古いユーザーのプロフィールが開かれたとき)や
`statusCacheBackfillGo` によって参拝と無関係に書き直される。そのため
キャッシュの再計算がそのまま「期間中に伸びた分」として計上され、何年も
参拝していないユーザーが週間ランキングに現れていた。ログ方式はイベントを
合計するだけなのでこの問題が原理的に起きない(詳細は `battle_logs.go`)。

### 移行時の遡り作成 (`battleLogBackfillGo`)

`battle_logs` はログ方式への切り替え以降の参拝でしか積まれないため、切り替え
直前の期間は実際には伸びているのに記録が無く、ランキングから抜け落ちる。
せんとうりょくは `github_activities` の純関数なので、期間内の活動の寄与を
計算すれば伸び幅を復元できる。

- 対象は `期間開始 <= created_at <= last_activity_created_at` の活動。
  `last_activity_created_at` までの活動は既に `status.total` に取り込み済みで、
  今後の参拝でライブにログへ積まれることがないため、二重計上にならない
- 活動1件ごとに、その活動が起きた時刻で積む。能力値の加算は活動ごとの寄与と
  「直前の活動との間隔」による寄与の和なので、時刻順に1件ずつ直前の活動を
  渡して計算すれば合計は範囲全体をまとめて計算した場合と一致する。こうして
  おくと、どの期間で切っても正しく振り分けられる
- 積み終えたユーザーには完了印 `users/{id}/battle_log_backfills/{key}` を書き、
  次回以降はそれで飛ばすので冪等。**印はログを全部書いた後に置く**。
  `battle_logs` 側の `backfill_key` を印代わりにすると、書き込み途中で落ちた
  ユーザーが「完了済み」に見え、欠けたまま二度と埋まらない。印の無い書きかけの
  ログは、積み直す前に消してから作り直す
- 伸び幅ゼロのユーザーにも印を置く。置かないと再実行のたびに
  `github_activities` を読み直すことになり、先へ進めない
- `last_activity_created_at` が期間開始より前のユーザーは、`github_activities`
  を読む前に落とす。休眠ユーザーの全活動を読むだけで実行時間を使い切るため
- 書き込みは `BulkWriter` でまとめる。1件ずつ `Add` すると、活動数千件の
  ユーザー1人で数分かかる
- 1回の実行(タイムアウト540秒)で終わらない規模のため、6分で自分で切り上げる。
  強制終了されると書きかけのユーザーが出るので、その前に止める。続きは再キック
  で進む。`rankingCloseJulyGo` のように締めまで行う処理は、**見終える前に締めない**
  (欠けたアーカイブで確定してしまう)
- 定時実行は無い。Pub/Sub トピック `battle-log-backfill-go` へ手で publish する
  (`.github/workflows/kick-scheduled-function.yml`)

### 締めを取りこぼさない

締めは期間キーの変化で検出するため、**失敗したまま状態のキーを進めると、その
期間は二度と締められない**。そこで失敗した期間はキーを据え置き、次の実行で
自動的に再試行する(値はログの範囲集計なので、いつ締めても結果は同じ)。

既にキーが進んでしまった期間を後から締め直すために `rankingCloseRetryGo`
(Pub/Sub トピック `ranking-close-retry-go`、定時実行なし)を用意している。
直前の週にアーカイブが無ければ締める。既にあれば何もしないので冪等。

### 締め機能より前の期間を作る

締め機能を入れる前に過ぎてしまった 2026年7月は、`rankingCloseJulyGo`
(`ranking-close-july-go`、一度きり)で後から作る。復元の精度は指標で違う:

- **ぽいんと**: `sanpai_logs` が2021年から残っているので正確
- **せんとうりょく**: `github_activities` から復元するが、そこに入っているのは
  参拝時に取得できたイベントだけ。その月に参拝していないユーザーの活動は
  保存されていないことがあり、取りこぼしが出る

獲得ログの作成は 7/1〜7/27 に限る。7/27 以降は移行時のバックフィルで既に
作られているため、重ねると二重計上になる(`runBattleLogBackfillRange` の
`until`)。

本番は対象ユーザーが多く1回では終わらない。ログの復元が途中なら締めずに戻る
ので、`ranking-close-july-go` を「復元完了」のログが出るまで繰り返しキックする。

### 実行頻度

`rankingUpdateGo`(毎時)に相乗りする。usersの全件スキャンは既存のものを
再利用するので、表示情報(display_name/image_path)の追加読み取りは発生しない。

- せんとうりょくの期間ランキング: **毎時**。参拝直後に反映されないと体験が
  悪いため、コレクショングループ読み取りを毎時払う
- ぽいんとの期間ランキング: **3時間ごと**(`shouldAggregateSanpaiPoints`)。
  参拝ログの横断読み取りは期間中の参拝数に比例するため間引く。間引いた回は
  `MergeAll` によって前回値がそのまま残る。JST 0時は集計回に当たるので、
  週明け・月初の切り替わりは待たずに反映される。

期間集計が失敗しても(インデックス未作成・一時エラー等)ログを残して
トータルの更新は続行する。フロントは空の期間をトータル表示にフォールバック
するので、利用者側は壊れない。

### キャッシュドキュメントの持ち方

`cache_data/ranking_cache` に指標×期間ごとの2フィールドを持つ:

- `{battle,points}_{week,month}_top`: 上位100件(display_name/image_path つき)
- `{battle,points}_{week,month}_ranks`: 全ユーザー分の `{screen_name, value, rank}`

トータルのランキングは全ユーザー分を表示情報つきで持っており、ドキュメントの
1MiB上限に効く(N≒2,000〜3,500)。期間別で同じ持ち方をすると上限が一気に
縮むため、表示情報つきは上位のみにし、圏外の「あなたの順位」は軽量な
`*_ranks` から引く(順位カードは順位と値しか使わない)。

### Firestoreインデックス

`sanpai_logs.timestamp` をコレクショングループで使うため、
`app/firestore.indexes.json` の `fieldOverrides` に **COLLECTION_GROUP** スコープの
インデックスを追加した。fieldOverrides は自動の単一フィールドインデックスを
置き換えるので、既存の `sanpaiHistoryGo`(サブコレクション単位の
`where timestamp >= X`)が使う COLLECTION スコープの昇順・降順も併記している。
デプロイは既存の `firebase deploy --force` が firestore.indexes.json ごと出す。

### フロント

`Ranking.vue` に指標(せんとうりょく/ぽいんと)と期間(トータル/週間/月間)の
2段セグメントを置く。初期表示は**週間×せんとうりょく**。選択中の期間が空なら
**トータルにフォールバック**して注記を出し、記録が溜まれば自動で期間表示に戻る。
全期間を1レスポンスで受け取るのでタブ切替で再フェッチしない(CDNキャッシュ
キーも増えない)。トップページは幅が狭いので `:show-tabs="false"` でタブを
出さず、既定(週間、空ならトータル)だけを見せる。

## レベル計算の上限(#215)

`GetLevel` は閾値テーブル `targetPoints` を先頭から見て「戦闘力 <= 閾値」の
最初のレベルを返すが、移植元(Node版 get_level)はどれにも当てはまらない場合
= 最高レベルの上限を超えた場合に **level=0** を返していた。テーブルは50件
(Lv50の上限39156)だったため、39156を超えた利用者が「Lv0」と表示された。
`GetNextLevelExp` も level=0 として `targetPoints[0]`=0 を返すので、マイページの
「NEXT 0 exp」と進捗バーの0除算も同時に起きていた。

対応:

- **テーブルをLv100まで延長**。Lv1-50 の閾値は1つも変えていない(既存ユーザーの
  レベルが下がらないよう `TestTargetPoints_Lv1To50Unchanged` で固定)。Lv51以降は
  実測した増分比(末尾で約1.084倍/Lv)をそのまま延ばした。Lv100の上限は約238万。
- **上限超えは最高レベル扱い**にして、二度と0に落ちないようにする。テーブルを
  延ばしてもいつかは超える人が出る前提の防波堤。
- **最高レベルでは NextExp に0を返さない**(進捗バーの0除算を避ける)。
  フロント側にも `progressPercent` で 0除算・100%超えのガードを入れた。
- **レベルはキャッシュではなく戦闘力から引き直す**。`status.level` は
  statusGo が書くキャッシュに残るが、`fromFirestoreStatus` と `readCachedLevel`
  (バッジ・称号が使用)は `status.total` から `GetLevel` で毎回求める。レベルは
  total の純関数なので等価で、閾値テーブルを直したときにキャッシュの作り直しを
  待たずに正しい値が出る(status_version を上げて全ユーザー再計算する必要がない)。
  ただし status キャッシュ自体が無い場合は 0 を返し、「未計算(参拝求ム)」の
  判定を壊さないようにしている。

## 過去ランキングのアーカイブと入賞称号(#220)

### 締め(アーカイブ)

週明け・月初(JST 0:00)に期間キーが変わったら、閉じた期間の最終結果を
`ranking_archive/{week|month}_{期間キー}` に保存して二度と変えない。
確定値は**締めの瞬間に計算し直す**(定期実行の最後の値を流用しない):

- **せんとうりょく**: 基準値を作り直す前に「旧基準値 → 現在値」の差分を取る。
  作り直した後では復元できないため、ロールオーバー処理の中で確定させる
  (`detectClosings` → `closePeriod` → `rollBattleBaseline` の順)
- **ぽいんと**: 閉じた期間の範囲 `[開始, 開始+1週/1ヶ月)` で `sanpai_logs` を
  集計し直す。終了を「現在の期間開始」ではなく「開始+1期間」にしているのは、
  関数が数期間止まっていても閉じる期間の範囲が伸びないようにするため

締めは**ぽいんとの3時間間引きに関係なく必ず走る**。締めに失敗しても基準値の
更新は続ける(止めると旧期間の差分が取れなくなり、二度と締められなくなる)。

保存内容は `battle_top` / `points_top`(上位10件・表示情報つき)と
`battle_ranks` / `points_ranks`(全ユーザー分の `{screen_name, value, rank}`)。
全員分の順位を持つのは、将来ユーザーページで順位の推移を出すため。
`partial` は集計を期間の途中から始めた期間(機能の導入直後など)の目印で、
基準値を作った時刻(`week_base_at` / `month_base_at`)が期間開始から90分以上
遅れていたら立てる。

### 配信

`rankingArchiveGo`:

- `?type=week` → 期間の一覧(新しい順、既定26件・最大100件)
- `?type=week&period=2026-07-20` → その期間の確定結果

確定済みの内容は変わらないので、詳細は `s-maxage=86400` と長めに置く
(一覧は期間が増えるので1時間)。一覧は `period_type` の等価 + `period_key` の
降順なので複合インデックスを `firestore.indexes.json` に追加した。

### 入賞称号

締め時に各ランキングの1位(同点なら全員)へ称号を付ける。既存の称号と違い
**過去のイベントで事実から再判定できない**ため、`users/{id}.crowns` に
`{count, latest_period}` を貯める(`firestore.Increment` で加算)。
伸び幅0しか居ない期間は誰にも付けない。`profileStatsGo` が `crowns` として
獲得回数つきで返し、マイページでは通常の称号と分けて琥珀寄りの色で見せる。

### LV称号

レベル上限がLv100になった(#219)のに合わせて、序盤と終盤に称号を追加して
計8つにした: 氏子(Lv5) / 見習い神主(10) / 宮守(15) / 本殿の主(25) /
大神主(35) / 生き神(50) / 神域の主(75) / 露御読把和流の化身(100)。
既存3つの名前と条件は変えていない。
