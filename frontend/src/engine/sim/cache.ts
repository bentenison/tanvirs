import { mulberry32 } from './random'

/**
 * LRU cache with per-entry TTL in front of a slow store. Every request
 * produces exactly one event so the visualisation can narrate it.
 */
export type CacheEventKind = 'hit' | 'miss' | 'expired' | 'evict'

export interface CacheEvent {
  seq: number
  kind: CacheEventKind
  key: string
  at: number
}

export interface CacheEntry {
  key: string
  storedAt: number
  expiresAt: number
}

export const HIT_LATENCY_MS = 2
export const MISS_LATENCY_MS = 120

export class CacheSim {
  /** Most recently used first. */
  entries: CacheEntry[] = []
  events: CacheEvent[] = []
  hits = 0
  misses = 0
  time = 0
  capacity: number
  ttl: number
  readonly keys: string[]
  private seq = 0
  private rnd: () => number
  private weights: number[]

  constructor(capacity = 4, ttl = 8, seed = 3, keyCount = 9) {
    this.capacity = capacity
    this.ttl = ttl
    this.rnd = mulberry32(seed)
    this.keys = Array.from({ length: keyCount }, (_, i) => `user:${i + 1}`)
    // Zipf-like popularity: a few hot keys, a long tail.
    const raw = this.keys.map((_, i) => 1 / (i + 1) ** 1.1)
    const sum = raw.reduce((a, b) => a + b, 0)
    this.weights = raw.map((w) => w / sum)
  }

  setCapacity(n: number): void {
    this.capacity = Math.max(1, Math.round(n))
    while (this.entries.length > this.capacity) {
      const e = this.entries.pop()!
      this.emit('evict', e.key)
    }
  }

  setTtl(seconds: number): void {
    this.ttl = Math.max(0.5, seconds)
  }

  advance(seconds: number): void {
    this.time += seconds
  }

  /** Draw a key according to popularity. */
  sampleKey(): string {
    let r = this.rnd()
    for (let i = 0; i < this.keys.length; i++) {
      r -= this.weights[i]
      if (r <= 0) return this.keys[i]
    }
    return this.keys[this.keys.length - 1]
  }

  /** Returns the simulated latency in ms. */
  get(key: string): { kind: 'hit' | 'miss'; latency: number; events: CacheEvent[] } {
    const out: CacheEvent[] = []
    const idx = this.entries.findIndex((e) => e.key === key)
    if (idx >= 0) {
      const entry = this.entries[idx]
      if (this.time < entry.expiresAt) {
        this.entries.splice(idx, 1)
        this.entries.unshift(entry)
        this.hits++
        out.push(this.emit('hit', key))
        return { kind: 'hit', latency: HIT_LATENCY_MS, events: out }
      }
      this.entries.splice(idx, 1)
      out.push(this.emit('expired', key))
    }
    this.misses++
    out.push(this.emit('miss', key))
    this.entries.unshift({ key, storedAt: this.time, expiresAt: this.time + this.ttl })
    while (this.entries.length > this.capacity) {
      const evicted = this.entries.pop()!
      out.push(this.emit('evict', evicted.key))
    }
    return { kind: 'miss', latency: MISS_LATENCY_MS, events: out }
  }

  get hitRatio(): number {
    const total = this.hits + this.misses
    return total ? this.hits / total : 0
  }

  get avgLatency(): number {
    const total = this.hits + this.misses
    return total ? (this.hits * HIT_LATENCY_MS + this.misses * MISS_LATENCY_MS) / total : 0
  }

  remaining(e: CacheEntry): number {
    return Math.max(0, Math.min(1, (e.expiresAt - this.time) / this.ttl))
  }

  private emit(kind: CacheEventKind, key: string): CacheEvent {
    const ev = { seq: ++this.seq, kind, key, at: this.time }
    this.events.unshift(ev)
    if (this.events.length > 40) this.events.pop()
    return ev
  }
}
