package contact

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestValidate(t *testing.T) {
	ok := Submission{Name: "Ada Lovelace", Email: "ada@example.com", Message: "Hello there, nice work!"}
	tests := []struct {
		name   string
		mutate func(*Submission)
		want   FieldErrors
	}{
		{"valid", func(*Submission) {}, FieldErrors{}},
		{"all empty", func(s *Submission) { *s = Submission{} },
			FieldErrors{"name": ErrRequired, "email": ErrRequired, "message": ErrRequired}},
		{"whitespace only", func(s *Submission) { s.Name, s.Email, s.Message = "  ", "\t", " \n " },
			FieldErrors{"name": ErrRequired, "email": ErrRequired, "message": ErrRequired}},
		{"name too long", func(s *Submission) { s.Name = strings.Repeat("é", 101) }, FieldErrors{"name": ErrTooLong}},
		{"name max runes", func(s *Submission) { s.Name = strings.Repeat("é", 100) }, FieldErrors{}},
		{"name CRLF", func(s *Submission) { s.Name = "Ada\r\nBcc: x@y.com" }, FieldErrors{"name": ErrInvalid}},
		{"name control", func(s *Submission) { s.Name = "Ada\x00" }, FieldErrors{"name": ErrInvalid}},
		{"email display name", func(s *Submission) { s.Email = "Ada <ada@example.com>" }, FieldErrors{"email": ErrInvalid}},
		{"email garbage", func(s *Submission) { s.Email = "not-an-email" }, FieldErrors{"email": ErrInvalid}},
		{"email CRLF", func(s *Submission) { s.Email = "ada@example.com\r\nBcc: x@y.com" }, FieldErrors{"email": ErrInvalid}},
		{"email too long", func(s *Submission) { s.Email = strings.Repeat("a", 250) + "@x.io" }, FieldErrors{"email": ErrTooLong}},
		{"message too short", func(s *Submission) { s.Message = "hi" }, FieldErrors{"message": ErrTooShort}},
		{"message too long", func(s *Submission) { s.Message = strings.Repeat("a", 5001) }, FieldErrors{"message": ErrTooLong}},
		{"message short after strip", func(s *Submission) { s.Message = "\x01\x02\x03\x04\x05\x06\x07\x08abc" }, FieldErrors{"message": ErrTooShort}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := ok
			tt.mutate(&s)
			_, errs := Validate(s)
			if len(errs) != len(tt.want) {
				t.Fatalf("errs = %v, want %v", errs, tt.want)
			}
			for k, v := range tt.want {
				if errs[k] != v {
					t.Errorf("%s = %q, want %q", k, errs[k], v)
				}
			}
		})
	}
}

func TestValidateCleans(t *testing.T) {
	s, errs := Validate(Submission{
		Name:    "  Ada  ",
		Email:   " ada@example.com ",
		Message: " line one\r\nline\ttwo\x07\x1b[31m ",
	})
	if len(errs) != 0 {
		t.Fatalf("errs = %v", errs)
	}
	if s.Name != "Ada" || s.Email != "ada@example.com" {
		t.Errorf("not trimmed: %+v", s)
	}
	if want := "line one\nline\ttwo[31m"; s.Message != want {
		t.Errorf("message = %q, want %q", s.Message, want)
	}
}

func TestLimiter(t *testing.T) {
	now := time.Unix(1_000_000, 0)
	l := NewLimiter(2, time.Minute, 3, time.Hour)
	l.now = func() time.Time { return now }

	for i := range 2 {
		if ok, _ := l.Allow("a"); !ok {
			t.Fatalf("a #%d denied", i)
		}
	}
	ok, wait := l.Allow("a")
	if ok || wait != time.Minute {
		t.Fatalf("a #3: ok=%v wait=%v", ok, wait)
	}
	if ok, _ := l.Allow("b"); !ok {
		t.Fatal("b denied")
	}
	// Global cap (3) reached.
	ok, wait = l.Allow("c")
	if ok || wait != time.Hour {
		t.Fatalf("global: ok=%v wait=%v", ok, wait)
	}

	now = now.Add(61 * time.Second)
	if ok, _ := l.Allow("a"); ok {
		t.Fatal("global cap should still apply")
	}
	now = now.Add(time.Hour)
	if ok, _ := l.Allow("a"); !ok {
		t.Fatal("a should be allowed after windows")
	}
	l.cleanup()
	l.mu.Lock()
	if len(l.keys) != 1 || len(l.allHit) != 1 {
		t.Errorf("cleanup left keys=%d all=%d", len(l.keys), len(l.allHit))
	}
	l.mu.Unlock()
}

func TestLimiterConcurrentAndRun(t *testing.T) {
	l := NewLimiter(5, time.Minute, 50, time.Hour)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { l.Run(ctx, time.Millisecond); close(done) }()

	var wg sync.WaitGroup
	var mu sync.Mutex
	allowed := 0
	for i := range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range 10 {
				if ok, _ := l.Allow(strconv.Itoa(i)); ok {
					mu.Lock()
					allowed++
					mu.Unlock()
				}
			}
		}()
	}
	wg.Wait()
	cancel()
	<-done
	if allowed != 50 {
		t.Errorf("allowed = %d, want 50 (global cap)", allowed)
	}
}
