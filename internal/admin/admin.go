// Package admin serves the private /admin area: a login, an inbox of contact
// messages and actions on them. Pages are server-rendered with html/template
// and need no JavaScript, so the strict Content-Security-Policy still holds.
package admin

import (
	"bytes"
	"context"
	"crypto/subtle"
	"embed"
	"encoding/csv"
	"errors"
	"fmt"
	"html/template"
	"log/slog"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata" // the host may not ship zoneinfo

	"github.com/gin-gonic/gin"

	"github.com/bentenison/portfolio/internal/contact"
	"github.com/bentenison/portfolio/internal/middleware"
	"github.com/bentenison/portfolio/internal/store"
)

//go:embed templates/*.html
var templateFS embed.FS

// Store is what the admin area needs from persistence.
type Store interface {
	Authenticate(ctx context.Context, username, password string) (store.Admin, error)
	CreateSession(ctx context.Context, adminID int64, ttl time.Duration, clientIP, userAgent string) (string, store.Session, error)
	SessionByToken(ctx context.Context, token string) (store.Session, error)
	DeleteSession(ctx context.Context, token string) error
	ListMessages(ctx context.Context, f store.MessageFilter) ([]store.Message, int, error)
	GetMessage(ctx context.Context, id int64) (store.Message, error)
	MarkReadIfNew(ctx context.Context, id int64) error
	SetStatus(ctx context.Context, id int64, status string) error
	SetNote(ctx context.Context, id int64, note string) error
	DeleteMessage(ctx context.Context, id int64) error
	StatusCounts(ctx context.Context) (map[string]int, error)
}

// Options configure the admin area.
type Options struct {
	Store      Store
	Logger     *slog.Logger
	SessionTTL time.Duration
	// Secure marks the session cookie Secure and uses the __Host- prefix.
	// Set it whenever the site is served over HTTPS.
	Secure bool
	// LoginLimiter throttles login attempts per client IP.
	LoginLimiter *contact.Limiter
	// Location is used to display times. Defaults to Asia/Kolkata.
	Location *time.Location
}

// Handler serves /admin.
type Handler struct {
	opt  Options
	tmpl *template.Template
}

const (
	pageSize      = 25
	sessionKey    = "admin.session"
	tokenKey      = "admin.token"
	maxFormBytes  = 32 << 10
	cookieBase    = "portfolio_admin"
	defaultZone   = "Asia/Kolkata"
	loginFailWait = 400 * time.Millisecond
)

// New parses the templates and returns a Handler.
func New(o Options) (*Handler, error) {
	if o.Store == nil {
		return nil, errors.New("admin: Store is required")
	}
	if o.SessionTTL <= 0 {
		o.SessionTTL = 12 * time.Hour
	}
	if o.LoginLimiter == nil {
		// 10 attempts per IP per 15 minutes, 100 per hour overall.
		o.LoginLimiter = contact.NewLimiter(10, 15*time.Minute, 100, time.Hour)
	}
	if o.Location == nil {
		loc, err := time.LoadLocation(defaultZone)
		if err != nil {
			loc = time.UTC
		}
		o.Location = loc
	}
	h := &Handler{opt: o}
	funcs := template.FuncMap{
		"when":     h.formatTime,
		"ago":      h.ago,
		"excerpt":  excerpt,
		"mailto":   mailto,
		"label":    statusLabel,
		"statuses": func() []string { return store.Statuses },
	}
	t, err := template.New("").Funcs(funcs).ParseFS(templateFS, "templates/*.html")
	if err != nil {
		return nil, fmt.Errorf("admin: templates: %w", err)
	}
	h.tmpl = t
	return h, nil
}

// Limiter exposes the login limiter so the caller can run its janitor.
func (h *Handler) Limiter() *contact.Limiter { return h.opt.LoginLimiter }

// Register mounts the admin routes on r.
func (h *Handler) Register(r gin.IRouter) {
	g := r.Group("/admin", noStore, middleware.BodyLimit(maxFormBytes))
	g.GET("/login", h.loginPage)
	g.POST("/login", h.sameOrigin, h.login)

	auth := g.Group("", h.requireSession)
	auth.GET("", h.inbox)
	auth.GET("/", h.inbox)
	auth.GET("/export.csv", h.export)
	auth.GET("/messages/:id", h.message)
	auth.POST("/messages/:id/status", h.sameOrigin, h.csrf, h.setStatus)
	auth.POST("/messages/:id/note", h.sameOrigin, h.csrf, h.setNote)
	auth.POST("/messages/:id/delete", h.sameOrigin, h.csrf, h.deleteMessage)
	auth.POST("/logout", h.sameOrigin, h.csrf, h.logout)
}

