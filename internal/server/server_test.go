package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/mail"
	"strconv"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/bentenison/portfolio/internal/config"
	"github.com/bentenison/portfolio/internal/contact"
	"github.com/bentenison/portfolio/internal/handlers"
	"github.com/bentenison/portfolio/internal/middleware"
	"github.com/bentenison/portfolio/internal/web"
)

const (
	indexHTML   = "<!doctype html><title>home</title>"
	workHTML    = "<!doctype html><title>eduflow</title>"
	notFoundPG  = "<!doctype html><title>404</title>"
	appJS       = "console.log('app')"
	appJSBr     = "BR-BYTES"
	appJSGz     = "GZ-BYTES-LONGER"
	styleCSS    = "body{}"
	robotsTxt   = "User-agent: *"
	faviconSVG  = "<svg/>"
	manifestStr = "{}"
)

func testFS() fstest.MapFS {
	f := func(s string) *fstest.MapFile { return &fstest.MapFile{Data: []byte(s)} }
	return fstest.MapFS{
		"index.html":              f(indexHTML),
		"index.html.br":           f("BR-INDEX"),
		"404.html":                f(notFoundPG),
		"work/eduflow/index.html": f(workHTML),
		"assets/app-abc123.js":    f(appJS),
		"assets/app-abc123.js.br": f(appJSBr),
		"assets/app-abc123.js.gz": f(appJSGz),
		"assets/style-1.css":      f(styleCSS),
		"assets/hero.webp":        f("WEBP"),
		"robots.txt":              f(robotsTxt),
		"favicon.svg":             f(faviconSVG),
		"site.webmanifest":        f(manifestStr),
		"sitemap.xml":             f("<urlset/>"),
		"app.mjs":                 f("export{}"),
		"data.json":               f("{}"),
		"img/a.png":               f("PNG"),
		"img/b.jpg":               f("JPG"),
		"img/c.avif":              f("AVIF"),
		"favicon.ico":             f("ICO"),
		"fonts/x.woff2":           f("WOFF2"),
		"assets/app.js.map":       f("{}"),
		".gitkeep":                f(""),
	}
}

type fakeMailer struct {
	mu   sync.Mutex
	err  error
	sent []contact.Message
}

func (m *fakeMailer) Send(_ context.Context, msg contact.Message) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.err != nil {
		return m.err
	}
	m.sent = append(m.sent, msg)
	return nil
}

type env struct {
	h      http.Handler
	health *handlers.Health
	logs   *bytes.Buffer
	mailer *fakeMailer
}

type opt func(*Options)

func newEnv(t *testing.T, opts ...opt) *env {
	t.Helper()
	logs := &bytes.Buffer{}
	e := &env{health: handlers.NewHealth(), logs: logs, mailer: &fakeMailer{}}
	o := Options{
		Config:  config.Config{TrustedProxies: nil},
		Logger:  slog.New(slog.NewJSONHandler(&syncWriter{w: logs}, nil)),
		Static:  testFS(),
		Health:  e.health,
		Mailer:  e.mailer,
		Limiter: contact.NewDefaultLimiter(),
	}
	for _, f := range opts {
		f(&o)
	}
	srv, err := New(o)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	e.h = srv.Handler
	return e
}

type syncWriter struct {
	mu sync.Mutex
	w  io.Writer
}

func (s *syncWriter) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.w.Write(p)
}

func (e *env) do(method, target string, hdr map[string]string, body string) *httptest.ResponseRecorder {
	var r io.Reader
	if body != "" {
		r = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, target, r)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	return w
}

func (e *env) get(target string) *httptest.ResponseRecorder {
	return e.do(http.MethodGet, target, nil, "")
}

