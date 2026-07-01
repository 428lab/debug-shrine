// ローカル動作確認専用のエントリポイント。
// デプロイ(gcloud functions deploy)では使用しない(buildpackが自動生成するmainを使う)。
package main

import (
	"log"
	"os"

	"github.com/GoogleCloudPlatform/functions-framework-go/funcframework"

	_ "github.com/428lab/debug-shrine/functions-go"
)

func main() {
	target := os.Getenv("FUNCTION_TARGET")
	if target == "" {
		target = "StatusGo"
	}
	os.Setenv("FUNCTION_TARGET", target)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	if err := funcframework.Start(port); err != nil {
		log.Fatalf("funcframework.Start: %v", err)
	}
}
