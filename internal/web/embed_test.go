package web

import (
	"io/fs"
	"testing"
)

func TestDist(t *testing.T) {
	d, err := Dist()
	if err != nil {
		t.Fatalf("Dist: %v", err)
	}
	if _, err := fs.ReadDir(d, "."); err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	// .gitkeep is always present (committed); it proves the FS is rooted at dist.
	if _, err := fs.Stat(d, ".gitkeep"); err != nil {
		t.Fatalf(".gitkeep not found at FS root: %v", err)
	}
}
