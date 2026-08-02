// せんとうりょく獲得ログ(users/{github_id}/battle_logs)。
//
// 週間・月間のせんとうりょくランキングの土台。参拝1回で伸びた分をイベントとして
// 積み、期間ランキングはその合計で作る。
//
// もともとは cache_data/battle_baseline(期間開始時点の status.total のスナップ
// ショット)との差分で出していたが、status.total はスコアであると同時にマイページ
// 表示用のキャッシュでもあり、参拝と無関係に書き直される経路がある:
//
//   - statusGo — キャッシュが無い/status_version が古いユーザーのプロフィールが
//     開かれると再計算して書き戻す
//   - statusCacheBackfillGo — 30分毎に同じ条件で再計算する
//
// そのためキャッシュの再計算がそのまま「期間中に伸びた分」として計上され、何年も
// 参拝していないユーザーが週間ランキングに現れていた。ぽいんと(sanpai_logs)が
// この問題と無縁なのは、可変なキャッシュの差ではなくイベントを合計しているため。
// せんとうりょくも同じ構造にする(詳細は docs/backend.md)。
package gofunctions

import (
	"context"

	"cloud.google.com/go/firestore"

	"github.com/428lab/debug-shrine/functions-go/internal/performance"
)

// battleLogsCollection は獲得ログのサブコレクション名。
const battleLogsCollection = "battle_logs"

// battleLogEntry は battle_logs の1件。sanpai_logs と同じ形にしてある
// (期間集計のコードを同じ形で書けるようにするため)。
type battleLogEntry struct {
	AddPoint  int64 `firestore:"add_point"`
	Timestamp any   `firestore:"timestamp"`
}

// battleTotal はせんとうりょくの合計(純関数)。
// UserFormattedPerformance の total と同じ式。Dex は合計に含めない。
func battleTotal(d performance.RawUserData) int {
	return d.HP + d.Power + d.Intelligence + d.Defence + d.Agility
}

// appendBattleLog はこの参拝で伸びた分を記録する。0以下なら何もしない
// (伸びていない参拝はランキングに関係しないので、書き込みを節約する)。
func appendBattleLog(ctx context.Context, userRef *firestore.DocumentRef, gain int) error {
	if gain <= 0 {
		return nil
	}
	_, _, err := userRef.Collection(battleLogsCollection).Add(ctx, map[string]interface{}{
		"add_point": gain,
		"timestamp": firestore.ServerTimestamp,
	})
	return err
}
