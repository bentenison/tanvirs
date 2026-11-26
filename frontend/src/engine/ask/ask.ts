/**
 * "Ask my portfolio": retrieval over this site's own content, entirely in the
 * browser. The corpus is built from the same config the pages render, so an
 * answer can only ever quote what the site already says. Ranking is BM25 with
 * a small synonym table; the answer is extractive (best sentences, cited).
 * No model is called and nothing leaves the page.
 */
import { profile } from '@/config/profile'
import { projects } from '@/config/projects'
import { domains, technologies } from '@/config/technologies'
import { tokenize } from '@/engine/sim/rag'

export interface Doc {
  id: number
  title: string
  section: string
  href: string
  text: string
  tokens: string[]
}

export interface Hit {
  doc: Doc
  score: number
  matched: string[]
}

export interface AskResult {
  query: string
  terms: string[]
  hits: Hit[]
  answer: { text: string; cites: number[] }[]
  found: boolean
  timings: { tokenize: number; retrieve: number; compose: number }
}

/** Words people use for the same thing. Both sides are expanded to the stemmed form. */
const SYNONYMS: Record<string, string[]> = {
  golang: ['go'],
  postgres: ['postgresql'],
  pg: ['postgresql'],
  db: ['database'],
  databases: ['database', 'postgresql', 'mongodb'],
  sql: ['postgresql', 'query'],
  frontend: ['vue', 'interface', 'ui'],
  ui: ['interface', 'vue'],
  ux: ['design', 'interface'],
  backend: ['go', 'api', 'server'],
  api: ['rest', 'api'],
  offline: ['offline', 'pwa'],
  pwa: ['offline', 'install'],
  realtime: ['real', 'time', 'live'],
  live: ['real', 'time', 'live'],
  ai: ['rag', 'llm', 'model', 'prompt'],
  llm: ['model', 'rag', 'ai'],
  rag: ['retrieval', 'augmented', 'generation'],
  kubernetes: ['kubernetes', 'deploy'],
  k8s: ['kubernetes'],
  deploy: ['deployment', 'binary'],
  fast: ['performance', 'latency'],
  speed: ['performance', 'latency'],
  slow: ['performance', 'latency'],
  security: ['secure', 'auth', 'permission'],
  auth: ['authentication', 'authorization', 'permission'],
  multitenant: ['tenant', 'organisation'],
  queue: ['queue', 'counter', 'ticket'],
  school: ['school', 'teacher', 'institute', 'learner'],
  teaching: ['teacher', 'lesson', 'class'],
  lowcode: ['low', 'code', 'metadata'],
  experience: ['year', 'experience'],
  hire: ['contact', 'available'],
  contact: ['contact', 'form', 'github'],
  email: ['contact', 'form'],
}

const STEMMED_SYNONYMS = new Map<string, string[]>(
  Object.entries(SYNONYMS).map(([k, v]) => [tokenize(k)[0] ?? k, v.flatMap((w) => tokenize(w))]),
)

export function expand(query: string): string[] {
  const base = tokenize(query)
  const out = new Set(base)
  for (const t of base) for (const s of STEMMED_SYNONYMS.get(t) ?? []) out.add(s)
  return [...out]
}

/** Builds the corpus from the site's configuration. */
export function buildCorpus(): Doc[] {
  const docs: Omit<Doc, 'id' | 'tokens'>[] = []
  const add = (title: string, section: string, href: string, text: string) => docs.push({ title, section, href, text })

  add('About', 'About', '/#about', `${profile.introduction} ${profile.title} with ${profile.experience} of experience, based in ${profile.location ?? 'India'}.`)
  profile.biography.forEach((p, i) => add('About', i === 0 ? 'How I work' : 'Background', '/#about', p))
  for (const pr of profile.principles) add(pr.title, 'Principles', '/#about', pr.body)

  for (const p of projects) {
    const href = p.presentation === 'feature' ? `/work/${p.slug}` : `/#project-${p.slug}`
    add(p.name, p.category, href, `${p.name}: ${p.tagline} ${p.summary} Built for ${p.audience.toLowerCase()}. Stack: ${p.stack.join(', ')}. Status: ${p.status}.`)
    add(p.name, 'Highlights', href, `${p.name} highlights: ${p.highlights.join('. ')}.`)
    for (const g of p.capabilities) add(p.name, g.title, href, `${p.name} ${g.title.toLowerCase()}: ${g.items.join('. ')}.`)
    for (const e of p.engineering ?? []) add(p.name, 'Engineering', href, `${p.name}: ${e.title}. ${e.body}`)
  }

  for (const d of domains) {
    const techs = technologies.filter((t) => t.domain === d.id)
    add(d.name, 'Skills', '/#capabilities', `${d.name}: ${d.summary} Technologies: ${techs.map((t) => t.name).join(', ')}.`)
    for (const t of techs) {
      add(t.name, d.short, '/#capabilities', `${t.name}: ${t.role} ${t.capabilities.join('. ')}.`)
    }
  }

  add('Contact', 'Contact', '/#contact', 'The best way to reach me is the contact form at the bottom of this page; I reply personally by email. My code is on GitHub.')

  return docs.map((d, i) => ({ ...d, id: i + 1, tokens: tokenize(`${d.title} ${d.text}`) }))
}

