package contact

import (
	"context"
	"sync"
	"time"
)

// Limiter is an in-memory sliding-window rate limiter with a per-key limit
// and a global limit. It is safe for concurrent use.
type Limiter struct {
	perKey       int
	perKeyWindow time.Duration
	global       int
	globalWindow time.Duration
	now          func() time.Time

	mu     sync.Mutex
	keys   map[string][]time.Time
	allHit []time.Time
}

// NewLimiter allows perKey events per key within perKeyWindow and global
// events overall within globalWindow.
func NewLimiter(perKey int, perKeyWindow time.Duration, global int, globalWindow time.Duration) *Limiter {
	return &Limiter{
		perKey:       perKey,
		perKeyWindow: perKeyWindow,
		global:       global,
		globalWindow: globalWindow,
		now:          time.Now,
		keys:         make(map[string][]time.Time),
	}
}

// NewDefaultLimiter returns the contact form policy: 5 per client per 10
// minutes and 60 per hour overall.
func NewDefaultLimiter() *Limiter {
	return NewLimiter(5, 10*time.Minute, 60, time.Hour)
}

// Allow records an event for key if both limits permit it. When denied it
// returns false and how long until the next event would be allowed.
func (l *Limiter) Allow(key string) (bool, time.Duration) {
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()

	l.allHit = prune(l.allHit, now.Add(-l.globalWindow))
	hits := prune(l.keys[key], now.Add(-l.perKeyWindow))

	var wait time.Duration
	if len(hits) >= l.perKey {
		wait = hits[len(hits)-l.perKey].Add(l.perKeyWindow).Sub(now)
	}
	if len(l.allHit) >= l.global {
		wait = max(wait, l.allHit[len(l.allHit)-l.global].Add(l.globalWindow).Sub(now))
	}
	if wait > 0 {
		if len(hits) == 0 {
			delete(l.keys, key)
		} else {
			l.keys[key] = hits
		}
		return false, wait
	}
	l.keys[key] = append(hits, now)
	l.allHit = append(l.allHit, now)
	return true, 0
}

// Run removes expired entries every interval until ctx is cancelled.
func (l *Limiter) Run(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			l.cleanup()
		}
	}
}

func (l *Limiter) cleanup() {
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()
	for k, hits := range l.keys {
		if hits = prune(hits, now.Add(-l.perKeyWindow)); len(hits) == 0 {
			delete(l.keys, k)
		} else {
			l.keys[k] = hits
		}
	}
	l.allHit = prune(l.allHit, now.Add(-l.globalWindow))
}

// prune drops timestamps at or before cutoff; hits is sorted ascending.
func prune(hits []time.Time, cutoff time.Time) []time.Time {
	i := 0
	for i < len(hits) && !hits[i].After(cutoff) {
		i++
	}
	if i == 0 {
		return hits
	}
	return append(hits[:0:0], hits[i:]...)
}
