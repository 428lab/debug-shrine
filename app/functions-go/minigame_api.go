// ミニゲームのランキングと実績のエンドポイント(minigameGo)。決まりは minigame.go。
//
//	GET  ?board={id}&period=all|week|month[&me={github_id}]  ランキング上位(既定 50 件)と自分の順位
//	GET  ?achievements=1[&me={github_id}]                    実績の一覧と、持っている実績・ベスト
//	POST {github_id, game, score, ...}(Bearer 必須)          1 回遊んだ結果を送る
//
// 保存先:
//   - minigame_boards/{board}__{期間キー}/scores/{github_id}: 期間ごとのベスト(1 人 1 件)
//   - users/{github_id}/minigame/state: 回数・累計・持っている実績(mgState)
//
// 送信は本人だけ(IDトークンの UID とユーザーの auth_user_uid の一致。pinned_repos.go と同じ)。
// ログインしていない人の点数は記録しない。
package gofunctions

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"cloud.google.com/go/firestore"
	"cloud.google.com/go/firestore/apiv1/firestorepb"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	"google.golang.org/grpc/codes"
	grpcstatus "google.golang.org/grpc/status"
)

func init() {
	functions.HTTP("MinigameGo", minigameHandler)
}

const mgDefaultLimit = 50

// mgTieMargin はランキングを読む時に多めに読む件数(境目の同点のため)。
const mgTieMargin = 20

func minigameHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		w.WriteHeader(http.StatusNoContent)
		return
	}
	ctx := r.Context()
	switch r.Method {
	case http.MethodGet:
		client, err := getFirestoreClient(ctx)
		if err != nil {
			log.Printf("minigame: getFirestoreClient error: %v", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		q := r.URL.Query()
		if q.Get("achievements") != "" {
			err = runMinigameAchievements(ctx, w, client, q.Get("me"))
		} else {
			limit, _ := strconv.Atoi(q.Get("limit"))
			err = runMinigameRanking(ctx, w, client, q.Get("board"), q.Get("period"), q.Get("me"), limit, time.Now())
		}
		if err != nil {
			log.Printf("minigame: %v", err)
			writeError(w, http.StatusInternalServerError, "internal error")
		}
	case http.MethodPost:
		minigameSubmitHandler(w, r)
	default:
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed"})
	}
}

func minigameSubmitHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var body mgSubmit
	if err := decodeJSONBody(r, &body); err != nil {
		log.Printf("minigame: decodeJSONBody error: %v", err)
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "failed"})
		return
	}
	if body.GithubID == "" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed parameter"})
		return
	}
	token, ok := extractBearerToken(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "authorization missing."})
		return
	}
	authClient, err := getFirebaseAuthClient(ctx)
	if err != nil {
		log.Printf("minigame: getFirebaseAuthClient error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	decoded, err := authClient.VerifyIDToken(ctx, token)
	if err != nil {
		log.Printf("minigame: VerifyIDToken error: %v", err)
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "authorization missing."})
		return
	}
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("minigame: getFirestoreClient error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err := runMinigameSubmit(ctx, w, client, body, decoded.UID, time.Now()); err != nil {
		log.Printf("minigame: submit: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
	}
}

var errMgTooFast = errors.New("too fast")

