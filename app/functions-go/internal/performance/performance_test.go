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
	// 0exp は Lv1。GetLevel は points <= 閾値 で判定するので、
	// targetPoints[0]=0 を1でも超えた 1exp で Lv2 になる。
	r := GetNextLevelExp(0)
	if r.NextLevel != 2 {
		t.Errorf("NextLevel = %d, want 2", r.NextLevel)
	}
	if r.NextExp != 1 {
		t.Errorf("NextExp = %d, want 1", r.NextExp)
	}
}

// NEXT として出す値は「そこに到達したら実際にレベルが上がる値」でなければ
// ならない。以前は1レベルぶん先(Lv L+1 の上限)を返しており、表示より手前で
// レベルが上がっていた(5exp は Lv2 で 6exp で Lv3 になるのに NEXT 11 と表示)。
func TestGetNextLevelExp_ReachingItLevelsUp(t *testing.T) {
	for _, points := range []int{0, 1, 5, 6, 100, 39157, 51217} {
		level := GetLevel(points)
		next := GetNextLevelExp(points)
		if level >= MaxLevel {
			continue
		}
		if got := GetLevel(next.NextExp); got != level+1 {
			t.Errorf("points=%d (Lv%d): NEXT %d exp に到達しても Lv%d のまま (want Lv%d)",
				points, level, next.NextExp, got, level+1)
		}
		// その1手前ではまだ上がらない(先取りしすぎていない)。
		if got := GetLevel(next.NextExp - 1); got != level {
			t.Errorf("points=%d (Lv%d): NEXT-1 = %d exp で既に Lv%d (まだ Lv%d のはず)",
				points, level, next.NextExp-1, got, level)
		}
	}
}

