package gofunctions

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestAggregateSanpaiDays_Empty(t *testing.T) {
	days := aggregateSanpaiDays(nil, jstLocation)
	if len(days) != 0 {
		t.Fatalf("empty entries → %d days, want 0", len(days))
	}
}

func TestAggregateSanpaiDays_JSTBoundary(t *testing.T) {
	// UTC 2026-07-09 15:00 = JST 2026-07-10 00:00 → JSTでは7/10扱い。
	// UTC 2026-07-09 14:59 = JST 2026-07-09 23:59 → 7/9扱い。
	entries := []sanpaiLogEntry{
		{Timestamp: time.Date(2026, 7, 9, 14, 59, 0, 0, time.UTC), AddPoint: 3},
		{Timestamp: time.Date(2026, 7, 9, 15, 0, 0, 0, time.UTC), AddPoint: 5},
	}
	days := aggregateSanpaiDays(entries, jstLocation)
	if len(days) != 2 {
		t.Fatalf("days = %d, want 2 (JST境界で別日に分かれる)", len(days))
	}
	if days[0].Date != "2026-07-09" || days[0].Count != 1 || days[0].Points != 3 {
		t.Errorf("day0 = %+v, want 2026-07-09 count=1 points=3", days[0])
	}
	if days[1].Date != "2026-07-10" || days[1].Count != 1 || days[1].Points != 5 {
		t.Errorf("day1 = %+v, want 2026-07-10 count=1 points=5", days[1])
	}
}

func TestAggregateSanpaiDays_MultiplePerDayAndSorted(t *testing.T) {
	jst := jstLocation
	entries := []sanpaiLogEntry{
		// 入力順は意図的にバラバラ。年跨ぎも含む。
		{Timestamp: time.Date(2026, 1, 1, 9, 0, 0, 0, jst), AddPoint: 2},
		{Timestamp: time.Date(2025, 12, 31, 23, 0, 0, 0, jst), AddPoint: 10},
		{Timestamp: time.Date(2026, 1, 1, 21, 0, 0, 0, jst), AddPoint: 4},
		{Timestamp: time.Date(2026, 1, 1, 12, 0, 0, 0, jst), AddPoint: 1},
	}
	days := aggregateSanpaiDays(entries, jst)
	if len(days) != 2 {
		t.Fatalf("days = %d, want 2", len(days))
	}
	if days[0].Date != "2025-12-31" || days[0].Count != 1 || days[0].Points != 10 {
		t.Errorf("day0 = %+v, want 2025-12-31 count=1 points=10", days[0])
	}
	if days[1].Date != "2026-01-01" || days[1].Count != 3 || days[1].Points != 7 {
		t.Errorf("day1 = %+v, want 2026-01-01 count=3 points=7", days[1])
	}
}

func TestAggregateSanpaiDays_SkipsZeroTimestamp(t *testing.T) {
	entries := []sanpaiLogEntry{
		{Timestamp: time.Time{}, AddPoint: 5},
		{Timestamp: time.Date(2026, 7, 10, 10, 0, 0, 0, jstLocation), AddPoint: 3},
	}
	days := aggregateSanpaiDays(entries, jstLocation)
	if len(days) != 1 || days[0].Date != "2026-07-10" {
		t.Fatalf("days = %+v, want only 2026-07-10", days)
	}
}

func TestStartOfDayJST(t *testing.T) {
	// UTC 2026-07-09 20:00 = JST 2026-07-10 05:00 → JSTの7/10 0:00になるはず。
	got := startOfDayJST(time.Date(2026, 7, 9, 20, 0, 0, 0, time.UTC))
	want := time.Date(2026, 7, 10, 0, 0, 0, 0, jstLocation)
	if !got.Equal(want) {
		t.Errorf("startOfDayJST = %v, want %v", got, want)
	}
}

func TestSetSanpaiHistoryCacheHeaders(t *testing.T) {
	for _, tc := range []struct {
		all  bool
		want string
	}{
		{false, "public, max-age=60, s-maxage=300, stale-while-revalidate=600"},
		{true, "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"},
	} {
		rec := httptest.NewRecorder()
		setSanpaiHistoryCacheHeaders(rec, tc.all)
		if got := rec.Header().Get("Cache-Control"); got != tc.want {
			t.Errorf("all=%v Cache-Control = %q, want %q", tc.all, got, tc.want)
		}
	}
}
