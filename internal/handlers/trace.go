package handlers

import (
	"context"
	"math"
	"net/http"
	"runtime"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/bentenison/portfolio/internal/contact"
	"github.com/bentenison/portfolio/internal/middleware"
)

// Pinger checks that the database answers.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Trace powers the "The Request" hero: each call is a real request whose
// stages the server measures and reports, so the page can show a visitor how
// their own request was handled. A nil DB means no database stage.
type Trace struct {
	DB      Pinger
	Limiter *contact.Limiter
}

// NewTraceLimiter allows 30 traces per client per minute and 1200 per hour overall.
func NewTraceLimiter() *contact.Limiter {
	return contact.NewLimiter(30, time.Minute, 1200, time.Hour)
}

type traceServer struct {
	MiddlewareMS float64  `json:"middleware_ms"`
	HandlerMS    float64  `json:"handler_ms"`
	DatabaseMS   *float64 `json:"database_ms"`
	TotalMS      float64  `json:"total_ms"`
}

type traceResponse struct {
	RequestID string      `json:"request_id"`
	Server    traceServer `json:"server"`
	Database  string      `json:"database"`
	Runtime   string      `json:"runtime"`
	ServedAt  time.Time   `json:"served_at"`
}

func ms(d time.Duration) float64 { return math.Round(float64(d.Nanoseconds())/1e3) / 1e3 }

// Get handles GET /api/trace.
func (t *Trace) Get(c *gin.Context) {
	entered := time.Now()
	ctx := c.Request.Context()
	if t.Limiter != nil {
		if ok, wait := t.Limiter.Allow(c.ClientIP()); !ok {
			c.Header("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
			APIJSON(c, http.StatusTooManyRequests, gin.H{"error": "rate_limited"})
			return
		}
	}

	resp := traceResponse{
		RequestID: middleware.RequestIDFromContext(ctx),
		Database:  "not configured",
		Runtime:   runtime.Version(),
	}
	var extra []middleware.TimingMetric
	if t.DB != nil {
		pctx, cancel := context.WithTimeout(ctx, 2*time.Second)
		dbStart := time.Now()
		err := t.DB.Ping(pctx)
		dbDur := time.Since(dbStart)
		cancel()
		if err != nil {
			resp.Database = "unavailable"
		} else {
			resp.Database = "postgresql"
			v := ms(dbDur)
			resp.Server.DatabaseMS = &v
			extra = append(extra, middleware.TimingMetric{Name: "db", Desc: "PostgreSQL round trip", Dur: dbDur})
		}
	}

	start := middleware.RequestStart(ctx)
	if start.IsZero() {
		start = entered
	}
	now := time.Now()
	resp.Server.MiddlewareMS = ms(entered.Sub(start))
	resp.Server.HandlerMS = ms(now.Sub(entered))
	resp.Server.TotalMS = ms(now.Sub(start))
	resp.ServedAt = now.UTC()

	c.Header("Server-Timing", middleware.ServerTiming(ctx, entered, extra...))
	APIJSON(c, http.StatusOK, resp)
}
