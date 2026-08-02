// 期間ランキングの締め(アーカイブ)と、1位への称号付与。
//
// 週明け・月初(JST 0:00)に期間が変わったとき、閉じた期間の最終結果を
// ranking_archive に保存して二度と変えない。定期実行の最後の値を流用せず、
// 閉じた期間の範囲 [期間開始, 次の期間開始) で獲得ログを集計し直す
// (battle_logs / sanpai_logs)。週・月ごとに1回だけのクエリなので安い。
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
}

// archiveDocID は期間の保存先ID。期間キーは日付/年月なので、IDで新しい順に
// 並べ替えられる(週= week_2026-07-20 / 月= month_2026-07)。
func archiveDocID(periodType, periodKey string) string {
	return periodType + "_" + periodKey
}

// periodClosing は「締めるべき期間」1件分。
type periodClosing struct {
	Type  string // week / month
	Key   string // 閉じる期間のキー(旧キー)
	Start time.Time
	End   time.Time
}

// detectClosings は期間キーの変化から「閉じるべき期間」を洗い出す(純関数)。
//
// 終了時刻は現在の期間開始ではなく「閉じる期間の開始+1週/1ヶ月」にする。
// スケジュール関数が数期間止まっていた場合でも、閉じる期間の範囲が伸びない
// ようにするため。
func detectClosings(state *periodStateDoc, weekKey, monthKey string) []periodClosing {
	var closings []periodClosing

	if state.WeekKey != "" && state.WeekKey != weekKey {
		if start, err := time.ParseInLocation("2006-01-02", state.WeekKey, jst); err == nil {
			closings = append(closings, periodClosing{
				Type:  "week",
				Key:   state.WeekKey,
				Start: start,
				End:   start.AddDate(0, 0, 7),
			})
		}
	}
	if state.MonthKey != "" && state.MonthKey != monthKey {
		if start, err := time.ParseInLocation("2006-01", state.MonthKey, jst); err == nil {
			closings = append(closings, periodClosing{
				Type:  "month",
				Key:   state.MonthKey,
				Start: start,
				End:   start.AddDate(0, 1, 0),
			})
		}
	}
	return closings
}

// closePeriod は閉じた期間の最終結果を確定してアーカイブに保存し、
// 1位へ称号を付ける。値は獲得ログを期間範囲で集計し直して出す。
func closePeriod(
	ctx context.Context,
	client *firestore.Client,
	periodType string,
	periodKey string,
	start, end time.Time,
	profiles map[string]rankingProfile,
) error {
	battleTotals, err := aggregateBattlePointsRange(ctx, client, start, end)
	if err != nil {
		return err
	}
	battleScores := pointScores(battleTotals, profiles)

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
