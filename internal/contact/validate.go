// Package contact implements the contact form: input validation, rate
// limiting and SMTP delivery.
package contact

import (
	"net/mail"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Field limits.
const (
	MaxNameRunes    = 100
	MaxEmailBytes   = 254
	MinMessageRunes = 10
	MaxMessageRunes = 5000
)

// Validation error codes reported per field.
const (
	ErrRequired = "required"
	ErrTooLong  = "too_long"
	ErrTooShort = "too_short"
	ErrInvalid  = "invalid"
)

// Submission is the JSON body posted by the contact form.
type Submission struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Message string `json:"message"`
	// Company is a honeypot field hidden from humans; it must be empty.
	Company string `json:"company"`
	// ElapsedMS is how long the form was open on the client.
	ElapsedMS int64 `json:"elapsed_ms"`
}

// FieldErrors maps a field name to a validation error code.
type FieldErrors map[string]string

// Validate trims and sanitises s and checks every field. It returns the
// cleaned submission and the field errors, which are empty when valid.
func Validate(s Submission) (Submission, FieldErrors) {
	errs := FieldErrors{}

	s.Name = strings.TrimSpace(s.Name)
	switch {
	case s.Name == "":
		errs["name"] = ErrRequired
	case utf8.RuneCountInString(s.Name) > MaxNameRunes:
		errs["name"] = ErrTooLong
	case strings.IndexFunc(s.Name, unicode.IsControl) >= 0:
		errs["name"] = ErrInvalid // includes CR and LF
	}

	s.Email = strings.TrimSpace(s.Email)
	switch {
	case s.Email == "":
		errs["email"] = ErrRequired
	case len(s.Email) > MaxEmailBytes:
		errs["email"] = ErrTooLong
	case !validEmail(s.Email):
		errs["email"] = ErrInvalid
	}

	s.Message = strings.TrimSpace(cleanMessage(s.Message))
	switch n := utf8.RuneCountInString(s.Message); {
	case n == 0:
		errs["message"] = ErrRequired
	case n < MinMessageRunes:
		errs["message"] = ErrTooShort
	case n > MaxMessageRunes:
		errs["message"] = ErrTooLong
	}

	return s, errs
}

func validEmail(s string) bool {
	if strings.IndexFunc(s, unicode.IsControl) >= 0 {
		return false
	}
	a, err := mail.ParseAddress(s)
	return err == nil && a.Name == "" && a.Address == s
}

// cleanMessage normalises line endings and strips control characters other
// than newline and tab.
func cleanMessage(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	return strings.Map(func(r rune) rune {
		if r == '\n' || r == '\t' {
			return r
		}
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, s)
}
