package gofunctions

import (
	"context"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
)

func TestFirstPlaceIDs(t *testing.T) {
	scores := []periodScore{
		{ID: "a", Value: 10},
		{ID: "b", Value: 30},
		{ID: "c", Value: 30}, // 同点1位
		{ID: "d", Value: 5},
	}
	got := firstPlaceIDs(scores)
	if len(got) != 2 {
		t.Fatalf("同点1位は全員returnされるべき: %+v", got)
	}
	set := map[string]bool{got[0]: true, got[1]: true}
	if !set["b"] || !set["c"] {
		t.Errorf("1位は b と c: %+v", got)
	}
}

func TestFirstPlaceIDs_NoWinnerWhenEmptyOrZero(t *testing.T) {
	if got := firstPlaceIDs(nil); got != nil {
		t.Errorf("空なら1位なし: %+v", got)
	}
	// 伸び幅0しか居ない期間は誰も王者にしない。
	if got := firstPlaceIDs([]periodScore{{ID: "a", Value: 0}}); len(got) != 0 {
		t.Errorf("0点だけなら1位なし: %+v", got)
	}
}

func TestDetectClosings(t *testing.T) {
	state := &periodStateDoc{WeekKey: "2026-07-13", MonthKey: "2026-07"}

	// 週だけ変わった(月は同じ)→ 週のみ締める。
	closings := detectClosings(state, "2026-07-20", "2026-07")
	if len(closings) != 1 {
		t.Fatalf("締めるのは週だけ: %+v", closings)
	}
	c := closings[0]
	if c.Type != "week" || c.Key != "2026-07-13" {
		t.Errorf("締める期間が違う: %+v", c)
	}
	if !c.Start.Equal(time.Date(2026, 7, 13, 0, 0, 0, 0, jst)) {
		t.Errorf("開始が違う: %v", c.Start)
	}
	// 終了は「開始+7日」。関数が数週止まっても範囲が伸びないようにするため。
	if !c.End.Equal(time.Date(2026, 7, 20, 0, 0, 0, 0, jst)) {
		t.Errorf("終了が違う: %v", c.End)
	}
}

func TestDetectClosings_MonthRollover(t *testing.T) {
	state := &periodStateDoc{WeekKey: "2026-07-27", MonthKey: "2026-07"}
	closings := detectClosings(state, "2026-07-27", "2026-08")
	if len(closings) != 1 || closings[0].Type != "month" {
		t.Fatalf("締めるのは月だけ: %+v", closings)
	}
	c := closings[0]
	if !c.Start.Equal(time.Date(2026, 7, 1, 0, 0, 0, 0, jst)) || !c.End.Equal(time.Date(2026, 8, 1, 0, 0, 0, 0, jst)) {
		t.Errorf("月の範囲が違う: %v 〜 %v", c.Start, c.End)
	}
}

func TestDetectClosings_NoRollover(t *testing.T) {
	state := &periodStateDoc{WeekKey: "2026-07-20", MonthKey: "2026-07"}
	if got := detectClosings(state, "2026-07-20", "2026-07"); len(got) != 0 {
		t.Errorf("期間が変わっていなければ締めない: %+v", got)
	}
	// 初回(キーが空)も締めない。
	if got := detectClosings(&periodStateDoc{}, "2026-07-20", "2026-07"); len(got) != 0 {
		t.Errorf("状態が無いなら締めない: %+v", got)
	}
}