func TestServerTimeouts(t *testing.T) {
	logs := &bytes.Buffer{}
	srv, err := New(Options{
		Config: config.Config{Addr: ":1234"}, Logger: slog.New(slog.NewTextHandler(logs, nil)),
		Static: testFS(), Health: handlers.NewHealth(), Limiter: contact.NewDefaultLimiter(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if srv.Addr != ":1234" || srv.ReadHeaderTimeout != 5*time.Second || srv.ReadTimeout != 15*time.Second ||
		srv.WriteTimeout != 30*time.Second || srv.IdleTimeout != 120*time.Second || srv.MaxHeaderBytes != 64<<10 {
		t.Errorf("unexpected server config: %+v", srv)
	}
}

func TestStaticRouting(t *testing.T) {
	e := newEnv(t)
	tests := []struct {
		path   string
		status int
		body   string
	}{
		{"/", 200, indexHTML},
		{"/index.html", 200, indexHTML},
		{"/work/eduflow", 200, workHTML},
		{"/work/eduflow/", 200, workHTML},
		{"/work//eduflow", 200, workHTML},
		{"/work/eduflow/index.html", 200, workHTML},
		{"/assets/app-abc123.js", 200, appJS},
		{"/robots.txt", 200, robotsTxt},
		{"/does/not/exist", 404, notFoundPG},
		{"/work/unknown/", 404, notFoundPG},
		{"/assets/missing-xyz.js", 404, "not found"},
		{"/assets/missing.css", 404, "not found"},
		{"/missing.png", 404, "not found"},
		{"/assets/app-abc123.js.br", 404, "not found"},
		{"/assets/app-abc123.js.gz", 404, "not found"},
		{"/index.html.br", 404, "not found"},
		{"/.gitkeep", 404, "not found"},
		{"/../etc/passwd", 404, "not found"},
		{"/assets/%2e%2e/index.html", 404, "not found"},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			w := e.get(tt.path)
			if w.Code != tt.status {
				t.Errorf("status = %d, want %d", w.Code, tt.status)
			}
			if w.Body.String() != tt.body {
				t.Errorf("body = %q, want %q", w.Body.String(), tt.body)
			}
			if tt.body == "not found" {
				if got := w.Header().Get("Cache-Control"); got != "no-store" {
					t.Errorf("Cache-Control = %q, want no-store", got)
				}
				if strings.Contains(w.Body.String(), "<!doctype") {
					t.Error("missing asset must not return HTML")
				}
			}
		})
	}
}

func TestFallbackWithout404Page(t *testing.T) {
	fsys := testFS()
	delete(fsys, "404.html")
	e := newEnv(t, func(o *Options) { o.Static = fsys })
	w := e.get("/nope")
	if w.Code != 404 || w.Body.String() != indexHTML {
		t.Errorf("got %d %q, want 404 index.html", w.Code, w.Body.String())
	}
}

func TestFrontendNotBuilt(t *testing.T) {
	e := newEnv(t, func(o *Options) { o.Static = fstest.MapFS{".gitkeep": {}} })
	w := e.get("/")
	if w.Code != 503 || !strings.Contains(w.Body.String(), "frontend not built") {
		t.Errorf("got %d %q", w.Code, w.Body.String())
	}
	if !strings.Contains(e.logs.String(), "frontend not built") {
		t.Error("expected startup warning")
	}
	if w := e.get("/healthz"); w.Code != 200 {
		t.Errorf("healthz = %d", w.Code)
	}
	if w := e.get("/assets/app.js"); w.Code != 404 {
		t.Errorf("asset = %d", w.Code)
	}
}

func TestEmbeddedDist(t *testing.T) {
	d, err := web.Dist()
	if err != nil {
		t.Fatal(err)
	}
	e := newEnv(t, func(o *Options) { o.Static = d })
	if w := e.get("/healthz"); w.Code != 200 {
		t.Errorf("healthz = %d", w.Code)
	}
	if w := e.get("/"); w.Code != 200 && w.Code != 503 {
		t.Errorf("/ = %d, want 200 (built) or 503 (not built)", w.Code)
	}
}

func TestContentTypes(t *testing.T) {
	e := newEnv(t)
	tests := map[string]string{
		"/":                     "text/html; charset=utf-8",
		"/assets/app-abc123.js": "text/javascript; charset=utf-8",
		"/app.mjs":              "text/javascript; charset=utf-8",
		"/assets/style-1.css":   "text/css; charset=utf-8",
		"/data.json":            "application/json",
		"/site.webmanifest":     "application/manifest+json",
		"/favicon.svg":          "image/svg+xml",
		"/img/a.png":            "image/png",
		"/img/b.jpg":            "image/jpeg",
		"/assets/hero.webp":     "image/webp",
		"/img/c.avif":           "image/avif",
		"/favicon.ico":          "image/x-icon",
		"/fonts/x.woff2":        "font/woff2",
		"/robots.txt":           "text/plain; charset=utf-8",
		"/sitemap.xml":          "application/xml",
		"/assets/app.js.map":    "application/json",
	}
	for p, want := range tests {
		if got := e.get(p).Header().Get("Content-Type"); got != want {
			t.Errorf("%s: Content-Type = %q, want %q", p, got, want)
		}
	}
}

func TestCacheHeaders(t *testing.T) {
	e := newEnv(t)
	tests := map[string]string{
		"/assets/app-abc123.js": "public, max-age=31536000, immutable",
		"/assets/hero.webp":     "public, max-age=31536000, immutable",
		"/":                     "no-cache",
		"/work/eduflow/":        "no-cache",
		"/robots.txt":           "public, max-age=3600",
		"/favicon.svg":          "public, max-age=3600",
		"/healthz":              "no-store",
		"/readyz":               "no-store",
		"/api/contact":          "no-store",
		"/api/nope":             "no-store",
	}
	for p, want := range tests {
		if got := e.get(p).Header().Get("Cache-Control"); got != want {
			t.Errorf("%s: Cache-Control = %q, want %q", p, got, want)
		}
	}
}

func TestETag(t *testing.T) {
	e := newEnv(t)
	w := e.get("/robots.txt")
	etag := w.Header().Get("ETag")
	if len(etag) != 18 || etag[0] != '"' || etag[17] != '"' {
		t.Fatalf("ETag = %q, want quoted 16 hex chars", etag)
	}
	tests := []struct {
		inm    string
		status int
	}{
		{etag, 304},
		{"W/" + etag, 304},
		{`"zzz", ` + etag, 304},
		{"*", 304},
		{`"other"`, 200},
	}
	for _, tt := range tests {
		w := e.do(http.MethodGet, "/robots.txt", map[string]string{"If-None-Match": tt.inm}, "")
		if w.Code != tt.status {
			t.Errorf("If-None-Match %q: status %d, want %d", tt.inm, w.Code, tt.status)
		}
		if tt.status == 304 && w.Body.Len() != 0 {
			t.Errorf("304 with body %q", w.Body.String())
		}
	}
	// Each encoding has its own ETag.
	br := e.do(http.MethodGet, "/assets/app-abc123.js", map[string]string{"Accept-Encoding": "br"}, "")
	id := e.get("/assets/app-abc123.js")
	if br.Header().Get("ETag") == id.Header().Get("ETag") {
		t.Error("br and identity share an ETag")
	}
}

func TestHead(t *testing.T) {
	e := newEnv(t)
	for p, size := range map[string]int{"/": len(indexHTML), "/assets/app-abc123.js": len(appJS), "/nope": len(notFoundPG)} {
		w := e.do(http.MethodHead, p, nil, "")
		if w.Body.Len() != 0 {
			t.Errorf("HEAD %s: body %q", p, w.Body.String())
		}
		if got := w.Header().Get("Content-Length"); got != strconv.Itoa(size) {
			t.Errorf("HEAD %s: Content-Length = %q, want %d", p, got, size)
		}
		if ct := w.Header().Get("Content-Type"); ct == "text/plain; charset=utf-8" {
			t.Errorf("HEAD %s: Content-Type overwritten: %q", p, ct)
		}
	}
	if w := e.do(http.MethodHead, "/nope", nil, ""); w.Code != 404 {
		t.Errorf("HEAD /nope = %d", w.Code)
	}
	if w := e.do(http.MethodHead, "/healthz", nil, ""); w.Code != 200 {
		t.Errorf("HEAD /healthz = %d", w.Code)
	}
}

func TestRange(t *testing.T) {
	e := newEnv(t)
	w := e.do(http.MethodGet, "/robots.txt", map[string]string{"Range": "bytes=0-3"}, "")
	if w.Code != 206 || w.Body.String() != robotsTxt[:4] {
		t.Errorf("got %d %q", w.Code, w.Body.String())
	}
}

func TestEncodingNegotiation(t *testing.T) {
	e := newEnv(t)
	tests := []struct {
		accept, encoding, body string
	}{
		{"", "", appJS},
		{"br", "br", appJSBr},
		{"gzip", "gzip", appJSGz},
		{"gzip, deflate, br", "br", appJSBr},
		{"br;q=0, gzip", "gzip", appJSGz},
		{"br;q=0.5, gzip;q=0.8", "gzip", appJSGz},
		{"br;q=0, gzip;q=0", "", appJS},
		{"*", "br", appJSBr},
		{"*;q=0", "", appJS},
		{"*, br;q=0", "gzip", appJSGz},
		{"identity", "", appJS},
		{"x-gzip", "gzip", appJSGz},
		{"BR;Q=1", "br", appJSBr},
		{"br;q=bogus, gzip", "gzip", appJSGz},
	}
	for _, tt := range tests {
		t.Run(tt.accept, func(t *testing.T) {
			w := e.do(http.MethodGet, "/assets/app-abc123.js", map[string]string{"Accept-Encoding": tt.accept}, "")
			if got := w.Header().Get("Content-Encoding"); got != tt.encoding {
				t.Errorf("Content-Encoding = %q, want %q", got, tt.encoding)
			}
			if w.Body.String() != tt.body {
				t.Errorf("body = %q, want %q", w.Body.String(), tt.body)
			}
			if got := w.Header().Get("Vary"); got != "Accept-Encoding" {
				t.Errorf("Vary = %q", got)
			}
			if got := w.Header().Get("Content-Type"); got != "text/javascript; charset=utf-8" {
				t.Errorf("Content-Type = %q", got)
			}
			if got := w.Header().Get("Content-Length"); got != strconv.Itoa(len(tt.body)) {
				t.Errorf("Content-Length = %q", got)
			}
		})
	}
	// Only a .br sibling exists for index.html.
	w := e.do(http.MethodGet, "/", map[string]string{"Accept-Encoding": "gzip"}, "")
	if w.Header().Get("Content-Encoding") != "" || w.Header().Get("Vary") != "Accept-Encoding" {
		t.Errorf("index gzip: enc=%q vary=%q", w.Header().Get("Content-Encoding"), w.Header().Get("Vary"))
	}
	// Files without siblings get no Vary and are never compressed.
	w = e.do(http.MethodGet, "/assets/hero.webp", map[string]string{"Accept-Encoding": "br, gzip"}, "")
	if w.Header().Get("Content-Encoding") != "" || w.Header().Get("Vary") != "" {
		t.Errorf("webp: enc=%q vary=%q", w.Header().Get("Content-Encoding"), w.Header().Get("Vary"))
	}
}

func TestSecurityHeadersEverywhere(t *testing.T) {
	e := newEnv(t)
	for _, p := range []string{"/", "/assets/app-abc123.js", "/nope", "/assets/nope.js", "/healthz", "/api/contact", "/api/nope"} {
		w := e.get(p)
		if w.Header().Get("Content-Security-Policy") != middleware.ContentSecurityPolicy ||
			w.Header().Get("X-Content-Type-Options") != "nosniff" ||
			w.Header().Get("X-Frame-Options") != "DENY" ||
			w.Header().Get("Referrer-Policy") != "strict-origin-when-cross-origin" ||
			w.Header().Get("Cross-Origin-Opener-Policy") != "same-origin" ||
			w.Header().Get("Permissions-Policy") == "" ||
			w.Header().Get("X-Request-ID") == "" {
			t.Errorf("%s: missing security headers: %v", p, w.Header())
		}
		if w.Header().Get("Strict-Transport-Security") != "" {
			t.Errorf("%s: HSTS sent while disabled", p)
		}
	}
	hsts := newEnv(t, func(o *Options) { o.Config.HSTS = true })
	if got := hsts.get("/").Header().Get("Strict-Transport-Security"); got != "max-age=63072000; includeSubDomains" {
		t.Errorf("HSTS = %q", got)
	}
}

func TestHealth(t *testing.T) {
	e := newEnv(t)
	check := func(path string, status int, body string) {
		t.Helper()
		w := e.get(path)
		if w.Code != status || strings.TrimSpace(w.Body.String()) != body {
			t.Errorf("%s = %d %s, want %d %s", path, w.Code, w.Body.String(), status, body)
		}
	}
	check("/healthz", 200, `{"status":"ok"}`)
	check("/readyz", 200, `{"status":"ready"}`)
	e.health.SetReady(false)
	check("/healthz", 200, `{"status":"ok"}`)
	check("/readyz", 503, `{"status":"shutting_down"}`)
}

func TestMethods(t *testing.T) {
	e := newEnv(t)
	tests := []struct {
		method, path string
		status       int
		allow        string
		jsonErr      string
	}{
		{http.MethodPost, "/", 405, "GET, HEAD", ""},
		{http.MethodDelete, "/work/eduflow", 405, "GET, HEAD", ""},
		{http.MethodPut, "/assets/app-abc123.js", 405, "GET, HEAD", ""},
		{http.MethodPost, "/healthz", 405, "GET, HEAD", ""},
		{http.MethodDelete, "/api/contact", 405, "", "not_found"},
		{http.MethodGet, "/api/unknown", 404, "", "not_found"},
		{http.MethodPost, "/api/unknown", 404, "", "not_found"},
		{http.MethodGet, "/api", 404, "", "not_found"},
		{http.MethodGet, "/api/contact/", 404, "", "not_found"},
		{http.MethodGet, "/api/assets/app.js", 404, "", "not_found"},
	}
	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			w := e.do(tt.method, tt.path, nil, "")
			if w.Code != tt.status {
				t.Errorf("status = %d, want %d", w.Code, tt.status)
			}
			if tt.allow != "" && w.Header().Get("Allow") != tt.allow {
				t.Errorf("Allow = %q, want %q", w.Header().Get("Allow"), tt.allow)
			}
			if tt.jsonErr != "" {
				if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
					t.Errorf("Content-Type = %q", ct)
				}
				var body map[string]string
				if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body["error"] != tt.jsonErr {
					t.Errorf("body = %q", w.Body.String())
				}
			}
		})
	}
}