/** Okapi BM25 over the corpus, with a small bonus for title matches. */
export function search(corpus: Doc[], terms: string[], k = 4, k1 = 1.2, b = 0.75): Hit[] {
  if (!terms.length) return []
  const N = corpus.length
  const avgdl = corpus.reduce((s, d) => s + d.tokens.length, 0) / Math.max(N, 1)
  const df = new Map<string, number>()
  for (const t of terms) df.set(t, corpus.filter((d) => d.tokens.includes(t)).length)
  return corpus
    .map((doc) => {
      let score = 0
      const matched: string[] = []
      const titleTokens = tokenize(doc.title)
      for (const t of terms) {
        const f = doc.tokens.filter((x) => x === t).length
        if (!f) continue
        matched.push(t)
        const n = df.get(t) ?? 0
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * doc.tokens.length) / avgdl)))
        if (titleTokens.includes(t)) score += idf * 0.5
      }
      return { doc, score, matched }
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.id - b.doc.id)
    .slice(0, k)
}

/** Minimum best score for an answer; below it we say we don't know. */
export const MIN_SCORE = 1.2

export function compose(terms: string[], hits: Hit[], maxSentences = 3): { text: string; cites: number[] }[] {
  const q = new Set(terms)
  const candidates: { s: string; cite: number; score: number }[] = []
  hits.forEach((h, rank) => {
    const sentences = h.doc.text.match(/[^.!?]+[.!?]?/g) ?? []
    for (const raw of sentences) {
      const s = raw.trim()
      if (s.split(/\s+/).length < 4) continue
      const toks = tokenize(s)
      const overlap = toks.filter((t) => q.has(t)).length
      if (!overlap) continue
      candidates.push({ s, cite: rank + 1, score: overlap / Math.sqrt(toks.length) + h.score * 0.08 - rank * 0.05 })
    }
  })
  candidates.sort((a, b) => b.score - a.score)
  const picked: typeof candidates = []
  for (const c of candidates) {
    if (picked.length >= maxSentences) break
    if (picked.some((p) => p.s === c.s)) continue
    picked.push(c)
  }
  // Keep the source order of picked sentences readable: group by citation.
  picked.sort((a, b) => a.cite - b.cite)
  return picked.map((p) => ({ text: p.s.replace(/[.!?]?$/, '.'), cites: [p.cite] }))
}

let cached: Doc[] | null = null
export function corpus(): Doc[] {
  return (cached ??= buildCorpus())
}

export function ask(query: string): AskResult {
  const t0 = performance.now()
  const terms = expand(query)
  const t1 = performance.now()
  const hits = search(corpus(), terms)
  const t2 = performance.now()
  const found = hits.length > 0 && hits[0].score >= MIN_SCORE
  const answer = found ? compose(terms, hits) : []
  const t3 = performance.now()
  return {
    query,
    terms,
    hits: found ? hits : [],
    answer,
    found: found && answer.length > 0,
    timings: { tokenize: t1 - t0, retrieve: t2 - t1, compose: t3 - t2 },
  }
}

export const SUGGESTIONS = [
  'Have you built offline apps?',
  'How do you handle multi-tenant data?',
  'What do you do with PostgreSQL?',
  'Do you work with AI and RAG?',
  'Tell me about Kreovio live classes',
  'How do I contact you?',
]
