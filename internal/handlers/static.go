package handlers

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"
)

// contentTypes overrides mime.TypeByExtension so responses do not depend on
// the host OS registry.
var contentTypes = map[string]string{
	".html":        "text/html; charset=utf-8",
	".js":          "text/javascript; charset=utf-8",
	".mjs":         "text/javascript; charset=utf-8",
	".css":         "text/css; charset=utf-8",
	".json":        "application/json",
	".webmanifest": "application/manifest+json",
	".svg":         "image/svg+xml",
	".png":         "image/png",
	".jpg":         "image/jpeg",
	".jpeg":        "image/jpeg",
	".gif":         "image/gif",
	".webp":        "image/webp",
	".avif":        "image/avif",
	".ico":         "image/x-icon",
	".woff2":       "font/woff2",
	".woff":        "font/woff",
	".txt":         "text/plain; charset=utf-8",
	".xml":         "application/xml",
	".map":         "application/json",
	".wasm":        "application/wasm",
}

// ContentType returns the Content-Type used for a file name.
func ContentType(name string) string {
	ext := strings.ToLower(path.Ext(name))
	if ct, ok := contentTypes[ext]; ok {
		return ct
	}
	if ct := mime.TypeByExtension(ext); ct != "" {
		return ct
	}
	return "application/octet-stream"
}

// representation is one stored encoding of a file.
type representation struct {
	data []byte
	etag string
}

type file struct {
	identity    representation
	br, gz      *representation
	contentType string
	cache       string
}

// Static serves an fs.FS containing a prerendered Vite build with SPA
// semantics: real files are served directly, extension-less paths resolve to
// <path>/index.html, missing assets are 404 and never fall back to HTML.
// Precompressed name.br / name.gz siblings are negotiated via Accept-Encoding.
type Static struct {
	files    map[string]*file
	hasIndex bool
}

