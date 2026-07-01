# internal/performance

参拝の能力解析(パフォーマンス計算)に関する純粋ロジックのGoポート。

`app/functions/performance.js` (Node版)のうち、`status`/`sanpai` エンドポイント
(Go版)が必要とする範囲を移植している:

- `GetLevel` / `GetNextLevelExp` (Node版 `get_level` / `get_next_leve_exp`)
- `UserPerformance` (Node版 `user_performance`)
- `UserFormattedPerformance` (Node版 `user_formatted_performance`)
- `RawUserDataFromStatus` (Node版 `raw_user_data_from_status`)
- `ComputePerformanceIncrement` (Node版 `compute_performance_increment`、増分計算)
- `LatestActivityCreatedAt` (Node版 `latest_activity_created_at`)

## Node版との既知の意図的な単純化

- `UserFormattedPerformance` の `User` は常に `UserInfo` 構造体を要求する
  (Node版は `append_data.user` 未指定時に `user_data.user`(文字列)へ
  フォールバックするが、現在の全呼び出し箇所(`status`/`sanpai`/
  `statusCacheBackfill`)で `append_data.user` は必ず設定されているため、
  この単純化は挙動を変えない)。

## Node版と同一に保つべき点(変更する場合は両実装を同時に更新すること)

- `targetPoints` の値
- イベント種別ごとの加点テーブル(`UserPerformance` の switch)
- `IssuesEvent` の加点は `payload.action`("opened"→intelligence+3 /
  "closed"→defence+5)で判定する。GitHub Events API の payload はオブジェクトで
  action フィールドに開閉種別が入るため(公式ドキュメント/実データで確認済み)。
  ※移植前のNode版は `payload`(オブジェクト)を文字列 "opened"/"closed" と
  直接比較しており、GitHub実データのオブジェクトpayloadとは決して一致しない
  ため Issue のオープン/クローズが一切加点されないバグがあった。移植に合わせて
  両実装で修正済み。
- agility/hp の時間差バケット境界値

## テスト

`performance_test.go` は `app/functions/test/performance.test.js` のうち
上記の移植範囲に対応するケースを同一の入出力で移植したもの。Node版のテストを
変更する場合は、対応するGo側のテストも同時に更新すること。

増分計算(`ComputePerformanceIncrement`)については、ランダム生成したアクティビティ
列に対して「全件を一度に `UserPerformance` で計算した結果」と「バッチに分けて
`ComputePerformanceIncrement` を繰り返し適用した結果」が完全一致することを
プロパティテスト(`TestIncrementEqualsFullCalculation_TwoBatches`:2000ケース、
`TestIncrementEqualsFullCalculation_ThreeBatchesSequential`:1000ケース)で
検証している。これは `performance.test.js` の同名テストと同一のロジック。
