package config

import (
	"bytes"
	"fmt"
	"log/slog"
	"reflect"
	"strings"
	"testing"
)

func envFunc(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(envFunc(nil))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Addr != ":8080" {
		t.Errorf("Addr = %q", cfg.Addr)
	}
	if cfg.BaseURL != DefaultBaseURL {
		t.Errorf("BaseURL = %q", cfg.BaseURL)
	}
	if cfg.LogLevel != slog.LevelInfo || cfg.LogFormat != LogJSON {
		t.Errorf("log = %v %v", cfg.LogLevel, cfg.LogFormat)
	}
	if want := []string{"127.0.0.1", "::1"}; !reflect.DeepEqual(cfg.TrustedProxies, want) {
		t.Errorf("TrustedProxies = %v", cfg.TrustedProxies)
	}
	if cfg.HSTS {
		t.Error("HSTS should default to false")
	}
	if cfg.SMTP.Port != 587 || cfg.SMTP.TLS != TLSStartTLS {
		t.Errorf("SMTP defaults = %+v", cfg.SMTP)
	}
	if cfg.SMTP.Enabled() {
		t.Error("contact should be disabled by default")
	}
}

func TestLoadAddr(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
		want string
	}{
		{"explicit", map[string]string{"PORTFOLIO_ADDR": "127.0.0.1:9000", "PORT": "1"}, "127.0.0.1:9000"},
		{"ip and port", map[string]string{"IP": "10.0.0.5", "PORT": "8100"}, "10.0.0.5:8100"},
		{"ipv6 and port", map[string]string{"IP": "::", "PORT": "8100"}, "[::]:8100"},
		{"port only", map[string]string{"PORT": "3000"}, ":3000"},
		{"ip only", map[string]string{"IP": "10.0.0.5"}, "10.0.0.5:8080"},
		{"default", nil, ":8080"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg, err := Load(envFunc(tt.env))
			if err != nil {
				t.Fatalf("Load: %v", err)
			}
			if cfg.Addr != tt.want {
				t.Errorf("Addr = %q, want %q", cfg.Addr, tt.want)
			}
		})
	}
}

func TestLoadValues(t *testing.T) {
	cfg, err := Load(envFunc(map[string]string{
		"PORTFOLIO_BASE_URL":        "http://localhost:8080/",
		"PORTFOLIO_LOG_LEVEL":       "DEBUG",
		"PORTFOLIO_LOG_FORMAT":      "text",
		"PORTFOLIO_TRUSTED_PROXIES": " 10.0.0.0/8 , 192.168.1.1 ",
		"PORTFOLIO_HSTS":            "true",
		"SMTP_HOST":                 "smtp.example.com",
		"SMTP_PORT":                 "465",
		"SMTP_TLS":                  "tls",
		"SMTP_FROM":                 "site@example.com",
		"CONTACT_TO":                "owner@example.com",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.BaseURL != "http://localhost:8080" {
		t.Errorf("BaseURL = %q", cfg.BaseURL)
	}
	if cfg.LogLevel != slog.LevelDebug || cfg.LogFormat != LogText || !cfg.HSTS {
		t.Errorf("unexpected %+v", cfg)
	}
	if want := []string{"10.0.0.0/8", "192.168.1.1"}; !reflect.DeepEqual(cfg.TrustedProxies, want) {
		t.Errorf("TrustedProxies = %v", cfg.TrustedProxies)
	}
	if !cfg.SMTP.Enabled() || cfg.SMTP.Port != 465 || cfg.SMTP.TLS != TLSImplicit {
		t.Errorf("SMTP = %+v", cfg.SMTP)
	}
}

func TestLoadTrustedProxiesNone(t *testing.T) {
	cfg, err := Load(envFunc(map[string]string{"PORTFOLIO_TRUSTED_PROXIES": "none"}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.TrustedProxies != nil {
		t.Errorf("TrustedProxies = %v, want nil", cfg.TrustedProxies)
	}
}

func TestLoadInvalid(t *testing.T) {
	tests := []struct {
		key, value string
	}{
		{"PORTFOLIO_ADDR", "nope"},
		{"PORTFOLIO_ADDR", ":99999"},
		{"PORT", "abc"},
		{"PORT", "0"},
		{"IP", "not-an-ip"},
		{"PORTFOLIO_BASE_URL", "ftp://example.com"},
		{"PORTFOLIO_BASE_URL", "/relative"},
		{"PORTFOLIO_LOG_LEVEL", "verbose"},
		{"PORTFOLIO_LOG_FORMAT", "xml"},
		{"PORTFOLIO_TRUSTED_PROXIES", "127.0.0.1,banana"},
		{"PORTFOLIO_HSTS", "maybe"},
		{"SMTP_PORT", "-1"},
		{"SMTP_TLS", "ssl3"},
		{"SMTP_FROM", "not an address"},
		{"CONTACT_TO", "a@b.com\r\nBcc: x@y.com"},
	}
	for _, tt := range tests {
		t.Run(tt.key+"="+tt.value, func(t *testing.T) {
			_, err := Load(envFunc(map[string]string{tt.key: tt.value}))
			if err == nil {
				t.Fatal("expected error")
			}
			if !strings.Contains(err.Error(), tt.key) {
				t.Errorf("error %q does not mention %s", err, tt.key)
			}
		})
	}
}

func TestEnabledRequiresAll(t *testing.T) {
	for _, s := range []SMTP{
		{Host: "h", From: "f@x.com"},
		{Host: "h", To: "t@x.com"},
		{From: "f@x.com", To: "t@x.com"},
	} {
		if s.Enabled() {
			t.Errorf("%+v should not be enabled", s)
		}
	}
}

func TestPasswordRedacted(t *testing.T) {
	const secret = "hunter2-super-secret"
	cfg, err := Load(envFunc(map[string]string{
		"SMTP_HOST":     "smtp.example.com",
		"SMTP_USERNAME": "user",
		"SMTP_PASSWORD": secret,
		"SMTP_FROM":     "site@example.com",
		"CONTACT_TO":    "owner@example.com",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.SMTP.Password != secret {
		t.Fatal("password not loaded")
	}
	for _, newHandler := range []func(*bytes.Buffer) slog.Handler{
		func(b *bytes.Buffer) slog.Handler { return slog.NewJSONHandler(b, nil) },
		func(b *bytes.Buffer) slog.Handler { return slog.NewTextHandler(b, nil) },
	} {
		var buf bytes.Buffer
		log := slog.New(newHandler(&buf))
		log.Info("config", "config", cfg)
		log.Info("smtp", "smtp", cfg.SMTP)
		out := buf.String()
		if strings.Contains(out, secret) {
			t.Fatalf("password leaked: %s", out)
		}
		if !strings.Contains(out, "[REDACTED]") {
			t.Errorf("expected redaction marker in %s", out)
		}
	}
	if s := fmt.Sprintf("%v %s", cfg.SMTP, cfg.SMTP); strings.Contains(s, secret) {
		t.Fatalf("password leaked via fmt: %s", s)
	}
}