// 進捗バーは「今のレベルの中でどこまで進んだか」。レベル帯の下限で0%、
// 次レベルの直前で100%近くになること(累計/次レベルだと常に満タンに見えた)。
func TestGetLevelStartExp(t *testing.T) {
	if got := GetLevelStartExp(0); got != 0 {
		t.Errorf("Lv1 の下限 = %d, want 0", got)
	}
	for _, points := range []int{1, 5, 6, 100, 39157, 51217} {
		level := GetLevel(points)
		start := GetLevelStartExp(points)
		if GetLevel(start) != level {
			t.Errorf("points=%d: 下限 %d が同じレベルでない (Lv%d vs Lv%d)",
				points, start, GetLevel(start), level)
		}
		if start > 0 && GetLevel(start-1) != level-1 {
			t.Errorf("points=%d: 下限 %d の1つ手前が前のレベルでない", points, start)
		}
		next := GetNextLevelExp(points).NextExp
		if level < MaxLevel && next <= start {
			t.Errorf("points=%d: next(%d) <= start(%d) では割合が出せない", points, next, start)
		}
	}
	// 報告例: Lv54 の 51217。累計/次 では 92%超だが、レベル内では約10%。
	start := GetLevelStartExp(51217)
	next := GetNextLevelExp(51217).NextExp
	ratio := float64(51217-start) / float64(next-start) * 100
	if ratio > 20 {
		t.Errorf("Lv54 51217 の進捗 = %.1f%%, レベル帯の序盤なので小さいはず (start=%d next=%d)",
			ratio, start, next)
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
	// GitHub Events API の payload は {action:"opened"} 等のオブジェクトなので、
	// payload.action を見て加点する(opened -> intelligence+3, closed -> defence+5)。
	if r := UserPerformance([]Activity{item("IssuesEvent", 1000, map[string]any{"action": "opened"})}, "u"); r.Intelligence != 3 {
		t.Errorf("opened intelligence = %d, want 3", r.Intelligence)
	}
	if r := UserPerformance([]Activity{item("IssuesEvent", 1000, map[string]any{"action": "closed"})}, "u"); r.Defence != 5 {
		t.Errorf("closed defence = %d, want 5", r.Defence)
	}
	// action が opened/closed 以外(reopened等)は加点されない。
	if r := UserPerformance([]Activity{item("IssuesEvent", 1000, map[string]any{"action": "reopened"})}, "u"); r.Intelligence != 0 || r.Defence != 0 {
		t.Errorf("reopened intelligence=%d defence=%d, want 0,0", r.Intelligence, r.Defence)
	}
	// payload がオブジェクトでない(文字列/nil)場合は action を取れず加点されない。
	if r := UserPerformance([]Activity{item("IssuesEvent", 1000, "opened")}, "u"); r.Intelligence != 0 || r.Defence != 0 {
		t.Errorf("string payload intelligence=%d defence=%d, want 0,0", r.Intelligence, r.Defence)
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

func TestTargetPoints_Lv1To50Unchanged(t *testing.T) {
	// Lv51以降を足すときに既存の閾値を触ると、既存ユーザーのレベルが下がる。
	// 移植元(Node版 target_points)の50件をそのまま持っていることを固定する。
	want := []int{
		0, 5, 11, 19, 30, 45, 65, 91, 124, 166, 218, 281, 357, 447, 553, 676, 818, 981,
		1167, 1378, 1616, 1884, 2184, 2519, 2892, 3306, 3764, 4269, 4825, 5436, 6106,
		6840, 7643, 8520, 9477, 10520, 11656, 12892, 14236, 15696, 17281, 19001, 20867,
		22891, 25086, 27466, 30046, 32842, 35872, 39156,
	}
	if len(targetPoints) < len(want) {
		t.Fatalf("targetPoints が短い: %d", len(targetPoints))
	}
	for i, w := range want {
		if targetPoints[i] != w {
			t.Errorf("targetPoints[%d](Lv%d) = %d, want %d", i, i+1, targetPoints[i], w)
		}
	}
}

func TestTargetPoints_IsIncreasing(t *testing.T) {
	if len(targetPoints) != MaxLevel {
		t.Fatalf("len(targetPoints) = %d, want MaxLevel(%d)", len(targetPoints), MaxLevel)
	}
	for i := 1; i < len(targetPoints); i++ {
		if targetPoints[i] <= targetPoints[i-1] {
			t.Fatalf("閾値は単調増加であるべき: [%d]=%d [%d]=%d", i-1, targetPoints[i-1], i, targetPoints[i])
		}
	}
}

func TestGetLevel_Boundaries(t *testing.T) {
	for _, tc := range []struct {
		points int
		want   int
	}{
		{0, 1},      // 閾値ちょうどはそのレベル
		{5, 2},      // targetPoints[1]=5 → Lv2
		{6, 3},      // 5超えは次のレベル
		{39156, 50}, // 旧テーブルの上限。Lv50のまま
		{39157, 51}, // ここが Lv0 になっていた(#215)
		{99663, 61}, // Lv61の上限ちょうど
		{99664, 62}, // 1超えると次のレベル
	} {
		if got := GetLevel(tc.points); got != tc.want {
			t.Errorf("GetLevel(%d) = %d, want %d", tc.points, got, tc.want)
		}
	}
}

func TestGetLevel_NeverZeroAboveMax(t *testing.T) {
	// テーブルの上限を超えても 0 に落ちない(最高レベルで頭打ちにする)。
	max := targetPoints[len(targetPoints)-1]
	for _, p := range []int{max, max + 1, max * 10, 1 << 40} {
		got := GetLevel(p)
		if got < 1 || got > MaxLevel {
			t.Errorf("GetLevel(%d) = %d, want 1..%d", p, got, MaxLevel)
		}
	}
	if got := GetLevel(1 << 40); got != MaxLevel {
		t.Errorf("上限超えは最高レベルであるべき: %d", got)
	}
}

func TestGetNextLevelExp_HighAndMaxLevel(t *testing.T) {
	// 途中のレベルは「次の閾値」を返す。
	// Lv51 の範囲は (39156, 42716]。42716 を超えた 42717 で Lv52 になる。
	got := GetNextLevelExp(39157) // Lv51
	if got.NextLevel != 52 || got.NextExp != targetPoints[50]+1 {
		t.Errorf("GetNextLevelExp(39157) = %+v, want NextLevel=52 NextExp=%d", got, targetPoints[50]+1)
	}
	// 最高レベルでは 0 を返さない(進捗バーが0除算になるため)。
	max := targetPoints[len(targetPoints)-1]
	atMax := GetNextLevelExp(max + 1)
	if atMax.NextExp == 0 {
		t.Errorf("最高レベルで NextExp=0 を返してはいけない: %+v", atMax)
	}
	if atMax.NextLevel != MaxLevel {
		t.Errorf("最高レベルの NextLevel = %d, want %d", atMax.NextLevel, MaxLevel)
	}
}
