# internal/performance

参拝の能力解析(パフォーマンス計算)に関する純粋ロジックのGoポート。

`app/functions/performance.js` (Node版)のうち、現時点で `status` エンドポイント
(Go版)が必要とする範囲のみを移植している:

- `GetLevel` / `GetNextLevelExp` (Node版 `get_level` / `get_next_leve_exp`)
- `UserPerformance` (Node版 `user_performance`)
- `UserFormattedPerformance` (Node版 `user_formatted_performance`)

`raw_user_data_from_status` / `compute_performance_increment`(増分計算)は
`sanpai`/`statusCacheBackfill` 専用のため、これらをGoへ移植する際に追加する。

## Node版との既知の意図的な単純化

- `UserFormattedPerformance` の `User` は常に `UserInfo` 構造体を要求する
  (Node版は `append_data.user` 未指定時に `user_data.user`(文字列)へ
  フォールバックするが、現在の全呼び出し箇所(`status`/`sanpai`/
  `statusCacheBackfill`)で `append_data.user` は必ず設定されているため、
  この単純化は挙動を変えない)。

## Node版と同一に保つべき点(変更する場合は両実装を同時に更新すること)

- `targetPoints` の値
- イベント種別ごとの加点テーブル(`UserPerformance` の switch)
- `IssuesEvent` の payload 判定は文字列との厳密等価のみ(GitHub実データの
  オブジェクトpayloadとは一致しない、既存Node版の挙動をそのまま踏襲)
- agility/hp の時間差バケット境界値

## テスト

`performance_test.go` は `app/functions/test/performance.test.js` のうち
上記の移植範囲に対応するケースを同一の入出力で移植したもの。Node版のテストを
変更する場合は、対応するGo側のテストも同時に更新すること。
