// 期間ランキングの締め(アーカイブ)と、1位への称号付与。
//
// 週明け・月初(JST 0:00)に期間が変わったとき、閉じた期間の最終結果を
// ranking_archive に保存して二度と変えない。定期実行の最後の値を流用せず、
// 締めの瞬間に計算し直す:
//
//   - せんとうりょく: 基準値を作り直す前に「旧基準値 → 現在値」の差分を取る
//     (作り直した後では復元できないため、ロールオーバー処理の中で確定させる)
//   - ぽいんと: 閉じた期間の範囲 [期間開始, 次の期間開始) で sanpai_logs を
//     集計し直す。週/月ごとに1回だけのクエリなので安い
//
// あわせて各ランキングの1位(同点なら全員)に称号を付ける。称号は過去の
// イベントで事実から再判定できないため、users/{id}.crowns に回数を貯める。
package gofunctions

import (
	"context"
	"log"
	"time"

	"cloud.google.com/go/firestore"
)

// archiveTopLimit はアーカイブに表示情報つきで残す件数。
// 全ユーザー分の順位は別に軽量な形(periodRankEntry)で持つ。
const archiveTopLimit = 10

// crownDef はランキング1位で得られる称号の定義。
type crownDef struct {
	ID         string
	Label      string
	Icon       string
	Desc       string
	PeriodType string // week / month
	Metric     string // battle / points
}

// crownDefs は入賞称号(1位のみ)。表示順もこの順。
var crownDefs = []crownDef{
	{"week_battle_first", "週間せんとうりょく王", "fa-trophy", "週間せんとうりょくランキング1位", "week", "battle"},
	{"week_points_first", "週間ぽいんと王", "fa-trophy", "週間ぽいんとランキング1位", "week", "points"},
	{"month_battle_first", "月間せんとうりょく王", "fa-award", "月間せんとうりょくランキング1位", "month", "battle"},
	{"month_points_first", "月間ぽいんと王", "fa-award", "月間ぽいんとランキング1位", "month", "points"},
}

func crownIDFor(periodType, metric string) string {
	for _, d := range crownDefs {
		if d.PeriodType == periodType && d.Metric == metric {
			return d.ID
		}
	}
	return ""
}

// rankingArchiveDoc は ranking_archive/{week|month}_{期間キー} の形状。
type rankingArchiveDoc struct {
	PeriodType string    `firestore:"period_type" json:"period_type"`
	PeriodKey  string    `firestore:"period_key" json:"period_key"`
	StartsAt   time.Time `firestore:"starts_at" json:"-"`
	EndsAt     time.Time `firestore:"ends_at" json:"-"`
	ClosedAt   time.Time `firestore:"closed_at" json:"-"`

	BattleTop   []periodEntry     `firestore:"battle_top" json:"battle_top"`
	BattleRanks []periodRankEntry `firestore:"battle_ranks" json:"-"`
	PointsTop   []periodEntry     `firestore:"points_top" json:"points_top"`
	PointsRanks []periodRankEntry `firestore:"points_ranks" json:"-"`

	// Partial は集計の途中から始まった期間(機能導入直後など)であることを示す。
	Partial bool `firestore:"partial" json:"partial"`
}

// archiveDocID は期間の保存先ID。期間キーは日付/年月なので、IDで新しい順に
// 並べ替えられる(週= week_2026-07-20 / 月= month_2026-07)。
func archiveDocID(periodType, periodKey string) string {
	return periodType + "_" + periodKey
}

// periodClosing は「締めるべき期間」1件分。ロールオーバーを検出した時点で、
// 基準値を作り直す前に確定させる必要がある(作り直すと差分が取れなくなる)。
type periodClosing struct {
	Type    string // week / month
	Key     string // 閉じる期間のキー(旧キー)
	Start   time.Time
	End     time.Time
	Scores  []periodScore // せんとうりょくの伸び幅(確定値)
	Partial bool          // 期間の途中から集計を始めていた
}

// detectClosings は期間キーの変化から「閉じるべき期間」を洗い出す(純関数)。
//
// 終了時刻は現在の期間開始ではなく「閉じる期間の開始+1週/1ヶ月」にする。
// スケジュール関数が数期間止まっていた場合でも、閉じる期間の範囲が伸びない
// ようにするため。
func detectClosings(baseline *battleBaselineDoc, users []rankingUpdateUserDoc, weekKey, monthKey string) []periodClosing {
	var closings []periodClosing

	if baseline.WeekKey != "" && baseline.WeekKey != weekKey {
		if start, err := time.ParseInLocation("2006-01-02", baseline.WeekKey, jst); err == nil {
			closings = append(closings, periodClosing{
				Type:    "week",
				Key:     baseline.WeekKey,
				Start:   start,
				End:     start.AddDate(0, 0, 7),
				Scores:  baselineDeltas(baseline.Week, users, start),
				Partial: isPartialPeriod(baseline.WeekBaseAt, start),
			})
		}
	}
	if baseline.MonthKey != "" && baseline.MonthKey != monthKey {
		if start, err := time.ParseInLocation("2006-01", baseline.MonthKey, jst); err == nil {
			closings = append(closings, periodClosing{
				Type:    "month",
				Key:     baseline.MonthKey,
				Start:   start,
				End:     start.AddDate(0, 1, 0),
				Scores:  baselineDeltas(baseline.Month, users, start),
				Partial: isPartialPeriod(baseline.MonthBaseAt, start),
			})
		}
	}
	return closings
}

