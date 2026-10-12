package gofunctions

import (
	"testing"
	"time"
)

func TestMgCheck(t *testing.T) {
	cases := []struct {
		name   string
		s      mgSubmit
		board  string
		reject bool
	}{
		{"ostrich ok", mgSubmit{Game: "ostrich", Score: 1500, DurationMs: 30000}, "ostrich", false},
		{"ostrich too high", mgSubmit{Game: "ostrich", Score: 5000, DurationMs: 10000}, "", true},
		{"typo ok", mgSubmit{Game: "typo", Score: 9000, DurationMs: 120000, Fixed: 40, MaxCombo: 30}, "typo", false},
		{"typo score too high", mgSubmit{Game: "typo", Score: 30000, DurationMs: 120000, Fixed: 40}, "", true},
		{"typo too many words", mgSubmit{Game: "typo", Score: 100, DurationMs: 1000, Fixed: 100}, "", true},
		{"typo combo > words", mgSubmit{Game: "typo", Score: 100, DurationMs: 60000, Fixed: 5, MaxCombo: 6}, "", true},
		{"rhythm ok", mgSubmit{Game: "rhythm", Song: "ten", Level: "hard", Score: 788000, MaxCombo: 100, Counts: map[string]int64{"kiwami": 70, "ryo": 30, "ka": 25, "fuka": 0}}, "rhythm-ten-hard", false},
		{"rhythm mismatch", mgSubmit{Game: "rhythm", Song: "ten", Level: "hard", Score: 1000000, Counts: map[string]int64{"kiwami": 70, "ryo": 30}}, "", true},
		{"rhythm unknown song", mgSubmit{Game: "rhythm", Song: "x", Level: "hard", Score: 0, Counts: map[string]int64{"fuka": 1}}, "", true},
		{"rhythm bad judge", mgSubmit{Game: "rhythm", Song: "ten", Level: "easy", Score: 0, Counts: map[string]int64{"perfect": 1}}, "", true},
		{"rhythm empty", mgSubmit{Game: "rhythm", Song: "ten", Level: "easy", Score: 0}, "", true},
		{"negative", mgSubmit{Game: "ostrich", Score: -1}, "", true},
		{"unknown game", mgSubmit{Game: "tetris", Score: 1}, "", true},
	}
	for _, c := range cases {
		board, _, reason := mgCheck(c.s)
		if (reason != "") != c.reject {
			t.Errorf("%s: reason=%q, want reject=%v", c.name, reason, c.reject)
		}
		if !c.reject && board != c.board {
			t.Errorf("%s: board=%q, want %q", c.name, board, c.board)
		}
	}
}

func TestMgCheckRhythmFlags(t *testing.T) {
	_, run, _ := mgCheck(mgSubmit{Game: "rhythm", Song: "kagura", Level: "hard", Score: 1000000, Counts: map[string]int64{"kiwami": 50}})
	if run["rhythm.full_combo"] != 1 || run["rhythm.all_kiwami"] != 1 || run["rhythm.hard_full_combo"] != 1 {
		t.Fatalf("all kiwami on hard: %v", run)
	}
	_, run, _ = mgCheck(mgSubmit{Game: "rhythm", Song: "kagura", Level: "normal", Score: 300000, Counts: map[string]int64{"ka": 50}})
	if run["rhythm.full_combo"] != 1 || run["rhythm.all_kiwami"] != 0 || run["rhythm.hard_full_combo"] != 0 {
		t.Fatalf("fc on normal: %v", run)
	}
	_, run, _ = mgCheck(mgSubmit{Game: "rhythm", Song: "kagura", Level: "hard", Score: 980000, Counts: map[string]int64{"kiwami": 49, "fuka": 1}})
	if run["rhythm.full_combo"] != 0 || run["rhythm.hard_full_combo"] != 0 {
		t.Fatalf("miss: %v", run)
	}
}

