package contact

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"mime"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/bentenison/portfolio/internal/config"
)

// Message is a validated contact message ready for delivery.
type Message struct {
	Name      string
	Email     string
	Body      string
	RequestID string
}

// Mailer delivers contact messages.
type Mailer interface {
	Send(ctx context.Context, m Message) error
}

// Timeouts used by SMTPMailer.
const (
	DialTimeout = 10 * time.Second
	SendTimeout = 20 * time.Second
)

// SMTPMailer delivers messages with net/smtp.
type SMTPMailer struct {
	cfg  config.SMTP
	from *mail.Address
	to   *mail.Address
	now  func() time.Time
}

// NewSMTPMailer validates cfg and returns a mailer for it.
func NewSMTPMailer(cfg config.SMTP) (*SMTPMailer, error) {
	if !cfg.Enabled() {
		return nil, errors.New("contact: SMTP is not fully configured")
	}
	from, err := mail.ParseAddress(cfg.From)
	if err != nil {
		return nil, fmt.Errorf("contact: SMTP_FROM: %w", err)
	}
	to, err := mail.ParseAddress(cfg.To)
	if err != nil {
		return nil, fmt.Errorf("contact: CONTACT_TO: %w", err)
	}
	return &SMTPMailer{cfg: cfg, from: from, to: to, now: time.Now}, nil
}

// Send delivers m. PLAIN auth is used only when a username is configured;
// net/smtp refuses PLAIN auth over an unencrypted connection to a non-local
// host, so credentials are never sent in clear text.
func (s *SMTPMailer) Send(ctx context.Context, m Message) error {
	ctx, cancel := context.WithTimeout(ctx, SendTimeout)
	defer cancel()

	addr := net.JoinHostPort(s.cfg.Host, strconv.Itoa(s.cfg.Port))
	tlsCfg := &tls.Config{ServerName: s.cfg.Host, MinVersion: tls.VersionTLS12}
	dialer := &net.Dialer{Timeout: DialTimeout}

	var conn net.Conn
	var err error
	if s.cfg.TLS == config.TLSImplicit {
		conn, err = (&tls.Dialer{NetDialer: dialer, Config: tlsCfg}).DialContext(ctx, "tcp", addr)
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return fmt.Errorf("smtp dial: %w", err)
	}
	if d, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(d)
	}
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stop()

	c, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("smtp greeting: %w", err)
	}
	defer c.Close()

	if s.cfg.TLS == config.TLSStartTLS {
		if ok, _ := c.Extension("STARTTLS"); !ok {
			return errors.New("smtp: server does not support STARTTLS")
		}
		if err := c.StartTLS(tlsCfg); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	}
	if s.cfg.Username != "" {
		if err := c.Auth(smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err := c.Mail(s.from.Address); err != nil {
		return fmt.Errorf("smtp MAIL FROM: %w", err)
	}
	if err := c.Rcpt(s.to.Address); err != nil {
		return fmt.Errorf("smtp RCPT TO: %w", err)
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp DATA: %w", err)
	}
	if _, err := w.Write(BuildMessage(s.from, s.to, m, s.now())); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp end data: %w", err)
	}
	return c.Quit()
}

// BuildMessage renders m as an RFC 5322 plain-text, quoted-printable email.
// Header values derived from user input are stripped of control characters so
// header injection is impossible.
func BuildMessage(from, to *mail.Address, m Message, now time.Time) []byte {
	var b bytes.Buffer
	header := func(k, v string) { fmt.Fprintf(&b, "%s: %s\r\n", k, v) }

	name := headerSafe(m.Name)
	header("From", from.String())
	header("To", to.String())
	header("Reply-To", (&mail.Address{Address: headerSafe(m.Email)}).String())
	header("Subject", mime.QEncoding.Encode("utf-8", "Portfolio contact: "+name))
	header("Date", now.Format(time.RFC1123Z))
	header("Message-ID", messageID(from.Address))
	header("MIME-Version", "1.0")
	header("Content-Type", "text/plain; charset=utf-8")
	header("Content-Transfer-Encoding", "quoted-printable")
	b.WriteString("\r\n")

	qp := quotedprintable.NewWriter(&b)
	fmt.Fprintf(qp, "New message from the portfolio contact form.\n\n"+
		"Name: %s\nEmail: %s\nRequest ID: %s\n\nMessage:\n%s\n",
		name, headerSafe(m.Email), headerSafe(m.RequestID), m.Body)
	_ = qp.Close()
	return b.Bytes()
}

func headerSafe(s string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, s)
}

func messageID(from string) string {
	domain := "localhost"
	if i := strings.LastIndexByte(from, '@'); i >= 0 && i < len(from)-1 {
		domain = from[i+1:]
	}
	var r [12]byte
	_, _ = rand.Read(r[:])
	return "<" + hex.EncodeToString(r[:]) + "@" + domain + ">"
}
