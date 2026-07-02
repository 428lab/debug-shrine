// ユーザーOGP画像生成(userOGP)エンドポイントのGo実装。
//
// Node版(app/functions/index.js の exports.userOGP / createOgp)からの移植。
// コールドスタート短縮とfunction起動課金削減のため Go/Cloud Run functions として
// デプロイする(関数名は userOGPGo)。ogpRewriteGo の og:image をこの関数に向ける。
//
// Node版との差分(意図的な改善):
//   - ベース画像とフォント(Noto Sans JP)をバイナリに同梱(internal/ogpimage)し、
//     実行時のGCSからの base.png ダウンロードを廃止。
//   - レーダーチャートは chartjs-node-canvas(外部プロセス)ではなく
//     Goネイティブ描画(internal/ogpimage)で再現。
//   - 表示名/アイコンは GitHub API ではなく Firestore の display_name / image_path を
//     使用し、GitHub APIへの往復(レート制限リスク)を排除。
//   - 出力を PNG から WebP(可逆VP8L)へ変更しファイルサイズを削減。
//     キャッシュオブジェクトは ogps/{user}.webp。
package gofunctions

import (
	"context"
	"errors"
	"fmt"
	"image"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"time"

	"cloud.google.com/go/firestore"
	"cloud.google.com/go/storage"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"

	"github.com/428lab/debug-shrine/functions-go/internal/ogpimage"
	"github.com/428lab/debug-shrine/functions-go/internal/performance"
)

func init() {
	functions.HTTP("UserOGPGo", userOGPHandler)
}

var userOGPHTTPClient = &http.Client{Timeout: 10 * time.Second}

func userOGPHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	username := r.URL.Query().Get("user")
	if username == "" {
		// Node版と同じく user 未指定は404。
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("user not found."))
		return
	}

	ctx := r.Context()
	bucketName := os.Getenv("STORAGE_BUCKET_NAME")
	if bucketName == "" {
		log.Printf("userOGP: STORAGE_BUCKET_NAME is not set")
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	storageCli, err := getStorageClient(ctx)
	if err != nil {
		log.Printf("userOGP: getStorageClient error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	bucket := storageCli.Bucket(bucketName)
	objectPath := fmt.Sprintf("ogps/%s.webp", username)

	// 既存キャッシュがあればそのURLへ。無ければ生成してからURLを得る。
	exists, err := objectExists(ctx, bucket, objectPath)
	if err != nil {
		log.Printf("userOGP: objectExists error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if !exists {
		status, ok, err := generateAndUploadOGP(ctx, bucket, objectPath, username)
		if err != nil {
			log.Printf("userOGP: generate error: %v", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if !ok {
			// 未登録ユーザー。
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte("user not found."))
			return
		}
		_ = status
	}

	imageURL := ogpImageURL(bucketName, username)
	if os.Getenv("FUNCTIONS_EMULATOR") != "" {
		// エミュレーター上はリダイレクトせずURL文字列を返す(Node版と同じ挙動)。
		_, _ = io.WriteString(w, imageURL)
		return
	}
	http.Redirect(w, r, imageURL, http.StatusFound)
}

func objectExists(ctx context.Context, bucket *storage.BucketHandle, name string) (bool, error) {
	_, err := bucket.Object(name).Attrs(ctx)
	if errors.Is(err, storage.ErrObjectNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// generateAndUploadOGP はユーザーのOGP画像を生成しGCSへアップロードする。
// 未登録ユーザーの場合は ok=false を返す。
func generateAndUploadOGP(ctx context.Context, bucket *storage.BucketHandle, objectPath, screenName string) (performance.FormattedPerformance, bool, error) {
	client, err := getFirestoreClient(ctx)
	if err != nil {
		return performance.FormattedPerformance{}, false, err
	}
	userDoc, err := findUserByScreenName(ctx, client, screenName)
	if err != nil {
		return performance.FormattedPerformance{}, false, err
	}
	if userDoc == nil {
		return performance.FormattedPerformance{}, false, nil
	}

	var userData userDocument
	if err := userDoc.DataTo(&userData); err != nil {
		return performance.FormattedPerformance{}, false, err
	}

	formatted, err := resolveUserStatus(ctx, userDoc, userData, screenName)
	if err != nil {
		return performance.FormattedPerformance{}, false, err
	}

	avatar, err := fetchAvatar(ctx, userData.ImagePath)
	if err != nil {
		return performance.FormattedPerformance{}, false, fmt.Errorf("fetch avatar: %w", err)
	}

	displayName := userData.DisplayName
	if displayName == "" {
		displayName = screenName
	}

	webp, err := ogpimage.EncodeWebP(ogpimage.Params{
		DisplayName:  displayName,
		Avatar:       avatar,
		Level:        formatted.Level,
		Points:       formatted.Points,
		Total:        formatted.Total,
		HP:           formatted.HP,
		Power:        formatted.Power,
		Intelligence: formatted.Intelligence,
		Defence:      formatted.Defence,
		Agility:      formatted.Agility,
	})
	if err != nil {
		return performance.FormattedPerformance{}, false, err
	}

	if err := uploadObject(ctx, bucket, objectPath, "image/webp", webp); err != nil {
		return performance.FormattedPerformance{}, false, err
	}
	return formatted, true, nil
}

// resolveUserStatus は status キャッシュを version 判定つきで解決する。
// 現行バージョンのキャッシュがあれば再利用し、無い/旧版なら再計算して書き戻す
// (status エンドポイントおよびNode版 userOGP と同一のキャッシュ運用)。
func resolveUserStatus(ctx context.Context, userDoc *firestore.DocumentSnapshot, userData userDocument, screenName string) (performance.FormattedPerformance, error) {
	cachedStatus, err := decodeCurrentStatusCache(userDoc, userData.StatusVersion)
	if err != nil {
		return performance.FormattedPerformance{}, err
	}
	if statusCacheIsCurrent(cachedStatus, userData.StatusVersion) {
		return fromFirestoreStatus(*cachedStatus).FormattedPerformance, nil
	}

	activities, err := loadActivities(ctx, userDoc.Ref)
	if err != nil {
		return performance.FormattedPerformance{}, err
	}
	raw := performance.UserPerformance(activities, screenName)
	formatted := performance.UserFormattedPerformance(raw, performance.AppendData{
		Exp: int(userData.Exp),
		User: performance.UserInfo{
			DisplayName:     userData.DisplayName,
			ScreenName:      userData.ScreenName,
			GithubImagePath: userData.ImagePath,
		},
	})
	lastSanpai := formatLastSanpai(userData.LastSanpai)
	if _, err := userDoc.Ref.Update(ctx, []firestore.Update{
		{Path: "status", Value: toFirestoreStatus(formatted, lastSanpai)},
		{Path: "status_version", Value: performance.StatusLogicVersion},
	}); err != nil {
		return performance.FormattedPerformance{}, err
	}
	return formatted, nil
}

func fetchAvatar(ctx context.Context, avatarURL string) (image.Image, error) {
	if avatarURL == "" {
		return nil, errors.New("empty avatar url")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, avatarURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := userOGPHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("avatar fetch status %d", resp.StatusCode)
	}
	img, _, err := image.Decode(resp.Body)
	if err != nil {
		return nil, err
	}
	return img, nil
}

func uploadObject(ctx context.Context, bucket *storage.BucketHandle, name, contentType string, data []byte) error {
	wc := bucket.Object(name).NewWriter(ctx)
	wc.ContentType = contentType
	if _, err := wc.Write(data); err != nil {
		_ = wc.Close()
		return err
	}
	return wc.Close()
}

// ogpImageURL は Firebase Storage のダウンロードURLを返す(Node版 getOgpUrl 相当、拡張子はwebp)。
func ogpImageURL(bucketName, username string) string {
	objectPath := "ogps%2F" + url.QueryEscape(username) + ".webp"
	if host := os.Getenv("FIREBASE_STORAGE_EMULATOR_HOST"); host != "" && os.Getenv("FUNCTIONS_EMULATOR") != "" {
		return fmt.Sprintf("http://%s/download/storage/v1/b/%s/o/%s?alt=media", host, bucketName, objectPath)
	}
	return fmt.Sprintf("https://firebasestorage.googleapis.com/v0/b/%s/o/%s?alt=media", bucketName, objectPath)
}
