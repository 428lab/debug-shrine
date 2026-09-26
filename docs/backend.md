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

### ボーナスタイム

土日・祝日・年末年始・4/28(よつやの日)の GitHub の活動に、ぽいんとの上乗せを付ける
(`computeAddExp`、`app/functions-go/sanpai.go`)。判定は参拝した時刻ではなく、
**各イベントの `created_at` を JST で日付にしたもの**で行う(いつ参拝しても同じ点になる)。

```
mag(day) = 4 (4/28) > 3 (12/29〜1/3) > 2 (土日・祝日) > 1     ※ max、掛け合わせない
rb_i     = 0 (対象外) / 1 (bonusBranches に一致) / 2 (428lab/* かつ day_i が 4/28)
addExp   = 1 + floor(Σ mag(day_i) / 5) + Σ rb_i
```

- 参拝1回の基礎点 `1` は日付に紐付かないので倍率をかけない。
- すべて平日なら従来の式 `1 + floor(n/5) + b` と一致する。
- 暦の判定は `app/functions-go/bonus_calendar.go`。祝日は内閣府の CSV を UTF-8 に
  変換して `app/functions-go/holidays/holidays_jp.csv` に同梱している(振替休日・
  国民の休日を含む)。**毎年2月頃(翌年分の公開後)に翌年分を CSV に追記する**
  (手順は `app/functions-go/README.md`)。当年分が無いと
  `TestJPHolidays_CoverCurrentYear` が落ちる。
- 参拝結果の `msg` に内訳を出す。書式は固定順・`/` 区切りで、0件の項は出さない。
  何も該当しなければ空文字。
  例: `ボーナスタイム: よつやの日 ×4 2件 / 年末年始 ×3 1件 / 土日・祝日 ×2 3件 / 428lab ×2 2件`
- `users/{id}/sanpai_logs` に `bonus_point`(`add_point` のうちボーナス由来の増分 =
  addExp − 従来の式の値)を記録する。ランキングは従来どおり `add_point` だけを見る。
- Node版の期間限定ボーナス(`get_bonus_mag`: 2022/1/1〜1/3 は3倍)は移植していない。

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
- **問い合わせが終わるまで「引く」は押せない**(`statusChecked`)。保存済みの状態で
  先に画面を出すため、確認前でもボタンが見えている。ここで押せると、演出の最中に
  peek の応答が返って `state` を上書きし、**演出が畳まれて引く前の画面に戻る**
  (リロードされたように見える)。併せて、**その問い合わせより後に演出が始まっていたら
  応答を捨てる**(`sceneCount` の世代で判定)。「今 animating か」で判定してはいけない
  — 演出が結果より先に終わったときの取り直し(`onLanded`)はまだ `animating` のまま
  呼ぶため、それを捨てると演出が閉じずに固まる。演出中にクールダウンが明けたときの
  タイマーも `state` を触らない。

### フロント

- `web/pages/omikuji.vue`(状態管理・API呼び出し)と `web/components/OmikujiResult.vue`
  (レア度別配色の結果カード)。ナビの「おみくじ」はログイン時のみ表示。
- 演出は `web/components/OmikujiScene.vue`(matter.js)。「儀式(ユーザー操作)→
  装置の見せ場(サーバー応答待ち)→ 狐が本命のビンへ着地(結果)」の3幕で、
  抽選の正しさは装置に依存しない(狐の最終着地は `omikujiFox.js` が制御)。

### 演出の装置(からくり)は差し替え式

装置(からくり)は引くたびにランダムに選ばれる(`web/components/omikujiMachines.js`)。
各装置は同じインターフェースを実装したモジュールで、`OmikujiScene` はそれだけを
使って幕を進める。装置固有の座標や操作(鈴の緒を振る、玉を引き絞る)はシーンに
持ち込まない。

| id | 装置 | 儀式 | 見せ場 |
|---|---|---|---|
| `bell` | 鈴の緒(`omikujiMachine.js`) | 房をつかんで左右に振る | 玉が絵馬・水車・ドミノ階段をリレーして狐に直撃 |
| `slingshot` | 弾き玉(`omikujiSlingshot.js`) | 御神玉をつまんで引き絞り、放す | 木札の櫓に直撃して崩れ、木札か玉が狐に当たる |
| `pinball` | 弾き盤(`omikujiPinball.js`) | 右端の御神玉を下に引いて、放す | 玉が天辺の弧を回って盤面へ、バンパーに弾かれながら中央の穴の狐へ落ちる |
| `saisen` | 賽銭落とし(`omikujiSaisen.js`) | 天辺の賽銭を左右に動かし、放す | 賽銭が釘の林と風車の間を跳ねて落ち、斜面を左端の狐まで転がる |
| `daruma` | だるま落とし(`omikujiDaruma.js`) | 吊り下げの木槌を左へ引いて、放す | 木槌が往復して胴を一段ずつ弾き飛ばし、最後に残った頭が転がって左端の狐へ |
| `amida` | 隠しあみだくじ(`OmikujiAmida.vue`) | 7本の縦線から1本選ぶ | 霞が晴れながら光が選んだ線をたどり、下の端のレア度に着く(狐は出ない) |
| `tube` | おみくじ筒(`OmikujiTube.vue`) | 筒をつまんで上下に振る | 筒をひっくり返すと番号の棒が出て、その番号の引き出しから札が出る(狐は出ない) |
| `pitagora` | 和風ピタゴラ(`OmikujiPitagora.vue`) | 鈴の緒を下に引く | 玉が絵馬ドミノ・鳥居の螺旋・谷越え・鹿威しを駆け抜け、玉の視点(3D)であみだくじを走って結果の門をくぐる(狐は出ない) |