// NewStatic indexes every file in fsys, reading contents and computing ETags.
func NewStatic(fsys fs.FS) (*Static, error) {
	s := &Static{files: make(map[string]*file)}
	compressed := map[string]representation{}
	err := fs.WalkDir(fsys, ".", func(name string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || path.Base(name) == ".gitkeep" {
			return nil
		}
		data, err := fs.ReadFile(fsys, name)
		if err != nil {
			return err
		}
		rep := representation{data: data, etag: etagOf(data)}
		if isCompressedSibling(name) {
			compressed[name] = rep
			return nil
		}
		s.files[name] = &file{identity: rep, contentType: ContentType(name), cache: cachePolicy(name)}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("index static files: %w", err)
	}
	for name, rep := range compressed {
		f, ok := s.files[name[:len(name)-3]]
		if !ok {
			continue
		}
		r := rep
		if strings.HasSuffix(name, ".br") {
			f.br = &r
		} else {
			f.gz = &r
		}
	}
	_, s.hasIndex = s.files["index.html"]
	return s, nil
}

// HasIndex reports whether the FS contains index.html, i.e. whether the
// frontend has been built.
func (s *Static) HasIndex() bool { return s.hasIndex }

func isCompressedSibling(name string) bool {
	return strings.HasSuffix(name, ".br") || strings.HasSuffix(name, ".gz")
}

func etagOf(b []byte) string {
	sum := sha256.Sum256(b)
	return `"` + hex.EncodeToString(sum[:])[:16] + `"`
}

func cachePolicy(name string) string {
	switch {
	case strings.HasPrefix(name, "assets/"):
		return "public, max-age=31536000, immutable"
	case strings.HasSuffix(name, ".html"):
		return "no-cache"
	default:
		return "public, max-age=3600"
	}
}

// ServeHTTP implements http.Handler.
func (s *Static) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		plain(w, r, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	name, ok := cleanName(r.URL.Path)
	if !ok || isCompressedSibling(name) {
		notFound(w, r)
		return
	}

	// Asset request: the last segment has an extension.
	if name != "" && strings.Contains(path.Base(name), ".") {
		f, ok := s.files[name]
		if !ok {
			notFound(w, r)
			return
		}
		s.serve(w, r, f, http.StatusOK)
		return
	}

	// Navigation request.
	if !s.hasIndex {
		w.Header().Set("Cache-Control", "no-store")
		plain(w, r, http.StatusServiceUnavailable, "frontend not built — run scripts/build")
		return
	}
	index := "index.html"
	if name != "" {
		index = name + "/index.html"
	}
	if f, ok := s.files[index]; ok {
		s.serve(w, r, f, http.StatusOK)
		return
	}
	for _, fallback := range []string{"404.html", "index.html"} {
		if f, ok := s.files[fallback]; ok {
			s.serve(w, r, f, http.StatusNotFound)
			return
		}
	}
	notFound(w, r)
}

// cleanName converts a URL path into an FS name ("" for the root). It
// rejects any ".." segment and invalid paths.
func cleanName(p string) (string, bool) {
	for _, seg := range strings.Split(p, "/") {
		if seg == ".." {
			return "", false
		}
	}
	if strings.ContainsAny(p, "\\\x00") {
		return "", false
	}
	name := strings.TrimPrefix(path.Clean("/"+p), "/")
	if name == "" {
		return "", true
	}
	return name, fs.ValidPath(name)
}

func (s *Static) serve(w http.ResponseWriter, r *http.Request, f *file, status int) {
	h := w.Header()
	rep := &f.identity
	if f.br != nil || f.gz != nil {
		h.Add("Vary", "Accept-Encoding")
		switch negotiate(r.Header.Get("Accept-Encoding"), f.br != nil, f.gz != nil) {
		case "br":
			rep = f.br
			h.Set("Content-Encoding", "br")
		case "gzip":
			rep = f.gz
			h.Set("Content-Encoding", "gzip")
		}
	}
	h.Set("Content-Type", f.contentType) // set before ServeContent so it never sniffs
	h.Set("Cache-Control", f.cache)

	if status != http.StatusOK {
		// Error pages are not conditional and do not support ranges.
		h.Set("Content-Length", strconv.Itoa(len(rep.data)))
		w.WriteHeader(status)
		if r.Method != http.MethodHead {
			_, _ = w.Write(rep.data)
		}
		return
	}
	h.Set("ETag", rep.etag)
	if rep != &f.identity {
		// ServeContent omits Content-Length for encoded bodies, and byte
		// ranges of an encoded representation are of little use, so serve
		// the whole encoded body with an explicit length.
		h.Set("Content-Length", strconv.Itoa(len(rep.data)))
		r2 := *r
		r2.Header = r.Header.Clone()
		r2.Header.Del("Range")
		r = &r2
	}
	// ServeContent handles If-None-Match (lists, weak comparison), Range and HEAD.
	http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(rep.data))
}

// negotiate picks "br", "gzip" or "" (identity) from an Accept-Encoding
// header, considering only encodings that are available. Higher q wins; br
// wins ties. q=0 refuses an encoding; "*" covers unlisted encodings.
func negotiate(header string, haveBr, haveGz bool) string {
	if header == "" {
		return ""
	}
	q := map[string]float64{}
	for _, part := range strings.Split(header, ",") {
		coding, params, _ := strings.Cut(part, ";")
		coding = strings.ToLower(strings.TrimSpace(coding))
		if coding == "" {
			continue
		}
		weight := 1.0
		for _, p := range strings.Split(params, ";") {
			k, v, ok := strings.Cut(strings.TrimSpace(p), "=")
			if ok && strings.EqualFold(strings.TrimSpace(k), "q") {
				f, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
				if err != nil || f < 0 || f > 1 {
					f = 0
				}
				weight = f
			}
		}
		if coding == "x-gzip" {
			coding = "gzip"
		}
		q[coding] = weight
	}
	weight := func(c string) float64 {
		if w, ok := q[c]; ok {
			return w
		}
		return q["*"] // 0 when absent
	}
	best, bestQ := "", 0.0
	if haveBr {
		if w := weight("br"); w > bestQ {
			best, bestQ = "br", w
		}
	}
	if haveGz {
		if w := weight("gzip"); w > bestQ {
			best = "gzip"
		}
	}
	return best
}

func notFound(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	plain(w, r, http.StatusNotFound, "not found")
}

func plain(w http.ResponseWriter, r *http.Request, status int, msg string) {
	h := w.Header()
	h.Set("Content-Type", "text/plain; charset=utf-8")
	h.Set("Content-Length", strconv.Itoa(len(msg)))
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		_, _ = w.Write([]byte(msg))
	}
}
