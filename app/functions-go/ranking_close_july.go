// 2026年7月の月間ランキングを後から作る(rankingCloseJuly)。
//
// 締め機能(#222)を入れる前に 8/1 の月替わりを過ぎてしまったため、2026-07 の
// アーカイブが存在しない。ログ方式では期間の値を後から集計し直せるので、
// 遡って作る。一度きりの処理。
//
// 復元の精度は指標で違う:
//
//   - ぽいんと: sanpai_logs が2021年から残っているので正確
//   - せんとうりょく: github_activities から復元するが、そこに入っているのは
//     参拝時に取得できたイベントだけ。7月中(または90日以内)に参拝していない
//     ユーザーの7月の活動は保存されていないことがあり、取りこぼしが出る
//
// 二重計上を避けるため、獲得ログの作成は 7/1 〜 7/27 に限る。7/27 以降は
// 移行時のバックフィル(#228)で既に作られているため。
package gofunctions

import (
	"context"
	"log"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	cloudevents "github.com/cloudevents/sdk-go/v2"
)

func init() {
	functions.CloudEvent("RankingCloseJulyGo", rankingCloseJulyHandler)
}

// julyBackfillKey は7月分として作ったログの印。既にあるユーザーは飛ばす。
const julyBackfillKey = "month_2026-07"

func rankingCloseJulyHandler(ctx context.Context, _ cloudevents.Event) error {
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("rankingCloseJuly: getFirestoreClient error: %v", err)
		return err
	}
	return runRankingCloseJuly(ctx, client)
}

func runRankingCloseJuly(ctx context.Context, client *firestore.Client) error {
	monthStart := time.Date(2026, 7, 1, 0, 0, 0, 0, jst)
	monthEnd := time.Date(2026, 8, 1, 0, 0, 0, 0, jst)
	// 移行時のバックフィルが作ったログの開始。ここより後は積み直さない。
	existingLogsFrom := time.Date(2026, 7, 27, 0, 0, 0, 0, jst)

	done, err := runBattleLogBackfillRange(ctx, client, monthStart, existingLogsFrom, julyBackfillKey)
	if err != nil {
		return err
	}
	// 全ユーザーを見終える前に締めると、まだ積んでいないぶんが欠けた
	// アーカイブで確定してしまう。続きは再キックで進む。
	if !done {
		log.Printf("rankingCloseJuly: ログの復元が途中のため締めは見送り(もう一度キックしてください)")
		return nil
	}
	return closePeriodIfMissing(ctx, client, "month", monthStart, monthEnd)
}
