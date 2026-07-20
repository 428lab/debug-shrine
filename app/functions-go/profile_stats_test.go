package gofunctions

import (
	"testing"
	"time"
)

func day(date string, count int) sanpaiHistoryDay {
	return sanpaiHistoryDay{Date: date, Count: count}
}

func TestComputeStreaks(t *testing.T) {
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, jstLocation)

	for _, tc := range []struct {
		name            string
		days            []sanpaiHistoryDay
		current, longest int
	}{
		{"empty", nil, 0, 0},
		{"only today", []sanpaiHistoryDay{day("2026-07-10", 1)}, 1, 1},
		{
			// 今日まだ参拝していなくても昨日までの連続は継続中として数える
			"ends yesterday",
			[]sanpaiHistoryDay{day("2026-07-07", 1), day("2026-07-08", 2), day("2026-07-09", 1)},
			3, 3,
		},
		{
			// 一昨日で途切れている → current=0
			"broken",
			[]sanpaiHistoryDay{day("2026-07-06", 1), day("2026-07-07", 1), day("2026-07-08", 1)},
			0, 3,
		},
		{
			// 過去の長い連続 vs 現在の短い連続
			"longest in past",
			[]sanpaiHistoryDay{
				day("2026-01-01", 1), day("2026-01-02", 1), day("2026-01-03", 1),
				day("2026-01-04", 1), day("2026-01-05", 1),
				day("2026-07-09", 1), day("2026-07-10", 1),
			},
			2, 5,
		},
		{
			// 月跨ぎの連続(1/31→2/1)
			"month boundary",
			[]sanpaiHistoryDay{day("2026-01-31", 1), day("2026-02-01", 1)},
			0, 2,
		},
	} {
		cur, lon := computeStreaks(tc.days, now)
		if cur != tc.current || lon != tc.longest {
			t.Errorf("%s: streaks = (%d,%d), want (%d,%d)", tc.name, cur, lon, tc.current, tc.longest)
		}
	}
}

func TestComputeBadges(t *testing.T) {
	// 未達成: 全部 achieved=false で全件返る
	none := computeBadges(profileFacts{})
	if len(none) != len(badgeDefs) {
		t.Fatalf("badges = %d, want %d", len(none), len(badgeDefs))
	}
	for _, b := range none {
		if b.Achieved {
			t.Errorf("badge %s achieved with zero facts", b.ID)
		}
	}

	// 代表的な達成パターン
	got := map[string]bool{}
	for _, b := range computeBadges(profileFacts{
		SanpaiTotal:   120,
		LongestStreak: 8,
		Level:         26,
		OmikujiTotal:  12,
		DaikyoCount:   3,
	}) {
		got[b.ID] = b.Achieved
	}
	for id, want := range map[string]bool{
		"hatsumode": true, "sanpai10": true, "sanpai50": true, "sanpai100": true,
		"sanpai365": false, "sanpai1000": false,
		"streak3": true, "streak7": true, "streak30": false,
		"lv10": true, "lv25": true, "lv50": false,
		"omikuji10": true, "chokichi": false, "daikyo": true, "daikyo3": true,
	} {
		if got[id] != want {
			t.Errorf("badge %s = %v, want %v", id, got[id], want)
		}
	}
}

func TestBadges_AllHaveIcon(t *testing.T) {
	// 絵文字は機種依存のため表示は icon(FontAwesome)優先(DESIGN.md / #183)。
	// 定義漏れで絵文字フォールバックに落ちないよう全件にアイコンを要求する。
	for _, def := range badgeDefs {
		if def.Icon == "" {
			t.Errorf("badge %s has no icon", def.ID)
		}
		if def.Emoji == "" {
			t.Errorf("badge %s has no emoji fallback", def.ID)
		}
	}
}
