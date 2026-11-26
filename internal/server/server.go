// Package server assembles the Gin engine and the production *http.Server.
package server

import (
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/bentenison/portfolio/internal/admin"
	"github.com/bentenison/portfolio/internal/config"
	"github.com/bentenison/portfolio/internal/contact"
	"github.com/bentenison/portfolio/internal/handlers"
	"github.com/bentenison/portfolio/internal/middleware"
)

// HTTP server limits.
const (
	ReadHeaderTimeout = 5 * time.Second
	ReadTimeout       = 15 * time.Second
	WriteTimeout      = 30 * time.Second
	IdleTimeout       = 120 * time.Second
	MaxHeaderBytes    = 64 << 10
)

// Options are the dependencies of the server.
type Options struct {
	Config       config.Config
	Logger       *slog.Logger
	Static       fs.FS                 // embedded frontend build
	Health       *handlers.Health      // readiness flag, flipped by the caller on shutdown
	Saver        handlers.MessageSaver // nil disables the contact form
	Limiter      *contact.Limiter      // contact rate limiter; caller runs its janitor
	Admin        *admin.Handler        // nil disables /admin
	DB           handlers.Pinger       // optional; adds a database stage to /api/trace
	TraceLimiter *contact.Limiter      // optional; defaults to handlers.NewTraceLimiter
}

var releaseMode sync.Once

// NewEngine builds the Gin engine with all middleware and routes.
func NewEngine(o Options) (*gin.Engine, error) {
	releaseMode.Do(func() { gin.SetMode(gin.ReleaseMode) })

	static, err := handlers.NewStatic(o.Static)
	if err != nil {
		return nil, err
	}
	if !static.HasIndex() {
		o.Logger.Warn("frontend not built: embedded dist has no index.html; navigation requests will return 503")
	}

	r := gin.New()
	r.HandleMethodNotAllowed = true
	r.RedirectTrailingSlash = false // trailing slashes are handled by the SPA handler
	if err := r.SetTrustedProxies(o.Config.TrustedProxies); err != nil {
		return nil, fmt.Errorf("trusted proxies: %w", err)
	}

	r.Use(
		middleware.RequestID(),
		middleware.Recovery(o.Logger),
		middleware.Logger(o.Logger),
		middleware.SecurityHeaders(o.Config.HSTS),
	)

	r.GET("/healthz", o.Health.Healthz)
	r.HEAD("/healthz", o.Health.Healthz)
	r.GET("/readyz", o.Health.Readyz)
	r.HEAD("/readyz", o.Health.Readyz)

	c := &handlers.Contact{Saver: o.Saver, Limiter: o.Limiter, Logger: o.Logger}
	api := r.Group("/api")
	api.GET("/contact", c.Status)
	api.POST("/contact", middleware.BodyLimit(handlers.MaxContactBody), c.Submit)

	tl := o.TraceLimiter
	if tl == nil {
		tl = handlers.NewTraceLimiter()
	}
	trace := &handlers.Trace{DB: o.DB, Limiter: tl}
	api.GET("/trace", trace.Get)

	siteJS := handlers.SiteConfigScript(handlers.SiteConfig{Hero: o.Config.Hero, Ask: o.Config.Ask})
	r.GET("/site-config.js", siteJS)
	r.HEAD("/site-config.js", siteJS)

	if o.Admin != nil {
		o.Admin.Register(r)
	}

	r.NoRoute(func(c *gin.Context) {
		if middleware.IsAPI(c.Request.URL.Path) {
			handlers.APIJSON(c, http.StatusNotFound, gin.H{"error": "not_found"})
			return
		}
		static.ServeHTTP(c.Writer, c.Request)
		// Mark the response written so Gin does not append its default
		// "404 page not found" body to bodiless (HEAD/304) responses.
		c.Writer.WriteHeaderNow()
	})
	r.NoMethod(func(c *gin.Context) {
		// Gin has already set the Allow header.
		if middleware.IsAPI(c.Request.URL.Path) {
			handlers.APIJSON(c, http.StatusMethodNotAllowed, gin.H{"error": "not_found"})
			return
		}
		c.Header("Content-Type", "text/plain; charset=utf-8")
		c.String(http.StatusMethodNotAllowed, "method not allowed")
	})
	return r, nil
}

// New returns an *http.Server with production timeouts serving NewEngine.
func New(o Options) (*http.Server, error) {
	engine, err := NewEngine(o)
	if err != nil {
		return nil, err
	}
	return &http.Server{
		Addr:              o.Config.Addr,
		Handler:           engine,
		ReadHeaderTimeout: ReadHeaderTimeout,
		ReadTimeout:       ReadTimeout,
		WriteTimeout:      WriteTimeout,
		IdleTimeout:       IdleTimeout,
		MaxHeaderBytes:    MaxHeaderBytes,
		ErrorLog:          slog.NewLogLogger(o.Logger.Handler(), slog.LevelWarn),
	}, nil
}
