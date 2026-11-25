package admin

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/bentenison/portfolio/internal/contact"
	"github.com/bentenison/portfolio/internal/store"
)

// ---- in-memory store ---------------------------------------------------------

type memStore struct {
	mu       sync.Mutex
	msgs     map[int64]*store.Message
	nextID   int64
	sessions map[string]store.Session
	failList bool
}

func newMem() *memStore {
	return &memStore{msgs: map[int64]*store.Message{}, sessions: map[string]store.Session{}}
}

func (m *memStore) add(name, email, text, status string) int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.nextID++
	now := time.Now().Add(time.Duration(m.nextID) * time.Second)
	m.msgs[m.nextID] = &store.Message{ID: m.nextID, Name: name, Email: email, Message: text, Status: status, CreatedAt: now, UpdatedAt: now}
	return m.nextID
}

func (m *memStore) Authenticate(_ context.Context, u, p string) (store.Admin, error) {
	if u == "admin" && p == "correct horse battery" {
		return store.Admin{ID: 1, Username: "admin"}, nil
	}
	return store.Admin{}, store.ErrBadCredentials
}

func (m *memStore) CreateSession(_ context.Context, id int64, ttl time.Duration, _, _ string) (string, store.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	tok := "tok-" + strconv.Itoa(len(m.sessions)+1)
	s := store.Session{Admin: store.Admin{ID: id, Username: "admin"}, CSRFToken: "csrf-" + tok, ExpiresAt: time.Now().Add(ttl)}
	m.sessions[tok] = s
	return tok, s, nil
}

func (m *memStore) SessionByToken(_ context.Context, tok string) (store.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[tok]
	if !ok {
		return store.Session{}, store.ErrNotFound
	}
	return s, nil
}

func (m *memStore) DeleteSession(_ context.Context, tok string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, tok)
	return nil
}

