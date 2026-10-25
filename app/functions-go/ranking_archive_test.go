package gofunctions

import (
	"context"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
)

func TestPlaceIDs(t *testing.T) {
	scores := []periodScore{
		{ID: "a", Value: 10},
		{ID: "b", Value: 30},
		{ID: "c", Value: 30}, // 同点1位
		{ID: "d", Value: 5},
		{ID: "e", Value: 20},
	}
	got := placeIDs(scores)
	set := func(ids []string) map[string]bool {
		m := map[string]bool{}
		for _, id := range ids {
			m[id] = true
		}
		return m
	}
	if p1 := set(got[1]); len(got[1]) != 2 || !p1["b"] || !p1["c"] {
		t.Errorf("同点1位は全員: %+v", got)
	}
	// 1位が2人なので 2位は居ない。20 は3位(ランキング表示と同じ数え方)
	if len(got[2]) != 0 {
		t.Errorf("1位が2人なら2位は居ない: %+v", got)
	}
	if len(got[3]) != 1 || got[3][0] != "e" {
		t.Errorf("3位は e: %+v", got)
	}
	if len(got) != 2 {
		t.Errorf("4位以下は入らない: %+v", got)
	}

	got = placeIDs([]periodScore{{ID: "a", Value: 3}, {ID: "b", Value: 2}, {ID: "c", Value: 2}, {ID: "d", Value: 1}})
	if len(got[1]) != 1 || len(got[2]) != 2 || len(got[3]) != 0 {
		t.Errorf("2位が2人なら3位は居ない: %+v", got)
	}
}

func TestPlaceIDs_NoWinnerWhenEmptyOrZero(t *testing.T) {
	if got := placeIDs(nil); len(got) != 0 {
		t.Errorf("空なら入賞なし: %+v", got)
	}
	// 伸び幅0しか居ない期間は誰も入賞しない。0の人は2位・3位にもならない
	if got := placeIDs([]periodScore{{ID: "a", Value: 0}}); len(got) != 0 {
		t.Errorf("0点だけなら入賞なし: %+v", got)
	}
	got := placeIDs([]periodScore{{ID: "a", Value: 5}, {ID: "b", Value: 0}})
	if len(got[1]) != 1 || len(got[2]) != 0 {
		t.Errorf("0点の人は2位にしない: %+v", got)
	}
}

func TestCrownDefs(t *testing.T) {
	seen := map[string]bool{}
	for _, pt := range []string{"week", "month"} {
		for _, m := range []string{"battle", "points"} {
			for place := 1; place <= crownPlaces; place++ {
				id := crownIDFor(pt, m, place)
				if id == "" || seen[id] {
					t.Errorf("%s/%s/%d の称号が無い・重複: %q", pt, m, place, id)
				}
				seen[id] = true
			}
		}
	}
	// 1位の ID は導入時のまま(既に付いた称号が消えない)
	if crownIDFor("week", "battle", 1) != "week_battle_first" || crownIDFor("month", "points", 1) != "month_points_first" {
		t.Error("1位の称号の ID が変わった")
	}
}

func TestPodiumCrownTallies(t *testing.T) {
	archives := []rankingArchiveDoc{
		{PeriodType: "week", PeriodKey: "2026-07-20",
			BattleRanks: []periodRankEntry{{"a", 30, 1}, {"b", 20, 2}, {"c", 10, 3}, {"d", 5, 4}},
			PointsRanks: []periodRankEntry{{"b", 9, 1}, {"a", 9, 1}, {"c", 3, 3}}},
		{PeriodType: "week", PeriodKey: "2026-07-27",
			BattleRanks: []periodRankEntry{{"c", 50, 1}, {"b", 40, 2}, {"x", 0, 3}}},
		{PeriodType: "month", PeriodKey: "2026-07",
			PointsRanks: []periodRankEntry{{"a", 100, 1}, {"b", 80, 2}}},
	}
	got := podiumCrownTallies(archives)
	want := map[string]map[string]crownTally{
		"b": {"week_battle_second": {2, "2026-07-27"}, "month_points_second": {1, "2026-07"}},
		"c": {"week_battle_third": {1, "2026-07-20"}, "week_points_third": {1, "2026-07-20"}},
	}
	if len(got) != len(want) {
		t.Fatalf("1位・4位以下・0点は数えない: %+v", got)
	}
	for sn, crowns := range want {
		for id, w := range crowns {
			if got[sn][id] != w {
				t.Errorf("%s の %s = %+v, want %+v", sn, id, got[sn][id], w)
			}
		}
		if len(got[sn]) != len(crowns) {
			t.Errorf("%s の称号の数が違う: %+v", sn, got[sn])
		}
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
	seedLog("sanpai_logs", "c", 3, start.Add(3*time.Hour))
	seedLog(battleLogsCollection, "c", 50, start.Add(3*time.Hour))

	profiles := map[string]rankingProfile{
		prefix + "a": {DisplayName: "A", ScreenName: "screena", ImagePath: "https://example.com/a.png"},
		prefix + "b": {DisplayName: "B", ScreenName: "screenb"},
		prefix + "c": {DisplayName: "C", ScreenName: "screenc"},
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
	if len(doc.BattleTop) != 3 || doc.BattleTop[0].ScreenName != "screenb" || doc.BattleTop[0].Value != 400 {
		t.Errorf("せんとうりょくの確定順位が違う(期間外の5000が混ざっていないか): %+v", doc.BattleTop)
	}
	if len(doc.PointsTop) != 3 || doc.PointsTop[0].ScreenName != "screena" || doc.PointsTop[0].Value != 30 {
		t.Errorf("ぽいんとの確定順位が違う(期間外の999が混ざっていないか): %+v", doc.PointsTop)
	}
	if len(doc.PointsRanks) != 3 {
		t.Errorf("全員分の順位も保存されるべき: %+v", doc.PointsRanks)
	}

	// 称号: せんとうりょく 1位=b 2位=a 3位=c、ぽいんと 1位=a 2位=b 3位=c
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
	assertCrown("a", "week_battle_second", 1)
	assertCrown("c", "week_battle_third", 1)
	assertCrown("a", "week_points_first", 1)
	assertCrown("b", "week_points_second", 1)
	assertCrown("c", "week_points_third", 1)

	// 2回目の締めで回数が増える(同じ人が連覇)
	if err := closePeriod(ctx, client, "week", "2026-03-09", start, end, profiles); err != nil {
		t.Fatalf("closePeriod 2: %v", err)
	}
	assertCrown("b", "week_battle_first", 2)
	assertCrown("c", "week_battle_third", 2)
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

