package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"math"
	"mime"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/bentenison/portfolio/internal/contact"
	"github.com/bentenison/portfolio/internal/middleware"
)

// MaxContactBody is the maximum accepted contact request body in bytes.
const MaxContactBody = 16 << 10

// MinElapsedMS is the minimum time a human plausibly needs to fill the form.
const MinElapsedMS = 2500

// Contact serves the contact API. A nil Mailer disables delivery.
type Contact struct {
	Mailer  contact.Mailer
	Limiter *contact.Limiter
	Logger  *slog.Logger
}

func (h *Contact) enabled() bool { return h.Mailer != nil }

// APIJSON writes a JSON API response with Cache-Control: no-store.
func APIJSON(c *gin.Context, status int, body any) {
	c.Header("Cache-Control", "no-store")
	c.JSON(status, body)
}

// Status reports whether the contact form is available. When it is not, the
// frontend should fall back to a mailto link.
func (h *Contact) Status(c *gin.Context) {
	APIJSON(c, http.StatusOK, gin.H{"enabled": h.enabled()})
}

// Submit validates and delivers a contact form submission.
func (h *Contact) Submit(c *gin.Context) {
	ctx := c.Request.Context()
	rid := middleware.RequestIDFromContext(ctx)
	log := h.Logger.With("request_id", rid)

	if !h.enabled() {
		APIJSON(c, http.StatusServiceUnavailable, gin.H{"error": "contact_disabled"})
		return
	}
	if mt, _, err := mime.ParseMediaType(c.GetHeader("Content-Type")); err != nil || mt != "application/json" {
		APIJSON(c, http.StatusUnsupportedMediaType, gin.H{"error": "unsupported_media_type"})
		return
	}

	// The body is capped by middleware.BodyLimit(MaxContactBody) on the route.
	var sub contact.Submission
	dec := json.NewDecoder(c.Request.Body)
	dec.DisallowUnknownFields()
	err := dec.Decode(&sub)
	if err == nil {
		// Reject trailing data after the object.
		if dec.Decode(&struct{}{}) != io.EOF {
			err = errors.New("trailing data")
		}
	}
	if err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			APIJSON(c, http.StatusRequestEntityTooLarge, gin.H{"error": "too_large"})
			return
		}
		APIJSON(c, http.StatusBadRequest, gin.H{"error": "bad_request"})
		return
	}

	if ok, wait := h.Limiter.Allow(c.ClientIP()); !ok {
		c.Header("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
		APIJSON(c, http.StatusTooManyRequests, gin.H{"error": "rate_limited"})
		return
	}

	if sub.Company != "" {
		log.InfoContext(ctx, "spam dropped", "reason", "honeypot")
		APIJSON(c, http.StatusOK, gin.H{"ok": true})
		return
	}
	if sub.ElapsedMS < MinElapsedMS {
		APIJSON(c, http.StatusUnprocessableEntity, gin.H{"error": "too_fast"})
		return
	}
	clean, fieldErrs := contact.Validate(sub)
	if len(fieldErrs) > 0 {
		APIJSON(c, http.StatusUnprocessableEntity, gin.H{"error": "invalid", "fields": fieldErrs})
		return
	}

	err = h.Mailer.Send(ctx, contact.Message{
		Name:      clean.Name,
		Email:     clean.Email,
		Body:      clean.Message,
		RequestID: rid,
	})
	if err != nil {
		log.ErrorContext(ctx, "contact delivery failed", "error", err)
		APIJSON(c, http.StatusBadGateway, gin.H{"error": "delivery_failed"})
		return
	}
	log.InfoContext(ctx, "contact delivered")
	APIJSON(c, http.StatusOK, gin.H{"ok": true})
}