// runMinigameSubmit は 1 回分の結果を記録し、期間ごとの順位と、新しく取った実績を返す。
func runMinigameSubmit(ctx context.Context, w http.ResponseWriter, client *firestore.Client, body mgSubmit, authUID string, now time.Time) error {
	userRef := client.Collection("users").Doc(body.GithubID)
	userSnap, err := userRef.Get(ctx)
	if err != nil {
		if grpcstatus.Code(err) == codes.NotFound {
			writeJSON(w, http.StatusOK, map[string]string{"status": "failed", "message": "not registered"})
			return nil
		}
		return err
	}
	var user struct {
		AuthUserUID string `firestore:"auth_user_uid"`
	}
	if err := userSnap.DataTo(&user); err != nil {
		return err
	}
	if user.AuthUserUID == "" || user.AuthUserUID != authUID {
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "forbidden"})
		return nil
	}

	board, run, reason := mgCheck(body)
	if reason != "" {
		log.Printf("minigame: rejected %s: %s (%+v)", body.GithubID, reason, body)
		writeJSON(w, http.StatusOK, map[string]string{"status": "rejected", "message": reason})
		return nil
	}

	keys := mgPeriodKeys(now)
	stateRef := userRef.Collection("minigame").Doc("state")
	scoreRefs := map[string]*firestore.DocumentRef{}
	for _, p := range mgPeriods {
		scoreRefs[p] = client.Collection("minigame_boards").Doc(mgBoardDocID(board, keys[p])).Collection("scores").Doc(body.GithubID)
	}

	var unlocked []mgAchievementDef
	var st mgState
	bests := map[string]int64{}
	newBest := map[string]bool{}
	err = client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		unlocked = nil
		st = mgState{}
		// 記録と期間ごとのベストを 1 回で読む(無いものは Exists() が false)
		refs := []*firestore.DocumentRef{stateRef}
		for _, p := range mgPeriods {
			refs = append(refs, scoreRefs[p])
		}
		snaps, err := tx.GetAll(refs)
		if err != nil {
			return err
		}
		if snaps[0].Exists() {
			if err := snaps[0].DataTo(&st); err != nil {
				return err
			}
		}
		if !st.LastSubmitAt.IsZero() && now.Sub(st.LastSubmitAt) < mgMinInterval {
			return errMgTooFast
		}
		prev := map[string]int64{}
		for i, p := range mgPeriods {
			snap := snaps[i+1]
			if !snap.Exists() {
				prev[p] = -1
				continue
			}
			v, _ := snap.DataAt("score")
			n, _ := v.(int64)
			prev[p] = n
		}

		mgApply(&st, body, board, run, now)
		unlocked = mgUnlock(&st, mgFacts(&st, run), now)

		for _, p := range mgPeriods {
			bests[p] = prev[p]
			newBest[p] = body.Score > prev[p]
			if !newBest[p] {
				continue
			}
			bests[p] = body.Score
			// 名前やアイコンは持たない(変わることがあるので、読む時にユーザーから引く)
			if err := tx.Set(scoreRefs[p], map[string]interface{}{
				"score":      body.Score,
				"updated_at": now,
			}); err != nil {
				return err
			}
		}
		return tx.Set(stateRef, st)
	})
	if errors.Is(err, errMgTooFast) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "too_fast"})
		return nil
	}
	if err != nil {
		return err
	}

	// 期間ごとの順位(自分のベストより高い人の数 + 1)
	ranks := map[string]interface{}{}
	for _, p := range mgPeriods {
		rank, err := mgRankOf(ctx, client, board, keys[p], bests[p])
		if err != nil {
			return err
		}
		ranks[p] = map[string]interface{}{"rank": rank, "best": bests[p], "new_best": newBest[p]}
	}
	if unlocked == nil {
		unlocked = []mgAchievementDef{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":       "success",
		"board":        board,
		"ranks":        ranks,
		"unlocked":     unlocked,
		"achievements": mgAchievementIDs(&st),
	})
	return nil
}

func mgAchievementIDs(st *mgState) []string {
	ids := []string{}
	for _, d := range mgAchievementDefs {
		if _, ok := st.Achievements[d.ID]; ok {
			ids = append(ids, d.ID)
		}
	}
	return ids
}

// mgRankOf は点数 score の順位(より高い人の数 + 1)。
func mgRankOf(ctx context.Context, client *firestore.Client, board, periodKey string, score int64) (int64, error) {
	q := client.Collection("minigame_boards").Doc(mgBoardDocID(board, periodKey)).Collection("scores").Where("score", ">", score)
	res, err := q.NewAggregationQuery().WithCount("n").Get(ctx)
	if err != nil {
		return 0, err
	}
	v, ok := res["n"].(*firestorepb.Value)
	if !ok {
		return 0, errors.New("minigame: count result missing")
	}
	return v.GetIntegerValue() + 1, nil
}

