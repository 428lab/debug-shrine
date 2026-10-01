// ボーナスタイムの暦(参拝で得るぽいんとの倍率を決める日付の判定)。
//
// 判定は各イベントの created_at を JST で日付にしたもので行う(参拝した時刻ではない)。
// 倍率は重ね掛けせず、当てはまるもののうち最大を取る:
//
//   - 4/28(よつやの日): 4
//   - 12/29〜1/3(年末年始): 3
//   - 土日・祝日: 2
//   - それ以外: 1
//
// 祝日は内閣府の「国民の祝日」CSV を UTF-8 に変換して同梱している(振替休日・
// 国民の休日を含む)。年1回の追記が要る。手順は functions-go/README.md を参照。
package gofunctions

import (
	_ "embed"
	"fmt"
	"strings"
	"time"
)

const (
	bonusMagYotsuya = 4
	bonusMagYearEnd = 3
	bonusMagHoliday = 2
)

//go:embed holidays/holidays_jp.csv
var holidaysJPCSV string

// jpHolidays は祝日の集合(キーは JST の日付 "2006-01-02")。
var jpHolidays = parseHolidaysCSV(holidaysJPCSV)

// parseHolidaysCSV は "YYYY-MM-DD,名称" の行を読んで日付の集合にする。
// 同梱データなので、壊れていれば起動時に落として気付けるようにする。
func parseHolidaysCSV(s string) map[string]bool {
	res := make(map[string]bool)
	for i, line := range strings.Split(strings.TrimPrefix(s, "\ufeff"), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		date, _, _ := strings.Cut(line, ",")
		if _, err := time.ParseInLocation("2006-01-02", date, jst); err != nil {
			panic(fmt.Sprintf("holidays_jp.csv line %d: %v", i+1, err))
		}
		res[date] = true
	}
	return res
}

// bonusDay は t を JST の日付(その日の 0:00 JST)にする。
func bonusDay(t time.Time) time.Time {
	j := t.In(jst)
	return time.Date(j.Year(), j.Month(), j.Day(), 0, 0, 0, 0, jst)
}

// isJPHoliday は day(JST)が祝日かを返す。
func isJPHoliday(day time.Time) bool {
	return jpHolidays[day.In(jst).Format("2006-01-02")]
}

// isYearEndNewYear は day(JST)が 12/29〜1/3 かを返す。
func isYearEndNewYear(day time.Time) bool {
	d := day.In(jst)
	switch d.Month() {
	case time.December:
		return d.Day() >= 29
	case time.January:
		return d.Day() <= 3
	}
	return false
}

// isYotsuyaDay は day(JST)が 4/28(よつやの日)かを返す。
func isYotsuyaDay(day time.Time) bool {
	d := day.In(jst)
	return d.Month() == time.April && d.Day() == 28
}

// bonusMagnitude は day(JST)の倍率を返す。当てはまるもののうち最大を取る。
func bonusMagnitude(day time.Time) int {
	d := day.In(jst)
	switch {
	case isYotsuyaDay(d):
		return bonusMagYotsuya
	case isYearEndNewYear(d):
		return bonusMagYearEnd
	case d.Weekday() == time.Saturday || d.Weekday() == time.Sunday || isJPHoliday(d):
		return bonusMagHoliday
	}
	return 1
}