func (m *memStore) ListMessages(_ context.Context, f store.MessageFilter) ([]store.Message, int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failList {
		return nil, 0, io.ErrUnexpectedEOF
	}
	var out []store.Message
	for _, msg := range m.msgs {
		switch {
		case f.Status == "all":
		case f.Status == "" && msg.Status == store.StatusArchived:
			continue
		case f.Status != "" && msg.Status != f.Status:
			continue
		}
		if q := strings.ToLower(f.Search); q != "" && !strings.Contains(strings.ToLower(msg.Name+msg.Email+msg.Message), q) {
			continue
		}
		out = append(out, *msg)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	total := len(out)
	if f.Offset >= len(out) {
		return nil, total, nil
	}
	out = out[f.Offset:]
	if f.Limit > 0 && len(out) > f.Limit {
		out = out[:f.Limit]
	}
	return out, total, nil
}

func (m *memStore) GetMessage(_ context.Context, id int64) (store.Message, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	msg, ok := m.msgs[id]
	if !ok {
		return store.Message{}, store.ErrNotFound
	}
	return *msg, nil
}

func (m *memStore) MarkReadIfNew(_ context.Context, id int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if msg, ok := m.msgs[id]; ok && msg.Status == store.StatusNew {
		msg.Status = store.StatusRead
	}
	return nil
}

func (m *memStore) SetStatus(_ context.Context, id int64, st string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	msg, ok := m.msgs[id]
	if !ok {
		return store.ErrNotFound
	}
	msg.Status = st
	return nil
}

func (m *memStore) SetNote(_ context.Context, id int64, note string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	msg, ok := m.msgs[id]
	if !ok {
		return store.ErrNotFound
	}
	msg.Note = note
	return nil
}

func (m *memStore) DeleteMessage(_ context.Context, id int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.msgs[id]; !ok {
		return store.ErrNotFound
	}
	delete(m.msgs, id)
	return nil
}

func (m *memStore) StatusCounts(_ context.Context) (map[string]int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[string]int{}
	for _, msg := range m.msgs {
		out[msg.Status]++
	}
	return out, nil
}

// ---- harness -------------------------------------------------------------

type harness struct {
	t    *testing.T
	mem  *memStore
	h    http.Handler
	logs *bytes.Buffer
}

func newHarness(t *testing.T, secure bool) *harness {
	t.Helper()
	gin.SetMode(gin.TestMode)
	mem := newMem()
	logs := &bytes.Buffer{}
	adm, err := New(Options{
		Store:        mem,
		Logger:       slog.New(slog.NewTextHandler(logs, nil)),
		SessionTTL:   time.Hour,
		Secure:       secure,
		LoginLimiter: contact.NewLimiter(3, time.Minute, 100, time.Hour),
	})
	if err != nil {
		t.Fatal(err)
	}
	r := gin.New()
	adm.Register(r)
	return &harness{t: t, mem: mem, h: r, logs: logs}
}

func (h *harness) req(method, target string, form url.Values, cookie string, hdr map[string]string) *httptest.ResponseRecorder {
	var body io.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	}
	r := httptest.NewRequest(method, target, body)
	r.RemoteAddr = "192.0.2.10:5000"
	if form != nil {
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	if cookie != "" {
		r.Header.Set("Cookie", cookie)
	}
	for k, v := range hdr {
		r.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	h.h.ServeHTTP(w, r)
	return w
}

// login returns the cookie header value and the CSRF token.
func (h *harness) login() (cookie, csrf string) {
	h.t.Helper()
	w := h.req(http.MethodPost, "/admin/login", url.Values{"username": {"admin"}, "password": {"correct horse battery"}}, "", nil)
	if w.Code != http.StatusSeeOther || w.Header().Get("Location") != "/admin" {
		h.t.Fatalf("login: %d %s", w.Code, w.Body.String())
	}
	set := w.Result().Cookies()
	if len(set) != 1 {
		h.t.Fatalf("cookies = %v", set)
	}
	c := set[0]
	s, _ := h.mem.SessionByToken(context.Background(), c.Value)
	return c.Name + "=" + c.Value, s.CSRFToken
}

// ---- tests -----------------------------------------------------------------

func TestUnauthenticatedRedirectsToLogin(t *testing.T) {
	h := newHarness(t, false)
	for _, p := range []string{"/admin", "/admin/", "/admin/messages/1", "/admin/export.csv"} {
		w := h.req(http.MethodGet, p, nil, "", nil)
		if w.Code != http.StatusSeeOther || w.Header().Get("Location") != "/admin/login" {
			t.Errorf("%s: %d -> %q", p, w.Code, w.Header().Get("Location"))
		}
	}
	w := h.req(http.MethodGet, "/admin", nil, "portfolio_admin=forged", nil)
	if w.Code != http.StatusSeeOther {
		t.Errorf("forged cookie accepted: %d", w.Code)
	}
}

func TestLoginPage(t *testing.T) {
	h := newHarness(t, false)
	w := h.req(http.MethodGet, "/admin/login", nil, "", nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `autocomplete="current-password"`) {
		t.Fatalf("got %d", w.Code)
	}
	if w.Header().Get("Cache-Control") != "no-store" || !strings.Contains(w.Header().Get("X-Robots-Tag"), "noindex") {
		t.Errorf("headers = %v", w.Header())
	}
}

func TestLoginCookieFlags(t *testing.T) {
	for _, secure := range []bool{false, true} {
		h := newHarness(t, secure)
		w := h.req(http.MethodPost, "/admin/login", url.Values{"username": {"admin"}, "password": {"correct horse battery"}}, "", nil)
		c := w.Result().Cookies()[0]
		if !c.HttpOnly || c.SameSite != http.SameSiteStrictMode || c.Path != "/" || c.MaxAge != 3600 {
			t.Errorf("secure=%v cookie = %+v", secure, c)
		}
		if secure && (!c.Secure || c.Name != "__Host-portfolio_admin") {
			t.Errorf("secure cookie = %+v", c)
		}
	}
}

func TestLoginFailureAndRateLimit(t *testing.T) {
	h := newHarness(t, false)
	bad := url.Values{"username": {"admin"}, "password": {"wrong"}}
	for i := range 3 {
		w := h.req(http.MethodPost, "/admin/login", bad, "", nil)
		if w.Code != http.StatusUnauthorized || len(w.Result().Cookies()) != 0 {
			t.Fatalf("attempt %d: %d", i, w.Code)
		}
		if !strings.Contains(w.Body.String(), "don&#39;t match") {
			t.Errorf("no error message: %s", w.Body.String())
		}
	}
	w := h.req(http.MethodPost, "/admin/login", url.Values{"username": {"admin"}, "password": {"correct horse battery"}}, "", nil)
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Errorf("rate limit: %d", w.Code)
	}
	if !strings.Contains(h.logs.String(), "admin login failed") {
		t.Error("failed logins not logged")
	}
	if strings.Contains(h.logs.String(), "wrong") {
		t.Error("password logged")
	}
}

func TestCrossOriginPostRejected(t *testing.T) {
	h := newHarness(t, false)
	w := h.req(http.MethodPost, "/admin/login", url.Values{"username": {"admin"}, "password": {"correct horse battery"}}, "",
		map[string]string{"Origin": "https://evil.example"})
	if w.Code != http.StatusForbidden {
		t.Errorf("cross-origin login: %d", w.Code)
	}
	cookie, csrf := h.login()
	id := h.mem.add("A", "a@example.com", "hello there friend", store.StatusNew)
	w = h.req(http.MethodPost, "/admin/messages/"+strconv.FormatInt(id, 10)+"/delete",
		url.Values{"csrf": {csrf}, "confirm": {"yes"}}, cookie, map[string]string{"Origin": "https://evil.example"})
	if w.Code != http.StatusForbidden {
		t.Errorf("cross-origin delete: %d", w.Code)
	}
	if _, err := h.mem.GetMessage(context.Background(), id); err != nil {
		t.Error("message deleted by cross-origin post")
	}
}

func TestCSRFRequired(t *testing.T) {
	h := newHarness(t, false)
	cookie, _ := h.login()
	id := h.mem.add("A", "a@example.com", "hello there friend", store.StatusNew)
	for _, token := range []string{"", "csrf-wrong"} {
		w := h.req(http.MethodPost, "/admin/messages/"+strconv.FormatInt(id, 10)+"/status",
			url.Values{"csrf": {token}, "status": {"archived"}}, cookie, nil)
		if w.Code != http.StatusForbidden {
			t.Errorf("csrf %q: %d", token, w.Code)
		}
	}
	if m, _ := h.mem.GetMessage(context.Background(), id); m.Status != store.StatusNew {
		t.Error("status changed without a valid CSRF token")
	}
}

func TestInboxListsAndEscapes(t *testing.T) {
	h := newHarness(t, false)
	cookie, _ := h.login()
	h.mem.add(`<script>alert(1)</script>`, "x@example.com", `<img src=x onerror=alert(1)> please call`, store.StatusNew)
	h.mem.add("Old", "old@example.com", "archived one", store.StatusArchived)
	w := h.req(http.MethodGet, "/admin", nil, cookie, nil)
	body := w.Body.String()
	if w.Code != 200 {
		t.Fatalf("inbox: %d", w.Code)
	}
	if strings.Contains(body, "<script>alert") || strings.Contains(body, "<img src=x") {
		t.Fatal("user content not escaped")
	}
	if !strings.Contains(body, "&lt;script&gt;") {
		t.Error("escaped name missing")
	}
	if strings.Contains(body, "archived one") {
		t.Error("archived message shown in the default inbox")
	}
	all := h.req(http.MethodGet, "/admin?status=all", nil, cookie, nil).Body.String()
	if !strings.Contains(all, "archived one") {
		t.Error("archived message missing from All")
	}
	search := h.req(http.MethodGet, "/admin?q=please", nil, cookie, nil).Body.String()
	if !strings.Contains(search, "please call") || strings.Contains(search, "old@example.com") {
		t.Error("search did not filter")
	}
}

func TestMessageViewMarksReadAndActions(t *testing.T) {
	h := newHarness(t, false)
	cookie, csrf := h.login()
	id := h.mem.add("Ada Lovelace", "ada@example.com", "Line one\nLine two", store.StatusNew)
	path := "/admin/messages/" + strconv.FormatInt(id, 10)

	w := h.req(http.MethodGet, path, nil, cookie, nil)
	if w.Code != 200 {
		t.Fatalf("view: %d", w.Code)
	}
	if m, _ := h.mem.GetMessage(context.Background(), id); m.Status != store.StatusRead {
		t.Errorf("status after opening = %s", m.Status)
	}
	if !regexp.MustCompile(`href="mailto:ada@example.com\?[^"]*subject=Re`).MatchString(w.Body.String()) {
		t.Error("reply mailto link missing")
	}

	post := func(action string, form url.Values) *httptest.ResponseRecorder {
		form.Set("csrf", csrf)
		return h.req(http.MethodPost, path+"/"+action, form, cookie, nil)
	}
	if w := post("status", url.Values{"status": {"replied"}}); w.Code != http.StatusSeeOther {
		t.Fatalf("status: %d", w.Code)
	}
	if w := post("status", url.Values{"status": {"bogus"}}); w.Code != http.StatusBadRequest {
		t.Errorf("bogus status: %d", w.Code)
	}
	if w := post("note", url.Values{"note": {"  Called on Monday  "}}); w.Code != http.StatusSeeOther {
		t.Fatalf("note: %d", w.Code)
	}
	m, _ := h.mem.GetMessage(context.Background(), id)
	if m.Status != store.StatusReplied || m.Note != "Called on Monday" {
		t.Errorf("after actions: %+v", m)
	}
	if w := post("delete", url.Values{}); w.Code != http.StatusBadRequest {
		t.Errorf("delete without confirm: %d", w.Code)
	}
	if w := post("delete", url.Values{"confirm": {"yes"}}); w.Code != http.StatusSeeOther || w.Header().Get("Location") != "/admin?done=deleted" {
		t.Errorf("delete: %d %s", w.Code, w.Header().Get("Location"))
	}
	if w := h.req(http.MethodGet, path, nil, cookie, nil); w.Code != http.StatusNotFound {
		t.Errorf("deleted message view: %d", w.Code)
	}
}

func TestExportCSVNeutralisesFormulas(t *testing.T) {
	h := newHarness(t, false)
	cookie, _ := h.login()
	h.mem.add("=HYPERLINK(\"http://evil\")", "a@example.com", "+cmd|' /C calc'!A0", store.StatusNew)
	w := h.req(http.MethodGet, "/admin/export.csv", nil, cookie, nil)
	if w.Code != 200 || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/csv") {
		t.Fatalf("export: %d %s", w.Code, w.Header().Get("Content-Type"))
	}
	body := w.Body.String()
	if !strings.Contains(body, `'=HYPERLINK`) || !strings.Contains(body, `'+cmd`) {
		t.Errorf("formulas not neutralised:\n%s", body)
	}
}

