# functions-go

レイテンシー(特にコールドスタート)がクリティカルなエンドポイントを Go で実装し、
[Cloud Run functions](https://cloud.google.com/functions) として個別にデプロイするための
モジュール。

## なぜGoか

`app/functions`(Node.js/`firebase-functions`)はマイページ表示の解析キャッシュ導入で
ウォーム時のレイテンシーは大幅に改善したが、コールドスタート自体はランタイム由来の
オーバーヘッドが残る。Go は Node.js よりコールドスタートが大幅に短く(目安: Go 100〜300ms
vs Node.js 300〜800ms)、同時実行数が増えてもコンテナ起動回数(≒課金対象のインスタンス数)を
抑えやすいため、まずマイページ/プロフィール表示で使われる `status` エンドポイントから
Go へ移植している。

## なぜ Firebase Functions ではなく Cloud Run functions として直接デプロイするか

`firebase-functions` SDK自体はGoをサポートしていない(Node.js/Python/実験的Dartのみ)。
一方、Firebase Functionsの実体はCloud Run functions(旧Cloud Functions 2nd gen)であるため、
同一GCPプロジェクトに `gcloud functions deploy --gen2 --runtime=go125` で直接デプロイすれば
Firebaseプロジェクトと共存できる。

## ディレクトリ構成

Cloud Run functions(Go)の制約上、関数のエントリポイント(`functions.HTTP(...)`を呼ぶ
コード)はモジュールルートのパッケージに置く必要がある(サブディレクトリ配置不可)。
共有ロジックはサブパッケージとして `internal/` 配下に置く。

```
functions-go/
  go.mod
  status.go              # statusGo エンドポイント(モジュールルートパッケージ)
  sanpai.go              # sanpaiGo エンドポイント(モジュールルートパッケージ)
  sanpai_test.go         # sanpaiGoのFirestoreエミュレータ統合テスト
  cmd/
    main.go               # ローカル動作確認専用(デプロイでは使わない)
  internal/
    performance/
      performance.go      # app/functions/performance.js の対象範囲のGoポート
      performance_test.go # performance.test.js と同一の入出力を検証
```

## 関数の命名規則(既存Node関数との共存)

Go版は既存のNode版と**別の関数名**でデプロイする(例: `status`(Node) → `statusGo`(Go))。
同名で運用すると、`firebase deploy`(Node側のソースに存在しない関数として誤って
削除しようとする)と `gcloud functions deploy`(Go側)が同じ関数を取り合う事故が
起こり得るため、意図的に名前を分けて完全に独立させている。

移行が完了し十分な期間安定稼働を確認できた関数については、フロントエンドの
呼び出し先をGo版に切り替えたうえで、Node側の対応するexportを削除する
(削除の判断はその都度提案し、承認を得てから行う)。

## ローカルでの動作確認

```bash
cd app/functions-go
go build ./...
go vet ./...
go test ./...

# sanpaiGoのFirestore統合テストも含めて実行する場合
# (firebase emulators:start --only firestore を別途起動しておく)
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 go test ./... -v

# Firestoreエミュレータ(別途起動)に対してローカルでHTTPサーバーを起動する場合
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
GOOGLE_CLOUD_PROJECT=d-shrine-dev \
FUNCTION_TARGET=StatusGo \
PORT=8090 \
go run ./cmd
```

`sanpai_test.go` は `FIRESTORE_EMULATOR_HOST` が未設定の場合は自動的にスキップする
ため、通常のCI(`go test ./...`)には影響しない。GitHub Events APIはテスト用の
`httptest` モックサーバーに差し替えており(`githubAPIBaseURL` 変数)、実際の
GitHub APIやFirebase Authへの通信は発生しない。

## デプロイ

CI(`.github/workflows/dev-deploy.yml`)から以下相当のコマンドで自動デプロイされる。

```bash
gcloud functions deploy statusGo \
  --project=d-shrine-dev \
  --gen2 \
  --runtime=go125 \
  --region=us-central1 \
  --source=. \
  --entry-point=StatusGo \
  --trigger-http \
  --allow-unauthenticated \
  --memory=256Mi \
  --timeout=30s
```

`--source=.`(functions-goディレクトリ全体)を指定し、`--entry-point` でどの
`functions.HTTP(...)` 登録を使うかを選ぶ。

`sanpaiGo` は書き込み系(Firebase認証・GitHub API呼び出し・Firestore更新)のため、
デプロイ時に以下の環境変数を追加で渡している(`--set-env-vars`)。

- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`: GitHub Events API呼び出し用の
  OAuth App資格情報。Node版が `functions.config().github` から読む値と同じもので、
  CIが `firebase functions:config:get github` から取得しCloud Functionsの環境変数
  として橋渡ししている(新規のGitHub Secretsは追加していない)。
- `SANPAI_NEXT_TIME_SECONDS`: 参拝のクールダウン秒数。Node版は
  `projectID == 'd-shrine' ? 300 : 60` とプロジェクトIDで分岐しているが、Go版は
  デプロイ時に明示的な値を渡す(dev: `60`。prod移植時は `300` を指定する)。

将来 `ranking`/`register` を移植する場合も、モジュールルートに新しいファイル
(例: `ranking.go`)を追加し、別の `--entry-point`/関数名でデプロイを追加する想定。

## Node版との等価性の確認方法

新しく移植する際は、Firestoreエミュレータに同一のテストデータを投入し、
Node版のハンドラをスクリプトから直接呼び出した出力と、Go版をローカル起動して
叩いた出力を比較し、フィールド単位で一致することを確認する
(`status`移植時の実施例は本PRのコミットログ・レビュー履歴を参照)。