`amida`・`tube`・`pitagora` は物理の装置ではなく、**演出そのものが結果を見せる種類**。
OmikujiScene(狐がビンを選ぶ)を通らず、それぞれ専用のコンポーネントで動く。ページとの
約束は同じ(props `targetTier`、儀式が済んだら `rang`、見せ終えたら `landed`)。
`omikuji.vue` は `omikujiMachines.isReveal()` が真の種類なら専用のコンポーネントを出す。
いずれも結果が 25 秒届かなければ着地させる(ページは結果が無ければ状態を取り直す。
OmikujiScene の `TIMELINE.failsafeMs` と同じ扱い)。

インターフェース(詳細は `omikujiMachines.js` の冒頭コメント):
`GEO`(論理座標系)/ `FOX`(寝床)/ `HINT`(案内文)/ `TIMELINE`(フォールバック時刻)/
`wakeLabels`(狐を起こすボディ)/ `grabFilter`(指でつまめるもの)/ `build` /
`createRitual`(儀式の完了判定)/ `fallbackRitual`(「うまくできないとき」)/
`onRitualDone` / `nudge`(詰まったときの押し)/ `createSettleDetector`(任意)。

確認用に `?scene=slingshot` `?scene=pitagora` のようにクエリで演出を固定できる。

#### 弾き玉(slingshot)の設計

- 玉はゴム(拘束)で台に繋がれていて、放して**支点を通り過ぎた瞬間**(ゴムが伸び切って
  一番速い瞬間)に切り離す。判定は「放した時の引いた向き」との内積で行う。
  「x が支点より右」のような固定条件だと、垂直気味の引きで永久に切り離せず
  ぶら下がったままになった。
- 射出速度には上限(15px/step)を掛ける。matter は連続衝突判定をしないため、
  速すぎる玉は壁を突き抜けて場外へ落ちる(stiffness 0.045 では最大 45px/step に
  達していた)。壁も厚め(60px)。