// baselineDeltas は基準値と現在値の差分を出す(純関数)。
// 基準値に居ないユーザー(期間の途中から参加)は差分を出せないので載せない。
// その期間に参拝していないユーザーも載せない(sanpaiedSince 参照)。
func baselineDeltas(base map[string]int64, users []rankingUpdateUserDoc, start time.Time) []periodScore {
	scores := make([]periodScore, 0, len(users))
	for _, u := range users {
		b, ok := base[u.ID]
		if !ok {
			continue
		}
		if !sanpaiedSince(u, start) {
			continue
		}
		if d := u.Status.Total - b; d > 0 {
			scores = append(scores, periodScore{
				ID:      u.ID,
				Profile: rankingProfile{DisplayName: u.DisplayName, ScreenName: u.ScreenName, ImagePath: u.ImagePath},
				Value:   d,
			})
		}
	}
	return scores
}

// isPartialPeriod は基準値の作成が期間開始よりだいぶ後だったかを判定する。
// ロールオーバーは期間開始直後の実行で起きるので、大きくずれているのは
// 機能の導入直後や関数の長時間停止に限られる。
//
// 記録が無い(ゼロ値)場合は partial としない。base_at は締め機能と同時に
// 足したフィールドで、期間ランキング自体はそれより前から動いている。つまり
// ゼロ値は「途中から始めた」ではなく「フィールドを持つ前に作られた基準値」を
// 意味する。ここで true にすると、頭から記録できている最初の週・月に
// 誤った注意書きが出てしまう。
func isPartialPeriod(baseAt, start time.Time) bool {
	if baseAt.IsZero() {
		return false
	}
	return baseAt.After(start.Add(90 * time.Minute))
}

// closePeriod は閉じた期間の最終結果を確定してアーカイブに保存し、
// 1位へ称号を付ける。
//
// battleScores は呼び出し側がロールオーバー前に確定させた「旧基準値との差分」。
// ぽいんとはここで期間範囲を指定して集計し直す。
func closePeriod(
	ctx context.Context,
	client *firestore.Client,
	periodType string,
	periodKey string,
	start, end time.Time,
	battleScores []periodScore,
	profiles map[string]rankingProfile,
	partial bool,
) error {
	pointTotals, err := aggregateSanpaiPointsRange(ctx, client, start, end)
	if err != nil {
		return err
	}
	pointsScores := pointScores(pointTotals, profiles)

	battleTop, battleRanks := buildPeriodRanking(battleScores)
	pointsTop, pointsRanks := buildPeriodRanking(pointsScores)

	doc := rankingArchiveDoc{
		PeriodType:  periodType,
		PeriodKey:   periodKey,
		StartsAt:    start,
		EndsAt:      end,
		ClosedAt:    time.Now(),
		BattleTop:   capEntries(battleTop, archiveTopLimit),
		BattleRanks: battleRanks,
		PointsTop:   capEntries(pointsTop, archiveTopLimit),
		PointsRanks: pointsRanks,
		Partial:     partial,
	}
	if _, err := client.Collection("ranking_archive").Doc(archiveDocID(periodType, periodKey)).Set(ctx, doc); err != nil {
		return err
	}

	// 1位へ称号を付与。ランキングが空(誰も伸びなかった等)なら誰にも付けない。
	grantCrowns(ctx, client, periodType, "battle", periodKey, battleScores)
	grantCrowns(ctx, client, periodType, "points", periodKey, pointsScores)
	return nil
}

// capEntries は上位N件に切り詰める(純関数)。
func capEntries(entries []periodEntry, limit int) []periodEntry {
	if len(entries) > limit {
		return entries[:limit]
	}
	return entries
}

// firstPlaceIDs は1位のユーザーIDを返す(純関数)。同点1位は全員。
// スコアが空、または最高値が0以下なら誰も1位にしない。
func firstPlaceIDs(scores []periodScore) []string {
	best := int64(0)
	for _, s := range scores {
		if s.Value > best {
			best = s.Value
		}
	}
	if best <= 0 {
		return nil
	}
	ids := make([]string, 0, 1)
	for _, s := range scores {
		if s.Value == best {
			ids = append(ids, s.ID)
		}
	}
	return ids
}

// grantCrowns は1位に称号を1つ加算する。1人失敗しても他を止めない
// (アーカイブ自体は保存済みで、称号は後追いで直せるため)。
func grantCrowns(ctx context.Context, client *firestore.Client, periodType, metric, periodKey string, scores []periodScore) {
	crownID := crownIDFor(periodType, metric)
	if crownID == "" {
		return
	}
	for _, id := range firstPlaceIDs(scores) {
		if _, err := client.Collection("users").Doc(id).Set(ctx, map[string]interface{}{
			"crowns": map[string]interface{}{
				crownID: map[string]interface{}{
					"count":         firestore.Increment(1),
					"latest_period": periodKey,
				},
			},
		}, firestore.MergeAll); err != nil {
			log.Printf("rankingArchive: grant crown %s to %s failed: %v", crownID, id, err)
		}
	}
}
