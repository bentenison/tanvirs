/**
 * A transparent, deterministic RAG pipeline. No model is called:
 * BM25 lexical scoring stands in for embeddings, and the "generation"
 * step is extractive, it quotes the best-matching sentences and cites
 * the chunks they came from. The point is to show the shape of the
 * pipeline honestly, not to imitate an LLM.
 */
export interface Chunk {
  id: number
  text: string
  tokens: string[]
  start: number
}

export interface Scored {
  chunk: Chunk
  score: number
  matched: string[]
}

const STOP = new Set(
  'a an and are as at be by can do does for from has have how i if in into is it its of on or so that the their them then there these they this to was what when which who why will with you your should does'.split(
    ' ',
  ),
)

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !STOP.has(t)).map(stem)
}

/** Tiny suffix stripper, enough to match "pools"/"pool", "timeouts"/"timeout". */
function stem(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y'
  if (t.length > 3 && t.endsWith('es') && !t.endsWith('ses')) return t.slice(0, -2)
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1)
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3)
  return t
}

/** Split into chunks of ~`size` words with `overlap` words carried over. */
export function chunk(text: string, size = 40, overlap = 8): Chunk[] {
  const words = text.split(/\s+/).filter(Boolean)
  const step = Math.max(1, size - Math.min(overlap, size - 1))
  const out: Chunk[] = []
  for (let start = 0, id = 1; start < words.length; start += step, id++) {
    const slice = words.slice(start, start + size).join(' ')
    out.push({ id, text: slice, tokens: tokenize(slice), start })
    if (start + size >= words.length) break
  }
  return out
}

/** Okapi BM25 over the chunk set. */
export function retrieve(chunks: Chunk[], query: string, k = 3, k1 = 1.2, b = 0.75): Scored[] {
  const q = Array.from(new Set(tokenize(query)))
  const N = chunks.length
  const avgdl = chunks.reduce((s, c) => s + c.tokens.length, 0) / Math.max(N, 1)
  const df = new Map<string, number>()
  for (const term of q) df.set(term, chunks.filter((c) => c.tokens.includes(term)).length)

  return chunks
    .map((c) => {
      let score = 0
      const matched: string[] = []
      for (const term of q) {
        const f = c.tokens.filter((t) => t === term).length
        if (!f) continue
        matched.push(term)
        const n = df.get(term) ?? 0
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * c.tokens.length) / avgdl)))
      }
      return { chunk: c, score, matched }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.id - b.chunk.id)
    .slice(0, k)
}

export function buildPrompt(question: string, context: Scored[]): string {
  const ctx = context.map((s) => `[${s.chunk.id}] ${s.chunk.text}`).join('\n')
  return `Answer using only the context. Cite chunk ids.\n\nContext:\n${ctx}\n\nQuestion: ${question}`
}

/** Extractive answer: best sentences from retrieved chunks, with citations. */
export function answer(question: string, context: Scored[], maxSentences = 2): { text: string; citations: number[] } {
  const q = new Set(tokenize(question))
  const candidates: { s: string; id: number; score: number }[] = []
  for (const sc of context) {
    const sentences = sc.chunk.text.match(/[^.!?]+[.!?]?/g) ?? []
    for (const raw of sentences) {
      const s = raw.trim()
      if (s.split(/\s+/).length < 5) continue
      const toks = tokenize(s)
      const overlap = toks.filter((t) => q.has(t)).length
      if (overlap) candidates.push({ s, id: sc.chunk.id, score: overlap / Math.sqrt(toks.length) + sc.score * 0.05 })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  const picked: typeof candidates = []
  for (const c of candidates) {
    if (picked.length >= maxSentences) break
    if (!picked.some((p) => p.s === c.s)) picked.push(c)
  }
  if (!picked.length) return { text: 'The context does not answer this question.', citations: [] }
  const text = picked.map((p) => `${p.s.replace(/[.!?]?$/, '.')} [${p.id}]`).join(' ')
  return { text, citations: Array.from(new Set(picked.map((p) => p.id))) }
}

/** The sample document, original text written for this demo. */
export const SAMPLE_DOCUMENT = `Running a Go service well starts with bounded concurrency. Spawning a goroutine per request is cheap, but unbounded work still exhausts memory and downstream systems. A worker pool with a buffered channel caps the number of jobs in flight and gives natural back-pressure when the queue fills.
Database connections are a scarcer resource than goroutines. Set a maximum number of open connections so the database is never overwhelmed, and set a sensible wait timeout so callers fail fast instead of piling up when the pool is exhausted. Keep transactions short because a connection held by a slow transaction is unavailable to everyone else.
Caching removes repeated work from hot paths. An LRU cache keeps the most recently used entries and evicts the least recently used when it is full. A time-to-live bounds how stale an entry can become, which is the main trade-off: longer TTLs mean more hits but older data.
Indexes make reads fast at the cost of slower writes and more storage. Check the query plan before adding one, and prefer composite indexes that match how queries filter and sort. Partitioning very large tables keeps indexes small and makes archiving old data cheap.
Graceful shutdown matters on every deploy. Stop accepting new requests, let in-flight requests finish within a deadline, then close database pools and flush logs. Readiness checks should fail first so load balancers stop sending traffic before the process exits.
Observability closes the loop. Structured logs with request ids connect a slow response to the query that caused it, and profiles show where CPU time and memory actually go before any optimisation begins.`

export const SAMPLE_QUESTIONS = [
  'What happens when the connection pool is exhausted?',
  'How does a TTL affect cache hits?',
  'What does graceful shutdown do during a deploy?',
]
