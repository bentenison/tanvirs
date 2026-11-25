// Package config loads and validates the portfolio server configuration from
// environment variables.
//
// Recognised variables:
//
//	PORTFOLIO_ADDR             Full listen address, e.g. ":8080" or "127.0.0.1:9000".
//	                           When unset, IP and PORT are used instead (the convention
//	                           used by alwaysdata and similar hosts); when PORT is also
//	                           unset the default is ":8080".
//	IP, PORT                   Listen address given by the host (alwaysdata sets both;
//	                           IP may be IPv6, e.g. "::" or "fd00::4a16"). HOST is accepted
//	                           in place of IP when it is an IP address.
//	PORTFOLIO_BASE_URL         Public absolute http(s) URL of the site.
//	                           Default "https://tanvirs.alwaysdata.net".
//	PORTFOLIO_LOG_LEVEL        debug | info | warn | error. Default "info".
//	PORTFOLIO_LOG_FORMAT       json | text. Default "json".
//	PORTFOLIO_TRUSTED_PROXIES  Comma separated IPs or CIDRs whose forwarding headers
//	                           are trusted when determining the client IP.
//	                           Default "127.0.0.1,::1". Use "none" to trust no proxy.
//	PORTFOLIO_HSTS             Boolean; send Strict-Transport-Security. Default false.
//	DATABASE_URL               PostgreSQL connection string, e.g.
//	                           postgres://user:pass@host:5432/db?sslmode=require.
//	                           Enables the contact form and the admin area. Never logged.
//	ADMIN_USERNAME             Login name for the admin area. Default "admin".
//	ADMIN_PASSWORD             Password for the admin area (at least 12 characters).
//	                           Seeded into the database at startup; changing it here
//	                           changes the login. Never logged.
//	ADMIN_SESSION_HOURS        Admin session lifetime in hours. Default 12.
//
// Without DATABASE_URL the site still serves pages; the contact form reports
// itself disabled and /admin is not available.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/netip"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Default values applied when the corresponding variable is unset.
const (
	DefaultAddr           = ":8080"
	DefaultBaseURL        = "https://tanvirs.alwaysdata.net"
	DefaultTrustedProxies = "127.0.0.1,::1"
	DefaultAdminUsername  = "admin"
	DefaultSessionTTL     = 12 * time.Hour
	MinAdminPasswordLen   = 12
)

// LogFormat selects the slog handler.
type LogFormat string

// Supported log formats.
const (
	LogJSON LogFormat = "json"
	LogText LogFormat = "text"
)

// Config is the complete, validated server configuration.
type Config struct {
	Addr           string
	AddrSource     string // PORTFOLIO_ADDR, IP/PORT or default
	BaseURL        string
	LogLevel       slog.Level
	LogFormat      LogFormat
	TrustedProxies []string // nil means trust no proxy
	HSTS           bool
	Database       Database
	Admin          Admin
}

// Database holds the PostgreSQL connection settings.
type Database struct {
	URL string
}

// Enabled reports whether a database is configured.
func (d Database) Enabled() bool { return d.URL != "" }

// LogValue implements slog.LogValuer; only the host and database name are logged.
func (d Database) LogValue() slog.Value {
	if !d.Enabled() {
		return slog.GroupValue(slog.Bool("enabled", false))
	}
	host, name := "", ""
	if u, err := url.Parse(d.URL); err == nil {
		host, name = u.Host, strings.TrimPrefix(u.Path, "/")
	}
	return slog.GroupValue(slog.Bool("enabled", true), slog.String("host", host), slog.String("name", name))
}

// String implements fmt.Stringer without the credentials.
func (d Database) String() string { return d.LogValue().String() }

// Admin holds the seeded admin login.
type Admin struct {
	Username   string
	Password   string
	SessionTTL time.Duration
}

// LogValue implements slog.LogValuer so the password is never logged.
func (a Admin) LogValue() slog.Value {
	return slog.GroupValue(
		slog.String("username", a.Username),
		slog.Bool("password_set", a.Password != ""),
		slog.String("session_ttl", a.SessionTTL.String()),
	)
}

// String implements fmt.Stringer with the password redacted.
func (a Admin) String() string { return a.LogValue().String() }

// LogValue implements slog.LogValuer.
func (c Config) LogValue() slog.Value {
	return slog.GroupValue(
		slog.String("addr", c.Addr),
		slog.String("addr_source", c.AddrSource),
		slog.String("base_url", c.BaseURL),
		slog.String("log_level", c.LogLevel.String()),
		slog.String("log_format", string(c.LogFormat)),
		slog.Any("trusted_proxies", c.TrustedProxies),
		slog.Bool("hsts", c.HSTS),
		slog.Any("database", c.Database),
		slog.Any("admin", c.Admin),
	)
}

// FromEnv loads the configuration from the process environment.
func FromEnv() (Config, error) {
	return Load(os.Getenv)
}

