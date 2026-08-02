// 過去ランキング(締め済みアーカイブ)の配信エンドポイント。
//
//	GET rankingArchiveGo?type=week            → 期間の一覧(新しい順)
//	GET rankingArchiveGo?type=week&period=... → その期間の確定結果(上位10件)
//
// 締め済みの結果は二度と変わらないので、CDNに長めに置く。
package gofunctions

import (
	"context"
	"log"
	"net/http"
	"strconv"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	grpcstatus "google.golang.org/grpc/status"
)

func init() {
	functions.HTTP("RankingArchiveGo", rankingArchiveHandler)
}

// archiveListDefaultLimit は一覧のデフォルト件数(週なら約半年分)。
const archiveListDefaultLimit = 26

// archiveListMaxLimit は一覧の上限。ドキュメントを読む数がそのまま
// 読み取りコストになるので、際限なく取らせない。
const archiveListMaxLimit = 100

// archivePeriodSummary は一覧の1件。中身(順位表)は含めず、選ぶのに要る情報だけ。
type archivePeriodSummary struct {
	PeriodType string `json:"period_type"`
	PeriodKey  string `json:"period_key"`
	Label      string `json:"label"`
}

type archiveListResponse struct {
	Periods []archivePeriodSummary `json:"periods"`
}

// archiveDetailResponse は1期間の確定結果。
type archiveDetailResponse struct {
	PeriodType string        `json:"period_type"`
	PeriodKey  string        `json:"period_key"`
	Label      string        `json:"label"`
	BattleTop  []periodEntry `json:"battle_top"`
	PointsTop  []periodEntry `json:"points_top"`
}

func rankingArchiveHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	periodType := r.URL.Query().Get("type")
	if periodType != "week" && periodType != "month" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "failed parameter"})
		return
	}

	ctx := r.Context()
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("rankingArchive: getFirestoreClient error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// 締め済みの内容は変わらないので、共有キャッシュに長く置く。
	// 一覧は新しい期間が増えるため、詳細より短くしておく。
	if period := r.URL.Query().Get("period"); period != "" {
		w.Header().Set("Cache-Control", "public, max-age=600, s-maxage=86400, stale-while-revalidate=86400")
		resp, err := loadArchiveDetail(ctx, client, periodType, period)
		if err != nil {
			log.Printf("rankingArchive: loadArchiveDetail error: %v", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if resp == nil {
			writeError(w, http.StatusNotFound, "period not found")
			return
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400")
	resp, err := loadArchiveList(ctx, client, periodType, archiveListLimit(r))
	if err != nil {
		log.Printf("rankingArchive: loadArchiveList error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// archiveListLimit は ?limit= を読み取る(範囲外・不正は既定値)。
func archiveListLimit(r *http.Request) int {
	n, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil || n <= 0 {
		return archiveListDefaultLimit
	}
	if n > archiveListMaxLimit {
		return archiveListMaxLimit
	}
	return n
}

// loadArchiveList は指定種別の期間を新しい順に返す。
// ドキュメントIDが week_2026-07-20 / month_2026-07 の形で辞書順=時系列順に
// なるため、period_key の降順で並べれば新しい順になる。
func loadArchiveList(ctx context.Context, client *firestore.Client, periodType string, limit int) (archiveListResponse, error) {
	resp := archiveListResponse{Periods: []archivePeriodSummary{}}
	iter := client.Collection("ranking_archive").
		Where("period_type", "==", periodType).
		OrderBy("period_key", firestore.Desc).
		Limit(limit).
		Documents(ctx)
	defer iter.Stop()
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			return resp, nil
		}
		if err != nil {
			return archiveListResponse{}, err
		}
		var d rankingArchiveDoc
		if err := doc.DataTo(&d); err != nil {
			// 1件の形が想定外でも一覧全体は返す。ただし黙って消すと
			// 「締めたのに履歴に出ない」の原因が分からなくなるので必ず残す。
			log.Printf("rankingArchive: skip %s: %v", doc.Ref.ID, err)
			continue
		}
		resp.Periods = append(resp.Periods, archivePeriodSummary{
			PeriodType: d.PeriodType,
			PeriodKey:  d.PeriodKey,
			Label:      periodLabel(d.PeriodType, d.StartsAt, d.EndsAt),
		})
	}
}

// loadArchiveDetail は1期間の確定結果を返す。未作成なら nil。
func loadArchiveDetail(ctx context.Context, client *firestore.Client, periodType, periodKey string) (*archiveDetailResponse, error) {
	snap, err := client.Collection("ranking_archive").Doc(archiveDocID(periodType, periodKey)).Get(ctx)
	if err != nil {
		if grpcstatus.Code(err) == codes.NotFound {
			return nil, nil
		}
		return nil, err
	}
	var d rankingArchiveDoc
	if err := snap.DataTo(&d); err != nil {
		return nil, err
	}
	resp := &archiveDetailResponse{
		PeriodType: d.PeriodType,
		PeriodKey:  d.PeriodKey,
		Label:      periodLabel(d.PeriodType, d.StartsAt, d.EndsAt),
		BattleTop:  d.BattleTop,
		PointsTop:  d.PointsTop,
	}
	if resp.BattleTop == nil {
		resp.BattleTop = []periodEntry{}
	}
	if resp.PointsTop == nil {
		resp.PointsTop = []periodEntry{}
	}
	return resp, nil
}

// periodLabel は期間の見出し(純関数)。週は「2026/7/20 〜 7/26」、
// 月は「2026年7月」。終了時刻は期間の"次の開始"なので1日戻して表示する。
func periodLabel(periodType string, start, end time.Time) string {
	s := start.In(jst)
	if periodType == "month" {
		return strconv.Itoa(s.Year()) + "年" + strconv.Itoa(int(s.Month())) + "月"
	}
	e := end.In(jst).AddDate(0, 0, -1)
	label := strconv.Itoa(s.Year()) + "/" + strconv.Itoa(int(s.Month())) + "/" + strconv.Itoa(s.Day()) + " 〜 "
	if s.Year() != e.Year() {
		label += strconv.Itoa(e.Year()) + "/"
	}
	return label + strconv.Itoa(int(e.Month())) + "/" + strconv.Itoa(e.Day())
}
