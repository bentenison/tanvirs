package contact

import (
	"bufio"
	"context"
	"io"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/bentenison/portfolio/internal/config"
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

func TestBuildMessageNoInjection(t *testing.T) {
	from := &mail.Address{Name: "Portfolio", Address: "site@example.com"}
	to := &mail.Address{Address: "owner@example.com"}
	raw := BuildMessage(from, to, Message{
		Name:      "Eve\r\nBcc: victim@example.com",
		Email:     "eve@example.com\nX-Injected: 1",
		Body:      "Hello\nBcc: not-a-header@example.com\n.\nünïcödé = test",
		RequestID: "rid-1",
	}, time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC))

	msg, err := mail.ReadMessage(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatalf("ReadMessage: %v", err)
	}
	for _, k := range []string{"Bcc", "X-Injected"} {
		if v := msg.Header.Get(k); v != "" {
			t.Errorf("injected header %s = %q", k, v)
		}
	}
	head, _, _ := strings.Cut(string(raw), "\r\n\r\n")
	for _, line := range strings.Split(head, "\r\n") {
		if strings.ContainsAny(line, "\r\n") {
			t.Errorf("header line contains CR/LF: %q", line)
		}
	}
	checks := map[string]string{
		"From":                      `"Portfolio" <site@example.com>`,
		"To":                        "<owner@example.com>",
		"Subject":                   "Portfolio contact: EveBcc: victim@example.com",
		"MIME-Version":              "1.0",
		"Content-Type":              "text/plain; charset=utf-8",
		"Content-Transfer-Encoding": "quoted-printable",
		"Date":                      "Fri, 02 Jan 2026 03:04:05 +0000",
	}
	for k, want := range checks {
		if got := msg.Header.Get(k); got != want {
			t.Errorf("%s = %q, want %q", k, got, want)
		}
	}
	if rt := msg.Header.Get("Reply-To"); !strings.Contains(rt, "eve@example.com") {
		t.Errorf("Reply-To = %q", rt)
	}
	if id := msg.Header.Get("Message-ID"); !strings.HasSuffix(id, "@example.com>") {
		t.Errorf("Message-ID = %q", id)
	}
	body, err := io.ReadAll(quotedprintable.NewReader(msg.Body))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Name: EveBcc: victim@example.com", "Request ID: rid-1", "ünïcödé = test"} {
		if !strings.Contains(string(body), want) {
			t.Errorf("body missing %q:\n%s", want, body)
		}
	}
}

func TestNewSMTPMailerRequiresConfig(t *testing.T) {
	if _, err := NewSMTPMailer(config.SMTP{Host: "h"}); err == nil {
		t.Fatal("expected error")
	}
}

// fakeSMTP is a minimal plaintext SMTP server that records one DATA payload.
func fakeSMTP(t *testing.T) (port int, got <-chan string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	ch := make(chan string, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		r := bufio.NewReader(conn)
		say := func(s string) { _, _ = io.WriteString(conn, s+"\r\n") }
		say("220 fake ESMTP")
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return
			}
			cmd := strings.ToUpper(strings.TrimSpace(line))
			switch {
			case strings.HasPrefix(cmd, "EHLO"), strings.HasPrefix(cmd, "HELO"):
				say("250 fake")
			case strings.HasPrefix(cmd, "MAIL"), strings.HasPrefix(cmd, "RCPT"):
				say("250 ok")
			case cmd == "DATA":
				say("354 go ahead")
				var data strings.Builder
				for {
					l, err := r.ReadString('\n')
					if err != nil {
						return
					}
					if l == ".\r\n" {
						break
					}
					data.WriteString(l)
				}
				ch <- data.String()
				say("250 queued")
			case cmd == "QUIT":
				say("221 bye")
				return
			default:
				say("502 unknown")
			}
		}
	}()
	return ln.Addr().(*net.TCPAddr).Port, ch
}

func TestSMTPMailerSendPlain(t *testing.T) {
	port, got := fakeSMTP(t)
	m, err := NewSMTPMailer(config.SMTP{
		Host: "127.0.0.1", Port: port, TLS: config.TLSNone,
		From: "site@example.com", To: "owner@example.com",
	})
	if err != nil {
		t.Fatal(err)
	}
	err = m.Send(context.Background(), Message{Name: "Ada", Email: "ada@example.com", Body: "Hello world!", RequestID: "r1"})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	select {
	case data := <-got:
		if !strings.Contains(data, "Subject: Portfolio contact: Ada") || !strings.Contains(data, "Hello world!") {
			t.Errorf("unexpected data:\n%s", data)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no data received")
	}
}

func TestSMTPMailerStartTLSUnsupported(t *testing.T) {
	port, _ := fakeSMTP(t)
	m, _ := NewSMTPMailer(config.SMTP{
		Host: "127.0.0.1", Port: port, TLS: config.TLSStartTLS,
		From: "site@example.com", To: "owner@example.com",
	})
	if err := m.Send(context.Background(), Message{}); err == nil || !strings.Contains(err.Error(), "STARTTLS") {
		t.Fatalf("err = %v, want STARTTLS error", err)
	}
}

func TestSMTPMailerDialFailure(t *testing.T) {
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close()
	m, _ := NewSMTPMailer(config.SMTP{
		Host: "127.0.0.1", Port: port, TLS: config.TLSNone,
		From: "site@example.com", To: "owner@example.com",
	})
	if err := m.Send(context.Background(), Message{}); err == nil {
		t.Fatal("expected dial error")
	}
}