func TestClosePeriod_ArchivesAndGrantsCrowns(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	prefix := "TestClosePeriod_"
	start := time.Date(2026, 3, 2, 0, 0, 0, 0, jst) // 月曜
	end := start.AddDate(0, 0, 7)

	// 獲得ログ。確定値はこの範囲で集計し直される。
	seedLog := func(collection, id string, point int64, at time.Time) {
		userRef := client.Collection("users").Doc(prefix + id)
		if _, err := userRef.Set(ctx, map[string]interface{}{"screen_name": "screen" + id}, firestore.MergeAll); err != nil {
			t.Fatalf("seed user: %v", err)
		}
		if _, _, err := userRef.Collection(collection).Add(ctx, map[string]interface{}{
			"add_point": point, "timestamp": at,
		}); err != nil {
			t.Fatalf("seed %s: %v", collection, err)
		}
	}
	seedLog("sanpai_logs", "a", 30, start.Add(time.Hour))
	seedLog("sanpai_logs", "b", 5, start.Add(2*time.Hour))
	seedLog("sanpai_logs", "a", 999, end.Add(time.Hour)) // 期間外。確定値に入ってはいけない
	seedLog(battleLogsCollection, "b", 400, start.Add(time.Hour))
	seedLog(battleLogsCollection, "a", 100, start.Add(2*time.Hour))
	seedLog(battleLogsCollection, "a", 5000, end.Add(time.Hour)) // 期間外

	profiles := map[string]rankingProfile{
		prefix + "a": {DisplayName: "A", ScreenName: "screena", ImagePath: "https://example.com/a.png"},
		prefix + "b": {DisplayName: "B", ScreenName: "screenb"},
	}

	if err := closePeriod(ctx, client, "week", "2026-03-02", start, end, profiles); err != nil {
		t.Fatalf("closePeriod: %v", err)
	}

	snap, err := client.Collection("ranking_archive").Doc("week_2026-03-02").Get(ctx)
	if err != nil {
		t.Fatalf("アーカイブが作られていない: %v", err)
	}
	var doc rankingArchiveDoc
	if err := snap.DataTo(&doc); err != nil {
		t.Fatalf("DataTo: %v", err)
	}
	if doc.PeriodType != "week" || doc.PeriodKey != "2026-03-02" {
		t.Errorf("期間の記録が違う: %+v", doc)
	}
	if len(doc.BattleTop) != 2 || doc.BattleTop[0].ScreenName != "screenb" || doc.BattleTop[0].Value != 400 {
		t.Errorf("せんとうりょくの確定順位が違う(期間外の5000が混ざっていないか): %+v", doc.BattleTop)
	}
	if len(doc.PointsTop) != 2 || doc.PointsTop[0].ScreenName != "screena" || doc.PointsTop[0].Value != 30 {
		t.Errorf("ぽいんとの確定順位が違う(期間外の999が混ざっていないか): %+v", doc.PointsTop)
	}
	if len(doc.PointsRanks) != 2 {
		t.Errorf("全員分の順位も保存されるべき: %+v", doc.PointsRanks)
	}

	// 称号: せんとうりょく1位=b、ぽいんと1位=a
	assertCrown := func(id, crownID string, wantCount int64) {
		t.Helper()
		s, err := client.Collection("users").Doc(prefix + id).Get(ctx)
		if err != nil {
			t.Fatalf("get user %s: %v", id, err)
		}
		v, err := s.DataAt("crowns." + crownID + ".count")
		if err != nil {
			t.Fatalf("%s に %s が付いていない: %v", id, crownID, err)
		}
		if n, _ := v.(int64); n != wantCount {
			t.Errorf("%s の %s = %v, want %d", id, crownID, v, wantCount)
		}
	}
	assertCrown("b", "week_battle_first", 1)
	assertCrown("a", "week_points_first", 1)

	// 2回目の締めで回数が増える(同じ人が連覇)
	if err := closePeriod(ctx, client, "week", "2026-03-09", start, end, profiles); err != nil {
		t.Fatalf("closePeriod 2: %v", err)
	}
	assertCrown("b", "week_battle_first", 2)
}

func TestPeriodLabel(t *testing.T) {
	week := periodLabel("week",
		time.Date(2026, 7, 20, 0, 0, 0, 0, jst),
		time.Date(2026, 7, 27, 0, 0, 0, 0, jst))
	if week != "2026/7/20 〜 7/26" {
		t.Errorf("週の見出し = %q", week)
	}
	month := periodLabel("month",
		time.Date(2026, 7, 1, 0, 0, 0, 0, jst),
		time.Date(2026, 8, 1, 0, 0, 0, 0, jst))
	if month != "2026年7月" {
		t.Errorf("月の見出し = %q", month)
	}
	// 年をまたぐ週は終了側にも年を出す。
	over := periodLabel("week",
		time.Date(2026, 12, 28, 0, 0, 0, 0, jst),
		time.Date(2027, 1, 4, 0, 0, 0, 0, jst))
	if over != "2026/12/28 〜 2027/1/3" {
		t.Errorf("年またぎの週の見出し = %q", over)
	}
}

