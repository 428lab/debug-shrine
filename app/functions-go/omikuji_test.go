package gofunctions

import (
	"math/rand"
	"testing"
)

// すべてのレア度(表示順)。テストの網羅チェックに使う。
var allTiers = []string{
	TierChokichi, TierDaikichi, TierChukichi, TierShokichi, TierSuekichi, TierKyo, TierDaikyo,
}

func TestOmikuji_TierWeightsCoverAllTiers(t *testing.T) {
	seen := map[string]bool{}
	for _, w := range tierWeights {
		if w.Weight <= 0 {
			t.Errorf("tier %q has non-positive weight %d", w.Tier, w.Weight)
		}
		seen[w.Tier] = true
	}
	for _, tier := range allTiers {
		if !seen[tier] {
			t.Errorf("tier %q is missing from tierWeights", tier)
		}
	}
	if len(tierWeights) != len(allTiers) {
		t.Errorf("tierWeights has %d entries, want %d", len(tierWeights), len(allTiers))
	}
}

func TestOmikuji_DrawTierBoundaries(t *testing.T) {
	// r=0 は先頭(最良)、r が 1 に限りなく近い場合は末尾(最悪)になる。
	if got := drawTierByValue(0); got != tierWeights[0].Tier {
		t.Errorf("drawTierByValue(0) = %q, want %q", got, tierWeights[0].Tier)
	}
	if got := drawTierByValue(0.999999); got != tierWeights[len(tierWeights)-1].Tier {
		t.Errorf("drawTierByValue(~1) = %q, want %q", got, tierWeights[len(tierWeights)-1].Tier)
	}
	// 返り値は必ず有効なレア度。
	valid := map[string]bool{}
	for _, tier := range allTiers {
		valid[tier] = true
	}
	for i := 0; i <= 1000; i++ {
		r := float64(i) / 1000.0
		if !valid[drawTierByValue(r)] {
			t.Fatalf("drawTierByValue(%v) returned invalid tier", r)
		}
	}
}

func TestOmikuji_DrawDistributionApproximatesWeights(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	const n = 200000
	counts := map[string]int{}
	for i := 0; i < n; i++ {
		counts[drawTierByValue(rng.Float64())]++
	}
	total := float64(tierWeightTotal())
	for _, w := range tierWeights {
		want := float64(w.Weight) / total
		got := float64(counts[w.Tier]) / float64(n)
		// 経験分布は重みの ±1.5%(絶対)以内に収まるはず。
		if diff := got - want; diff > 0.015 || diff < -0.015 {
			t.Errorf("tier %q proportion = %.4f, want ~%.4f", w.Tier, got, want)
		}
	}
}

func TestOmikuji_PickEntryReturnsRequestedTier(t *testing.T) {
	for _, tier := range allTiers {
		for i := 0; i <= 100; i++ {
			r := float64(i) / 101.0
			entry, ok := pickEntryByValue(tier, r)
			if !ok {
				t.Fatalf("pickEntryByValue(%q, %v): no entry (tier has no data?)", tier, r)
			}
			if entry.Tier != tier {
				t.Errorf("pickEntryByValue(%q) returned entry of tier %q", tier, entry.Tier)
			}
		}
	}
	if _, ok := pickEntryByValue("存在しない", 0.5); ok {
		t.Error("pickEntryByValue with bogus tier should return ok=false")
	}
}

func TestOmikuji_DataIntegrity(t *testing.T) {
	if len(omikujiEntries) < 105 {
		t.Errorf("omikujiEntries has %d entries, want >= 105", len(omikujiEntries))
	}

	perTier := map[string]int{}
	ids := map[string]bool{}
	validTier := map[string]bool{}
	for _, tier := range allTiers {
		validTier[tier] = true
	}

	for _, e := range omikujiEntries {
		if !validTier[e.Tier] {
			t.Errorf("entry %q has invalid tier %q", e.ID, e.Tier)
		}
		if e.ID == "" {
			t.Error("found entry with empty ID")
		}
		if ids[e.ID] {
			t.Errorf("duplicate omikuji ID %q", e.ID)
		}
		ids[e.ID] = true
		if e.Fortune == "" {
			t.Errorf("entry %q has empty Fortune", e.ID)
		}
		if len(e.Lines) < 3 {
			t.Errorf("entry %q has %d lines, want >= 3", e.ID, len(e.Lines))
		}
		cats := map[string]bool{}
		for _, l := range e.Lines {
			if l.Category == "" || l.Text == "" {
				t.Errorf("entry %q has a line with empty category/text", e.ID)
			}
			if cats[l.Category] {
				t.Errorf("entry %q has duplicate category %q", e.ID, l.Category)
			}
			cats[l.Category] = true
		}
		perTier[e.Tier]++
	}

	for _, tier := range allTiers {
		if perTier[tier] < 15 {
			t.Errorf("tier %q has %d entries, want >= 15", tier, perTier[tier])
		}
	}
}

func TestOmikuji_CooldownDefault(t *testing.T) {
	t.Setenv("OMIKUJI_COOLDOWN_SECONDS", "")
	if got := loadOmikujiCooldownSeconds(); got != 8*60*60 {
		t.Errorf("default cooldown = %d, want %d", got, 8*60*60)
	}
	t.Setenv("OMIKUJI_COOLDOWN_SECONDS", "60")
	if got := loadOmikujiCooldownSeconds(); got != 60 {
		t.Errorf("cooldown from env = %d, want 60", got)
	}
	t.Setenv("OMIKUJI_COOLDOWN_SECONDS", "bogus")
	if got := loadOmikujiCooldownSeconds(); got != 8*60*60 {
		t.Errorf("cooldown with bogus env = %d, want default %d", got, 8*60*60)
	}
}
