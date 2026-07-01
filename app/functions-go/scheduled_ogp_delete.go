// OGP画像キャッシュの定期削除(scheduledOgpDelete)スケジュール関数のGo実装。
//
// Node版(app/functions/index.js の exports.scheduledOgpDelete、毎時)からの移植。
// Cloud Storageの `ogps/` プレフィックス配下のファイルを全て削除する
// (userOGPが生成するOGP画像キャッシュを定期的に作り直させるための削除処理)。
//
// 挙動はNode版と同一にすることを優先し、独自の改善は入れていない
// (詳細は docs/backend.md「スケジュール関数のGo移植」を参照)。
package gofunctions

import (
	"context"
	"errors"
	"log"
	"os"
	"sync"

	"cloud.google.com/go/storage"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	cloudevents "github.com/cloudevents/sdk-go/v2"
	"google.golang.org/api/iterator"
)

func init() {
	functions.CloudEvent("ScheduledOgpDeleteGo", scheduledOgpDeleteHandler)
}

var (
	storageClientOnce sync.Once
	storageClient     *storage.Client
	storageClientErr  error
)

func getStorageClient(ctx context.Context) (*storage.Client, error) {
	storageClientOnce.Do(func() {
		storageClient, storageClientErr = storage.NewClient(ctx)
	})
	return storageClient, storageClientErr
}

func scheduledOgpDeleteHandler(ctx context.Context, _ cloudevents.Event) error {
	bucketName := os.Getenv("STORAGE_BUCKET_NAME")
	if bucketName == "" {
		// デプロイ時の --set-env-vars 漏れ等の設定ミスに早期に気づけるよう、
		// 空のバケット名でAPI呼び出しに進んでしまう前に明示的にエラーにする。
		return errors.New("scheduledOgpDelete: STORAGE_BUCKET_NAME is not set")
	}
	client, err := getStorageClient(ctx)
	if err != nil {
		log.Printf("scheduledOgpDelete: getStorageClient error: %v", err)
		return err
	}
	return runScheduledOgpDelete(ctx, storageOgpBucket{bucket: client.Bucket(bucketName)}, "ogps/")
}

// ogpBucket は Cloud Storage 操作を抽象化する(*storage.BucketHandle は具象型で
// モック差し替えができないため、テスト時にフェイク実装へ差し替えるための境界)。
type ogpBucket interface {
	listObjectNames(ctx context.Context, prefix string) ([]string, error)
	deleteObject(ctx context.Context, name string) error
}

type storageOgpBucket struct {
	bucket *storage.BucketHandle
}

func (b storageOgpBucket) listObjectNames(ctx context.Context, prefix string) ([]string, error) {
	it := b.bucket.Objects(ctx, &storage.Query{Prefix: prefix})
	var names []string
	for {
		attrs, err := it.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}
		names = append(names, attrs.Name)
	}
	return names, nil
}

func (b storageOgpBucket) deleteObject(ctx context.Context, name string) error {
	return b.bucket.Object(name).Delete(ctx)
}

func runScheduledOgpDelete(ctx context.Context, bucket ogpBucket, prefix string) error {
	names, err := bucket.listObjectNames(ctx, prefix)
	if err != nil {
		return err
	}
	deleted := 0
	for _, name := range names {
		if err := bucket.deleteObject(ctx, name); err != nil {
			// Node版は `bucket.deleteFiles({prefix:"ogps/"})` の戻り値(Promise)を
			// onRun内でawait/returnしておらず、削除失敗時の挙動は実質的に
			// 「ログにも残らず不可視のunhandled rejectionになるだけ」という
			// fire-and-forgetな状態(force未指定なのでNode内部的には最初の
			// エラーで残りの削除処理は打ち切られるが、それを検知する仕組みが無い)。
			// この処理は1時間毎に再実行される冪等なクリーンアップジョブであり、
			// 削除し損ねたファイルは次回実行で再試行されるだけなので実害は無い。
			// Go版は挙動を不可視にせず、1ファイルの削除失敗をログに残して
			// 他のファイルの削除は続行する(ジョブ全体を失敗させない)。
			log.Printf("scheduledOgpDelete: failed to delete %q: %v", name, err)
			continue
		}
		deleted++
	}
	log.Printf("scheduledOgpDelete: deleted %d files", deleted)
	return nil
}