// --- contact ---

const validBody = `{"name":"Ada Lovelace","email":"ada@example.com","message":"Hello, I would like to talk.","company":"","elapsed_ms":5000}`

func jsonHdr() map[string]string { return map[string]string{"Content-Type": "application/json"} }

func decode(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
		t.Fatalf("body %q: %v", w.Body.String(), err)
	}
	return m
}

func TestContactStatus(t *testing.T) {
	on := newEnv(t)
	if m := decode(t, on.get("/api/contact")); m["enabled"] != true {
		t.Errorf("enabled = %v", m["enabled"])
	}
	off := newEnv(t, func(o *Options) { o.Mailer = nil })
	if m := decode(t, off.get("/api/contact")); m["enabled"] != false {
		t.Errorf("enabled = %v", m["enabled"])
	}
	w := off.do(http.MethodPost, "/api/contact", jsonHdr(), validBody)
	if w.Code != 503 || decode(t, w)["error"] != "contact_disabled" {
		t.Errorf("disabled submit = %d %s", w.Code, w.Body.String())
	}
}

func TestContactRequests(t *testing.T) {
	big := `{"name":"a","email":"a@b.co","message":"` + strings.Repeat("x", 17<<10) + `","elapsed_ms":5000}`
	tests := []struct {
		name   string
		ctype  string
		body   string
		status int
		err    string
		fields map[string]string
	}{
		{"wrong content type", "text/plain", validBody, 415, "unsupported_media_type", nil},
		{"no content type", "", validBody, 415, "unsupported_media_type", nil},
		{"json with charset", "application/json; charset=utf-8", validBody, 200, "", nil},
		{"too large", "application/json", big, 413, "too_large", nil},
		{"malformed", "application/json", `{"name":`, 400, "bad_request", nil},
		{"unknown field", "application/json", `{"name":"a","extra":1}`, 400, "bad_request", nil},
		{"trailing data", "application/json", validBody + `{}`, 400, "bad_request", nil},
		{"too fast", "application/json", strings.Replace(validBody, "5000", "1000", 1), 422, "too_fast", nil},
		{"missing elapsed", "application/json", `{"name":"Ada","email":"ada@example.com","message":"Hello there friend"}`, 422, "too_fast", nil},
		{"invalid fields", "application/json",
			`{"name":"","email":"Ada <ada@example.com>","message":"short","elapsed_ms":5000}`, 422, "invalid",
			map[string]string{"name": "required", "email": "invalid", "message": "too_short"}},
		{"name injection", "application/json",
			`{"name":"Ada\r\nBcc: x@y.com","email":"ada@example.com","message":"Hello there friend","elapsed_ms":5000}`, 422, "invalid",
			map[string]string{"name": "invalid"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newEnv(t)
			hdr := map[string]string{}
			if tt.ctype != "" {
				hdr["Content-Type"] = tt.ctype
			}
			w := e.do(http.MethodPost, "/api/contact", hdr, tt.body)
			if w.Code != tt.status {
				t.Fatalf("status = %d, want %d (%s)", w.Code, tt.status, w.Body.String())
			}
			if w.Header().Get("Cache-Control") != "no-store" || !strings.HasPrefix(w.Header().Get("Content-Type"), "application/json") {
				t.Errorf("headers = %v", w.Header())
			}
			m := decode(t, w)
			if tt.err == "" {
				if m["ok"] != true {
					t.Errorf("body = %v", m)
				}
				return
			}
			if m["error"] != tt.err {
				t.Errorf("error = %v, want %s", m["error"], tt.err)
			}
			if tt.fields != nil {
				got, _ := m["fields"].(map[string]any)
				if len(got) != len(tt.fields) {
					t.Errorf("fields = %v, want %v", got, tt.fields)
				}
				for k, v := range tt.fields {
					if got[k] != v {
						t.Errorf("fields[%s] = %v, want %s", k, got[k], v)
					}
				}
			}
			if len(e.mailer.sent) != 0 {
				t.Error("mail sent for rejected request")
			}
		})
	}
}