- ゴムに繋がっている間は玉の自重を打ち消す。柔らかいゴムは重力で 3px ほどたわみ、
  玉が支点から下がったまま微振動して眠れない(鈴の緒装置の水車と同じ手 #199)。
- 櫓の木札は最初からスリープで凍結し、触られるまで完全静止(#199 の方針)。
- **狙いが外れて何にも当たらなくても数秒で進む**。玉も木札も静まったら
  (`createSettleDetector`)、物音で狐が起きる。タイムボックス(9秒)は最後の保険。
- ヘッドレス検証は `web/scripts/simulate-omikuji-slingshot.js`。引きの角度×強さ
  45点を掃引し、狐への到達と静止までの秒数、無操作で装置が動かないことを確認する。
  GEO を触ったら必ず回す。

#### 弾き盤(pinball)の設計

- 右端のレーンにある御神玉(プランジャー)を**下に引いて放す**。引きはレーンに
  沿った縦方向だけに正規化し、支点を上に通り過ぎた瞬間に切り離す。射出速度は
  [17, 21]px/step に収める。弱すぎると天辺の弧まで登り切れずレーンに落ち戻り、
  速すぎると薄い壁(レーン壁 8px・弧 20px)を突き抜ける。
- 天辺の弧は静止セグメントで近似する。弧の右端は盤面の外(x>480)まで出す。
  レーンの中に端が残ると、登ってきた玉が端に下から当たって跳ね返り、盤面へ出られない。
- **レーンの蓋(一方通行)**。玉が盤面へ出た瞬間、レーンの口に蓋を閉じる
  (`collisionFilter.mask` を 0 → 全部に切り替える)。跳ね返ってきた玉がレーンに
  落ち戻ると、井戸の底で止まって狐から遠く、静止検知まで 10 秒近くかかった。
  蓋は左下がりのくさび形にする。平らな板だと天辺を右へ戻ってきた玉が板の上に
  載って右上の隅で止まった。
- ポップバンパーは衝突した瞬間に玉を中心から外向きへ**一定速度**(9px/step)で弾く。
  反発係数で表現すると速度が発散したり減衰したりして安定しない。弾く向きに僅かな
  乱れ(±0.35rad)を混ぜて、同じ引きでも毎回違う軌道になるようにする(乱数は
  `build(Matter, { rnd })` で注入でき、検証はシード付き)。
- 床は中央の穴へ向かう**2枚の斜面(台形)**。薄い板だと板の下や外側へ落ちた玉が
  床で止まって穴に入らなかった。右の斜面はレーン壁の手前で止める(レーンに
  食い込むと、井戸に引き下げた玉が斜面の上で止まって放てない)。
- 左右のスリングショット(三角)は壁に張り付け、下の頂点を斜面の上に載せる。
  壁との間に隙間があると、そこへ落ちた玉が斜面の上で詰まった。
- バンパーは玉の軌跡(`--trace`)を見て道筋の上に置く。強く放った玉は弧を回りきって
  左壁に着く(42,182)、中くらいは弧を離れて斜めに落ちる(100,240)、弱いと
  右上から中央へ落ちる(290,270)。
- 玉が止まったら(`createSettleDetector`)物音で狐が起きる。詰まりの押し(8s)、
  起こし(14s)、フェイルセーフ(20s)。押しはまだ跳ね回っている玉には触らない
  (長いラリーの途中で速度を書き換えると不自然)。止まった玉は静止検知が先に
  起こすので押しはほぼ保険。起こしの 14s は掃引の最遅到達(11.0s)に余裕を足したもの。
- ヘッドレス検証は `web/scripts/simulate-omikuji-pinball.js`。引き 11 段階 × シード
  (既定 6、`--seeds 30` で 330 点)を掃引し、狐への到達秒数・バンパー回数・
  無操作で装置が動かないことを確認する。狐に届かず静まった場合は、止まった場所が
  穴の中でなければ失敗にする(どこかの棚に載ったまま終わる演出を見逃さない)。
  GEO を触ったら必ず回す。

#### 賽銭落とし(saisen)の設計

- 賽銭は放すまで横木の高さに固定し、自重も打ち消す。つまんでいる間は x だけ動かせる
  (範囲は 70〜410。画面の縁に指が当たらないように)。放した瞬間に落とす。
- 床は右の壁ぎわから左の寝床へ下る 1 枚の斜面(台形)。どこから落としても狐に集まる。
- 風車は**一定速度で回し続ける**。自由回転にすると、45 度で止まった十字の上の V 字に
  賽銭が乗って釣り合い、止まった(126 点中 20 点以上)。
- 風車の回る範囲(腕+釘+賽銭1枚ぶん)には釘を置かない。重なると腕が釘をすり抜けて
  見え、腕と釘の間に賽銭が挟まる元にもなる。
- 壁ぎわの釘は、壁との隙間を賽銭(直径 24)が楽に通れる幅にする。25px では賽銭が
  壁と釘の間に挟まった。
- 釘の頂点で釣り合って止まる賽銭は、釘の位置の乱れ・放す瞬間の小さな横速度に加え、
  釘の林の中で 20step 止まったら横へ小突いて先へ進める(630 点中 2 点で必要だった)。
- ヘッドレス検証は `web/scripts/simulate-omikuji-saisen.js`。落とす位置(横木の端から
  端まで 21 点)× シード 6 を掃引し、狐への到達秒数と、儀式前に賽銭が動かないことを確認する。

#### だるま落とし(daruma)の設計

- 木槌は**頭だけを物体にし、支点から距離拘束で吊る**(腕は拘束の線として描く)。
  腕と頭を複合体(parts)にして支点に拘束すると、傾けた状態から放した瞬間に
  角速度が発散して木槌が高速で回り出した。頭の向きは毎ステップ振り子の角度に揃える。
- 木槌の強さは引きに依存させない。真下を右向きに通る瞬間に一定の角速度へ揃え(ポンプ)、
  右へ振り抜けたら止め具で跳ね返す(落ちてくる上の段をすくい上げないように)。
- **まだ打たれていない胴と頭は、積みの真上に留める**(縦にだけ落ちる)。自由にすると、
  打たれた段に引きずられて積みが横へずれ、木槌の届かない所へ行ったり、木槌の静止位置に
  食い込んで振り子を止めたりした。丸い頭は平らな胴の上で揺れて転がり落ちもした。
  木槌が右向きに最下段を打った時だけ、その胴を解き放つ。
- 放したら積みのスリープを解く。スリープのままだと、下の段が抜けても上の段が宙に浮いた
  まま落ちてこない。
- 胴は棚の上ではよく滑らせ(打たれた段だけが素早く抜ける)、棚から出たら摩擦を上げて
  右の壁ぎわで止める。胴を抜き終えたら木槌を左上へ引き上げ、棚に落ちた頭を左へ転がす。
  頭は棚の左端から落ちて、斜面を左端の狐まで転がる(胴は右にあるので道をふさがない)。
  狐を起こすのは頭だけ。
- ヘッドレス検証は `web/scripts/simulate-omikuji-daruma.js`。引きの角度 8 段階 × 儀式前の
  待ち時間 4 段階を掃引する。ポンプの強さを 0.075〜0.11 rad/step の範囲で変えても
  全点が狐に届くことを確認済み(既定 0.09)。
- 詰まったときの押し(nudge)は、胴を抜いている途中なら木槌を振り直す(頭は積みの上に
  留めているので、頭を押しても動かない)。

#### 隠しあみだくじ(amida)の設計

- 途中の横線は、**選んだ後、結果が届いてから組み立てる**(`omikujiAmida.js` の `buildLadder`)。
  選ぶ前に見えているのは縦線と下の端(レア度。毎回シャッフル)だけで、途中は霞に隠れて
  いるので、後から組み立てても嘘にならない。
- 組み立ては、ふつうのあみだの規則(同じ段で隣り合う横線は置かない)でランダムに組み、
  選んだ線が結果の端に着くものが出るまで引き直す(1回あたり約 1/7)。200 回で決まらなければ、
  最後の数段で狙いの端まで横へ運ぶ横線を足して必ず着かせる。
- 光は折れ線に沿って一定の速さで下り、霞は光の少し先まで晴れる(横線は霞の下に描く)。
- 検証は `web/scripts/test-omikuji-amida.js`。全ての選択×全ての端×シード 60 で、必ず狙いの
  端に着くこと、規則違反の横線が無いこと、引き直しを使い切った場合の後始末も確認する。

#### おみくじ筒(tube)の設計

- 筒をつまんで上下に振る。上下の向きが 22(論理座標。画面の px ではない)以上動いてから切り返した回数が 4 回で完了。
  「うまく振れないとき」のリンクで自動で振る。
- 完了したら筒をひっくり返し、口から番号の棒が出る。**番号(どの引き出しか)は結果が届いて
  から決める**。引き出しは閉じていて中は見えないので、後から決めても嘘にならない。
- 結果がひっくり返す途中に届いても、ひっくり返し終えてから棒を出す(途中で棒の
  アニメーションを始めると、ひっくり返す動きが止まって筒が傾いたままになった)。
- 振っている途中で儀式が済むので、その後の指離し(touchend / click)がスキップに
  食われないよう、離した時点から 0.6 秒はスキップを受け付けない。振り続けて 1.5 秒後に
  離すと、札が出る前に演出が終わってしまった。
- 位置と回転は外側の `<g>` の transform 属性、カラカラの揺れは内側の `<g>` の CSS
  アニメーションに分ける。同じ要素に付けると CSS の transform が属性を上書きして、揺れる
  たびに筒が定位置へ飛ぶ。
- 札の文字は1文字ずつ縦に積む。絶対配置の札に `writing-mode: vertical-rl` を使うと、札の
  高さが文字に合わず、文字が札の外にはみ出した。

#### 和風ピタゴラ(pitagora)の設計

- **物理エンジンを使わない。** 玉の位置も仕掛けの動き(絵馬の倒れ方、跳ね板、鹿威しの傾き)も
  時間の関数で振り付ける(`omikujiPitagora.js`)。毎回同じ動きになり、詰まらない。
- 前半は横長の 2D の装置(幅 1900)で、カメラが玉を追って横に動く。谷越えはスロー
  モーション: 跳ね板で速く飛び出し、谷の真ん中で急に 1/7 ほどの速さに落として、着地の
  手前でまた速くする(全体を少しずつ遅くするだけでは、比べる速い場面が無くスローに見え
  なかった)。スローの間はカメラが玉にアップになり、上下の黒帯・周りの暗がり・玉の残像を出す(文字は
  出さない)。
- 鹿威しは、樋の口を竹筒の上面の口の真上に置き、水が流れて筒に注がれる(筒の傾きに
  合わせて水の落ちる先が上下する)。
- 鳥居の中は、真ん中の柱に巻き付く1本の螺旋のレール(`helixPoint` / `helixRailPaths`)。
  レールは柱の奥と手前に分けて、奥のレール → 奥にいる玉 → 柱 → 手前のレールの順に重ね、
  玉が柱の裏へ回るのが見えるようにする(輪を何段か並べただけの絵では、玉が輪に乗らず
  螺旋に見えなかった)。
- 音の書き文字(「カコーン」「ドン」)は出さない。鹿威しが石を打つ所は石から広がる輪と
  破片と画面の小さな揺れ、太鼓は広がる衝撃の輪で見せる。
- 回転盤で最低1周し、結果が届いていれば、玉が手前の真ん中に来た所で出口のレールへ
  まっすぐ右に出て、カメラが玉に寄る。3D はこの寄りの画面と同じ構図(真横から見た、
  右へ転がる玉とレール)で始めて重ね、玉を中心に後ろへ回り込む。玉の大きさ・位置・速さ・
  地平線の高さを 2D の寄りの画面にそろえてあるので、場面が切れずにつながる
  (`EXIT_ZOOM` / `EXIT_SIDE_DIST` / `EXIT_PITCH`)。回り込む間はあみだの横線に
  着かないよう、最初の直線(`POV.lead`)を長めにしている。結果が
  遅れたら、届くまで回転盤で回って待つ(25 秒で着地させるのは他の種類と同じ)。
- 3D のあみだは、3D に切り替わる時点(結果が届いた後)で、入る線が結果の門に着くように組み立てる
  (`buildRoute`。中身は隠しあみだと同じ `buildLadder`)。隠しあみだより段を多く、横線を
  密にしている(15 段・確率 0.45。横線は平均 29 本ほど、曲がる回数は平均 8.5 回)。視点に入った時点で全体が見えて
  いるので、途中で形が変わることはない。門の並び(レア度)は毎回シャッフルし、入る線は
  ランダム。カメラは常に進行方向を向き、曲がるたびに回るので追いにくい(読もうと思えば読める)。
- 3D は自前の透視投影(`project` / `projectSegment`)で canvas に線を描く。レールは線だけ
  なので、3D のライブラリは使わない。
- 描画の重さ: 門の札は最初に1回だけ画像にして、毎フレームは拡大縮小して貼る(毎フレーム
  違う大きさで文字を描き直すと、文字の描画がキャッシュに乗らず重さの大半を占めた)。線は
  色と太さごとにまとめて描く。まとめ描きは描く順番が崩れるので、枕木をすべて描いてから
  レールを描く。CPU を3倍遅くした条件で、描画は 1 フレーム 50ms → 1ms 程度になった。
- 検証は `web/scripts/test-omikuji-pitagora.js`。全ての入る線×全ての門×シード 40 で必ず
  狙いの門に着くこと、道のりが縦と横だけで前に進むこと、2D の区間の境目で玉が飛ばないこと、
  投影がカメラの後ろを描かないことを確かめる。

#### 指でつまんで動かす装置の注意(MouseConstraint の衝撃)

儀式中に物体の位置を `Body.setPosition` で置き直す装置(賽銭・だるま)は、
**`constraintImpulse` も 0 に戻す**。ドラッグ中は MouseConstraint がウォームスタート用の
衝撃を物体に溜めていて、位置と速度を上書きしても消えない。放した次の更新で溜まった衝撃が
位置に足され、指の方向へ蹴り出される。だるまでは 50° を越えて引いて放すと木槌が一回転して
積みの上に乗り、止まった。賽銭では下へ引っ張って放すと、上の数段の釘をすり抜けて飛んだ。

位置を直接置く各装置の検証スクリプトではこの経路を通らないので、
`web/scripts/simulate-omikuji-drag.js` で、偽のマウスを本物の MouseConstraint に渡し、
OmikujiScene と同じ順序でつまむ→動かす→放すを掃引する(賽銭 135 点、だるま 66 通りのうち放して発火する 40 点)。

### デプロイ

- `omikujiGo` は HTTP 関数として dev/prod 両ワークフローでデプロイ(`sanpaiGo` と同型。
  GitHub認証情報は不要)。POST のため Hosting rewrite は付けず、フロントは関数を直叩きする。

## GitHubイベントの取得件数(#239)

参拝時の取得は `/users/{name}/events/public` で、**公開イベントのみ**。
以前は1ページ(100件)だけ取って終わりだったため、前回の参拝から公開イベントが
100件を超えると**超過分を永久に取りこぼしていた**。90日を過ぎたイベントは
GitHub からも返らなくなるので、後から拾い直せない。活発に動いた人ほど損をする。

`Link` は使わず、`page=` を上限まで辿る。

- **上限は3ページ(300件)**。Events API はそれ以上返さない(`githubFeedMaxPages`)
- **取得済みの範囲に入ったページで打ち切る**(`reachedSince`)。イベントは新しい順に
  返るので、`since`(前回の参拝時刻)以前のものが1件でも混ざればそれ以上遡る必要はない。
  **普段の参拝は1リクエストのまま**で、全ページ舐めるのは初回参拝や、久しぶりの
  参拝で100件を超えている人だけ
- 埋まっていないページが来たらそこで終わり(存在しないページを叩かない)
- **イベントIDで重複を除く**。ページの取得中に新しいイベントが増えると窓がずれ、
  同じイベントが2つのページに載ることがある。重複したまま進めると、同一バッチ内で
  同じドキュメントへ2回書くことになり Firestore に弾かれて**参拝そのものが失敗する**
  うえ、ポイントと能力値も二重計上になる。1ページだけ取っていた頃は GitHub が
  ページ内のID一意を保証していたので起きなかった
- **途中のページで失敗したら参拝ごと失敗させる**。取れた分だけで進めると
  `last_sanpai` が進んでしまい、取れなかったイベントを二度と拾えない
  (取りこぼしを止めるための変更なので本末転倒)。失敗しても `last_sanpai` は
  書き換えないのでやり直せる

注意点:

- **過去の取りこぼしは復元できない**。今後の取りこぼしが止まるだけ
- 二重計上は起きない。`github_activities` はイベントIDをドキュメントIDにしており、
  集計対象も `created_at > last_sanpai` で絞っている
- ポイントは `len(splited)/5` のままなので、1回の参拝での上限が +20 から +60 になる
  (取りこぼしを止めるのが目的で、分母は据え置き)
- 書き込みは `firestoreBatchMaxWrites`(500)ごとに分割する。100件しか取っていなかった
  頃は上限に当たりようがなかったが、300件まで遡るようになって余裕が減ったため

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

## ミニゲーム(`/games`)

おみくじとは関係のない、単独のミニゲーム。一覧は `web/pages/games/index.vue`、各ゲームは
`web/pages/games/<id>.vue`(ゲームを増やしたら一覧の `games` に足す)。

### 韋駝天(いだてん。`/games/ostrich`)

名前は足の速い神様「韋駄天」の「駄」を駝鳥の「駝」にしたもの。

ログインしなくても遊べ、サーバーとは通信しない。

- ベースは Chrome の通信できない時の恐竜ゲーム。ダチョウが走り続け、地面でタップ(スペース
  キー / ↑)するとジャンプ、空中でタップすると羽ばたく(Flappy Bird)。
- 障害物:
  - サボテン(跳ぶ)、カラス(低い = 跳ぶ / 高い = 走り抜ける)
  - 鳥居: 上のすき間(大きな勾玉。点は3倍)を羽ばたいてくぐるか、下のすき間を走り抜ける
  - 堀: 地面が長く途切れる。ジャンプの滞空より長いので、羽ばたき続けないと越えられない
- 勾玉: ときどき浮かんでいて、取ると点。白 5 / 青 10 / 緑 20 / 赤 50 / 紫 100。黄色(10 点)は
  7 秒間の無敵で、当たった障害物を壊し(+15)、カラスは当たる前に逃げる。堀には無敵でも落ちる。
- 難しさは走った時間で上がり続ける(150 秒で level が最大)。速さが上がり、重力が強くなって
  ジャンプが短く鋭くなり、障害物の間隔が最大 40% 詰まり、サボテンが高くなり、鳥居の上の
  すき間が狭くなる。当たり判定は難しさで変えない(同じ当たり方で結果が変わるのはおかしい)。速くなるだけだと 1 回のジャンプで進む距離が
  伸びて単発の障害はかえって楽になる(検証で確かめた)ので、重力と間隔も変える。
- もう1回遊びたくなる工夫: タップですぐ再開、コース上にベストの位置の旗、走っている最中の
  「ベスト更新！」、スコアの称号(ひよこ〜ダチョウ神)と「次の称号まであと◯」。
- ハイスコアは DB に記録せず、端末の localStorage(`debug-shrine:ostrich:best`)にだけ保存する。
  終わると、スコア・称号・ベスト・勾玉の数・日付・サイト名の札をゲーム画面の下に出す。「画像を
  保存」はゲーム画面と札を1枚の PNG にまとめる(共有できる端末ではシェアシート)。
- タブを離れると一時停止し、タップで再開する。走っている間は「はじめる」ボタンを出さない。
- ルールは `web/components/ostrichGame.js`(純関数、固定刻み 1/120 秒、乱数を注入できる。
  描画に伝える出来事は `g.events` に積む)、描画と操作は `web/components/OstrichRun.vue`、
  ページは `web/pages/games/ostrich.vue`。トップページ(ログイン後)に「ミニゲームで遊ぶ」。
- 検証は `web/scripts/test-ostrich-game.js`:
  - 先読みの自動操縦(0.6 秒先まで「押す / 押さない」を試す)で 200 秒(難しさ最大の後まで)
    走り切れる = よけようのない配置が出ない。鳥居は上だけを通る版、反応を 60ms 遅らせた版でも
    確かめる。堀の上(水の上)に次の障害物が置かれない
  - 当たり判定は難しさで変わらない
  - 鳥居の下のすき間は、難しさ最大でも走ったまま抜けられる
  - 一番詰まった間隔の高いサボテン 2 つの、2 つ目を跳べるタイミングの幅が、序盤の約 330ms
    から 150 秒以降は約 170ms まで狭くなる(= 少しのミスで終わる)
  - 堀は跳ぶだけでは落ちる。黄色の勾玉で無敵になり、障害物を壊して進める。無敵でも堀には落ちる
- 将来はポイントを消費して遊べるようにする予定(今は無料・回数無制限のお試し)。

### 神楽ビート(リズムゲーム、`/games/rhythm`)

和のテイストの曲(4 曲から選ぶ)に合わせて、鈴・太鼓・柏手の 3 レーンを叩く。ログイン不要、サーバーとは
通信しない。ハイスコアは曲ごと・難易度ごとに端末の localStorage(`debug-shrine:rhythm:best-by-song`、
`{ 曲の id: { 難易度: 点数 } }`)にだけ保存する。1 曲だけだった頃の記録(`debug-shrine:rhythm:best`)は
「御神楽」に引き継ぐ。最後に選んだ曲も覚えておく(`debug-shrine:rhythm:song`)。

- 譜面は `web/components/rhythmChart.js` が曲の音の並びから作る(曲で実際に鳴っている音の時刻に
  置くので、叩くと曲と合う)。鈴 = メロディ(ボーカル・尺八・篠笛・篳篥)・掛け声、メロディの無い
  所は三味線・ギターのリフ・琴、太鼓 = キック・和太鼓、柏手 = スネア・クラップ・締太鼓。
  下の個数は「御神楽」のもの(曲の速さで変わる)。
  - 参拝(やさしい): 2 拍ごとの頭くらい(平均 2.5 個/秒)。同じレーンは 4 ステップ以上あける
  - 祈願(ふつう): 拍の頭のメロディ、小節の頭・真ん中の太鼓、2・4 拍目の柏手(平均 4.4 個/秒)。
    特に長いボーカルだけ長押し。同じレーンは 3 ステップ以上あける
  - 修行(むずかしい): ボーカルのメロディをなぞる(平均 6.8 個/秒)。長いボーカルは長押し
  - どちらも同時押しは 2 本まで。長押しの間、そのレーンに次の音符は置かない
- 判定は ±45ms = 極、±90ms = 良、±135ms = 可、それより外 / 叩かずに過ぎた = 不可。長押しは終わりの
  0.12 秒前まで押し続けたら成功。点数は満点 1,000,000(極 1・良 0.7・可 0.3)、正確さで大吉〜凶。
- 時刻は音の出力に合わせる(`getOutputTimestamp` で、耳に届いている曲の時刻を出す。入力はイベントの
  `timeStamp` を同じ時計に直して判定する)。タブを離れると音ごと一時停止し、タップで再開。
- スマホでダブルタップしても拡大しない(ゲーム画面は touch-action: none とタッチの既定動作を止める。
  ページにいる間は html に touch-action: manipulation、古い iOS 向けに素早い 2 回目のタップも打ち消す)。
  ピンチでの拡大は残す。
- 見た目: 奥へすぼまる 3 本のレーン、1 小節ごとに奥から迫る鳥居(サビで光る)、キックに合わせて
  脈打つ背景、叩くと火花と判定の文字、10 コンボごとの極で桜吹雪、20 コンボから画面の縁が金色に。
- 結果の札(評価・点数・判定の数・最大コンボ・ベスト・日付・サイト名)。「画像を保存」で正方形の
  画像にできる。描画と操作は `web/components/RhythmGame.vue`。
- 検証: `web/scripts/test-rhythm-chart.js`(すべての曲で: 音符が曲の音の時刻にある、レーンの間隔と長押し、同時押し
  2 本まで、修行が参拝より多い、密度、判定と点数)。

#### 曲と音

- 曲の一覧は `web/components/rhythmSongs.js`(id はハイスコアの保存に使うので変えない)。どの曲も
  音の並びの純関数で、区間の並びと 1 小節ずつ音を置く関数で書く(道具は `rhythmSongKit.js`)。
  - 「疾風迅雷」(`rhythmSongShippu.js`): 190 BPM・E マイナーの疾走和ロック。尺八がメロディ、
    歪んだギターのリフ(E と F がぶつかる和の響き)、津軽三味線のソロ、全音上げのラスサビ(約 71 秒)
  - 「祭ノ宵」(`rhythmSongMatsuri.js`): 140 BPM・G メジャーの祭り EDM。メロディは陽音階
    (G A B D E)、篠笛・締太鼓・当たり鉦のお囃子に四つ打ち、「ア・ヨイ!」「ソーレ!」
    「ワッショイ!」の掛け声(約 81 秒)
  - 「天ノ調」(`rhythmSongTen.js`): 128 BPM・E マイナーの雅楽トランス。笙の音の束、篳篥の
    メロディ、琴の 16 分のアルペジオ、ブレイクから盛り上げてドロップ(約 85 秒)
- 「御神楽」は `web/components/rhythmSong.js`。172 BPM・D マイナーの、和のテイストの
  ボカロ系。イントロ(三味線 → 和太鼓)→ A メロ → B メロ → サビ ×2 → 和のブレイク → 半音上げの
  ラスサビ → 締め(約 78 秒)。サビは王道進行(B♭ C Am Dm)、三味線は都節(D E♭ G A B♭)。
- 音は `web/components/rhythmAudio.js` が Web Audio でその場で合成する(音声ファイルは使わない)。
  - 歌の代わりのボーカルチョップ: のこぎり波を母音のフォルマント(3 つの帯域フィルタ)に通す。
    音の頭で下からずり上げ(しゃくり)、長い音には遅れてビブラート
  - 三味線・琴は弦の物理モデル(Karplus-Strong)を先に計算して使い回す。三味線の「さわり」は
    出力にだけ足す(繰り返しの計算に入れるとエネルギーが増え続けて音が割れた)
  - 尺八・篠笛・篳篥は、正弦波やのこぎり波に息の音と音の頭のずり上げ(篳篥は大きく = 塩梅)を足す。
    笙はリードの倍音を持つ波形を束ねる。歪んだギターは、音をまとめて 1 つの歪み(tanh)に通す。
    掛け声は 3 声のフォルマントで、子音(s・sh・y・w など)は雑音やフォルマントの動きで作る
  - トランスの刻み(16 分の開け閉め)は、和音を 1 本鳴らして音量だけ開け閉めする(軽い)
  - 曲は 0.15 秒先まで予約しながら鳴らす。叩いた時の効果音は鈴・太鼓・柏手 × 極・良・可・不可。
    効果音は曲のコンプレッサを通さずに出す(通すと、曲が大きい所で押し下げられて聞こえにくかった)。
    出口に音割れ防止のリミッター
- スマホで重くならないよう、1 音あたりの発振器を抑えている(シンセは 3 本、ボーカルは 1 本)。
  書き出して測ると、どの曲も一番重いところで処理は実時間の約 1/4〜1/3、音割れなし。
- 検証は `web/scripts/test-rhythm-song.js`(曲の長さ、音域、歌の拍頭がコードと濁らないこと、
  三味線が都節の音だけ、ラスサビの半音上げ)と `web/scripts/test-rhythm-songs.js`(すべての曲の
  長さ・時刻順・楽器が鳴らせること、メロディの小節の頭がコードと濁らないこと、祭ノ宵が陽音階、
  疾風迅雷の全音上げ)。

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

## 進捗バーと NEXT exp

マイページの exp バーが、レベルが上がるほど常に満タンに見える不具合があった。
原因は2つで、どちらも `targetPoints` の意味の取り違え。

`GetLevel` は「戦闘力 <= 閾値」で判定するため、**Lv L の範囲は
(targetPoints[L-2], targetPoints[L-1]]**。つまり `targetPoints[L-1]` を1でも
超えれば Lv L+1 になる。

- **NEXT exp が1レベルぶん先だった**。`GetNextLevelExp` が `targetPoints[level]`
  (= Lv L+1 の**上限**)を返しており、そこに届く前にレベルが上がっていた。
  例: 5exp は Lv2 だが 6exp で Lv3 になるのに「NEXT 11 exp」と表示。
  正しくは `targetPoints[level-1] + 1`(到達したら実際に上がる値)。
  `TestGetNextLevelExp_ReachingItLevelsUp` が、NEXT に到達したらレベルが上がり、
  その1手前では上がらないことを全域で担保する。
- **バーが 累計 / 次レベル だった**。レベルが上がるほど分子と分母が近づくため、
  レベル帯の先頭にいてもほぼ満タンに見える(Lv54 の下限 50759 でも
  50759/55293 = 92%)。正しくは**今のレベルの中での進み具合**
  `(total - 下限) / (次レベル - 下限)`。下限は `GetLevelStartExp` が返し、
  API は `level_start_exp` として渡す。

報告例(Lv54 / 戦闘力 51217)では 85% → 10.1% になる。

### バーが「常に」満タンだった本当の理由(Vue 2 のリアクティビティ)

上の2つを直してもバーは満タンのままだった。マイページは `profile: {}` に
**1つずつ後からプロパティを代入**していたが、Vue 2 は空オブジェクトへの
プロパティ追加を検知できない。そして進捗バーは `v-if="!isLoading"` の外に
あるため**データ到着前に必ず一度描画され**、そのとき `next` が `undefined` で
`progressPercent` が 100 を返す。以降 `profile` は同じオブジェクトのまま
変更通知が飛ばないので、**この 100% がキャッシュされたまま二度と再計算されない**。

つまり計算式をどう直しても実行されていなかった。`profile` を丸ごと差し替える
(1回の代入にする)ことで初めてバーが動く。読み込み中は 0% を返すようにして、
データが来るまで満タンを見せないようにしている。

いずれも `total` の純関数なので、`fromFirestoreStatus` がキャッシュではなく
`total` から引き直す。status キャッシュの作り直しは不要。

Node版(`app/functions/performance.js`)にも同じずれがあるため併せて直したが、
Node版は Go へ全面移植済みで**一切デプロイされていない**(`index.js` は関数を
何も export しない)。Lv50超えの扱い(#215)のように Go だけに入っている修正が
既にあるため、**食い違ったときは Go を正とする**。Node版のテストはテーブル内
(Lv1-50)の範囲だけを検証する。

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
