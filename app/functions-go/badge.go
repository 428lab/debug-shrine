// README埋め込みバッジ(SVG)エンドポイント。
//
// shields.io 風のフラットバッジをSVGで生成する。GitHubのREADMEに
//
//	[![でばっぐ神社](https://d-shrine.jp/badgeGo?user=X)](https://d-shrine.jp/u/X)
//
// と貼ると「⛩ でばっぐ神社 | Lv.42 戦闘力 9999」が表示され、公開プロフィール
// への導線になる。値は statusGo が書く status キャッシュ(level/total)から
// 読むため、追加の重い集計は行わない。
package gofunctions

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
)

func init() {
	functions.HTTP("BadgeGo", badgeHandler)
}

func badgeHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	screenName := r.URL.Query().Get("user")
	if screenName == "" {
		writeError(w, http.StatusBadRequest, "user is required")
		return
	}

	ctx := r.Context()
	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("badge: getFirestoreClient error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := runBadge(ctx, w, client, screenName); err != nil {
		log.Printf("badge: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
	}
}

func runBadge(ctx context.Context, w http.ResponseWriter, client *firestore.Client, screenName string) error {
	userDoc, err := findUserByScreenName(ctx, client, screenName)
	if err != nil {
		return err
	}

	// README内の画像はステータスコードが200以外だと壊れた画像アイコンになるため、
	// 未登録ユーザーにも200で「未登録」バッジを返す(キャッシュは短め)。
	if userDoc == nil {
		writeBadgeSVG(w, badgeContent{Value: "未登録"}, time.Minute*5)
		return nil
	}

	level := readCachedLevel(userDoc)
	total := readCachedTotal(userDoc)
	content := badgeContent{}
	if level > 0 || total > 0 {
		content.Value = fmt.Sprintf("Lv.%d 戦闘力 %d", level, total)
	} else {
		// statusキャッシュ未計算(未参拝 or 旧ユーザー)。参拝を促す。
		content.Value = "参拝求ム"
	}

	// バッジはREADME閲覧のたびに読み込まれる。値の鮮度は重要でないため
	// CDNに長めに載せ、関数・Firestoreへの到達を抑える。
	writeBadgeSVG(w, content, time.Hour)
	return nil
}

// readCachedTotal は status キャッシュから戦闘力(total)を取り出す。
func readCachedTotal(userDoc *firestore.DocumentSnapshot) int {
	v, err := userDoc.DataAt("status.total")
	if err != nil {
		return 0
	}
	if n, ok := v.(int64); ok {
		return int(n)
	}
	return 0
}

type badgeContent struct {
	Value string // 右側(色付き)セグメントの文言
}

func writeBadgeSVG(w http.ResponseWriter, content badgeContent, ttl time.Duration) {
	svg := renderBadgeSVG("でばっぐ神社", content.Value)
	w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
	w.Header().Set("Cache-Control", fmt.Sprintf(
		"public, max-age=%d, s-maxage=%d, stale-while-revalidate=86400",
		int(ttl.Seconds()), int(ttl.Seconds()),
	))
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(svg))
}

// estimateBadgeTextWidth は Verdana 11px 相当の表示幅を概算する。
// shields.io は実測メトリクスを持つが、ここでは ASCII≈7px・全角≈12px の
// 近似で十分(バッジ内テキストは短く、多少の誤差は余白で吸収される)。
func estimateBadgeTextWidth(s string) int {
	width := 0
	for _, r := range s {
		if r <= 0x7F {
			width += 7
		} else {
			width += 12
		}
	}
	return width
}

// renderBadgeSVG は shields.io フラットスタイル風のバッジSVGを生成する。
// 左: 鳥居アイコン+ラベル(グレー)、右: 値(神社の朱色)。
func renderBadgeSVG(label, value string) string {
	const (
		height   = 20
		pad      = 6  // セグメント両端の余白
		iconW    = 13 // 鳥居アイコンの幅
		iconGap  = 4  // アイコンとラベルの間
		labelBG  = "#555"
		valueBG  = "#c9302c" // 神社の朱色
		textFill = "#fff"
	)
	labelTextW := estimateBadgeTextWidth(label)
	valueTextW := estimateBadgeTextWidth(value)
	labelW := pad + iconW + iconGap + labelTextW + pad
	valueW := pad + valueTextW + pad
	totalW := labelW + valueW

	labelX := pad + iconW + iconGap + labelTextW/2
	valueX := labelW + valueW/2

	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" role="img" aria-label="%s: %s">`,
		totalW, height, escapeXML(label), escapeXML(value))
	fmt.Fprintf(&b, `<title>%s: %s</title>`, escapeXML(label), escapeXML(value))
	// 角丸クリップ
	fmt.Fprintf(&b, `<clipPath id="r"><rect width="%d" height="%d" rx="3" fill="#fff"/></clipPath>`, totalW, height)
	fmt.Fprintf(&b, `<g clip-path="url(#r)">`)
	fmt.Fprintf(&b, `<rect width="%d" height="%d" fill="%s"/>`, labelW, height, labelBG)
	fmt.Fprintf(&b, `<rect x="%d" width="%d" height="%d" fill="%s"/>`, labelW, valueW, height, valueBG)
	// shields風の上部ハイライト
	fmt.Fprintf(&b, `<rect width="%d" height="%d" fill="url(#s)"/>`, totalW, height)
	fmt.Fprintf(&b, `</g>`)
	fmt.Fprintf(&b, `<linearGradient id="s" x2="0" y2="100%%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>`)
	// 鳥居アイコン(笠木・島木・柱2本・額束)
	fmt.Fprintf(&b, `<g fill="%s" transform="translate(%d,4)">`, textFill, pad)
	b.WriteString(`<rect x="0" y="0" width="13" height="2" rx="0.5"/>`)   // 笠木
	b.WriteString(`<rect x="1.5" y="3.6" width="10" height="1.4"/>`)      // 島木(貫)
	b.WriteString(`<rect x="2.2" y="3.6" width="1.7" height="8.4"/>`)     // 左柱
	b.WriteString(`<rect x="9.1" y="3.6" width="1.7" height="8.4"/>`)     // 右柱
	b.WriteString(`<rect x="5.8" y="1.6" width="1.4" height="2.4"/>`)     // 額束
	b.WriteString(`</g>`)
	// テキスト(shields同様に影を敷いて読みやすく)
	font := `font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"`
	fmt.Fprintf(&b, `<g fill="%s" text-anchor="middle" %s>`, textFill, font)
	fmt.Fprintf(&b, `<text x="%d" y="15" fill="#010101" fill-opacity=".3">%s</text><text x="%d" y="14">%s</text>`,
		labelX, escapeXML(label), labelX, escapeXML(label))
	fmt.Fprintf(&b, `<text x="%d" y="15" fill="#010101" fill-opacity=".3">%s</text><text x="%d" y="14">%s</text>`,
		valueX, escapeXML(value), valueX, escapeXML(value))
	b.WriteString(`</g></svg>`)
	return b.String()
}

func escapeXML(s string) string {
	r := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&apos;",
	)
	return r.Replace(s)
}
