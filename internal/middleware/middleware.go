// Package middleware provides the Gin middleware stack used by the server:
// request IDs, panic recovery, structured request logging, security headers
// and request body limits.
package middleware

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"regexp"
	"runtime/debug"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// HeaderRequestID is the request and response header carrying the request ID.
const HeaderRequestID = "X-Request-ID"

// ContentSecurityPolicy is sent on every response.
const ContentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; " +
	"object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"

type ctxKey struct{}

var validRequestID = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)

// RequestIDFromContext returns the request ID stored by RequestID, or "".
func RequestIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(ctxKey{}).(string)
	return id
}

// RequestID accepts a well-formed incoming X-Request-ID or generates a new
// random one, echoes it in the response and stores it in the request context.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(HeaderRequestID)
		if !validRequestID.MatchString(id) {
			id = newID()
		}
		c.Header(HeaderRequestID, id)
		c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), ctxKey{}, id))
		c.Next()
	}
}

func newID() string {
	var b [16]byte
	_, _ = rand.Read(b[:]) // crypto/rand.Read never returns an error
	return hex.EncodeToString(b[:])
}

// IsAPI reports whether p is under the /api prefix.
func IsAPI(p string) bool {
	return p == "/api" || strings.HasPrefix(p, "/api/")
}

// Recovery recovers from panics, logs them with a stack trace and responds
// with 500: JSON for /api paths, plain text otherwise.
func Recovery(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			rec := recover()
			if rec == nil {
				return
			}
			if rec == http.ErrAbortHandler {
				panic(rec) // let net/http abort the connection as intended
			}
			log.ErrorContext(c.Request.Context(), "panic recovered",
				"panic", rec,
				"path", c.Request.URL.Path,
				"request_id", RequestIDFromContext(c.Request.Context()),
				"stack", string(debug.Stack()),
			)
			if c.Writer.Written() {
				c.Abort()
				return
			}
			c.Header("Cache-Control", "no-store")
			if IsAPI(c.Request.URL.Path) {
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "internal"})
				return
			}
			c.Header("Content-Type", "text/plain; charset=utf-8")
			c.AbortWithStatus(http.StatusInternalServerError)
			_, _ = c.Writer.WriteString("internal server error")
		}()
		c.Next()
	}
}

// Logger logs one structured record per request after it completes.
func Logger(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		status := c.Writer.Status()
		level := slog.LevelInfo
		if status >= 500 {
			level = slog.LevelError
		}
		log.LogAttrs(c.Request.Context(), level, "request",
			slog.String("method", c.Request.Method),
			slog.String("path", c.Request.URL.Path),
			slog.Int("status", status),
			slog.Float64("duration_ms", float64(time.Since(start).Microseconds())/1000),
			slog.Int("bytes", max(c.Writer.Size(), 0)),
			slog.String("request_id", RequestIDFromContext(c.Request.Context())),
			slog.String("client_ip", c.ClientIP()),
			slog.String("user_agent", c.Request.UserAgent()),
		)
	}
}

// SecurityHeaders sets the security headers on every response. HSTS is sent
// only when hsts is true (enable it only when served exclusively over HTTPS).
func SecurityHeaders(hsts bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("Content-Security-Policy", ContentSecurityPolicy)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()")
		if hsts {
			h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		}
		c.Next()
	}
}

// BodyLimit caps the request body at n bytes using http.MaxBytesReader.
// Reads beyond the limit fail with *http.MaxBytesError.
func BodyLimit(n int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, n)
		}
		c.Next()
	}
}
