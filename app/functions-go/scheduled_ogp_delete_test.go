package gofunctions

import (
	"context"
	"errors"
	"testing"
)

type fakeOgpBucket struct {
	objects   map[string]bool
	failNames map[string]bool
}

func newFakeOgpBucket(names ...string) *fakeOgpBucket {
	objects := map[string]bool{}
	for _, n := range names {
		objects[n] = true
	}
	return &fakeOgpBucket{objects: objects, failNames: map[string]bool{}}
}

func (b *fakeOgpBucket) listObjectNames(_ context.Context, prefix string) ([]string, error) {
	var names []string
	for n := range b.objects {
		if len(n) >= len(prefix) && n[:len(prefix)] == prefix {
			names = append(names, n)
		}
	}
	return names, nil
}

func (b *fakeOgpBucket) deleteObject(_ context.Context, name string) error {
	if b.failNames[name] {
		return errors.New("simulated delete failure")
	}
	delete(b.objects, name)
	return nil
}

func TestScheduledOgpDelete_DeletesOnlyMatchingPrefix(t *testing.T) {
	bucket := newFakeOgpBucket("ogps/user1.png", "ogps/user2.png", "base.png")
	ctx := context.Background()

	if err := runScheduledOgpDelete(ctx, bucket, "ogps/"); err != nil {
		t.Fatalf("runScheduledOgpDelete: %v", err)
	}

	if _, ok := bucket.objects["ogps/user1.png"]; ok {
		t.Error("ogps/user1.png should have been deleted")
	}
	if _, ok := bucket.objects["ogps/user2.png"]; ok {
		t.Error("ogps/user2.png should have been deleted")
	}
	if _, ok := bucket.objects["base.png"]; !ok {
		t.Error("base.png (prefix対象外) should not have been deleted")
	}
}

func TestScheduledOgpDelete_ContinuesAfterIndividualDeleteFailure(t *testing.T) {
	bucket := newFakeOgpBucket("ogps/user1.png", "ogps/user2.png")
	bucket.failNames["ogps/user1.png"] = true
	ctx := context.Background()

	if err := runScheduledOgpDelete(ctx, bucket, "ogps/"); err != nil {
		t.Fatalf("runScheduledOgpDelete should not fail the whole job on a single delete error: %v", err)
	}

	if _, ok := bucket.objects["ogps/user1.png"]; !ok {
		t.Error("delete失敗したファイルはそのまま残るはず")
	}
	if _, ok := bucket.objects["ogps/user2.png"]; ok {
		t.Error("他のファイルの削除は継続されるべき")
	}
}
