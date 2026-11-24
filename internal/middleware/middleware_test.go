package middleware

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() { gin.SetMode(gin.ReleaseMode) }

func newEngine(buf *bytes.Buffer, hsts bool) *gin.Engine {
	log := slog.New(slog.NewJSONHandler(buf, nil))
	r := gin.New()
	r.Use(RequestID(), Recovery(log), Logger(log), SecurityHeaders(hsts))
	r.GET("/ok", func(c *gin.Context) {
		c.String(http.StatusOK, RequestIDFromContext(c.Request.Context()))
	})
	r.GET("/panic", func(*gin.Context) { panic("boom") })
	r.GET("/api/panic", func(*gin.Context) { panic("boom") })
	r.POST("/limited", BodyLimit(8), func(c *gin.Context) {
		_, err := io.ReadAll(c.Request.Body)
		var mbe *http.MaxBytesError
		if err != nil && errors.As(err, &mbe) {
			c.Status(http.StatusRequestEntityTooLarge)
			return
		}
		c.Status(http.StatusOK)
	})
	return r
}

func TestRequestID(t *testing.T) {
	hex32 := regexp.MustCompile(`^[0-9a-f]{32}$`)
	tests := []struct {
		name, in string
		keep     bool
	}{
		{"valid incoming", "abc-123_X.y", true},
		{"none", "", false},
		{"too long", strings.Repeat("a", 65), false},
		{"bad chars", "abc def<script>", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			r := newEngine(&buf, false)
			req := httptest.NewRequest(http.MethodGet, "/ok", nil)
			if tt.in != "" {
				req.Header.Set(HeaderRequestID, tt.in)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			got := w.Header().Get(HeaderRequestID)
			if tt.keep && got != tt.in {
				t.Errorf("id = %q, want %q", got, tt.in)
			}
			if !tt.keep && !hex32.MatchString(got) {
				t.Errorf("id = %q, want generated hex", got)
			}
			if w.Body.String() != got {
				t.Errorf("context id %q != header %q", w.Body.String(), got)
			}
			if !strings.Contains(buf.String(), `"request_id":"`+got+`"`) {
				t.Errorf("log missing request id: %s", buf.String())
			}
		})
	}
}

func TestLoggerFields(t *testing.T) {
	var buf bytes.Buffer
	r := newEngine(&buf, false)
	req := httptest.NewRequest(http.MethodGet, "/ok", nil)
	req.Header.Set("User-Agent", "test-agent")
	r.ServeHTTP(httptest.NewRecorder(), req)
	var rec map[string]any
	if err := json.Unmarshal(buf.Bytes(), &rec); err != nil {
		t.Fatalf("log not JSON: %v: %s", err, buf.String())
	}
	for _, k := range []string{"method", "path", "status", "duration_ms", "bytes", "request_id", "client_ip", "user_agent"} {
		if _, ok := rec[k]; !ok {
			t.Errorf("missing log field %q", k)
		}
	}
	if rec["user_agent"] != "test-agent" || rec["status"] != float64(200) {
		t.Errorf("unexpected record %v", rec)
	}
}

func TestRecovery(t *testing.T) {
	tests := []struct {
		path, ctype, body string
	}{
		{"/panic", "text/plain; charset=utf-8", "internal server error"},
		{"/api/panic", "application/json; charset=utf-8", `{"error":"internal"}`},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			var buf bytes.Buffer
			r := newEngine(&buf, false)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, tt.path, nil))
			if w.Code != 500 {
				t.Errorf("status = %d", w.Code)
			}
			if got := w.Header().Get("Content-Type"); got != tt.ctype {
				t.Errorf("content-type = %q", got)
			}
			if got := w.Body.String(); got != tt.body {
				t.Errorf("body = %q", got)
			}
			if w.Header().Get("X-Frame-Options") != "DENY" {
				t.Error("security headers missing on panic response")
			}
			if !strings.Contains(buf.String(), "panic recovered") || !strings.Contains(buf.String(), "stack") {
				t.Errorf("panic not logged: %s", buf.String())
			}
		})
	}
}

func TestSecurityHeaders(t *testing.T) {
	want := map[string]string{
		"X-Content-Type-Options":     "nosniff",
		"Referrer-Policy":            "strict-origin-when-cross-origin",
		"X-Frame-Options":            "DENY",
		"Cross-Origin-Opener-Policy": "same-origin",
		"Permissions-Policy":         "camera=(), microphone=(), geolocation=(), interest-cohort=()",
	}
	for _, hsts := range []bool{false, true} {
		var buf bytes.Buffer
		w := httptest.NewRecorder()
		newEngine(&buf, hsts).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/ok", nil))
		for k, v := range want {
			if got := w.Header().Get(k); got != v {
				t.Errorf("hsts=%v %s = %q, want %q", hsts, k, got, v)
			}
		}
		wantCSP := ContentSecurityPolicy
		if hsts {
			// Upgrading subresources only makes sense when the site is HTTPS-only.
			wantCSP += "; upgrade-insecure-requests"
		}
		if got := w.Header().Get("Content-Security-Policy"); got != wantCSP {
			t.Errorf("hsts=%v CSP = %q, want %q", hsts, got, wantCSP)
		}
		got := w.Header().Get("Strict-Transport-Security")
		if hsts && got != "max-age=63072000; includeSubDomains" {
			t.Errorf("HSTS = %q", got)
		}
		if !hsts && got != "" {
			t.Errorf("HSTS sent when disabled: %q", got)
		}
	}
}

func TestBodyLimit(t *testing.T) {
	var buf bytes.Buffer
	r := newEngine(&buf, false)
	for body, want := range map[string]int{"12345678": 200, "123456789": 413} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/limited", strings.NewReader(body)))
		if w.Code != want {
			t.Errorf("len %d: status = %d, want %d", len(body), w.Code, want)
		}
	}
}

func TestIsAPI(t *testing.T) {
	for p, want := range map[string]bool{"/api": true, "/api/": true, "/api/x": true, "/apiary": false, "/": false} {
		if IsAPI(p) != want {
			t.Errorf("IsAPI(%q) != %v", p, want)
		}
	}
}