// runMinigameRanking はランキングの上位と、me があればその人の順位を返す。
func runMinigameRanking(ctx context.Context, w http.ResponseWriter, client *firestore.Client, board, period, me string, limit int, now time.Time) error {
	if !mgValidBoard(board) || !mgContains(mgPeriods, period) {
		writeError(w, http.StatusBadRequest, "bad board or period")
		return nil
	}
	if limit <= 0 || limit > 100 {
		limit = mgDefaultLimit
	}
	key := mgPeriodKeys(now)[period]
	scores := client.Collection("minigame_boards").Doc(mgBoardDocID(board, key)).Collection("scores")
	// 同点は先に出した人が上。Firestore は同点を id 順で返すので、境目の同点の人を
	// 取りこぼさないよう少し多めに読んで、並べ直してから切る
	docs, err := scores.OrderBy("score", firestore.Desc).Limit(limit + mgTieMargin).Documents(ctx).GetAll()
	if err != nil {
		return err
	}
	entries := make([]mgEntry, 0, len(docs))
	userRefs := make([]*firestore.DocumentRef, 0, len(docs))
	for _, d := range docs {
		var e struct {
			Score     int64     `firestore:"score"`
			UpdatedAt time.Time `firestore:"updated_at"`
		}
		if err := d.DataTo(&e); err != nil {
			return err
		}
		entries = append(entries, mgEntry{Score: e.Score, UpdatedAt: e.UpdatedAt, ID: d.Ref.ID})
		userRefs = append(userRefs, client.Collection("users").Doc(d.Ref.ID))
	}
	// 名前・アイコンはユーザーから引く(変えた人は新しいものに、退会した人は載せない)
	if len(userRefs) > 0 {
		users, err := client.GetAll(ctx, userRefs)
		if err != nil {
			return err
		}
		kept := entries[:0]
		for i, u := range users {
			if !u.Exists() {
				continue
			}
			var p rankingProfile
			p.DisplayName, _ = mgString(u, "display_name")
			p.ScreenName, _ = mgString(u, "screen_name")
			p.ImagePath, _ = mgString(u, "image_path")
			if p.ScreenName == "" {
				continue
			}
			e := entries[i]
			e.DisplayName, e.ScreenName, e.ImagePath = p.DisplayName, p.ScreenName, p.ImagePath
			kept = append(kept, e)
		}
		entries = kept
	}
	entries = mgRankEntries(entries)
	if len(entries) > limit {
		entries = entries[:limit]
	}

	resp := map[string]interface{}{
		"status":     "success",
		"board":      board,
		"period":     period,
		"period_key": key,
		"entries":    entries,
	}
	if me != "" {
		snap, err := scores.Doc(me).Get(ctx)
		if err != nil && grpcstatus.Code(err) != codes.NotFound {
			return err
		}
		if err == nil {
			v, _ := snap.DataAt("score")
			n, _ := v.(int64)
			rank, err := mgRankOf(ctx, client, board, key, n)
			if err != nil {
				return err
			}
			resp["me"] = map[string]interface{}{"rank": rank, "score": n}
		}
		w.Header().Set("Cache-Control", "private, no-store")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=30, s-maxage=60")
	}
	writeJSON(w, http.StatusOK, resp)
	return nil
}

// runMinigameAchievements は実績の一覧と、me があればその人が持っている実績・ベストを返す。
func runMinigameAchievements(ctx context.Context, w http.ResponseWriter, client *firestore.Client, me string) error {
	resp := map[string]interface{}{
		"status": "success",
		"defs":   mgAchievementDefs,
	}
	if me != "" {
		st, err := loadMgState(ctx, client.Collection("users").Doc(me))
		if err != nil {
			return err
		}
		best := st.Best
		if best == nil {
			best = map[string]int64{}
		}
		resp["achievements"] = mgAchievementIDs(st)
		resp["best"] = best
		w.Header().Set("Cache-Control", "private, no-store")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=300")
	}
	writeJSON(w, http.StatusOK, resp)
	return nil
}

// loadMgState は users/{id}/minigame/state を読む。無ければ空。
func loadMgState(ctx context.Context, userRef *firestore.DocumentRef) (*mgState, error) {
	st := &mgState{}
	snap, err := userRef.Collection("minigame").Doc("state").Get(ctx)
	if err != nil {
		if grpcstatus.Code(err) == codes.NotFound {
			return st, nil
		}
		return nil, err
	}
	if err := snap.DataTo(st); err != nil {
		return nil, err
	}
	return st, nil
}

func mgString(snap *firestore.DocumentSnapshot, field string) (string, bool) {
	v, err := snap.DataAt(field)
	if err != nil {
		return "", false
	}
	str, ok := v.(string)
	return str, ok
}
