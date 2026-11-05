package gofunctions

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
)

func TestHfGithubMatches(t *testing.T) {
	cases := []struct {
		hf, screen string
		want       bool
	}{
		{"kojira", "kojira", true},
		{"Kojira", "kojira", true},
		{"@kojira", "kojira", true},
		{"https://github.com/kojira/", "kojira", true},
		{"kojira2", "kojira", false},
		{"", "kojira", false},
		{"  ", "", false},
	}
	for _, c := range cases {
		if got := hfGithubMatches(c.hf, c.screen); got != c.want {
			t.Errorf("hfGithubMatches(%q, %q) = %v, want %v", c.hf, c.screen, got, c.want)
		}
	}
}

func TestAggregateHfRepos(t *testing.T) {
	models := []hfRepo{
		{ID: "u/a", LastModified: "2026-10-01T00:00:00.000Z", Likes: 3, Downloads: 10, DownloadsAllTime: 100},
		{ID: "u/b", LastModified: "2026-08-01T00:00:00.000Z", Likes: 1, Downloads: 5}, // 累計が無ければ直近 30 日
	}
	datasets := []hfRepo{{ID: "u/d", LastModified: "2026-09-01T00:00:00.000Z", Likes: 2, DownloadsAllTime: 7}}
	spaces := []hfRepo{{ID: "u/s", LastModified: "2026-11-01T00:00:00.000Z", Likes: 4}}
	s := aggregateHfRepos(models, datasets, spaces)
	if s.LikesTotal != 10 || s.DownloadsTotal != 112 {
		t.Errorf("合計 likes=%d downloads=%d", s.LikesTotal, s.DownloadsTotal)
	}
	got := []string{}
	for _, r := range s.Recent {
		got = append(got, r.Kind+":"+r.ID)
	}
	if strings.Join(got, ",") != "space:u/s,model:u/a,dataset:u/d,model:u/b" {
		t.Errorf("最近更新した順 = %v", got)
	}
	if s.Recent[0].URL != "https://huggingface.co/spaces/u/s" || s.Recent[2].URL != "https://huggingface.co/datasets/u/d" || s.Recent[1].URL != "https://huggingface.co/u/a" {
		t.Errorf("URL = %+v", s.Recent)
	}
	if len(aggregateHfRepos(nil, nil, nil).Recent) != 0 {
		t.Error("空なら最近も空")
	}
}

// fakeHf は HF の公開 API のふり(ユーザー名 → GitHub 名)。
func fakeHf(t *testing.T, github map[string]string) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		switch {
		case strings.HasPrefix(p, "/api/users/") && strings.HasSuffix(p, "/socials"):
			user := strings.TrimSuffix(strings.TrimPrefix(p, "/api/users/"), "/socials")
			gh, ok := github[user]
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			json.NewEncoder(w).Encode(map[string]interface{}{"socialHandles": map[string]string{"github": gh}})
		case strings.HasSuffix(p, "/overview"):
			json.NewEncoder(w).Encode(map[string]interface{}{"numModels": 2, "numDatasets": 1, "numSpaces": 0, "numFollowers": 5, "createdAt": "2022-09-02T18:52:13.000Z"})
		case p == "/api/models":
			if r.URL.Query().Get("author") == "" || len(r.URL.Query()["expand[]"]) == 0 {
				t.Errorf("一覧の問い合わせ = %s", r.URL.RawQuery)
			}
			json.NewEncoder(w).Encode([]hfRepo{{ID: "x/m", LastModified: "2026-10-15T09:58:50.000Z", Likes: 1, Downloads: 345, DownloadsAllTime: 2054}})
		case p == "/api/datasets", p == "/api/spaces":
			w.Write([]byte("[]"))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(srv.Close)
	old := hfAPIBaseURL
	hfAPIBaseURL = srv.URL
	t.Cleanup(func() { hfAPIBaseURL = old })
}

func TestFetchHf(t *testing.T) {
	fakeHf(t, map[string]string{"hfme": "MyGithub"})
	ctx := context.Background()
	gh, found, err := fetchHfGithubHandle(ctx, "hfme")
	if err != nil || !found || gh != "MyGithub" {
		t.Fatalf("socials = %q %v %v", gh, found, err)
	}
	if _, found, err := fetchHfGithubHandle(ctx, "nobody"); err != nil || found {
		t.Errorf("いないユーザー: found=%v err=%v", found, err)
	}
	s, err := fetchHfStats(ctx, "hfme")
	if err != nil {
		t.Fatal(err)
	}
	if s.Models != 2 || s.Datasets != 1 || s.Followers != 5 || s.DownloadsTotal != 2054 || len(s.Recent) != 1 {
		t.Errorf("実績 = %+v", s)
	}
}

// Firestore エミュレータでの、ひも付け → 表示 → 外す
func TestHfLinkAndStats(t *testing.T) {
	client := emulatorClient(t)
	ctx := context.Background()
	fakeHf(t, map[string]string{"hfok": "hfScreen", "hfother": "someoneelse"})

	id := "TestHfLink_user"
	if _, err := client.Collection("users").Doc(id).Set(ctx, map[string]interface{}{
		"screen_name": "hfscreen", "auth_user_uid": "uid1",
	}); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	post := func(hfUser, uid string) map[string]interface{} {
		t.Helper()
		rec := httptest.NewRecorder()
		if err := runHfLink(ctx, rec, client, id, hfUser, uid, now); err != nil {
			t.Fatal(err)
		}
		var res map[string]interface{}
		json.Unmarshal(rec.Body.Bytes(), &res)
		return res
	}
	get := func() hfStatsResponse {
		t.Helper()
		rec := httptest.NewRecorder()
		if err := runHfStats(ctx, rec, client, "hfscreen", now); err != nil {
			t.Fatal(err)
		}
		var res hfStatsResponse
		json.Unmarshal(rec.Body.Bytes(), &res)
		return res
	}

	if res := post("hfok", "uid-of-someone-else"); res["status"] != "forbidden" {
		t.Errorf("他人のトークンで書けた: %v", res)
	}
	if res := post("hfother", "uid1"); res["status"] != "failed" {
		t.Errorf("GitHub 名が違う HF のユーザーにひも付けられた: %v", res)
	}
	if res := post("nobody", "uid1"); res["status"] != "failed" {
		t.Errorf("いない HF のユーザーにひも付けられた: %v", res)
	}
	if res := get(); res.Linked {
		t.Errorf("ひも付ける前に表示された: %+v", res)
	}
	if res := post("hfok", "uid1"); res["status"] != "success" {
		t.Fatalf("ひも付けられない: %v", res)
	}
	if res := get(); !res.Linked || res.HfUser != "hfok" || res.Stats == nil || res.Stats.Models != 2 {
		t.Errorf("ひも付けた後の表示 = %+v", res)
	}
	// キャッシュが古くなってから、HF 側の GitHub 名が変わっていたら表示しない
	if _, err := client.Collection("users").Doc(id).Update(ctx, []firestore.Update{{Path: "hf_stats_fetched_at", Value: now.Add(-7 * time.Hour)}}); err != nil {
		t.Fatal(err)
	}
	fakeHf(t, map[string]string{"hfok": "changed"})
	if res := get(); res.Linked || !res.Mismatch {
		t.Errorf("GitHub 名が変わったのに表示された: %+v", res)
	}
	if res := post("", "uid1"); res["status"] != "success" {
		t.Errorf("外せない: %v", res)
	}
	if res := get(); res.Linked || res.Mismatch || res.HfUser != "" {
		t.Errorf("外した後 = %+v", res)
	}
}
