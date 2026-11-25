package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// ErrBadCredentials is returned for an unknown user or a wrong password.
var ErrBadCredentials = errors.New("store: invalid username or password")

// bcryptCost balances login latency (~100-250 ms) against brute force.
const bcryptCost = 12

// dummyHash is compared against when the username is unknown, so a login
// takes the same time whether or not the user exists.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("timing-equaliser"), bcryptCost)

// Admin is an authenticated administrator.
type Admin struct {
	ID       int64
	Username string
}

// Session is an admin session as seen by request handlers.
type Session struct {
	Admin     Admin
	CSRFToken string
	ExpiresAt time.Time
}

// SeedAdmin makes sure an admin with this username exists and that its
// password matches. The environment is the source of truth: changing
// ADMIN_PASSWORD and restarting changes the login and ends old sessions.
func (s *Store) SeedAdmin(ctx context.Context, username, password string) (created bool, err error) {
	if username == "" || password == "" {
		return false, errors.New("store: admin username and password are required")
	}
	var id int64
	var hash string
	err = s.pool.QueryRow(ctx, `SELECT id, password_hash FROM admin_users WHERE username = $1`, username).Scan(&id, &hash)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		h, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
		if err != nil {
			return false, err
		}
		_, err = s.pool.Exec(ctx, `INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)`, username, string(h))
		return err == nil, err
	case err != nil:
		return false, fmt.Errorf("store: seed admin: %w", err)
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil {
		return false, nil
	}
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return false, err
	}
	return false, pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE admin_users SET password_hash = $2, updated_at = now() WHERE id = $1`, id, string(h)); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `DELETE FROM admin_sessions WHERE admin_id = $1`, id)
		return err
	})
}

// Authenticate checks a username and password.
func (s *Store) Authenticate(ctx context.Context, username, password string) (Admin, error) {
	var a Admin
	var hash string
	err := s.pool.QueryRow(ctx, `SELECT id, username, password_hash FROM admin_users WHERE username = $1`, username).Scan(&a.ID, &a.Username, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		return Admin{}, ErrBadCredentials
	}
	if err != nil {
		return Admin{}, fmt.Errorf("store: authenticate: %w", err)
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return Admin{}, ErrBadCredentials
	}
	return a, nil
}

// CreateSession starts a session and returns the raw token for the cookie.
func (s *Store) CreateSession(ctx context.Context, adminID int64, ttl time.Duration, clientIP, userAgent string) (token string, sess Session, err error) {
	token, err = randomToken()
	if err != nil {
		return "", Session{}, err
	}
	csrf, err := randomToken()
	if err != nil {
		return "", Session{}, err
	}
	expires := s.now().Add(ttl)
	var a Admin
	err = s.pool.QueryRow(ctx, `
		WITH ins AS (
			INSERT INTO admin_sessions (token_hash, admin_id, csrf_token, client_ip, user_agent, expires_at)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING admin_id
		)
		SELECT u.id, u.username FROM admin_users u JOIN ins ON ins.admin_id = u.id`,
		hashToken(token), adminID, csrf, clientIP, truncate(userAgent, 512), expires,
	).Scan(&a.ID, &a.Username)
	if err != nil {
		return "", Session{}, fmt.Errorf("store: create session: %w", err)
	}
	return token, Session{Admin: a, CSRFToken: csrf, ExpiresAt: expires}, nil
}

// SessionByToken returns the live session for a cookie token.
func (s *Store) SessionByToken(ctx context.Context, token string) (Session, error) {
	if token == "" {
		return Session{}, ErrNotFound
	}
	var sess Session
	err := s.pool.QueryRow(ctx, `
		SELECT u.id, u.username, s.csrf_token, s.expires_at
		FROM admin_sessions s JOIN admin_users u ON u.id = s.admin_id
		WHERE s.token_hash = $1 AND s.expires_at > now()`, hashToken(token),
	).Scan(&sess.Admin.ID, &sess.Admin.Username, &sess.CSRFToken, &sess.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrNotFound
	}
	if err != nil {
		return Session{}, fmt.Errorf("store: session: %w", err)
	}
	return sess, nil
}

// DeleteSession ends a session.
func (s *Store) DeleteSession(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM admin_sessions WHERE token_hash = $1`, hashToken(token))
	return err
}

// PruneSessions removes expired sessions.
func (s *Store) PruneSessions(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM admin_sessions WHERE expires_at <= now()`)
	return err
}

func randomToken() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}

func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}
