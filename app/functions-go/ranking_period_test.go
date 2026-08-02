package gofunctions

import (
	"context"
	"strconv"
	"testing"
	"time"
)

func TestPeriodBounds_JST(t *testing.T) {
	for _, tc := range []struct {
		name          string
		now           time.Time
		wantWeekStart string // JST
		wantMonthKey  string
		wantWeekKey   string
	}{
		{
			// 水曜 → 直前の月曜(7/20)が週初。
			name:          "水曜",
			now:           time.Date(2026, 7, 22, 15, 0, 0, 0, jst),
			wantWeekStart: "2026-07-20",
			wantWeekKey:   "2026-07-20",
			wantMonthKey:  "2026-07",
		},
		{
			// 月曜0:00ちょうどはその日が週初。
			name:          "月曜0時",
			now:           time.Date(2026, 7, 20, 0, 0, 0, 0, jst),
			wantWeekStart: "2026-07-20",
			wantWeekKey:   "2026-07-20",
			wantMonthKey:  "2026-07",
		},
		{
			// 日曜は週の最終日。週初は6日前の月曜。
			name:          "日曜",
			now:           time.Date(2026, 7, 26, 23, 59, 0, 0, jst),
			wantWeekStart: "2026-07-20",
			wantWeekKey:   "2026-07-20",
			wantMonthKey:  "2026-07",
		},
		{
			// 週が月をまたぐ場合(8/1は土曜 → 週初は7/27)。
			name:          "月初が週の途中",
			now:           time.Date(2026, 8, 1, 12, 0, 0, 0, jst),
			wantWeekStart: "2026-07-27",
			wantWeekKey:   "2026-07-27",
			wantMonthKey:  "2026-08",
		},
		{
			// UTCで渡してもJSTに直して判定する(UTC 2026-07-19 16:00 = JST 7/20 1:00 月曜)。
			name:          "UTC入力",
			now:           time.Date(2026, 7, 19, 16, 0, 0, 0, time.UTC),
			wantWeekStart: "2026-07-20",
			wantWeekKey:   "2026-07-20",
			wantMonthKey:  "2026-07",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			weekStart, monthStart, weekKey, monthKey := periodBounds(tc.now)
			if got := weekStart.In(jst).Format("2006-01-02"); got != tc.wantWeekStart {
				t.Errorf("weekStart = %s, want %s", got, tc.wantWeekStart)
			}
			if h, m := weekStart.In(jst).Hour(), weekStart.In(jst).Minute(); h != 0 || m != 0 {
				t.Errorf("weekStart should be 00:00 JST, got %02d:%02d", h, m)
			}
			if got := monthStart.In(jst).Format("2006-01-02"); got != tc.wantMonthKey+"-01" {
				t.Errorf("monthStart = %s, want %s-01", got, tc.wantMonthKey)
			}
			if weekKey != tc.wantWeekKey {
				t.Errorf("weekKey = %s, want %s", weekKey, tc.wantWeekKey)
			}
			if monthKey != tc.wantMonthKey {
				t.Errorf("monthKey = %s, want %s", monthKey, tc.wantMonthKey)
			}
		})
	}
}

func TestShouldAggregateSanpaiPoints(t *testing.T) {
	// 週明け・月初(JST 0時)は必ず集計回に当たること(区切り直後に新しい期間の
	// 値が入る)。それ以外は3時間ごと。
	for hour, want := range map[int]bool{0: true, 1: false, 2: false, 3: true, 12: true, 23: false} {
		got := shouldAggregateSanpaiPoints(time.Date(2026, 7, 20, hour, 0, 0, 0, jst))
		if got != want {
			t.Errorf("hour %d: got %v, want %v", hour, got, want)
		}
	}
}

func TestBuildPeriodRanking(t *testing.T) {
	scores := []periodScore{
		{ID: "a", Profile: rankingProfile{ScreenName: "a"}, Value: 100},
		{ID: "b", Profile: rankingProfile{ScreenName: "b"}, Value: 300},
		{ID: "c", Profile: rankingProfile{ScreenName: "c"}, Value: 300},
		{ID: "d", Profile: rankingProfile{ScreenName: "d"}, Value: 50},
	}
	top, ranks := buildPeriodRanking(scores)

	if len(top) != 4 || len(ranks) != 4 {
		t.Fatalf("len(top)=%d len(ranks)=%d, want 4/4", len(top), len(ranks))
	}
	if top[0].ScreenName != "b" || top[1].ScreenName != "c" {
		t.Errorf("同点300は先頭2件(IDの昇順でb,c)になるべき: %+v", top)
	}
	if top[0].Rank != 1 || top[1].Rank != 1 {
		t.Errorf("同点は同順位(1位)になるべき: %d, %d", top[0].Rank, top[1].Rank)
	}
	if top[2].Rank != 3 {
		t.Errorf("同点2人の次は3位に飛ぶべき: %d", top[2].Rank)
	}
	if top[3].ScreenName != "d" || top[3].Rank != 4 {
		t.Errorf("最下位は d の4位: %+v", top[3])
	}
	for i := range ranks {
		if ranks[i].ScreenName != top[i].ScreenName || ranks[i].Rank != top[i].Rank {
			t.Errorf("ranks[%d] と top[%d] の順位がずれている: %+v / %+v", i, i, ranks[i], top[i])
		}
	}
}