// Load builds a Config using getenv to look up variables. An empty value is
// treated as unset. All problems are reported together.
func Load(getenv func(string) string) (Config, error) {
	get := func(k string) string { return strings.TrimSpace(getenv(k)) }
	var errs []error
	fail := func(format string, a ...any) { errs = append(errs, fmt.Errorf(format, a...)) }

	cfg := Config{
		BaseURL:   DefaultBaseURL,
		LogLevel:  slog.LevelInfo,
		LogFormat: LogJSON,
		Admin:     Admin{Username: DefaultAdminUsername, SessionTTL: DefaultSessionTTL},
	}

	// Listen address.
	if v := get("PORTFOLIO_ADDR"); v != "" {
		if _, port, err := net.SplitHostPort(v); err != nil {
			fail("PORTFOLIO_ADDR %q: %v", v, err)
		} else if _, err := parsePort(port); err != nil {
			fail("PORTFOLIO_ADDR %q: %v", v, err)
		}
		cfg.Addr = v
		cfg.AddrSource = "PORTFOLIO_ADDR"
	} else if ip, port := hostIP(get), get("PORT"); ip != "" || port != "" {
		if port == "" {
			port = "8080"
		}
		if _, err := parsePort(port); err != nil {
			fail("PORT %q: %v", port, err)
		}
		if ip != "" {
			if _, err := netip.ParseAddr(ip); err != nil {
				fail("IP %q: not an IP address", ip)
			}
		}
		cfg.Addr = net.JoinHostPort(ip, port)
		cfg.AddrSource = "IP/PORT"
	} else {
		cfg.Addr = DefaultAddr
		cfg.AddrSource = "default"
	}

	if v := get("PORTFOLIO_BASE_URL"); v != "" {
		u, err := url.Parse(v)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			fail("PORTFOLIO_BASE_URL %q: must be an absolute http(s) URL", v)
		}
		cfg.BaseURL = strings.TrimRight(v, "/")
	}

	if v := get("PORTFOLIO_LOG_LEVEL"); v != "" {
		switch strings.ToLower(v) {
		case "debug":
			cfg.LogLevel = slog.LevelDebug
		case "info":
			cfg.LogLevel = slog.LevelInfo
		case "warn", "warning":
			cfg.LogLevel = slog.LevelWarn
		case "error":
			cfg.LogLevel = slog.LevelError
		default:
			fail("PORTFOLIO_LOG_LEVEL %q: want debug, info, warn or error", v)
		}
	}

	if v := get("PORTFOLIO_LOG_FORMAT"); v != "" {
		switch f := LogFormat(strings.ToLower(v)); f {
		case LogJSON, LogText:
			cfg.LogFormat = f
		default:
			fail("PORTFOLIO_LOG_FORMAT %q: want json or text", v)
		}
	}

	proxies := get("PORTFOLIO_TRUSTED_PROXIES")
	if proxies == "" {
		proxies = DefaultTrustedProxies
	}
	if !strings.EqualFold(proxies, "none") {
		for _, p := range strings.Split(proxies, ",") {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}
			if !validProxy(p) {
				fail("PORTFOLIO_TRUSTED_PROXIES: %q is not an IP address or CIDR", p)
				continue
			}
			cfg.TrustedProxies = append(cfg.TrustedProxies, p)
		}
	}

	if v := get("PORTFOLIO_HSTS"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			fail("PORTFOLIO_HSTS %q: not a boolean", v)
		}
		cfg.HSTS = b
	}

	// Database.
	if v := get("DATABASE_URL"); v != "" {
		u, err := url.Parse(v)
		if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || u.Host == "" {
			// Never echo the value: it contains the password.
			fail("DATABASE_URL: must be a postgres:// URL with a host")
		}
		cfg.Database.URL = v
	}

	// Admin login.
	if v := get("ADMIN_USERNAME"); v != "" {
		if len(v) > 64 || strings.ContainsAny(v, " \t\r\n") {
			fail("ADMIN_USERNAME: at most 64 characters and no spaces")
		}
		cfg.Admin.Username = v
	}
	cfg.Admin.Password = getenv("ADMIN_PASSWORD") // not trimmed: spaces may be intentional
	if cfg.Admin.Password != "" && len([]rune(cfg.Admin.Password)) < MinAdminPasswordLen {
		fail("ADMIN_PASSWORD: must be at least %d characters", MinAdminPasswordLen)
	}
	if v := get("ADMIN_SESSION_HOURS"); v != "" {
		h, err := strconv.Atoi(v)
		if err != nil || h < 1 || h > 24*30 {
			fail("ADMIN_SESSION_HOURS %q: want a whole number of hours between 1 and 720", v)
		}
		cfg.Admin.SessionTTL = time.Duration(h) * time.Hour
	}

	if len(errs) > 0 {
		return Config{}, errors.Join(errs...)
	}
	return cfg, nil
}

// hostIP returns IP, or HOST when IP is unset and HOST is an IP address
// (alwaysdata documents both names). A HOST that is a hostname is ignored.
func hostIP(get func(string) string) string {
	if ip := get("IP"); ip != "" {
		return ip
	}
	if h := get("HOST"); h != "" {
		if _, err := netip.ParseAddr(h); err == nil {
			return h
		}
	}
	return ""
}

func parsePort(s string) (int, error) {
	p, err := strconv.Atoi(s)
	if err != nil || p < 1 || p > 65535 {
		return 0, errors.New("port must be a number between 1 and 65535")
	}
	return p, nil
}

func validProxy(s string) bool {
	if _, err := netip.ParseAddr(s); err == nil {
		return true
	}
	_, err := netip.ParsePrefix(s)
	return err == nil
}
