package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Message statuses, in the order they appear in the admin inbox.
const (
	StatusNew      = "new"
	StatusRead     = "read"
	StatusReplied  = "replied"
	StatusArchived = "archived"
)

// Statuses lists every valid status.
var Statuses = []string{StatusNew, StatusRead, StatusReplied, StatusArchived}

// ValidStatus reports whether s is a known status.
func ValidStatus(s string) bool {
	for _, v := range Statuses {
		if s == v {
			return true
		}
	}
	return false
}

// NewMessage is a validated contact form submission.
type NewMessage struct {
	Name      string
	Email     string
	Message   string
	ClientIP  string
	UserAgent string
	RequestID string
}

// Message is a stored contact message.
type Message struct {
	ID        int64
	Name      string
	Email     string
	Message   string
	Status    string
	Note      string
	ClientIP  string
	UserAgent string
	RequestID string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// MessageFilter selects messages for the inbox.
type MessageFilter struct {
	Status string // empty means every status except archived; "all" means everything
	Search string // case-insensitive match on name, email or message
	Limit  int
	Offset int
}

// CreateMessage stores a new submission and returns its id.
func (s *Store) CreateMessage(ctx context.Context, m NewMessage) (int64, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO contact_messages (name, email, message, client_ip, user_agent, request_id)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id`,
		m.Name, m.Email, m.Message, m.ClientIP, truncate(m.UserAgent, 512), m.RequestID,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("store: create message: %w", err)
	}
	return id, nil
}

const messageColumns = `id, name, email, message, status, note, client_ip, user_agent, request_id, created_at, updated_at`

func scanMessage(row pgx.Row) (Message, error) {
	var m Message
	err := row.Scan(&m.ID, &m.Name, &m.Email, &m.Message, &m.Status, &m.Note,
		&m.ClientIP, &m.UserAgent, &m.RequestID, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

// ListMessages returns one page of messages, newest first, and the total
// number matching the filter.
func (s *Store) ListMessages(ctx context.Context, f MessageFilter) ([]Message, int, error) {
	var where []string
	var args []any
	switch {
	case f.Status == "all":
	case f.Status == "":
		where = append(where, "status <> 'archived'")
	default:
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("status = $%d", len(args)))
	}
	if q := strings.TrimSpace(f.Search); q != "" {
		args = append(args, "%"+escapeLike(q)+"%")
		n := len(args)
		where = append(where, fmt.Sprintf("(name ILIKE $%d OR email ILIKE $%d OR message ILIKE $%d)", n, n, n))
	}
	cond := ""
	if len(where) > 0 {
		cond = "WHERE " + strings.Join(where, " AND ")
	}

	var total int
	if err := s.pool.QueryRow(ctx, "SELECT count(*) FROM contact_messages "+cond, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("store: count messages: %w", err)
	}

	limit := f.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	args = append(args, limit, max(f.Offset, 0))
	rows, err := s.pool.Query(ctx, fmt.Sprintf(
		"SELECT %s FROM contact_messages %s ORDER BY created_at DESC, id DESC LIMIT $%d OFFSET $%d",
		messageColumns, cond, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("store: list messages: %w", err)
	}
	defer rows.Close()
	var out []Message
	for rows.Next() {
		m, err := scanMessage(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("store: list messages: %w", err)
		}
		out = append(out, m)
	}
	return out, total, rows.Err()
}

// GetMessage returns one message.
func (s *Store) GetMessage(ctx context.Context, id int64) (Message, error) {
	m, err := scanMessage(s.pool.QueryRow(ctx, "SELECT "+messageColumns+" FROM contact_messages WHERE id = $1", id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Message{}, ErrNotFound
	}
	if err != nil {
		return Message{}, fmt.Errorf("store: get message: %w", err)
	}
	return m, nil
}

// SetStatus changes a message's status.
func (s *Store) SetStatus(ctx context.Context, id int64, status string) error {
	if !ValidStatus(status) {
		return fmt.Errorf("store: invalid status %q", status)
	}
	return s.exec1(ctx, `UPDATE contact_messages SET status = $2, updated_at = now() WHERE id = $1`, id, status)
}

// MarkReadIfNew moves a message from new to read (used when it is opened).
func (s *Store) MarkReadIfNew(ctx context.Context, id int64) error {
	_, err := s.pool.Exec(ctx, `UPDATE contact_messages SET status = 'read', updated_at = now() WHERE id = $1 AND status = 'new'`, id)
	return err
}

// SetNote replaces a message's private note.
func (s *Store) SetNote(ctx context.Context, id int64, note string) error {
	return s.exec1(ctx, `UPDATE contact_messages SET note = $2, updated_at = now() WHERE id = $1`, id, truncate(note, 5000))
}

// DeleteMessage permanently removes a message.
func (s *Store) DeleteMessage(ctx context.Context, id int64) error {
	return s.exec1(ctx, `DELETE FROM contact_messages WHERE id = $1`, id)
}

// StatusCounts returns how many messages have each status.
func (s *Store) StatusCounts(ctx context.Context) (map[string]int, error) {
	rows, err := s.pool.Query(ctx, `SELECT status, count(*) FROM contact_messages GROUP BY status`)
	if err != nil {
		return nil, fmt.Errorf("store: counts: %w", err)
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var st string
		var n int
		if err := rows.Scan(&st, &n); err != nil {
			return nil, err
		}
		out[st] = n
	}
	return out, rows.Err()
}

// exec1 runs a statement that must affect exactly one row.
func (s *Store) exec1(ctx context.Context, sql string, args ...any) error {
	tag, err := s.pool.Exec(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("store: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

func truncate(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}
