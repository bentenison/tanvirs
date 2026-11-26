import { describe, expect, it } from 'vitest'
import {
  animationMs,
  breakdown,
  formatMs,
  parseServerTiming,
  placeholderTrace,
  traceFromNavigation,
  traceFromProbe,
  type TimingLike,
} from '@/engine/trace/trace'

const serverTiming = [
  { name: 'mw', duration: 0.042, description: 'Middleware' },
  { name: 'app', duration: 0.118, description: 'Handler' },
  { name: 'embed', duration: 0, description: 'Embedded file (brotli)' },
  { name: 'total', duration: 0.16, description: 'Go server' },
  { name: 'rid', duration: 0, description: 'abc123def456ghi789' },
]

const nav = (over: Partial<TimingLike> = {}): TimingLike => ({
  startTime: 0,
  domainLookupStart: 5,
  domainLookupEnd: 25,
  connectStart: 25,
  connectEnd: 95,
  secureConnectionStart: 50,
  requestStart: 96,
  responseStart: 196,
  responseEnd: 210,
  transferSize: 13500,
  encodedBodySize: 13000,
  serverTiming,
  ...over,
})

describe('parseServerTiming', () => {
  it('reads every metric and the request id', () => {
    const st = parseServerTiming(serverTiming)
    expect(st).toMatchObject({ mw: 0.042, app: 0.118, total: 0.16, rid: 'abc123def456ghi789', db: null })
    expect(st.embedDesc).toContain('brotli')
  })
  it('tolerates a missing header', () => {
    expect(parseServerTiming(undefined).total).toBeNull()
  })
})

describe('traceFromNavigation', () => {
  it('splits the request into measured stages', () => {
    const t = traceFromNavigation(nav(), 320)
    const by = Object.fromEntries(t.stages.map((s) => [s.id, s]))
    expect(by.dns.ms).toBe(20)
    expect(by.connect.ms).toBe(70)
    expect(by.connect.label).toBe('Connect + TLS')
    // Waiting time minus server time is network + proxy.
    expect(by.edge.ms).toBeCloseTo(100 - 0.16, 3)
    expect(by.mw.ms).toBe(0.042)
    expect(by.app.detail).toContain('brotli')
    expect(by.db.ms).toBeNull()
    expect(by.db.note).toMatch(/not needed/)
    expect(by.download.ms).toBe(14)
    expect(by.render.ms).toBe(110)
    expect(t.requestId).toBe('abc123def456ghi789')
    expect(t.totalMs).toBe(320)
    expect(t.encoding).toBe('brotli')
    expect(t.cached).toBe(false)
  })

  it('labels reused connections instead of inventing numbers', () => {
    const t = traceFromNavigation(nav({ domainLookupStart: 0, domainLookupEnd: 0, connectStart: 0, connectEnd: 0, secureConnectionStart: 0 }))
    const by = Object.fromEntries(t.stages.map((s) => [s.id, s]))
    expect(by.dns.ms).toBeNull()
    expect(by.dns.note).toMatch(/already known/)
    expect(by.connect.note).toMatch(/reused/)
  })

  it('recognises a page served from the browser cache', () => {
    const t = traceFromNavigation(nav({ transferSize: 0, serverTiming: [] }))
    expect(t.cached).toBe(true)
    expect(t.stages.find((s) => s.id === 'mw')?.note).toMatch(/cache/)
  })
})

describe('traceFromProbe', () => {
  const json = {
    request_id: 'probe-1',
    server: { middleware_ms: 0.03, handler_ms: 0.9, database_ms: 0.7, total_ms: 0.93 },
    database: 'postgresql',
  }
  it('includes the database round trip when reported', () => {
    const t = traceFromProbe(json, nav({ serverTiming: [] }), 150)
    const db = t.stages.find((s) => s.id === 'db')!
    expect(db.ms).toBe(0.7)
    expect(db.note).toBeUndefined()
    expect(t.requestId).toBe('probe-1')
    expect(t.source).toBe('probe')
  })
  it('explains a missing database', () => {
    const t = traceFromProbe({ ...json, database: 'not configured', server: { ...json.server, database_ms: null } }, null, 80)
    expect(t.stages.find((s) => s.id === 'db')?.note).toMatch(/no database/)
    expect(t.stages.find((s) => s.id === 'edge')?.ms).toBeCloseTo(80 - 0.93, 3)
  })
})

describe('helpers', () => {
  it('breakdown shares add up to one and skip unmeasured groups', () => {
    const b = breakdown(traceFromNavigation(nav(), 320))
    expect(b.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 5)
    expect(b.map((x) => x.group)).not.toContain('data')
  })
  it('formats microseconds to seconds', () => {
    expect(formatMs(0.042)).toBe('42 µs')
    expect(formatMs(0)).toBe('< 1 µs')
    expect(formatMs(4.2)).toBe('4.20 ms')
    expect(formatMs(420)).toBe('420 ms')
    expect(formatMs(4200)).toBe('4.20 s')
  })
  it('keeps animation watchable but ordered', () => {
    expect(animationMs(0.04)).toBeGreaterThanOrEqual(280)
    expect(animationMs(100)).toBeGreaterThan(animationMs(1))
    expect(animationMs(100000)).toBeLessThanOrEqual(1100)
  })
  it('placeholder has the stages but no numbers', () => {
    const p = placeholderTrace()
    expect(p.stages.length).toBe(9)
    expect(p.stages.every((s) => s.ms === null)).toBe(true)
  })
})
