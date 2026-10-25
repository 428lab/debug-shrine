// 入賞称号の2位・3位を、過去の締めにさかのぼって付ける(crownBackfill)。
//
// 入賞称号は最初1位だけだった。2位・3位の称号を足したので、すでに締めた
// 期間(ranking_archive)の2位・3位にも付ける。デプロイの直後に一度だけ動かす。
//
//   - 回数は加算ではなく、全アーカイブから数え直した値で上書きする
//     (Pub/Sub の再配送などで重ねて動いても増えない)
//   - 1位の称号には触らない(締めのたびに付けてきた正しい値がある)
//
// 新しい締めは closePeriod が2位・3位にも加算するので、この処理の後に締めが
// 走っても、前に走っていても(数え直しにその期間のアーカイブも入る)結果は合う。
// ただし締めの最中(週明け・月初の JST 0:00 の集計)と重ねて動かすと、その回の
// 1つがずれることがあるので、その時間は避ける。
//
// アーカイブの全員分の順位(battle_ranks / points_ranks)は screen_name で
// 持っているので、users の screen_name から引き当てる。同じ screen_name が
// 複数いる人は付けずにログに残す。screen_name は再ログインで GitHub の今の
// 名前に変わるので、締めた後に名前を変えた人は、変える前の期間のぶんが付かない
// (前の名前を今は別の人が使っていれば、その人に付く)。名前を変えた人が締めで
// 加算された後にもう一度動かすと、前の名前のぶんが数え直しで消えるので、
// 動かすのはデプロイ直後の一度だけにする。
package gofunctions

import (
	"context"
	"log"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	cloudevents "github.com/cloudevents/sdk-go/v2"
	"google.golang.org/api/iterator"
)

func init() {
	functions.CloudEvent("CrownBackfillGo", crownBackfillHandler)
}

func crownBackfillHandler(ctx context.Context, _ cloudevents.Event) error {
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("crownBackfill: getFirestoreClient error: %v", err)
		return err
	}
	return runCrownBackfill(ctx, client)
}

// crownTally は1人・1称号ぶんの数え直しの結果。
type crownTally struct {
	Count        int64
	LatestPeriod string
}

// podiumCrownTallies は全アーカイブから、2位・3位の称号の回数を screen_name ごとに
// 数える(純関数)。順位はアーカイブに保存した順位(同点は同じ順位)をそのまま使う。
// 値が0以下の人は入賞にしない(締めと同じ)。
func podiumCrownTallies(archives []rankingArchiveDoc) map[string]map[string]crownTally {
	out := map[string]map[string]crownTally{}
	add := func(screenName, crownID, periodKey string) {
		if screenName == "" || crownID == "" {
			return
		}
		m := out[screenName]
		if m == nil {
			m = map[string]crownTally{}
			out[screenName] = m
		}
		t := m[crownID]
		t.Count++
		// 期間キーは日付・年月なので、文字列の大小で新しい方が分かる
		if periodKey > t.LatestPeriod {
			t.LatestPeriod = periodKey
		}
		m[crownID] = t
	}
	for _, a := range archives {
		for _, metric := range []struct {
			name  string
			ranks []periodRankEntry
		}{{"battle", a.BattleRanks}, {"points", a.PointsRanks}} {
			for _, r := range metric.ranks {
				if r.Value <= 0 || r.Rank < 2 || r.Rank > crownPlaces {
					continue
				}
				add(r.ScreenName, crownIDFor(a.PeriodType, metric.name, int(r.Rank)), a.PeriodKey)
			}
		}
	}
	return out
}

func runCrownBackfill(ctx context.Context, client *firestore.Client) error {
	var archives []rankingArchiveDoc
	iter := client.Collection("ranking_archive").Documents(ctx)
	defer iter.Stop()
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return err
		}
		var a rankingArchiveDoc
		if err := doc.DataTo(&a); err != nil {
			log.Printf("crownBackfill: skip archive %s: %v", doc.Ref.ID, err)
			continue
		}
		archives = append(archives, a)
	}
	tallies := podiumCrownTallies(archives)

	profiles, err := loadRankingProfiles(ctx, client)
	if err != nil {
		return err
	}
	ids := map[string][]string{}
	for id, p := range profiles {
		if p.ScreenName != "" {
			ids[p.ScreenName] = append(ids[p.ScreenName], id)
		}
	}

	granted, skipped := 0, 0
	for screenName, crowns := range tallies {
		found := ids[screenName]
		if len(found) != 1 {
			log.Printf("crownBackfill: skip %s (users with this screen_name: %d)", screenName, len(found))
			skipped++
			continue
		}
		set := map[string]interface{}{}
		for crownID, t := range crowns {
			set[crownID] = map[string]interface{}{
				"count":         t.Count,
				"latest_period": t.LatestPeriod,
			}
		}
		if _, err := client.Collection("users").Doc(found[0]).Set(ctx, map[string]interface{}{
			"crowns": set,
		}, firestore.MergeAll); err != nil {
			log.Printf("crownBackfill: set crowns for %s failed: %v", screenName, err)
			skipped++
			continue
		}
		granted++
	}
	log.Printf("crownBackfill: 完了 archives=%d users=%d skipped=%d", len(archives), granted, skipped)
	return nil
}
