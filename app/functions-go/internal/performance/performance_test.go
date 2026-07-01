// performance.go のテスト。app/functions/test/performance.test.js のうち、
// status エンドポイントで使用する範囲(get_level/get_next_leve_exp/user_performance/
// user_formatted_performance)を同一の入出力で移植し、Node版との等価性を保証する。
package performance

import (
	"math/rand"
	"reflect"
	"sort"
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

func TestRawUserDataFromStatus(t *testing.T) {
	status := FormattedPerformance{HP: 1, Power: 2, Defence: 3, Agility: 4, Intelligence: 5}
	got := RawUserDataFromStatus(status, "u")
	want := RawUserData{User: "u", HP: 1, Power: 2, Defence: 3, Dex: 0, Agility: 4, Intelligence: 5}
	if got != want {
		t.Errorf("RawUserDataFromStatus = %+v, want %+v", got, want)
	}
}

func TestLatestActivityCreatedAt(t *testing.T) {
	if got := LatestActivityCreatedAt(nil); got != "" {
		t.Errorf("LatestActivityCreatedAt(nil) = %q, want empty", got)
	}
	items := []Activity{item("PushEvent", 3000, nil), item("PushEvent", 1000, nil), item("PushEvent", 5000, nil)}
	want := iso(5000)
	if got := LatestActivityCreatedAt(items); got != want {
		t.Errorf("LatestActivityCreatedAt = %q, want %q", got, want)
	}
}

func TestComputePerformanceIncrement_InvariantViolationDoesNotPanic(t *testing.T) {
	base := RawUserData{User: "u"}
	// 境界より前のcreated_atを渡しても(警告ログのみで)パニックしないことを確認する。
	_ = ComputePerformanceIncrement(base, []Activity{item("PushEvent", 1000, nil)}, iso(5000))
	_ = ComputePerformanceIncrement(base, []Activity{item("PushEvent", 9000, nil)}, iso(5000))
}

// ============================================================
// 増分計算の等価性(プロパティテスト)
// performance.test.js の同名テストと同一のロジックをGoで移植。
// ============================================================

var eventTypes = []string{
	"ForkEvent", "PushEvent", "CreateEvent", "DeleteEvent", "PullRequestEvent",
	"IssuesEvent", "IssueCommentEvent", "PullRequestReviewEvent",
	"PullRequestReviewCommentEvent", "GollumEvent", "ReleaseEvent", "WatchEvent",
}

var payloadCandidates = []any{
	map[string]any{"action": "opened"}, map[string]any{"action": "closed"}, "opened", "closed", nil,
}

func genItems(rng *rand.Rand, count int, startUnix int64) []Activity {
	t := startUnix
	items := make([]Activity, 0, count)
	for i := 0; i < count; i++ {
		t += rng.Int63n(10000) // 7200秒境界を跨ぐようばらつかせる
		items = append(items, item(eventTypes[rng.Intn(len(eventTypes))], t, payloadCandidates[rng.Intn(len(payloadCandidates))]))
	}
	return items
}

func sortByCreatedAt(items []Activity) {
	sort.SliceStable(items, func(i, j int) bool {
		return parseCreatedAt(items[i].CreatedAt).Before(parseCreatedAt(items[j].CreatedAt))
	})
}

// pickedFields は比較対象のフィールドのみ抽出する(performance.test.js の pick と同じ意図)。
type pickedFields struct {
	HP, Power, Intelligence, Defence, Agility, Total, Level, NextExp, Points, Exp int
}

func pick(f FormattedPerformance) pickedFields {
	return pickedFields{f.HP, f.Power, f.Intelligence, f.Defence, f.Agility, f.Total, f.Level, f.NextExp, f.Points, f.Exp}
}

var appendForTest = AppendData{Exp: 42, User: UserInfo{DisplayName: "d", ScreenName: "s"}}

func TestIncrementEqualsFullCalculation_TwoBatches(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	for c := 0; c < 2000; c++ {
		all := genItems(rng, 1+rng.Intn(40), int64(1577836800)+rng.Int63n(1000000)) // 2020-01-01T00:00:00Z
		sortByCreatedAt(all)
		k := rng.Intn(len(all) + 1)
		oldItems := all[:k]
		newItems := all[k:]
		if len(newItems) == 0 {
			continue
		}

		full := UserFormattedPerformance(UserPerformance(all, ""), appendForTest)

		var incFmt FormattedPerformance
		if len(oldItems) > 0 {
			baseStatus := UserFormattedPerformance(UserPerformance(oldItems, ""), AppendData{})
			inc := ComputePerformanceIncrement(RawUserDataFromStatus(baseStatus, "s"), newItems, LatestActivityCreatedAt(oldItems))
			incFmt = UserFormattedPerformance(inc.UserData, appendForTest)
		} else {
			incFmt = UserFormattedPerformance(UserPerformance(newItems, ""), appendForTest)
		}
		if !reflect.DeepEqual(pick(incFmt), pick(full)) {
			t.Fatalf("case %d: increment=%+v full=%+v", c, pick(incFmt), pick(full))
		}
	}
}

func applyIncrement(rng *rand.Rand, prevStatus *FormattedPerformance, prevTs string, batch []Activity) (FormattedPerformance, string) {
	if prevStatus != nil {
		inc := ComputePerformanceIncrement(RawUserDataFromStatus(*prevStatus, "s"), batch, prevTs)
		return UserFormattedPerformance(inc.UserData, AppendData{}), inc.LastCreatedAt
	}
	return UserFormattedPerformance(UserPerformance(batch, ""), AppendData{}), LatestActivityCreatedAt(batch)
}

func TestIncrementEqualsFullCalculation_ThreeBatchesSequential(t *testing.T) {
	rng := rand.New(rand.NewSource(2))
	for c := 0; c < 1000; c++ {
		all := genItems(rng, 3+rng.Intn(40), int64(1577836800)+rng.Int63n(1000000))
		sortByCreatedAt(all)
		p1 := rng.Intn(len(all) + 1)
		p2 := p1 + rng.Intn(len(all)-p1+1)
		b1, b2, b3 := all[:p1], all[p1:p2], all[p2:]
		if len(b3) == 0 {
			continue
		}

		full := UserFormattedPerformance(UserPerformance(all, ""), appendForTest)

		var s *FormattedPerformance
		var ts string
		if len(b1) > 0 {
			r, t2 := applyIncrement(rng, s, ts, b1)
			s, ts = &r, t2
		}
		if len(b2) > 0 {
			r, t2 := applyIncrement(rng, s, ts, b2)
			s, ts = &r, t2
		}

		var finalFmt FormattedPerformance
		if s != nil {
			inc := ComputePerformanceIncrement(RawUserDataFromStatus(*s, "s"), b3, ts)
			finalFmt = UserFormattedPerformance(inc.UserData, appendForTest)
		} else {
			finalFmt = UserFormattedPerformance(UserPerformance(b3, ""), appendForTest)
		}
		if !reflect.DeepEqual(pick(finalFmt), pick(full)) {
			t.Fatalf("case %d: final=%+v full=%+v", c, pick(finalFmt), pick(full))
		}
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