func TestMgApplyAndUnlock(t *testing.T) {
	now := time.Date(2026, 10, 12, 10, 0, 0, 0, jst)
	st := &mgState{}
	play := func(s mgSubmit, at time.Time) []string {
		board, run, reason := mgCheck(s)
		if reason != "" {
			t.Fatalf("rejected: %s", reason)
		}
		mgApply(st, s, board, run, at)
		var ids []string
		for _, d := range mgUnlock(st, mgFacts(st, run), at) {
			ids = append(ids, d.ID)
		}
		return ids
	}
	got := play(mgSubmit{Game: "typo", Score: 3500, DurationMs: 60000, Fixed: 20, MaxCombo: 12}, now)
	if !equalStrings(got, []string{"typo_first", "typo_3000"}) {
		t.Fatalf("first typo: %v", got)
	}
	// 同じ実績は 2 回取れない
	got = play(mgSubmit{Game: "typo", Score: 3600, DurationMs: 60000, Fixed: 20, MaxCombo: 12}, now.Add(time.Minute))
	if len(got) != 0 {
		t.Fatalf("second typo: %v", got)
	}
	if st.Best["typo"] != 3600 || st.Plays["typo"] != 2 || st.TypoFixedTotal != 40 || st.Days != 1 {
		t.Fatalf("state: %+v", st)
	}
	got = play(mgSubmit{Game: "ostrich", Score: 100, DurationMs: 5000}, now.Add(2*time.Minute))
	if !equalStrings(got, []string{"ostrich_first"}) {
		t.Fatalf("ostrich: %v", got)
	}
	got = play(mgSubmit{Game: "rhythm", Song: "ten", Level: "hard", Score: 1000000, Counts: map[string]int64{"kiwami": 10}}, now.AddDate(0, 0, 1))
	if !equalStrings(got, []string{"rhythm_first", "rhythm_fc", "rhythm_allkiwami", "rhythm_hardfc", "rhythm_950k", "all_three"}) {
		t.Fatalf("rhythm: %v", got)
	}
	if st.Days != 2 || st.Best["rhythm-ten-hard"] != 1000000 {
		t.Fatalf("state after rhythm: %+v", st)
	}
	// 修行で全曲フルコンボ・全曲演奏
	for _, song := range []string{"kagura", "shippu"} {
		play(mgSubmit{Game: "rhythm", Song: song, Level: "hard", Score: 1000000, Counts: map[string]int64{"kiwami": 10}}, now.AddDate(0, 0, 1))
	}
	got = play(mgSubmit{Game: "rhythm", Song: "matsuri", Level: "hard", Score: 1000000, Counts: map[string]int64{"kiwami": 10}}, now.AddDate(0, 0, 1))
	if !equalStrings(got, []string{"rhythm_allsongs", "rhythm_hardfc_all"}) {
		t.Fatalf("all songs: %v", got)
	}
}

func TestMgAchievementDefs(t *testing.T) {
	seen := map[string]bool{}
	metrics := map[string]bool{}
	for k := range mgFacts(&mgState{}, nil) {
		metrics[k] = true
	}
	for _, k := range []string{"ostrich.score", "typo.score", "typo.max_combo", "rhythm.score", "rhythm.full_combo", "rhythm.all_kiwami", "rhythm.hard_full_combo"} {
		metrics[k] = true
	}
	for _, d := range mgAchievementDefs {
		if seen[d.ID] {
			t.Errorf("duplicate id %s", d.ID)
		}
		seen[d.ID] = true
		if !metrics[d.Metric] {
			t.Errorf("%s: unknown metric %s", d.ID, d.Metric)
		}
		if d.Min <= 0 || d.Label == "" || d.Icon == "" || d.Desc == "" {
			t.Errorf("%s: incomplete def", d.ID)
		}
		// 端末で判定できるのは、この回の点数・コンボだけ
		if d.Live && d.Metric != "ostrich.score" && d.Metric != "typo.score" && d.Metric != "typo.max_combo" {
			t.Errorf("%s: live metric %s", d.ID, d.Metric)
		}
	}
}

func TestMgRankEntries(t *testing.T) {
	t0 := time.Unix(1000, 0)
	es := mgRankEntries([]mgEntry{
		{ID: "a", Score: 10, UpdatedAt: t0.Add(2)},
		{ID: "b", Score: 30, UpdatedAt: t0},
		{ID: "c", Score: 10, UpdatedAt: t0.Add(1)},
		{ID: "d", Score: 5, UpdatedAt: t0},
	})
	want := []struct {
		id   string
		rank int64
	}{{"b", 1}, {"c", 2}, {"a", 2}, {"d", 4}}
	for i, w := range want {
		if es[i].ID != w.id || es[i].Rank != w.rank {
			t.Fatalf("es[%d] = %s/%d, want %s/%d", i, es[i].ID, es[i].Rank, w.id, w.rank)
		}
	}
}

func TestMgPeriodKeys(t *testing.T) {
	// 2026-10-12 は月曜。日本時間の 0:30 は UTC では前日(日曜)
	k := mgPeriodKeys(time.Date(2026, 10, 11, 15, 30, 0, 0, time.UTC))
	if k["week"] != "w2026-10-12" || k["month"] != "m2026-10" || k["all"] != "all" {
		t.Fatalf("keys: %v", k)
	}
	if len(mgBoards()) != 2+len(mgRhythmSongs)*len(mgRhythmLevels) || !mgValidBoard("rhythm-kagura-easy") || mgValidBoard("rhythm-x-easy") {
		t.Fatalf("boards: %v", mgBoards())
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
