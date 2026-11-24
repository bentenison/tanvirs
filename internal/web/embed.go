// Package web embeds the production frontend build.
//
// The build copies the Vite output (frontend/dist) into internal/web/dist
// before compiling the Go binary. The directory always contains .gitkeep so
// the package compiles before any frontend build exists.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// Dist returns the embedded frontend build rooted at the dist directory, so
// "index.html" refers to internal/web/dist/index.html.
func Dist() (fs.FS, error) {
	return fs.Sub(dist, "dist")
}