func TestContactHoneypot(t *testing.T) {
	e := newEnv(t)
	body := strings.Replace(validBody, `"company":""`, `"company":"Acme"`, 1)
	w := e.do(http.MethodPost, "/api/contact", jsonHdr(), body)
	if w.Code != 200 || decode(t, w)["ok"] != true {
		t.Errorf("got %d %s", w.Code, w.Body.String())
	}
	if len(e.mailer.sent) != 0 {
		t.Error("honeypot submission was delivered")
	}
	if !strings.Contains(e.logs.String(), "spam dropped") {
		t.Error("spam not logged")
	}
}

func TestContactSuccess(t *testing.T) {
	e := newEnv(t)
	body := `{"name":"  Ada Lovelace ","email":"ada@example.com","message":"Hi!\r\nLet's talk.\u0007","company":"","elapsed_ms":4000}`
	w := e.do(http.MethodPost, "/api/contact", map[string]string{"Content-Type": "application/json", "X-Request-ID": "req-42"}, body)
	if w.Code != 200 || decode(t, w)["ok"] != true {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
	if len(e.mailer.sent) != 1 {
		t.Fatalf("sent %d messages", len(e.mailer.sent))
	}
	got := e.mailer.sent[0]
	want := contact.Message{Name: "Ada Lovelace", Email: "ada@example.com", Body: "Hi!\nLet's talk.", RequestID: "req-42"}
	if got != want {
		t.Errorf("message = %+v, want %+v", got, want)
	}
	// Render the email exactly as the SMTP mailer would and verify the
	// headers contain no injected lines.
	raw := string(contact.BuildMessage(mustAddr(t, "site@example.com"), mustAddr(t, "owner@example.com"), got, time.Now()))
	head, _, _ := strings.Cut(raw, "\r\n\r\n")
	for _, line := range strings.Split(head, "\r\n") {
		if strings.ContainsAny(line, "\r\n") {
			t.Errorf("header line with CR/LF: %q", line)
		}
	}
	if !strings.Contains(head, "Reply-To: <ada@example.com>") || !strings.Contains(head, "Subject: Portfolio contact: Ada Lovelace") {
		t.Errorf("unexpected headers:\n%s", head)
	}
}

func TestContactDeliveryFailure(t *testing.T) {
	e := newEnv(t)
	e.mailer.err = errors.New("smtp: connection refused")
	w := e.do(http.MethodPost, "/api/contact", jsonHdr(), validBody)
	if w.Code != 502 || decode(t, w)["error"] != "delivery_failed" {
		t.Errorf("got %d %s", w.Code, w.Body.String())
	}
	if !strings.Contains(e.logs.String(), "connection refused") {
		t.Error("delivery error not logged")
	}
}

func TestContactRateLimit(t *testing.T) {
	e := newEnv(t)
	post := func(ip string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/contact", strings.NewReader(validBody))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = ip + ":1234"
		w := httptest.NewRecorder()
		e.h.ServeHTTP(w, req)
		return w
	}
	// Unparseable bodies are not counted.
	for range 10 {
		req := httptest.NewRequest(http.MethodPost, "/api/contact", strings.NewReader("{"))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "203.0.113.7:1"
		e.h.ServeHTTP(httptest.NewRecorder(), req)
	}
	for i := range 5 {
		if w := post("203.0.113.7"); w.Code != 200 {
			t.Fatalf("request %d: %d %s", i, w.Code, w.Body.String())
		}
	}
	w := post("203.0.113.7")
	if w.Code != 429 || decode(t, w)["error"] != "rate_limited" {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
	ra, err := strconv.Atoi(w.Header().Get("Retry-After"))
	if err != nil || ra < 1 || ra > 600 {
		t.Errorf("Retry-After = %q", w.Header().Get("Retry-After"))
	}
	if w := post("198.51.100.9"); w.Code != 200 {
		t.Errorf("other IP limited: %d", w.Code)
	}
	// X-Forwarded-For from an untrusted peer must not bypass the limit.
	req := httptest.NewRequest(http.MethodPost, "/api/contact", strings.NewReader(validBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", "192.0.2.1")
	req.RemoteAddr = "203.0.113.7:1"
	w = httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	if w.Code != 429 {
		t.Errorf("spoofed XFF bypassed limit: %d", w.Code)
	}
}

func TestContactGlobalRateLimit(t *testing.T) {
	e := newEnv(t, func(o *Options) { o.Limiter = contact.NewLimiter(5, time.Minute, 2, time.Hour) })
	for i, ip := range []string{"192.0.2.1", "192.0.2.2", "192.0.2.3"} {
		req := httptest.NewRequest(http.MethodPost, "/api/contact", strings.NewReader(validBody))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = ip + ":1"
		w := httptest.NewRecorder()
		e.h.ServeHTTP(w, req)
		want := 200
		if i == 2 {
			want = 429
		}
		if w.Code != want {
			t.Errorf("%s: %d, want %d", ip, w.Code, want)
		}
	}
}

func mustAddr(t *testing.T, s string) *mail.Address {
	t.Helper()
	a, err := mail.ParseAddress(s)
	if err != nil {
		t.Fatal(err)
	}
	return a
}