func noStore(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("X-Robots-Tag", "noindex, nofollow")
	c.Next()
}

func (h *Handler) cookieName() string {
	if h.opt.Secure {
		return "__Host-" + cookieBase
	}
	return cookieBase
}

func (h *Handler) setCookie(c *gin.Context, value string, maxAge int) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     h.cookieName(),
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   h.opt.Secure,
		SameSite: http.SameSiteStrictMode,
	})
}

// sameOrigin rejects cross-site form posts. Browsers send Origin on POST;
// when present it must match the request's own host.
func (h *Handler) sameOrigin(c *gin.Context) {
	if o := c.GetHeader("Origin"); o != "" && o != "null" {
		u, err := url.Parse(o)
		if err != nil || !strings.EqualFold(u.Host, c.Request.Host) {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
	}
	c.Next()
}

func (h *Handler) requireSession(c *gin.Context) {
	ck, err := c.Request.Cookie(h.cookieName())
	if err == nil {
		sess, err := h.opt.Store.SessionByToken(c.Request.Context(), ck.Value)
		if err == nil {
			c.Set(sessionKey, sess)
			c.Set(tokenKey, ck.Value)
			c.Next()
			return
		}
		if !errors.Is(err, store.ErrNotFound) {
			h.serverError(c, err)
			return
		}
	}
	c.Redirect(http.StatusSeeOther, "/admin/login")
	c.Abort()
}

func (h *Handler) csrf(c *gin.Context) {
	sess := session(c)
	got := c.PostForm("csrf")
	if got == "" || subtle.ConstantTimeCompare([]byte(got), []byte(sess.CSRFToken)) != 1 {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	c.Next()
}

func session(c *gin.Context) store.Session {
	v, _ := c.Get(sessionKey)
	s, _ := v.(store.Session)
	return s
}

// ---- login ----------------------------------------------------------------

func (h *Handler) loginPage(c *gin.Context) {
	h.render(c, http.StatusOK, "login.html", gin.H{"Title": "Sign in", "Username": ""})
}

func (h *Handler) login(c *gin.Context) {
	ctx := c.Request.Context()
	username := strings.TrimSpace(c.PostForm("username"))
	password := c.PostForm("password")
	data := gin.H{"Title": "Sign in", "Username": username}

	if ok, wait := h.opt.LoginLimiter.Allow(c.ClientIP()); !ok {
		c.Header("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
		data["Error"] = fmt.Sprintf("Too many attempts. Try again in %d minutes.", int(math.Ceil(wait.Minutes())))
		h.render(c, http.StatusTooManyRequests, "login.html", data)
		return
	}

	adm, err := h.opt.Store.Authenticate(ctx, username, password)
	if errors.Is(err, store.ErrBadCredentials) {
		h.opt.Logger.WarnContext(ctx, "admin login failed", "username", username, "client_ip", c.ClientIP())
		time.Sleep(loginFailWait)
		data["Error"] = "That username and password don't match."
		h.render(c, http.StatusUnauthorized, "login.html", data)
		return
	}
	if err != nil {
		h.serverError(c, err)
		return
	}
	token, _, err := h.opt.Store.CreateSession(ctx, adm.ID, h.opt.SessionTTL, c.ClientIP(), c.GetHeader("User-Agent"))
	if err != nil {
		h.serverError(c, err)
		return
	}
	h.setCookie(c, token, int(h.opt.SessionTTL.Seconds()))
	h.opt.Logger.InfoContext(ctx, "admin login", "username", adm.Username, "client_ip", c.ClientIP())
	c.Redirect(http.StatusSeeOther, "/admin")
}

func (h *Handler) logout(c *gin.Context) {
	if tok, ok := c.Get(tokenKey); ok {
		_ = h.opt.Store.DeleteSession(c.Request.Context(), tok.(string))
	}
	h.setCookie(c, "", -1)
	c.Redirect(http.StatusSeeOther, "/admin/login")
}

// ---- inbox ----------------------------------------------------------------

type tab struct {
	Key, Label string
	Count      int
	Active     bool
}

func (h *Handler) inbox(c *gin.Context) {
	ctx := c.Request.Context()
	status := c.Query("status")
	if status != "" && status != "all" && !store.ValidStatus(status) {
		status = ""
	}
	q := strings.TrimSpace(c.Query("q"))
	page, _ := strconv.Atoi(c.Query("page"))
	if page < 1 {
		page = 1
	}

	msgs, total, err := h.opt.Store.ListMessages(ctx, store.MessageFilter{
		Status: status, Search: q, Limit: pageSize, Offset: (page - 1) * pageSize,
	})
	if err != nil {
		h.serverError(c, err)
		return
	}
	counts, err := h.opt.Store.StatusCounts(ctx)
	if err != nil {
		h.serverError(c, err)
		return
	}
	all := 0
	for _, n := range counts {
		all += n
	}
	tabs := []tab{{Key: "", Label: "Inbox", Count: all - counts[store.StatusArchived]}}
	for _, s := range store.Statuses {
		tabs = append(tabs, tab{Key: s, Label: statusLabel(s), Count: counts[s]})
	}
	tabs = append(tabs, tab{Key: "all", Label: "All", Count: all})
	for i := range tabs {
		tabs[i].Active = tabs[i].Key == status
	}

	pages := (total + pageSize - 1) / pageSize
	h.render(c, http.StatusOK, "inbox.html", gin.H{
		"Title":    "Messages",
		"Session":  session(c),
		"Messages": msgs,
		"Total":    total,
		"Tabs":     tabs,
		"Status":   status,
		"Query":    q,
		"Page":     page,
		"Pages":    pages,
		"PrevURL":  pageURL(status, q, page-1, pages),
		"NextURL":  pageURL(status, q, page+1, pages),
		"Notice":   notice(c.Query("done")),
	})
}

func pageURL(status, q string, page, pages int) string {
	if page < 1 || page > pages {
		return ""
	}
	v := url.Values{}
	if status != "" {
		v.Set("status", status)
	}
	if q != "" {
		v.Set("q", q)
	}
	if page > 1 {
		v.Set("page", strconv.Itoa(page))
	}
	if len(v) == 0 {
		return "/admin"
	}
	return "/admin?" + v.Encode()
}

// ---- one message ------------------------------------------------------------

func messageID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	return id, err == nil && id > 0
}

func (h *Handler) message(c *gin.Context) {
	ctx := c.Request.Context()
	id, ok := messageID(c)
	if !ok {
		h.notFound(c)
		return
	}
	if err := h.opt.Store.MarkReadIfNew(ctx, id); err != nil {
		h.serverError(c, err)
		return
	}
	m, err := h.opt.Store.GetMessage(ctx, id)
	if errors.Is(err, store.ErrNotFound) {
		h.notFound(c)
		return
	}
	if err != nil {
		h.serverError(c, err)
		return
	}
	h.render(c, http.StatusOK, "message.html", gin.H{
		"Title":   "Message from " + m.Name,
		"Session": session(c),
		"M":       m,
		"Notice":  notice(c.Query("done")),
	})
}

func (h *Handler) setStatus(c *gin.Context) {
	id, ok := messageID(c)
	status := c.PostForm("status")
	if !ok || !store.ValidStatus(status) {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if err := h.opt.Store.SetStatus(c.Request.Context(), id, status); err != nil {
		h.mutationError(c, err)
		return
	}
	c.Redirect(http.StatusSeeOther, fmt.Sprintf("/admin/messages/%d?done=status", id))
}

func (h *Handler) setNote(c *gin.Context) {
	id, ok := messageID(c)
	if !ok {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if err := h.opt.Store.SetNote(c.Request.Context(), id, strings.TrimSpace(c.PostForm("note"))); err != nil {
		h.mutationError(c, err)
		return
	}
	c.Redirect(http.StatusSeeOther, fmt.Sprintf("/admin/messages/%d?done=note", id))
}

func (h *Handler) deleteMessage(c *gin.Context) {
	id, ok := messageID(c)
	if !ok || c.PostForm("confirm") != "yes" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if err := h.opt.Store.DeleteMessage(c.Request.Context(), id); err != nil {
		h.mutationError(c, err)
		return
	}
	h.opt.Logger.InfoContext(c.Request.Context(), "admin deleted message", "message_id", id, "username", session(c).Admin.Username)
	c.Redirect(http.StatusSeeOther, "/admin?done=deleted")
}

// export streams every message as CSV (Excel-safe: formula prefixes neutralised).
func (h *Handler) export(c *gin.Context) {
	ctx := c.Request.Context()
	var rows []store.Message
	for offset := 0; ; offset += 200 {
		batch, _, err := h.opt.Store.ListMessages(ctx, store.MessageFilter{Status: "all", Limit: 200, Offset: offset})
		if err != nil {
			h.serverError(c, err)
			return
		}
		rows = append(rows, batch...)
		if len(batch) < 200 {
			break
		}
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"id", "received", "status", "name", "email", "message", "note"})
	for _, m := range rows {
		_ = w.Write([]string{
			strconv.FormatInt(m.ID, 10), m.CreatedAt.In(h.opt.Location).Format("2006-01-02 15:04"), m.Status,
			csvSafe(m.Name), csvSafe(m.Email), csvSafe(m.Message), csvSafe(m.Note),
		})
	}
	w.Flush()
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="messages-%s.csv"`, time.Now().In(h.opt.Location).Format("2006-01-02")))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", buf.Bytes())
}

// csvSafe stops spreadsheet apps from treating cell text as a formula.
func csvSafe(s string) string {
	if s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0])) {
		return "'" + s
	}
	return s
}

// ---- rendering --------------------------------------------------------------

func (h *Handler) render(c *gin.Context, code int, name string, data gin.H) {
	var buf bytes.Buffer
	if err := h.tmpl.ExecuteTemplate(&buf, name, data); err != nil {
		h.opt.Logger.ErrorContext(c.Request.Context(), "admin template", "template", name, "error", err)
		c.String(http.StatusInternalServerError, "internal error")
		return
	}
	c.Data(code, "text/html; charset=utf-8", buf.Bytes())
}

func (h *Handler) notFound(c *gin.Context) {
	h.render(c, http.StatusNotFound, "notfound.html", gin.H{"Title": "Not found", "Session": session(c)})
	c.Abort()
}

func (h *Handler) mutationError(c *gin.Context, err error) {
	if errors.Is(err, store.ErrNotFound) {
		h.notFound(c)
		return
	}
	h.serverError(c, err)
}

func (h *Handler) serverError(c *gin.Context, err error) {
	h.opt.Logger.ErrorContext(c.Request.Context(), "admin error", "path", c.Request.URL.Path, "error", err)
	h.render(c, http.StatusInternalServerError, "error.html", gin.H{"Title": "Something went wrong"})
	c.Abort()
}

func notice(key string) string {
	switch key {
	case "status":
		return "Status updated."
	case "note":
		return "Note saved."
	case "deleted":
		return "Message deleted."
	}
	return ""
}

func statusLabel(s string) string {
	switch s {
	case store.StatusNew:
		return "New"
	case store.StatusRead:
		return "Read"
	case store.StatusReplied:
		return "Replied"
	case store.StatusArchived:
		return "Archived"
	}
	return s
}

func (h *Handler) formatTime(t time.Time) string {
	return t.In(h.opt.Location).Format("2 Jan 2006, 15:04 MST")
}

func (h *Handler) ago(t time.Time) string {
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%d min ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%d h ago", int(d.Hours()))
	case d < 7*24*time.Hour:
		return fmt.Sprintf("%d d ago", int(d.Hours()/24))
	}
	return t.In(h.opt.Location).Format("2 Jan 2006")
}

func excerpt(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > n {
		return string(r[:n]) + "…"
	}
	return s
}

// mailto builds a reply link that opens the admin's own mail app with the
// visitor's address, a subject and their message quoted.
func mailto(m store.Message) template.URL {
	var quoted strings.Builder
	for _, line := range strings.Split(m.Message, "\n") {
		quoted.WriteString("> " + line + "\n")
	}
	q := url.Values{}
	q.Set("subject", "Re: your message on my portfolio")
	q.Set("body", fmt.Sprintf("Hi %s,\n\n\n\nOn %s you wrote:\n%s", firstName(m.Name), m.CreatedAt.Format("2 Jan 2006"), quoted.String()))
	// url.Values encodes spaces as "+", which mail clients show literally.
	enc := strings.ReplaceAll(q.Encode(), "+", "%20")
	return template.URL("mailto:" + url.PathEscape(m.Email) + "?" + enc) //nolint:gosec // all parts escaped above
}

func firstName(name string) string {
	if f := strings.Fields(name); len(f) > 0 {
		return f[0]
	}
	return "there"
}
