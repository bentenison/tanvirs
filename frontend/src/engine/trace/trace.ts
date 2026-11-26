/**
 * "The Request": turns the browser's own measurements of a real request
 * (Navigation / Resource Timing) plus the Go server's Server-Timing header
 * into the stages the hero animates. Every number shown comes from here;
 * nothing is invented. A stage without a measurement has ms = null and a
 * note explaining why (reused connection, cached, not used by this page).
 */
export type StageGroup = 'browser' | 'network' | 'server' | 'data'

export interface Stage {
  id: 'you' | 'dns' | 'connect' | 'edge' | 'mw' | 'app' | 'db' | 'download' | 'render'
  label: string
  detail: string
  group: StageGroup
  /** Outbound (request) or return (response) leg. */
  leg: 'out' | 'back'
  ms: number | null
  note?: string
}

export interface Trace {
  source: 'page' | 'probe'
  requestId: string
  stages: Stage[]
  /** Wall-clock total from request start to response end (and render for the page). */
  totalMs: number
  serverMs: number | null
  bytes: number | null
  encoding: string
  cached: boolean
  database: string
}

export interface ServerTimingLike {
  name: string
  duration: number
  description: string
}

export interface ParsedServerTiming {
  mw: number | null
  app: number | null
  embed: number | null
  db: number | null
  total: number | null
  rid: string
  embedDesc: string
}

export function parseServerTiming(entries: readonly ServerTimingLike[] | undefined): ParsedServerTiming {
  const out: ParsedServerTiming = { mw: null, app: null, embed: null, db: null, total: null, rid: '', embedDesc: '' }
  for (const e of entries ?? []) {
    switch (e.name) {
      case 'mw':
      case 'app':
      case 'embed':
      case 'db':
      case 'total':
        out[e.name] = Number.isFinite(e.duration) ? e.duration : null
        if (e.name === 'embed') out.embedDesc = e.description
        break
      case 'rid':
        out.rid = e.description
        break
    }
  }
  return out
}

/** Minimal shape of PerformanceResourceTiming / PerformanceNavigationTiming we use. */
export interface TimingLike {
  startTime: number
  domainLookupStart: number
  domainLookupEnd: number
  connectStart: number
  connectEnd: number
  secureConnectionStart: number
  requestStart: number
  responseStart: number
  responseEnd: number
  transferSize: number
  encodedBodySize: number
  serverTiming?: readonly ServerTimingLike[]
}

const pos = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0)
const round = (n: number) => Math.round(n * 1000) / 1000

function encodingFrom(desc: string): string {
  const m = desc.match(/\((brotli|gzip|uncompressed)\)/)
  return m ? m[1] : ''
}

function networkStages(t: TimingLike, serverTotal: number | null): Stage[] {
  const dns = t.domainLookupEnd - t.domainLookupStart
  const connect = t.connectEnd - t.connectStart
  const tls = t.secureConnectionStart > 0 ? t.connectEnd - t.secureConnectionStart : 0
  const wait = pos(t.responseStart - t.requestStart)
  const edge = serverTotal !== null ? Math.max(0, wait - serverTotal) : wait
  return [
    {
      id: 'dns',
      label: 'DNS lookup',
      detail: 'Finding the server for this address',
      group: 'network',
      leg: 'out',
      ms: dns > 0 ? round(dns) : null,
      note: dns > 0 ? undefined : 'already known to your browser',
    },
    {
      id: 'connect',
      label: tls > 0 ? 'Connect + TLS' : 'Connect',
      detail: 'Opening an encrypted connection',
      group: 'network',
      leg: 'out',
      ms: connect > 0 ? round(connect) : null,
      note: connect > 0 ? undefined : 'connection reused',
    },
    {
      id: 'edge',
      label: 'Network + proxy',
      detail: 'Across the internet to alwaysdata, through its HTTPS proxy, and back',
      group: 'network',
      leg: 'out',
      ms: round(edge),
    },
  ]
}

/**
 * Builds the trace of the page navigation itself. `renderedAt` is when Vue
 * finished mounting (performance.now() timestamp), if known.
 */
export function traceFromNavigation(nav: TimingLike, renderedAt?: number): Trace {
  const st = parseServerTiming(nav.serverTiming)
  const cached = nav.transferSize === 0 && st.total === null
  const download = pos(nav.responseEnd - nav.responseStart)
  const render = renderedAt !== undefined ? pos(renderedAt - nav.responseEnd) : null
  const encoding = encodingFrom(st.embedDesc)
  const bytes = nav.encodedBodySize > 0 ? nav.encodedBodySize : null

  const stages: Stage[] = [
    { id: 'you', label: 'Your browser', detail: 'Asks for this page', group: 'browser', leg: 'out', ms: null },
    ...networkStages(nav, st.total),
    {
      id: 'mw',
      label: 'Go middleware',
      detail: 'Request ID, security headers, structured log',
      group: 'server',
      leg: 'out',
      ms: st.mw,
      note: st.mw === null ? (cached ? 'served from your browser cache' : 'not reported') : undefined,
    },
    {
      id: 'app',
      label: 'Go handler',
      detail: `Prerendered page embedded in the binary${encoding ? `, ${encoding}` : ''}`,
      group: 'server',
      leg: 'out',
      ms: st.app,
      note: st.app === null ? (cached ? 'served from your browser cache' : 'not reported') : undefined,
    },
    {
      id: 'db',
      label: 'PostgreSQL',
      detail: 'Contact messages and the admin inbox',
      group: 'data',
      leg: 'out',
      ms: null,
      note: 'not needed for this page',
    },
    {
      id: 'download',
      label: 'Response',
      detail: bytes ? `${formatBytes(bytes)} ${encoding || 'compressed'} back to you` : 'Back to you',
      group: 'network',
      leg: 'back',
      ms: round(download),
    },
    {
      id: 'render',
      label: 'Render',
      detail: 'Your browser parses the page and Vue takes over',
      group: 'browser',
      leg: 'back',
      ms: render !== null ? round(render) : null,
      note: render === null ? 'still rendering' : undefined,
    },
  ]
  const end = renderedAt ?? nav.responseEnd
  return {
    source: 'page',
    requestId: st.rid,
    stages,
    totalMs: round(pos(end - (nav.startTime || 0))),
    serverMs: st.total,
    bytes,
    encoding,
    cached,
    database: 'not used',
  }
}

