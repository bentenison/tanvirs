package store

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

// openTest connects to TEST_DATABASE_URL inside a fresh schema that is
// dropped afterwards. Tests skip when the variable is not set.
func openTest(t *testing.T) *Store {
	t.Helper()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		t.Skip("set TEST_DATABASE_URL to run PostgreSQL tests")
	}
	ctx := context.Background()
	schema := fmt.Sprintf("portfolio_test_%d", time.Now().UnixNano())

	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE")
		admin.Close(context.Background())
	})

	u, err := url.Parse(base)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	s, err := Open(ctx, u.String())
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(s.Close)
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return s
}

func TestMigrateIsIdempotentAndConcurrent(t *testing.T) {
	s := openTest(t)
	var wg sync.WaitGroup
	errs := make(chan error, 4)
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- s.Migrate(context.Background())
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	var n int
	if err := s.pool.QueryRow(context.Background(), "SELECT count(*) FROM schema_migrations").Scan(&n); err != nil || n != 1 {
		t.Fatalf("migrations recorded = %d, %v", n, err)
	}
}

func TestMessagesLifecycle(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()

	id, err := s.CreateMessage(ctx, NewMessage{Name: "Ada", Email: "ada@example.com", Message: "Hello 100% _real_", ClientIP: "203.0.113.5", UserAgent: strings.Repeat("u", 600), RequestID: "r1"})
	if err != nil {
		t.Fatal(err)
	}
	id2, _ := s.CreateMessage(ctx, NewMessage{Name: "Grace", Email: "grace@example.com", Message: "Second message here"})

	m, err := s.GetMessage(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if m.Status != StatusNew || m.ClientIP != "203.0.113.5" || len(m.UserAgent) != 512 || m.CreatedAt.IsZero() {
		t.Errorf("stored = %+v", m)
	}

	list, total, err := s.ListMessages(ctx, MessageFilter{})
	if err != nil || total != 2 || list[0].ID != id2 {
		t.Fatalf("list = %v total=%d err=%v (want newest first)", list, total, err)
	}

	// LIKE wildcards in the search are literal.
	if _, total, _ := s.ListMessages(ctx, MessageFilter{Search: "100%"}); total != 1 {
		t.Errorf("search 100%% matched %d", total)
	}
	if _, total, _ := s.ListMessages(ctx, MessageFilter{Search: "%"}); total != 1 {
		t.Errorf("search %% matched %d, want only the literal %%", total)
	}
	if _, total, _ := s.ListMessages(ctx, MessageFilter{Search: "GRACE"}); total != 1 {
		t.Errorf("case-insensitive search matched %d", total)
	}

	if err := s.MarkReadIfNew(ctx, id); err != nil {
		t.Fatal(err)
	}
	if err := s.SetStatus(ctx, id2, StatusArchived); err != nil {
		t.Fatal(err)
	}
	if err := s.SetStatus(ctx, id2, "bogus"); err == nil {
		t.Error("invalid status accepted")
	}
	if err := s.SetNote(ctx, id, "follow up"); err != nil {
		t.Fatal(err)
	}
	if _, total, _ := s.ListMessages(ctx, MessageFilter{}); total != 1 {
		t.Errorf("default inbox should hide archived, got %d", total)
	}
	if _, total, _ := s.ListMessages(ctx, MessageFilter{Status: "all"}); total != 2 {
		t.Errorf("all = %d", total)
	}
	counts, err := s.StatusCounts(ctx)
	if err != nil || counts[StatusRead] != 1 || counts[StatusArchived] != 1 {
		t.Errorf("counts = %v %v", counts, err)
	}
	m, _ = s.GetMessage(ctx, id)
	if m.Status != StatusRead || m.Note != "follow up" || !m.UpdatedAt.After(m.CreatedAt.Add(-time.Second)) {
		t.Errorf("after updates = %+v", m)
	}

	if err := s.DeleteMessage(ctx, id); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetMessage(ctx, id); !errors.Is(err, ErrNotFound) {
		t.Errorf("get deleted = %v", err)
	}
	if err := s.SetNote(ctx, id, "x"); !errors.Is(err, ErrNotFound) {
		t.Errorf("update deleted = %v", err)
	}
}

func TestListPagination(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	for i := range 7 {
		if _, err := s.CreateMessage(ctx, NewMessage{Name: fmt.Sprint(i), Email: "a@example.com", Message: "hello there"}); err != nil {
			t.Fatal(err)
		}
	}
	page, total, err := s.ListMessages(ctx, MessageFilter{Limit: 3, Offset: 6})
	if err != nil || total != 7 || len(page) != 1 || page[0].Name != "0" {
		t.Fatalf("last page = %v total=%d err=%v", page, total, err)
	}
}

func TestAdminSeedAuthAndSessions(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()

	created, err := s.SeedAdmin(ctx, "admin", "first-password-123")
	if err != nil || !created {
		t.Fatalf("seed: %v %v", created, err)
	}
	if created, err := s.SeedAdmin(ctx, "admin", "first-password-123"); err != nil || created {
		t.Fatalf("reseed same password: %v %v", created, err)
	}
	var hash string
	_ = s.pool.QueryRow(ctx, "SELECT password_hash FROM admin_users").Scan(&hash)
	if strings.Contains(hash, "first-password") || !strings.HasPrefix(hash, "$2") {
		t.Fatalf("password not bcrypt-hashed: %q", hash)
	}

	adm, err := s.Authenticate(ctx, "admin", "first-password-123")
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range [][2]string{{"admin", "nope"}, {"ghost", "first-password-123"}} {
		if _, err := s.Authenticate(ctx, c[0], c[1]); !errors.Is(err, ErrBadCredentials) {
			t.Errorf("auth %v = %v", c, err)
		}
	}

	token, sess, err := s.CreateSession(ctx, adm.ID, time.Hour, "203.0.113.5", "test-agent")
	if err != nil || sess.CSRFToken == "" || sess.Admin.Username != "admin" {
		t.Fatalf("session = %+v %v", sess, err)
	}
	var stored []byte
	_ = s.pool.QueryRow(ctx, "SELECT token_hash FROM admin_sessions").Scan(&stored)
	if strings.Contains(string(stored), token) {
		t.Fatal("raw session token stored")
	}
	got, err := s.SessionByToken(ctx, token)
	if err != nil || got.CSRFToken != sess.CSRFToken {
		t.Fatalf("lookup = %+v %v", got, err)
	}
	if _, err := s.SessionByToken(ctx, token+"x"); !errors.Is(err, ErrNotFound) {
		t.Errorf("wrong token = %v", err)
	}

	// Changing the seeded password ends existing sessions.
	if _, err := s.SeedAdmin(ctx, "admin", "second-password-456"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SessionByToken(ctx, token); !errors.Is(err, ErrNotFound) {
		t.Error("session survived a password change")
	}
	if _, err := s.Authenticate(ctx, "admin", "first-password-123"); !errors.Is(err, ErrBadCredentials) {
		t.Error("old password still works")
	}

	// Expired sessions are invisible and pruned.
	tok2, _, _ := s.CreateSession(ctx, adm.ID, -time.Minute, "", "")
	if _, err := s.SessionByToken(ctx, tok2); !errors.Is(err, ErrNotFound) {
		t.Error("expired session accepted")
	}
	if err := s.PruneSessions(ctx); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = s.pool.QueryRow(ctx, "SELECT count(*) FROM admin_sessions").Scan(&n)
	if n != 0 {
		t.Errorf("sessions after prune = %d", n)
	}

	tok3, _, _ := s.CreateSession(ctx, adm.ID, time.Hour, "", "")
	if err := s.DeleteSession(ctx, tok3); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SessionByToken(ctx, tok3); !errors.Is(err, ErrNotFound) {
		t.Error("deleted session still valid")
	}
}
