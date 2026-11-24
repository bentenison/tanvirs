package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func TestNegotiate(t *testing.T) {
	tests := []struct {
		header         string
		haveBr, haveGz bool
		want           string
	}{
		{"", true, true, ""},
		{"br, gzip", true, true, "br"},
		{"br, gzip", false, true, "gzip"},
		{"br, gzip", false, false, ""},
		{"gzip;q=1, br;q=0.9", true, true, "gzip"},
		{"gzip;q=0.9, br;q=0.9", true, true, "br"},
		{"br;q=0", true, false, ""},
		{"*;q=0.1, gzip;q=0", true, true, "br"},
		{"deflate", true, true, ""},
		{" gzip ; q=0.5 ", true, true, "gzip"},
	}
	for _, tt := range tests {
		if got := negotiate(tt.header, tt.haveBr, tt.haveGz); got != tt.want {
			t.Errorf("negotiate(%q, %v, %v) = %q, want %q", tt.header, tt.haveBr, tt.haveGz, got, tt.want)
		}
	}
}

func TestCleanName(t *testing.T) {
	tests := []struct {
		in   string
		want string
		ok   bool
	}{
		{"/", "", true},
		{"", "", true},
		{"/a/b/", "a/b", true},
		{"//a//b", "a/b", true},
		{"/a/./b", "a/b", true},
		{"/../x", "", false},
		{"/a/../x", "", false},
		{"/a\\b", "", false},
	}
	for _, tt := range tests {
		got, ok := cleanName(tt.in)
		if got != tt.want || ok != tt.ok {
			t.Errorf("cleanName(%q) = %q, %v; want %q, %v", tt.in, got, ok, tt.want, tt.ok)
		}
	}
}

func TestStaticEncoded304(t *testing.T) {
	s, err := NewStatic(fstest.MapFS{
		"index.html":      {Data: []byte("<p>hi</p>")},
		"app.js":          {Data: []byte("identity")},
		"app.js.br":       {Data: []byte("brotli")},
		"orphan.txt.gz":   {Data: []byte("no base file")},
		"nested/x/a.json": {Data: []byte("{}")},
	})
	if err != nil {
		t.Fatal(err)
	}
	get := func(target string, hdr map[string]string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, target, nil)
		for k, v := range hdr {
			req.Header.Set(k, v)
		}
		w := httptest.NewRecorder()
		s.ServeHTTP(w, req)
		return w
	}
	w := get("/app.js", map[string]string{"Accept-Encoding": "br"})
	etag := w.Header().Get("ETag")
	w = get("/app.js", map[string]string{"Accept-Encoding": "br", "If-None-Match": etag})
	if w.Code != http.StatusNotModified || w.Body.Len() != 0 || w.Header().Get("Vary") != "Accept-Encoding" {
		t.Errorf("encoded revalidation: %d %q %v", w.Code, w.Body.String(), w.Header())
	}
	// The identity ETag does not validate the br representation.
	id := get("/app.js", nil).Header().Get("ETag")
	if w := get("/app.js", map[string]string{"Accept-Encoding": "br", "If-None-Match": id}); w.Code != http.StatusOK {
		t.Errorf("identity etag matched br: %d", w.Code)
	}
	if w := get("/orphan.txt.gz", nil); w.Code != http.StatusNotFound {
		t.Errorf("orphan .gz = %d", w.Code)
	}
	if w := get("/nested/x/a.json", nil); w.Code != http.StatusOK {
		t.Errorf("nested asset = %d", w.Code)
	}
}