func TestLogoutEndsSession(t *testing.T) {
	h := newHarness(t, false)
	cookie, csrf := h.login()
	w := h.req(http.MethodPost, "/admin/logout", url.Values{"csrf": {csrf}}, cookie, nil)
	if w.Code != http.StatusSeeOther {
		t.Fatalf("logout: %d", w.Code)
	}
	if w := h.req(http.MethodGet, "/admin", nil, cookie, nil); w.Code != http.StatusSeeOther {
		t.Errorf("session still valid after logout: %d", w.Code)
	}
}

func TestStoreErrorShowsErrorPage(t *testing.T) {
	h := newHarness(t, false)
	cookie, _ := h.login()
	h.mem.failList = true
	w := h.req(http.MethodGet, "/admin", nil, cookie, nil)
	if w.Code != http.StatusInternalServerError || !strings.Contains(w.Body.String(), "Something went wrong") {
		t.Errorf("got %d", w.Code)
	}
}

func TestMailtoEncoding(t *testing.T) {
	u := string(mailto(store.Message{Name: "Ada Lovelace", Email: "ada@example.com", Message: "Hi & bye\nsecond", CreatedAt: time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC)}))
	if !strings.HasPrefix(u, "mailto:ada@example.com?") || strings.Contains(u, "+") {
		t.Fatalf("mailto = %s", u)
	}
	q, err := url.ParseQuery(strings.SplitN(u, "?", 2)[1])
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(q.Get("body"), "> Hi & bye\n> second") || !strings.HasPrefix(q.Get("body"), "Hi Ada,") {
		t.Errorf("body = %q", q.Get("body"))
	}
}
