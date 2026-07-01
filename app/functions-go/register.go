// ユーザー登録(register)エンドポイントのGo実装。
//
// Node版(app/functions/index.js の exports.register)からの移植であり、
// コールドスタートを短縮するために Go/Cloud Run functions として個別に
// デプロイする(関数名は registerGo。既存の register(Node) とは別関数として
// 共存させ、フロントエンドの切替タイミングを制御できるようにしている)。
//
// 挙動はNode版と同一にすることを優先し、独自の改善は入れていない
// (詳細は docs/backend.md「register エンドポイントのGo移植」を参照)。
package gofunctions

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"cloud.google.com/go/firestore"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	"google.golang.org/grpc/codes"
	grpcstatus "google.golang.org/grpc/status"
)

func init() {
	functions.HTTP("RegisterGo", registerHandler)
}

type registerRequestBody struct {
	GithubID    string `json:"github_id"`
	DisplayName string `json:"display_name"`
	ScreenName  string `json:"screen_name"`
	ImagePath   string `json:"image_path"`
}

func registerHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	ctx := r.Context()

	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "missing request"})
		return
	}

	token, ok := extractBearerToken(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "authorization missing."})
		return
	}

	authClient, err := getFirebaseAuthClient(ctx)
	if err != nil {
		log.Printf("register: getFirebaseAuthClient error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	decoded, err := authClient.VerifyIDToken(ctx, token)
	if err != nil {
		log.Printf("register: VerifyIDToken error: %v", err)
		writeJSON(w, http.StatusForbidden, map[string]string{"status": "authorization missing."})
		return
	}

	var body registerRequestBody
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	if body.GithubID == "" || body.DisplayName == "" || body.ScreenName == "" || body.ImagePath == "" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed parameter"})
		return
	}

	client, err := getFirestoreClient(ctx)
	if err != nil {
		log.Printf("register: getFirestoreClient error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := runRegister(ctx, w, client, body, decoded.UID); err != nil {
		log.Printf("register: runRegister error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
	}
}

func runRegister(ctx context.Context, w http.ResponseWriter, client *firestore.Client, body registerRequestBody, authUID string) error {
	userRef := client.Collection("users").Doc(body.GithubID)
	userSnap, err := userRef.Get(ctx)
	if err != nil && grpcstatus.Code(err) != codes.NotFound {
		return err
	}

	if err != nil {
		// codes.NotFound: 未登録ユーザー
		if _, err := userRef.Set(ctx, map[string]interface{}{
			"github_id":     body.GithubID,
			"display_name":  body.DisplayName,
			"screen_name":   body.ScreenName,
			"image_path":    body.ImagePath,
			"create_at":     firestore.ServerTimestamp,
			"exp":           10,
			"auth_user_uid": authUID,
		}); err != nil {
			return err
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
		return nil
	}

	var userData struct {
		AuthUserUID string `firestore:"auth_user_uid"`
	}
	if err := userSnap.DataTo(&userData); err != nil {
		return err
	}

	if userData.AuthUserUID == "" {
		if _, err := userRef.Update(ctx, []firestore.Update{
			{Path: "auth_user_uid", Value: authUID},
		}); err != nil {
			return err
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "updated", "message": "auth_user_uid"})
		return nil
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "registered"})
	return nil
}
