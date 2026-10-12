package gofunctions

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
)

// Firestore エミュレータが必要(FIRESTORE_EMULATOR_HOST 未設定ならスキップ)。

func decodeMgResp(t *testing.T, rec *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var m map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("unmarshal: %v (body=%s)", err, rec.Body.String())
	}
	return m
}

func TestMinigame_SubmitRankingAchievements(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, jst)
	keys := mgPeriodKeys(now)

	users := map[string]string{"mg-user-1": "uid-1", "mg-user-2": "uid-2"}
	for id, uid := range users {
		ref := client.Collection("users").Doc(id)
		if _, err := ref.Set(ctx, map[string]interface{}{"screen_name": id + "-name", "display_name": id, "image_path": "x.png", "auth_user_uid": uid}); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	t.Cleanup(func() {
		c := context.Background()
		for id := range users {
			client.Collection("users").Doc(id).Collection("minigame").Doc("state").Delete(c)
			client.Collection("users").Doc(id).Delete(c)
			for _, p := range mgPeriods {
				client.Collection("minigame_boards").Doc(mgBoardDocID("typo", keys[p])).Collection("scores").Doc(id).Delete(c)
			}
		}
	})

	submit := func(id, uid string, score int64, at time.Time) map[string]interface{} {
		rec := httptest.NewRecorder()
		body := mgSubmit{GithubID: id, Game: "typo", Score: score, DurationMs: 120000, Fixed: 40, MaxCombo: 35}
		if err := runMinigameSubmit(ctx, rec, client, body, uid, at); err != nil {
			t.Fatalf("submit: %v", err)
		}
		return decodeMgResp(t, rec)
	}

	// 他人の UID では送れない
	if m := submit("mg-user-1", "uid-2", 100, now); m["status"] != "forbidden" {
		t.Fatalf("other uid: %v", m)
	}

	m := submit("mg-user-1", "uid-1", 9000, now)
	if m["status"] != "success" {
		t.Fatalf("submit 1: %v", m)
	}
	unlocked := m["unlocked"].([]interface{})
	ids := []string{}
	for _, u := range unlocked {
		ids = append(ids, u.(map[string]interface{})["id"].(string))
	}
	if !equalStrings(ids, []string{"typo_first", "typo_3000", "typo_8000", "typo_combo30"}) {
		t.Fatalf("unlocked: %v", ids)
	}

	// 続けて送ると連打よけで弾かれる
	if m := submit("mg-user-1", "uid-1", 9500, now.Add(time.Second)); m["status"] != "too_fast" {
		t.Fatalf("too fast: %v", m)
	}

	m = submit("mg-user-2", "uid-2", 12000, now.Add(time.Minute))
	week := m["ranks"].(map[string]interface{})["week"].(map[string]interface{})
	if week["rank"].(float64) != 1 || week["new_best"] != true {
		t.Fatalf("user2 week: %v", week)
	}

	// 下がった点ではベストは変わらない
	m = submit("mg-user-1", "uid-1", 500, now.Add(2*time.Minute))
	all := m["ranks"].(map[string]interface{})["all"].(map[string]interface{})
	if all["rank"].(float64) != 2 || all["best"].(float64) != 9000 || all["new_best"] != false {
		t.Fatalf("user1 all: %v", all)
	}
	if len(m["unlocked"].([]interface{})) != 0 {
		t.Fatalf("unlocked again: %v", m["unlocked"])
	}

	// ランキング
	rec := httptest.NewRecorder()
	if err := runMinigameRanking(ctx, rec, client, "typo", "week", "mg-user-1", 0, now); err != nil {
		t.Fatalf("ranking: %v", err)
	}
	r := decodeMgResp(t, rec)
	entries := r["entries"].([]interface{})
	if len(entries) != 2 {
		t.Fatalf("entries: %v", entries)
	}
	first := entries[0].(map[string]interface{})
	if first["screen_name"] != "mg-user-2-name" || first["score"].(float64) != 12000 || first["rank"].(float64) != 1 {
		t.Fatalf("first: %v", first)
	}
	me := r["me"].(map[string]interface{})
	if me["rank"].(float64) != 2 || me["score"].(float64) != 9000 {
		t.Fatalf("me: %v", me)
	}

	// 名前を変えたら新しい名前で載る(名前はユーザーから引く)
	if _, err := client.Collection("users").Doc("mg-user-2").Update(ctx, []firestore.Update{{Path: "screen_name", Value: "renamed"}}); err != nil {
		t.Fatalf("rename: %v", err)
	}
	rec = httptest.NewRecorder()
	if err := runMinigameRanking(ctx, rec, client, "typo", "week", "", 0, now); err != nil {
		t.Fatalf("ranking after rename: %v", err)
	}
	if got := decodeMgResp(t, rec)["entries"].([]interface{})[0].(map[string]interface{})["screen_name"]; got != "renamed" {
		t.Fatalf("renamed: %v", got)
	}

	// 次の週は週間ランキングが空、歴代は残る
	rec = httptest.NewRecorder()
	if err := runMinigameRanking(ctx, rec, client, "typo", "week", "", 0, now.AddDate(0, 0, 7)); err != nil {
		t.Fatalf("ranking next week: %v", err)
	}
	if n := len(decodeMgResp(t, rec)["entries"].([]interface{})); n != 0 {
		t.Fatalf("next week entries: %d", n)
	}

	// 実績
	rec = httptest.NewRecorder()
	if err := runMinigameAchievements(ctx, rec, client, "mg-user-1"); err != nil {
		t.Fatalf("achievements: %v", err)
	}
	a := decodeMgResp(t, rec)
	if len(a["achievements"].([]interface{})) != 4 || a["best"].(map[string]interface{})["typo"].(float64) != 9000 {
		t.Fatalf("achievements: %v", a)
	}

	// 不正な board
	rec = httptest.NewRecorder()
	if err := runMinigameRanking(ctx, rec, client, "nope", "week", "", 0, now); err != nil || rec.Code != 400 {
		t.Fatalf("bad board: %v %d", err, rec.Code)
	}
}