export interface ProbeJSON {
  request_id: string
  server: { middleware_ms: number; handler_ms: number; database_ms: number | null; total_ms: number }
  database: string
}

/** Builds the trace of a fresh request to /api/trace. */
export function traceFromProbe(json: ProbeJSON, timing: TimingLike | null, wallMs: number): Trace {
  const st = parseServerTiming(timing?.serverTiming)
  const serverTotal = st.total ?? json.server.total_ms
  const net: Stage[] = timing
    ? networkStages(timing, serverTotal)
    : [{ id: 'edge', label: 'Network + proxy', detail: 'Across the internet and back', group: 'network', leg: 'out', ms: round(Math.max(0, wallMs - serverTotal)) }]
  const dbNote =
    json.database === 'postgresql' ? undefined : json.database === 'unavailable' ? 'database not reachable right now' : 'no database configured'
  const stages: Stage[] = [
    { id: 'you', label: 'Your browser', detail: 'Sends a fresh request', group: 'browser', leg: 'out', ms: null },
    ...net,
    { id: 'mw', label: 'Go middleware', detail: 'Request ID, security headers, rate limit', group: 'server', leg: 'out', ms: json.server.middleware_ms },
    { id: 'app', label: 'Go handler', detail: 'Measures each stage and reports it back', group: 'server', leg: 'out', ms: json.server.handler_ms },
    {
      id: 'db',
      label: 'PostgreSQL',
      detail: 'A real round trip to the database',
      group: 'data',
      leg: 'out',
      ms: json.server.database_ms,
      note: dbNote,
    },
    {
      id: 'download',
      label: 'Response',
      detail: 'A few hundred bytes of JSON back to you',
      group: 'network',
      leg: 'back',
      ms: timing ? round(pos(timing.responseEnd - timing.responseStart)) : null,
    },
  ]
  return {
    source: 'probe',
    requestId: json.request_id || st.rid,
    stages,
    totalMs: round(wallMs),
    serverMs: serverTotal,
    bytes: timing && timing.encodedBodySize > 0 ? timing.encodedBodySize : null,
    encoding: '',
    cached: false,
    database: json.database,
  }
}

/** Where the time went, for the stacked bar. Only measured stages count. */
export function breakdown(t: Trace): { group: StageGroup; ms: number; share: number }[] {
  const sums = new Map<StageGroup, number>()
  for (const s of t.stages) if (s.ms !== null) sums.set(s.group, (sums.get(s.group) ?? 0) + s.ms)
  const total = [...sums.values()].reduce((a, b) => a + b, 0) || 1
  return (['network', 'server', 'data', 'browser'] as StageGroup[])
    .filter((g) => (sums.get(g) ?? 0) > 0)
    .map((g) => ({ group: g, ms: round(sums.get(g)!), share: sums.get(g)! / total }))
}

export function formatMs(ms: number | null): string {
  if (ms === null) return ''
  // A zero means the stage finished within one tick of the server's clock.
  if (ms <= 0) return '< 1 µs'
  if (ms < 1) return `${Math.max(1, Math.round(ms * 1000))} µs`
  if (ms < 10) return `${ms.toFixed(2)} ms`
  if (ms < 1000) return `${ms.toFixed(0)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  return `${(n / 1024).toFixed(1)} KB`
}

/** Animation time per stage: real times are microseconds to seconds, so they are log-scaled to stay watchable. */
export function animationMs(ms: number | null): number {
  if (ms === null) return 260
  return Math.min(1100, Math.max(280, 280 + Math.log10(1 + ms * 10) * 260))
}

/** Sends a real request to /api/trace and builds its trace. */
export async function probe(signal?: AbortSignal): Promise<Trace> {
  const url = `/api/trace?t=${Date.now().toString(36)}`
  const t0 = performance.now()
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal })
  if (res.status === 429) throw new Error('rate_limited')
  if (!res.ok) throw new Error(`trace failed: ${res.status}`)
  const json = (await res.json()) as ProbeJSON
  const wall = performance.now() - t0
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  const timing = [...entries].reverse().find((e) => e.name.endsWith(url)) ?? null
  return traceFromProbe(json, timing as unknown as TimingLike | null, wall)
}

/** The trace of the page load itself, or null when the browser has no Navigation Timing. */
export function pageTrace(): Trace | null {
  const nav = performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined
  if (!nav) return null
  const mounted = performance.getEntriesByName?.('app-mounted')?.[0]?.startTime
  return traceFromNavigation(nav as unknown as TimingLike, mounted)
}

/** The stages with no numbers yet: what the server renders before measuring. */
export function placeholderTrace(): Trace {
  const t = traceFromNavigation({
    startTime: 0,
    domainLookupStart: 0,
    domainLookupEnd: 0,
    connectStart: 0,
    connectEnd: 0,
    secureConnectionStart: 0,
    requestStart: 0,
    responseStart: 0,
    responseEnd: 0,
    transferSize: 1,
    encodedBodySize: 0,
    serverTiming: [],
  })
  return { ...t, stages: t.stages.map((s) => ({ ...s, ms: null, note: undefined })), totalMs: 0 }
}
