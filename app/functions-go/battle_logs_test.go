package gofunctions

import (
	"context"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
)

func TestAggregateBattlePoints(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	now := time.Now().In(jst)
	weekStart, monthStart, _, _ := periodBounds(now)

	prefix := "TestAggregateBattle_"
	seed := func(id string, point int64, at time.Time) {
		userRef := client.Collection("users").Doc(prefix + id)
		if _, err := userRef.Set(ctx, map[string]interface{}{"screen_name": "screen" + id}, firestore.MergeAll); err != nil {
			t.Fatalf("seed user: %v", err)
		}
		if _, _, err := userRef.Collection(battleLogsCollection).Add(ctx, map[string]interface{}{
			"add_point": point, "timestamp": at,
		}); err != nil {
			t.Fatalf("seed log: %v", err)
		}
	}

	// 週が月をまたぐ日もあるため、期待値が境界に依存しないよう「週初と月初の
	// 遅い方」を基準にする。ここより後のログは週間・月間の両方に入る。
	inBoth := weekStart
	if monthStart.After(inBoth) {
		inBoth = monthStart
	}
	inBoth = inBoth.Add(time.Hour)

	seed("a", 40, inBoth)
	seed("a", 60, inBoth.Add(time.Minute))
	seed("a", 9999, now.AddDate(-2, 0, 0)) // 期間外
	seed("b", 30, inBoth)

	week, month, err := aggregateBattlePoints(ctx, client, weekStart, monthStart)
	if err != nil {
		t.Fatalf("aggregateBattlePoints: %v", err)
	}
	if got := week[prefix+"a"]; got != 100 {
		t.Errorf("週間のaの合計 = %d, want 100(期間外の9999は入らない)", got)
	}
	if got := month[prefix+"a"]; got != 100 {
		t.Errorf("月間のaの合計 = %d, want 100", got)
	}
	if got := week[prefix+"b"]; got != 30 {
		t.Errorf("週間のbの合計 = %d, want 30", got)
	}
}

func TestAggregateBattlePoints_UnaffectedByStatusRecompute(t *testing.T) {
	// この機能の要。status.total は表示用キャッシュでもあり、プロフィール閲覧や
	// バックフィルで参拝と無関係に書き換わる。ログ方式ではその書き換えが期間
	// ランキングに一切影響しないこと(以前は「期間中に伸びた」と誤計上された)。
	client := emulatorClient(t)
	ctx := context.Background()

	weekStart, monthStart, _, _ := periodBounds(time.Now())

	// 4年前を最後に参拝しているユーザー。獲得ログは期間内に無い。
	userRef := client.Collection("users").Doc("TestRecompute_dormant")
	if _, err := userRef.Set(ctx, map[string]interface{}{
		"screen_name": "dormant",
		"status":      map[string]interface{}{"total": int64(588)},
	}); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	before, _, err := aggregateBattlePoints(ctx, client, weekStart, monthStart)
	if err != nil {
		t.Fatalf("aggregateBattlePoints: %v", err)
	}

	// キャッシュの再計算(statusGo の書き戻し相当)で status.total が動く。
	if _, err := userRef.Update(ctx, []firestore.Update{
		{Path: "status.total", Value: int64(633)},
	}); err != nil {
		t.Fatalf("recompute: %v", err)
	}

	after, _, err := aggregateBattlePoints(ctx, client, weekStart, monthStart)
	if err != nil {
		t.Fatalf("aggregateBattlePoints: %v", err)
	}
	if after["TestRecompute_dormant"] != 0 {
		t.Errorf("キャッシュ再計算は伸び幅にならない: %d", after["TestRecompute_dormant"])
	}
	if len(after) != len(before) {
		t.Errorf("再計算で対象者が増えてはいけない: before=%d after=%d", len(before), len(after))
	}
}

func TestAppendBattleLog_SkipsNonPositive(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	userRef := client.Collection("users").Doc("TestAppendBattleLog_u")

	for _, gain := range []int{0, -5} {
		if err := appendBattleLog(ctx, userRef, gain); err != nil {
			t.Fatalf("appendBattleLog(%d): %v", gain, err)
		}
	}
	docs, err := userRef.Collection(battleLogsCollection).Documents(ctx).GetAll()
	if err != nil {
		t.Fatalf("GetAll: %v", err)
	}
	if len(docs) != 0 {
		t.Errorf("伸びていない参拝はログを積まない: %d件", len(docs))
	}

	if err := appendBattleLog(ctx, userRef, 12); err != nil {
		t.Fatalf("appendBattleLog: %v", err)
	}
	docs, err = userRef.Collection(battleLogsCollection).Documents(ctx).GetAll()
	if err != nil {
		t.Fatalf("GetAll: %v", err)
	}
	if len(docs) != 1 {
		t.Fatalf("伸びた参拝はログを積む: %d件", len(docs))
	}
	if got := docs[0].Data()["add_point"]; got != int64(12) {
		t.Errorf("add_point = %v, want 12", got)
	}
}
