package gofunctions

import (
	"strings"
	"testing"
	"time"
)

func TestBonusMagnitude(t *testing.T) {
	cases := []struct {
		date string
		want int
		note string
	}{
		{"2026-04-28", 4, "よつやの日(火曜)"},
		{"2026-01-01", 3, "元日は祝日より年末年始を優先"},
		{"2026-12-29", 3, "年末年始の初日"},
		{"2026-05-06", 2, "振替休日(水曜)"},
		{"2026-05-04", 2, "みどりの日"},
		{"2026-09-28", 1, "平日(月曜)"},
		{"2026-09-26", 2, "土曜"},
	}
	for _, c := range cases {
		day, err := time.ParseInLocation("2006-01-02", c.date, jst)
		if err != nil {
			t.Fatalf("parse %s: %v", c.date, err)
		}
		if got := bonusMagnitude(day); got != c.want {
			t.Errorf("bonusMagnitude(%s) = %d, want %d (%s)", c.date, got, c.want, c.note)
		}
	}
}

// 日付の境界は JST で切る(UTC の日付ではない)。
func TestBonusMagnitude_JSTBoundary(t *testing.T) {
	cases := []struct {
		at   string
		want int
	}{
		{"2026-04-27T15:00:00Z", 4}, // JST 4/28 0:00
		{"2026-04-27T14:59:59Z", 1}, // JST 4/27 23:59:59(月曜・平日)
	}
	for _, c := range cases {
		at, err := time.Parse(time.RFC3339, c.at)
		if err != nil {
			t.Fatalf("parse %s: %v", c.at, err)
		}
		if got := bonusMagnitude(bonusDay(at)); got != c.want {
			t.Errorf("bonusMagnitude(bonusDay(%s)) = %d, want %d", c.at, got, c.want)
		}
	}
}

// 祝日データの切れ目を知らせる tripwire。当年の祝日が CSV に無ければ落ちる
// (毎年 1/1 に赤くなる)。翌年分は2月頃に公開されるので当年分だけを要求する。
// 追記手順は functions-go/README.md を参照。
func TestJPHolidays_CoverCurrentYear(t *testing.T) {
	year := time.Now().In(jst).Format("2006")
	for d := range jpHolidays {
		if strings.HasPrefix(d, year+"-") {
			return
		}
	}
	t.Fatalf("holidays/holidays_jp.csv に %s 年の祝日がありません。内閣府の CSV から追記してください(functions-go/README.md 参照)", year)
}
