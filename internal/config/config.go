// Package config loads and validates the portfolio server configuration from
// environment variables.
//
// Recognised variables:
//
//	PORTFOLIO_ADDR             Full listen address, e.g. ":8080" or "127.0.0.1:9000".
//	                           When unset, IP and PORT are used instead (the convention
//	                           used by alwaysdata and similar hosts); when PORT is also
//	                           unset the default is ":8080".
//	IP, PORT                   Fallback host and port for the listen address.
//	PORTFOLIO_BASE_URL         Public absolute http(s) URL of the site.
//	                           Default "https://tanvirs.alwaysdata.net".
//	PORTFOLIO_LOG_LEVEL        debug | info | warn | error. Default "info".
//	PORTFOLIO_LOG_FORMAT       json | text. Default "json".
//	PORTFOLIO_TRUSTED_PROXIES  Comma separated IPs or CIDRs whose forwarding headers
//	                           are trusted when determining the client IP.
//	                           Default "127.0.0.1,::1". Use "none" to trust no proxy.
//	PORTFOLIO_HSTS             Boolean; send Strict-Transport-Security. Default false.
//	SMTP_HOST                  SMTP server host name. Required to enable contact.
//	SMTP_PORT                  SMTP server port. Default 587.
//	SMTP_USERNAME              SMTP username; PLAIN auth is used only when set.
//	SMTP_PASSWORD              SMTP password. Never logged.
//	SMTP_FROM                  Envelope and header sender address. Required to enable contact.
//	CONTACT_TO                 Recipient of contact messages. Required to enable contact.
//	SMTP_TLS                   starttls | tls | none. Default "starttls".
//
// The contact form is enabled only when SMTP_HOST, SMTP_FROM and CONTACT_TO
// are all set.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/mail"
	"net/netip"
	"net/url"
	"os"
	"strconv"
	"strings"
)

// Default values applied when the corresponding variable is unset.
const (
	DefaultAddr           = ":8080"
	DefaultBaseURL        = "https://tanvirs.alwaysdata.net"
	DefaultTrustedProxies = "127.0.0.1,::1"
	DefaultSMTPPort       = 587
)

// LogFormat selects the slog handler.
type LogFormat string

// Supported log formats.
const (
	LogJSON LogFormat = "json"
	LogText LogFormat = "text"
)

// TLSMode selects how the SMTP connection is secured.
type TLSMode string

// Supported SMTP TLS modes.
const (
	TLSStartTLS TLSMode = "starttls"
	TLSImplicit TLSMode = "tls"
	TLSNone     TLSMode = "none"
)

// Config is the complete, validated server configuration.
type Config struct {
	Addr           string
	BaseURL        string
	LogLevel       slog.Level
	LogFormat      LogFormat
	TrustedProxies []string // nil means trust no proxy
	HSTS           bool
	SMTP           SMTP
}

// SMTP holds contact delivery settings.
type SMTP struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
	To       string
	TLS      TLSMode
}

// Enabled reports whether enough settings are present to deliver contact
// messages.
func (s SMTP) Enabled() bool {
	return s.Host != "" && s.From != "" && s.To != ""
}

// LogValue implements slog.LogValuer so the password is never logged.
func (s SMTP) LogValue() slog.Value {
	pw := ""
	if s.Password != "" {
		pw = "[REDACTED]"
	}
	return slog.GroupValue(
		slog.Bool("enabled", s.Enabled()),
		slog.String("host", s.Host),
		slog.Int("port", s.Port),
		slog.String("username", s.Username),
		slog.String("password", pw),
		slog.String("from", s.From),
		slog.String("to", s.To),
		slog.String("tls", string(s.TLS)),
	)
}

// String implements fmt.Stringer with the password redacted, so accidental
// %v formatting is also safe.
func (s SMTP) String() string {
	return s.LogValue().String()
}

// LogValue implements slog.LogValuer.
func (c Config) LogValue() slog.Value {
	return slog.GroupValue(
		slog.String("addr", c.Addr),
		slog.String("base_url", c.BaseURL),
		slog.String("log_level", c.LogLevel.String()),
		slog.String("log_format", string(c.LogFormat)),
		slog.Any("trusted_proxies", c.TrustedProxies),
		slog.Bool("hsts", c.HSTS),
		slog.Any("smtp", c.SMTP),
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
		SMTP:      SMTP{Port: DefaultSMTPPort, TLS: TLSStartTLS},
	}

	// Listen address.
	if v := get("PORTFOLIO_ADDR"); v != "" {
		if _, port, err := net.SplitHostPort(v); err != nil {
			fail("PORTFOLIO_ADDR %q: %v", v, err)
		} else if _, err := parsePort(port); err != nil {
			fail("PORTFOLIO_ADDR %q: %v", v, err)
		}
		cfg.Addr = v
	} else if ip, port := get("IP"), get("PORT"); ip != "" || port != "" {
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
	} else {
		cfg.Addr = DefaultAddr
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
				fail("PORTFOLIO_TRUSTED_PROXIES: %q is not an IP or CIDR", p)
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

	// SMTP.
	cfg.SMTP.Host = get("SMTP_HOST")
	cfg.SMTP.Username = get("SMTP_USERNAME")
	cfg.SMTP.Password = getenv("SMTP_PASSWORD") // not trimmed: may legitimately contain spaces
	if v := get("SMTP_PORT"); v != "" {
		p, err := parsePort(v)
		if err != nil {
			fail("SMTP_PORT %q: %v", v, err)
		}
		cfg.SMTP.Port = p
	}
	if v := get("SMTP_TLS"); v != "" {
		switch m := TLSMode(strings.ToLower(v)); m {
		case TLSStartTLS, TLSImplicit, TLSNone:
			cfg.SMTP.TLS = m
		default:
			fail("SMTP_TLS %q: want starttls, tls or none", v)
		}
	}
	for _, kv := range []struct {
		key string
		dst *string
	}{{"SMTP_FROM", &cfg.SMTP.From}, {"CONTACT_TO", &cfg.SMTP.To}} {
		v := get(kv.key)
		if v == "" {
			continue
		}
		if _, err := mail.ParseAddress(v); err != nil || strings.ContainsAny(v, "\r\n") {
			fail("%s: not a valid email address", kv.key)
		}
		*kv.dst = v
	}

	if len(errs) > 0 {
		return Config{}, errors.Join(errs...)
	}
	return cfg, nil
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
