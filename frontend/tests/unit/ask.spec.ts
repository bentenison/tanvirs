import { describe, expect, it } from 'vitest'
import { ask, buildCorpus, expand, search, SUGGESTIONS } from '@/engine/ask/ask'

describe('Ask my portfolio', () => {
  it('builds a corpus only from site content, with working links', () => {
    const docs = buildCorpus()
    expect(docs.length).toBeGreaterThan(40)
    for (const d of docs) {
      expect(d.href).toMatch(/^\/(#|work\/)/)
      expect(d.text.length).toBeGreaterThan(10)
    }
    const blob = docs.map((d) => d.text).join(' ').toLowerCase()
    for (const banned of ['@gmail', 'mkcl', 'typescript', 'webassembly']) expect(blob).not.toContain(banned)
  })

  it('expands synonyms', () => {
    expect(expand('golang postgres')).toEqual(expect.arrayContaining(['go', 'postgresql']))
  })

  it.each([
    ['Have you built offline apps?', /EduFlow|Kreovio/],
    ['How do you handle multi-tenant data?', /Forge|FlowQ|PostgreSQL/],
    ['What do you do with PostgreSQL?', /PostgreSQL/],
    ['Do you work with AI and RAG?', /RAG|AI/],
    ['Tell me about Kreovio live classes', /Kreovio/],
    ['How do I contact you?', /Contact/],
  ])('answers %s from the right sources', (q, source) => {
    const r = ask(q)
    expect(r.found).toBe(true)
    expect(r.hits.map((h) => h.doc.title).join(' ')).toMatch(source)
    expect(r.answer.length).toBeGreaterThan(0)
    for (const a of r.answer) {
      for (const c of a.cites) expect(c).toBeLessThanOrEqual(r.hits.length)
      // Every sentence is quoted from a cited source.
      expect(r.hits[a.cites[0] - 1].doc.text).toContain(a.text.replace(/\.$/, ''))
    }
  })

  it('admits when the site does not cover something', () => {
    const r = ask('favourite pizza topping')
    expect(r.found).toBe(false)
    expect(r.answer).toEqual([])
  })

  it('handles empty and punctuation-only queries', () => {
    expect(ask('').found).toBe(false)
    expect(ask('??? !!!').found).toBe(false)
    expect(search(buildCorpus(), [])).toEqual([])
  })

  it('every suggestion has an answer', () => {
    for (const s of SUGGESTIONS) expect(ask(s).found, s).toBe(true)
  })
})