func TestBuildPeriodRanking_TopIsCappedButRanksAreFull(t *testing.T) {
	scores := make([]periodScore, 0, 150)
	for i := 0; i < 150; i++ {
		n := strconv.Itoa(i)
		scores = append(scores, periodScore{ID: n, Profile: rankingProfile{ScreenName: "u" + n}, Value: int64(1000 - i)})
	}
	top, ranks := buildPeriodRanking(scores)
	if len(top) != periodTopLimit {
		t.Errorf("len(top) = %d, want %d", len(top), periodTopLimit)
	}
	if len(ranks) != 150 {
		t.Errorf("len(ranks) = %d, want 150(圏外の順位照会に使うので全件)", len(ranks))
	}
	if ranks[149].Rank != 150 {
		t.Errorf("最下位の順位 = %d, want 150", ranks[149].Rank)
	}
}

func TestBuildPeriodRanking_Empty(t *testing.T) {
	top, ranks := buildPeriodRanking(nil)
	if len(top) != 0 || len(ranks) != 0 {
		t.Errorf("空の入力では空を返すべき: %d/%d", len(top), len(ranks))
	}
}

func newUser(id string, total int64) rankingUpdateUserDoc {
	u := rankingUpdateUserDoc{ID: id, ScreenName: "screen" + id, DisplayName: "name" + id}
	u.Status.Total = total
	return u
}

func TestPointScores_SkipsUnknownAndZero(t *testing.T) {
	profiles := map[string]rankingProfile{"a": {ScreenName: "sa"}, "b": {ScreenName: "sb"}}
	scores := pointScores(map[string]int64{"a": 5, "b": 0, "unknown": 7}, profiles)
	if len(scores) != 1 || scores[0].ID != "a" || scores[0].Value != 5 {
		t.Errorf("0点と未知のユーザーは除外されるべき: %+v", scores)
	}
}

func TestAggregateSanpaiPoints(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	now := time.Now().In(jst)
	weekStart, monthStart, _, _ := periodBounds(now)

	prefix := "TestAggregatePoints_"
	seed := func(id string, logs []struct {
		point int64
		at    time.Time
	}) {
		userRef := client.Collection("users").Doc(prefix + id)
		if _, err := userRef.Set(ctx, map[string]interface{}{"screen_name": "screen" + id}); err != nil {
			t.Fatalf("seed user: %v", err)
		}
		for _, l := range logs {
			if _, _, err := userRef.Collection("sanpai_logs").Add(ctx, map[string]interface{}{
				"add_point": l.point,
				"timestamp": l.at,
			}); err != nil {
				t.Fatalf("seed log: %v", err)
			}
		}
	}
	type logSeed = struct {
		point int64
		at    time.Time
	}

	// 週が月をまたぐ日(月初が週の途中)もあるため、期待値が境界に依存しないよう
	// 「週初と月初の遅い方」を基準にする。ここより後のログは週間・月間の両方に入る。
	inBoth := weekStart
	if monthStart.After(inBoth) {
		inBoth = monthStart
	}
	inBoth = inBoth.Add(time.Hour)
	beforeWeek := weekStart.Add(-time.Minute)
	longAgo := now.AddDate(-2, 0, 0)

	seed("a", []logSeed{{10, inBoth}, {5, inBoth.Add(time.Minute)}, {999, longAgo}})
	seed("b", []logSeed{{7, beforeWeek}})

	week, month, err := aggregateSanpaiPoints(ctx, client, weekStart, monthStart)
	if err != nil {
		t.Fatalf("aggregateSanpaiPoints: %v", err)
	}

	if got := week[prefix+"a"]; got != 15 {
		t.Errorf("週間のaの合計 = %d, want 15(期間外の999は入らない)", got)
	}
	if got := month[prefix+"a"]; got != 15 {
		t.Errorf("月間のaの合計 = %d, want 15", got)
	}
	if got := week[prefix+"b"]; got != 0 {
		t.Errorf("週初より前のログは週間に入らないべき: %d", got)
	}
	// beforeWeek が今月内なら月間には入る。月初=週初のケース(月曜が1日)では
	// 月間にも入らないので、その場合だけ期待値を変える。
	wantMonthB := int64(7)
	if beforeWeek.Before(monthStart) {
		wantMonthB = 0
	}
	if got := month[prefix+"b"]; got != wantMonthB {
		t.Errorf("月間のbの合計 = %d, want %d", got, wantMonthB)
	}
}
