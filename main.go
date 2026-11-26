// Command portfolio serves the embedded portfolio frontend and its small API.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/bentenison/portfolio/internal/admin"
	"github.com/bentenison/portfolio/internal/config"
	"github.com/bentenison/portfolio/internal/contact"
	"github.com/bentenison/portfolio/internal/handlers"
	"github.com/bentenison/portfolio/internal/server"
	"github.com/bentenison/portfolio/internal/store"
	"github.com/bentenison/portfolio/internal/web"
)

const shutdownTimeout = 15 * time.Second

// version is set at build time with -ldflags "-X main.version=...".
var version = "dev"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "portfolio:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.FromEnv()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}
	log := newLogger(cfg)
	slog.SetDefault(log)
	log.Info("starting", "version", version, "config", cfg)

	dist, err := web.Dist()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	limiter := contact.NewDefaultLimiter()
	janitorCtx, stopJanitor := context.WithCancel(context.Background())
	defer stopJanitor()
	go limiter.Run(janitorCtx, time.Minute)

	opts := server.Options{
		Config:  cfg,
		Logger:  log,
		Static:  dist,
		Health:  handlers.NewHealth(),
		Limiter: limiter,
	}
	if db := openStore(ctx, cfg, log); db != nil {
		defer db.Close()
		adm, err := admin.New(admin.Options{
			Store:      db,
			Logger:     log,
			SessionTTL: cfg.Admin.SessionTTL,
			Secure:     strings.HasPrefix(cfg.BaseURL, "https://"),
		})
		if err != nil {
			return err
		}
		go adm.Limiter().Run(janitorCtx, time.Minute)
		go pruneSessions(janitorCtx, db, log)
		opts.Saver, opts.Admin, opts.DB = db, adm, db
	}
	health := opts.Health
	srv, err := server.New(opts)
	if err != nil {
		return err
	}

	ln, err := net.Listen("tcp", cfg.Addr)
	if err != nil {
		return err
	}
	log.Info("listening", "addr", ln.Addr().String(), "source", cfg.AddrSource)

	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.Serve(ln) }()

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}
	stop() // a second signal now terminates immediately

	log.Info("shutting down", "timeout", shutdownTimeout.String())
	health.SetReady(false)
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	if err := <-serveErr; err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	log.Info("stopped")
	return nil
}

func newLogger(cfg config.Config) *slog.Logger {
	opts := &slog.HandlerOptions{Level: cfg.LogLevel}
	if cfg.LogFormat == config.LogText {
		return slog.New(slog.NewTextHandler(os.Stdout, opts))
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, opts))
}

// openStore connects, migrates and seeds the admin login. Any failure is
// logged and the site keeps serving pages with the contact form and /admin
// switched off, so a database outage never takes the portfolio down.
func openStore(ctx context.Context, cfg config.Config, log *slog.Logger) *store.Store {
	if !cfg.Database.Enabled() {
		log.Info("database not configured: contact form and /admin are disabled (set DATABASE_URL)")
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	db, err := store.Open(ctx, cfg.Database.URL)
	if err != nil {
		log.Error("database unavailable: contact form and /admin are disabled", "error", err)
		return nil
	}
	if err := db.Migrate(ctx); err != nil {
		log.Error("database migration failed: contact form and /admin are disabled", "error", err)
		db.Close()
		return nil
	}
	if cfg.Admin.Password == "" {
		log.Warn("ADMIN_PASSWORD not set: no admin login was seeded; existing logins still work")
		return db
	}
	created, err := db.SeedAdmin(ctx, cfg.Admin.Username, cfg.Admin.Password)
	if err != nil {
		log.Error("seeding the admin login failed", "error", err)
	} else if created {
		log.Info("admin login created", "username", cfg.Admin.Username)
	}
	return db
}

// pruneSessions deletes expired admin sessions every hour.
func pruneSessions(ctx context.Context, db *store.Store, log *slog.Logger) {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := db.PruneSessions(ctx); err != nil {
				log.Warn("pruning admin sessions failed", "error", err)
			}
		}
	}
}
