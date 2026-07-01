package gofunctions

import (
	"context"
	"strconv"
	"testing"
)

func TestRankingUpdate_WritesSortedRankingCache(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()

	// このテスト専用のプレフィックスでユーザーを作成し、他テストと衝突しないようにする。
	prefix := "TestRankingUpdate_"
	points := []int64{300, 300, 100, 500}
	for i, p := range points {
		id := prefix + strconv.Itoa(i)
		if _, err := client.Collection("users").Doc(id).Set(ctx, map[string]interface{}{
			"display_name": "name" + id,
			"screen_name":  "screen" + id,
			"image_path":   "https://example.com/" + id + ".png",
			"status":       map[string]interface{}{"total": p},
		}); err != nil {
			t.Fatalf("failed to seed user %s: %v", id, err)
		}
	}
	// status未計算のユーザーはNode版同様、orderByのフィールド欠落除外でスキップされるはず。
	noStatusID := prefix + "no_status"
	if _, err := client.Collection("users").Doc(noStatusID).Set(ctx, map[string]interface{}{
		"display_name": "no status",
		"screen_name":  "no_status",
	}); err != nil {
		t.Fatalf("failed to seed no-status user: %v", err)
	}

	if err := runRankingUpdate(ctx, client); err != nil {
		t.Fatalf("runRankingUpdate: %v", err)
	}

	doc, err := client.Collection("cache_data").Doc("ranking_cache").Get(ctx)
	if err != nil {
		t.Fatalf("failed to read ranking_cache: %v", err)
	}
	var out struct {
		Ranking []rankingEntry `firestore:"ranking"`
	}
	if err := doc.DataTo(&out); err != nil {
		t.Fatalf("DataTo: %v", err)
	}

	// このテストで作成した4ユーザーだけを screen_name -> entry で抽出する
	// (実運用データ・他テストのユーザーが同居する共有Firestoreを使うテストのため、
	// rankの絶対値や同点ユーザー間の並び順(Firestoreの仕様上不定)には依存しない)。
	byScreenName := map[string]rankingEntry{}
	for _, e := range out.Ranking {
		for i := range points {
			if e.ScreenName == "screen"+prefix+strconv.Itoa(i) {
				byScreenName[e.ScreenName] = e
			}
		}
	}
	if len(byScreenName) != len(points) {
		t.Fatalf("filtered ranking length = %d, want %d (got %+v)", len(byScreenName), len(points), byScreenName)
	}

	e0 := byScreenName["screen"+prefix+"0"] // 300pt
	e1 := byScreenName["screen"+prefix+"1"] // 300pt (e0と同点)
	e2 := byScreenName["screen"+prefix+"2"] // 100pt (最下位)
	e3 := byScreenName["screen"+prefix+"3"] // 500pt (最上位)

	if e0.Rank != e1.Rank {
		t.Errorf("同点(300pt)のユーザーは同じrankになるべき: e0.Rank=%d, e1.Rank=%d", e0.Rank, e1.Rank)
	}
	if !(e3.Rank < e0.Rank) {
		t.Errorf("500ptのrank(%d)は300ptのrank(%d)より良い(小さい)べき", e3.Rank, e0.Rank)
	}
	if !(e0.Rank < e2.Rank) {
		t.Errorf("300ptのrank(%d)は100ptのrank(%d)より良い(小さい)べき", e0.Rank, e2.Rank)
	}

	for _, e := range out.Ranking {
		if e.ScreenName == "no_status" {
			t.Errorf("status未計算のユーザーがrankingに含まれるべきではない: %+v", e)
		}
	}
}
