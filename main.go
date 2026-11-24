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
	"syscall"
	"time"

	"github.com/bentenison/portfolio/internal/config"
	"github.com/bentenison/portfolio/internal/contact"
	"github.com/bentenison/portfolio/internal/handlers"
	"github.com/bentenison/portfolio/internal/server"
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

	var mailer contact.Mailer
	if cfg.SMTP.Enabled() {
		m, err := contact.NewSMTPMailer(cfg.SMTP)
		if err != nil {
			return err
		}
		mailer = m
	} else {
		log.Info("contact form disabled: SMTP_HOST, SMTP_FROM and CONTACT_TO are required")
	}

	health := handlers.NewHealth()
	srv, err := server.New(server.Options{
		Config:  cfg,
		Logger:  log,
		Static:  dist,
		Health:  health,
		Mailer:  mailer,
		Limiter: limiter,
	})
	if err != nil {
		return err
	}

	ln, err := net.Listen("tcp", cfg.Addr)
	if err != nil {
		return err
	}
	log.Info("listening", "addr", ln.Addr().String())

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
