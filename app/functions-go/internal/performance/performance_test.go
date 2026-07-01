// performance.go のテスト。app/functions/test/performance.test.js のうち、
// status エンドポイントで使用する範囲(get_level/get_next_leve_exp/user_performance/
// user_formatted_performance)を同一の入出力で移植し、Node版との等価性を保証する。
package performance

import (
	"testing"
	"time"
)

var seq int

func iso(unixSec int64) string {
	return time.Unix(unixSec, 0).UTC().Format("2006-01-02T15:04:05") + "Z"
}

func item(eventType string, unixSec int64, payload any) Activity {
	seq++
	return Activity{Type: eventType, CreatedAt: iso(unixSec), Payload: payload}
}

func TestGetLevel_Boundary(t *testing.T) {
	cases := []struct {
		points, want int
	}{
		{0, 1}, // target_points[0]=0
		{5, 2}, // target_points[1]=5
		{6, 3}, // 6<=11
		{11, 3},
		{12, 4}, // 12<=19
	}
	for _, c := range cases {
		if got := GetLevel(c.points); got != c.want {
			t.Errorf("GetLevel(%d) = %d, want %d", c.points, got, c.want)
		}
	}
}

func TestGetNextLevelExp(t *testing.T) {
	r := GetNextLevelExp(0) // level=1 -> target_points[1]=5
	if r.NextLevel != 2 {
		t.Errorf("NextLevel = %d, want 2", r.NextLevel)
	}
	if r.NextExp != 5 {
		t.Errorf("NextExp = %d, want 5", r.NextExp)
	}
}

func TestUserPerformance_EventTypePoints(t *testing.T) {
	cases := []struct {
		eventType string
		field     string
		want      int
	}{
		{"ForkEvent", "power", 1},
		{"PushEvent", "power", 2},
		{"CreateEvent", "power", 1},
		{"DeleteEvent", "power", 1},
		{"PullRequestEvent", "power", 3},
		{"IssueCommentEvent", "intelligence", 2},
		{"PullRequestReviewEvent", "defence", 3},
		{"PullRequestReviewCommentEvent", "defence", 3},
		{"GollumEvent", "defence", 3},
		{"ReleaseEvent", "defence", 10},
	}
	for _, c := range cases {
		r := UserPerformance([]Activity{item(c.eventType, 1000, nil)}, "u")
		var got int
		switch c.field {
		case "power":
			got = r.Power
		case "intelligence":
			got = r.Intelligence
		case "defence":
			got = r.Defence
		}
		if got != c.want {
			t.Errorf("%s.%s = %d, want %d", c.eventType, c.field, got, c.want)
		}
	}
}

func TestUserPerformance_UnsupportedEvent(t *testing.T) {
	r := UserPerformance([]Activity{item("WatchEvent", 1000, nil)}, "u")
	sum := r.Power + r.Defence + r.Intelligence + r.Agility + r.HP
	if sum != 0 {
		t.Errorf("unsupported event sum = %d, want 0", sum)
	}
}

func TestUserPerformance_IssuesEventPayload(t *testing.T) {
	// 文字列 payload の場合のみ switch にマッチする(既存仕様)
	if r := UserPerformance([]Activity{item("IssuesEvent", 1000, "opened")}, "u"); r.Intelligence != 3 {
		t.Errorf("opened intelligence = %d, want 3", r.Intelligence)
	}
	if r := UserPerformance([]Activity{item("IssuesEvent", 1000, "closed")}, "u"); r.Defence != 5 {
		t.Errorf("closed defence = %d, want 5", r.Defence)
	}
	// GitHub API 実体のオブジェクトpayloadはマッチせず加点されない(既存挙動)
	objR := UserPerformance([]Activity{item("IssuesEvent", 1000, map[string]any{"action": "opened"})}, "u")
	if objR.Intelligence != 0 || objR.Defence != 0 {
		t.Errorf("object payload intelligence=%d defence=%d, want 0,0", objR.Intelligence, objR.Defence)
	}
}

func twoPush(diffSec int64) RawUserData {
	return UserPerformance([]Activity{item("PushEvent", 1000, nil), item("PushEvent", 1000+diffSec, nil)}, "u")
}

func TestUserPerformance_AgilityByDiff(t *testing.T) {
	cases := []struct {
		diff int64
		want int
	}{
		{60, 6}, // 30<diff<=120
		{120, 6},
		{150, 3},  // <=180
		{250, 2},  // <=300
		{1000, 1}, // <=1200
		{1201, 0}, // どのバケットにも該当しない
		{30, 3},   // 30<diffはfalseだがdiff<=180に該当し+3
	}
	for _, c := range cases {
		if got := twoPush(c.diff).Agility; got != c.want {
			t.Errorf("twoPush(%d).Agility = %d, want %d", c.diff, got, c.want)
		}
	}
}

func TestUserPerformance_HPByContinuousPairs(t *testing.T) {
	if got := twoPush(60).HP; got != 2 {
		t.Errorf("twoPush(60).HP = %d, want 2", got)
	}
	if got := twoPush(7200).HP; got != 2 {
		t.Errorf("twoPush(7200).HP = %d, want 2", got)
	}
	if got := twoPush(7201).HP; got != 0 {
		t.Errorf("twoPush(7201).HP = %d, want 0", got)
	}
	// 3連続(全て7200秒以内) -> 2ペア -> hp 4
	three := UserPerformance([]Activity{
		item("PushEvent", 1000, nil), item("PushEvent", 2000, nil), item("PushEvent", 3000, nil),
	}, "u")
	if three.HP != 4 {
		t.Errorf("three.HP = %d, want 4", three.HP)
	}
}

func TestUserFormattedPerformance(t *testing.T) {
	raw := RawUserData{User: "u", HP: 10, Power: 4, Intelligence: 2, Defence: 3, Agility: 6}
	fmt_ := UserFormattedPerformance(raw, AppendData{Exp: 100, User: UserInfo{DisplayName: "d"}})

	if fmt_.Total != 10+4+2+3+6 {
		t.Errorf("Total = %d, want %d", fmt_.Total, 10+4+2+3+6)
	}
	if fmt_.Exp != 100 {
		t.Errorf("Exp = %d, want 100", fmt_.Exp)
	}
	if fmt_.Points != 100 {
		t.Errorf("Points = %d, want 100", fmt_.Points)
	}
	wantChart := Chart{HP: 10, Power: 4, Intelligence: 2, Defence: 3, Agility: 6}
	if fmt_.Chart != wantChart {
		t.Errorf("Chart = %+v, want %+v", fmt_.Chart, wantChart)
	}
	if fmt_.Level != GetLevel(fmt_.Total) {
		t.Errorf("Level = %d, want %d", fmt_.Level, GetLevel(fmt_.Total))
	}
	if fmt_.User.DisplayName != "d" {
		t.Errorf("User.DisplayName = %q, want %q", fmt_.User.DisplayName, "d")
	}
}
