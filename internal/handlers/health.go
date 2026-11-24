// Package handlers contains the HTTP handlers: health probes, the embedded
// static/SPA file server and the contact API.
package handlers

import (
	"net/http"
	"sync/atomic"

	"github.com/gin-gonic/gin"
)

// Health serves liveness and readiness probes.
type Health struct {
	ready atomic.Bool
}

// NewHealth returns a Health that reports ready.
func NewHealth() *Health {
	h := &Health{}
	h.ready.Store(true)
	return h
}

// SetReady changes the readiness state; set false when shutdown begins.
func (h *Health) SetReady(ready bool) { h.ready.Store(ready) }

// Ready reports the readiness state.
func (h *Health) Ready() bool { return h.ready.Load() }

// Healthz always reports 200 while the process is serving.
func (h *Health) Healthz(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// Readyz reports 200 when ready and 503 once shutdown has begun.
func (h *Health) Readyz(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if !h.Ready() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "shutting_down"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ready"})
}
