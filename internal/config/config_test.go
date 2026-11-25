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
	if cfg.Database.Enabled() {
		t.Error("database should be disabled by default")
	}
	if cfg.Admin.Username != "admin" || cfg.Admin.SessionTTL != DefaultSessionTTL || cfg.Admin.Password != "" {
		t.Errorf("admin defaults = %+v", cfg.Admin)
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
		{"alwaysdata ipv6", map[string]string{"IP": "fd00::4a16", "PORT": "8100"}, "[fd00::4a16]:8100"},
		{"HOST as IP", map[string]string{"HOST": "fd00::4a16", "PORT": "8100"}, "[fd00::4a16]:8100"},
		{"IP wins over HOST", map[string]string{"IP": "::", "HOST": "10.0.0.9", "PORT": "8100"}, "[::]:8100"},
		{"hostname HOST ignored", map[string]string{"HOST": "my-laptop", "PORT": "8100"}, ":8100"},
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
			if cfg.AddrSource == "" {
				t.Error("AddrSource not set")
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
		"DATABASE_URL":              "postgres://u:p@db.example.com:5432/portfolio?sslmode=require",
		"ADMIN_USERNAME":            "tanvir",
		"ADMIN_PASSWORD":            "a-long-enough-password",
		"ADMIN_SESSION_HOURS":       "8",
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
	if !cfg.Database.Enabled() {
		t.Error("database should be enabled")
	}
	if cfg.Admin.Username != "tanvir" || cfg.Admin.Password != "a-long-enough-password" || cfg.Admin.SessionTTL.Hours() != 8 {
		t.Errorf("admin = %+v", cfg.Admin)
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
		{"DATABASE_URL", "mysql://u:p@h/db"},
		{"DATABASE_URL", "postgres:///nohost"},
		{"ADMIN_USERNAME", "has space"},
		{"ADMIN_PASSWORD", "short"},
		{"ADMIN_SESSION_HOURS", "0"},
		{"ADMIN_SESSION_HOURS", "lots"},
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

func TestSecretsRedacted(t *testing.T) {
	const dbSecret = "db-pass-hunter2"
	const adminSecret = "admin-pass-hunter2"
	cfg, err := Load(envFunc(map[string]string{
		"DATABASE_URL":   "postgres://portfolio:" + dbSecret + "@db.example.com:5432/portfolio",
		"ADMIN_PASSWORD": adminSecret,
	}))
	if err != nil {
		t.Fatal(err)
	}
	for _, newHandler := range []func(*bytes.Buffer) slog.Handler{
		func(b *bytes.Buffer) slog.Handler { return slog.NewJSONHandler(b, nil) },
		func(b *bytes.Buffer) slog.Handler { return slog.NewTextHandler(b, nil) },
	} {
		var buf bytes.Buffer
		log := slog.New(newHandler(&buf))
		log.Info("config", "config", cfg)
		out := buf.String()
		if strings.Contains(out, dbSecret) || strings.Contains(out, adminSecret) {
			t.Fatalf("secret leaked: %s", out)
		}
		if !strings.Contains(out, "db.example.com") {
			t.Errorf("expected database host in %s", out)
		}
	}
	if s := fmt.Sprintf("%v %s %v", cfg.Database, cfg.Admin, cfg); strings.Contains(s, dbSecret) || strings.Contains(s, adminSecret) {
		t.Fatalf("secret leaked via fmt: %s", s)
	}
}

func TestInvalidDatabaseURLNotEchoed(t *testing.T) {
	_, err := Load(envFunc(map[string]string{"DATABASE_URL": "mysql://u:topsecret@h/db"}))
	if err == nil || strings.Contains(err.Error(), "topsecret") {
		t.Fatalf("err = %v", err)
	}
}
