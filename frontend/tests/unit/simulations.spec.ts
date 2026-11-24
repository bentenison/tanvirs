import { describe, expect, it } from 'vitest'
import { WorkerPoolSim } from '@/engine/sim/workerPool'
import { ConnectionPoolSim } from '@/engine/sim/connectionPool'
import { CacheSim } from '@/engine/sim/cache'
import { chunk, retrieve, answer, SAMPLE_DOCUMENT, SAMPLE_QUESTIONS } from '@/engine/sim/rag'

const run = (sim: { step(dt: number): void }, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) sim.step(1 / 60)
}

describe('WorkerPoolSim', () => {
  it('is deterministic for a seed', () => {
    const a = new WorkerPoolSim(4, 9)
    const b = new WorkerPoolSim(4, 9)
    run(a, 10)
    run(b, 10)
    expect(a.stats()).toEqual(b.stats())
  })

  it('drains a burst with no arrivals', () => {
    const s = new WorkerPoolSim(8)
    s.arrivalRate = 0
    s.burst(40)
    run(s, 30)
    expect(s.stats().queued).toBe(0)
    expect(s.stats().done).toBe(40)
  })

  it('more workers drain the same backlog faster', () => {
    const few = new WorkerPoolSim(2, 1)
    const many = new WorkerPoolSim(16, 1)
    for (const s of [few, many]) {
      s.arrivalRate = 0
      s.burst(60)
    }
    run(few, 5)
    run(many, 5)
    expect(many.stats().done).toBeGreaterThan(few.stats().done)
  })

  it('the queue grows when arrivals exceed capacity', () => {
    const s = new WorkerPoolSim(1)
    s.arrivalRate = 10
    run(s, 10)
    expect(s.stats().queued).toBeGreaterThan(30)
  })

  it('shrinking the pool requeues in-flight jobs instead of losing them', () => {
    const s = new WorkerPoolSim(8)
    s.arrivalRate = 0
    s.burst(20)
    run(s, 0.1)
    s.setWorkers(1)
    run(s, 60)
    expect(s.stats().done).toBe(20)
  })
})

describe('ConnectionPoolSim', () => {
  it('has no waiting when the pool is larger than concurrency', () => {
    const s = new ConnectionPoolSim(4, 8)
    run(s, 10)
    expect(s.stats().p95).toBe(0)
    expect(s.errors).toBe(0)
  })

  it('queues and times out when the pool is exhausted', () => {
    const s = new ConnectionPoolSim(64, 2)
    s.timeout = 0.3
    run(s, 10)
    const st = s.stats()
    expect(st.p95).toBeGreaterThan(0)
    expect(st.errors).toBeGreaterThan(0)
    expect(st.inUse).toBeLessThanOrEqual(2)
  })

  it('never hands one connection to two clients', () => {
    const s = new ConnectionPoolSim(40, 5)
    for (let i = 0; i < 600; i++) {
      s.step(1 / 60)
      const owners = s.conns.filter((c) => c !== null)
      expect(new Set(owners).size).toBe(owners.length)
      if (i === 300) s.setPoolSize(3)
    }
  })
})

describe('CacheSim', () => {
  it('records a miss then a hit', () => {
    const c = new CacheSim(2, 10)
    expect(c.get('user:1').kind).toBe('miss')
    expect(c.get('user:1').kind).toBe('hit')
    expect(c.hitRatio).toBe(0.5)
  })

  it('evicts the least recently used entry', () => {
    const c = new CacheSim(2, 10)
    c.get('user:1')
    c.get('user:2')
    c.get('user:1') // user:1 is now most recent
    const res = c.get('user:3')
    expect(res.events.map((e) => e.kind)).toEqual(['miss', 'evict'])
    expect(res.events[1].key).toBe('user:2')
    expect(c.entries.map((e) => e.key)).toEqual(['user:3', 'user:1'])
  })

  it('expires entries after their TTL', () => {
    const c = new CacheSim(4, 2)
    c.get('user:1')
    c.advance(2.5)
    const res = c.get('user:1')
    expect(res.kind).toBe('miss')
    expect(res.events.map((e) => e.kind)).toEqual(['expired', 'miss'])
  })

  it('shrinking capacity evicts from the tail', () => {
    const c = new CacheSim(4, 10)
    ;['user:1', 'user:2', 'user:3'].forEach((k) => c.get(k))
    c.setCapacity(1)
    expect(c.entries.map((e) => e.key)).toEqual(['user:3'])
  })
})

describe('RAG pipeline', () => {
  it('chunks with overlap and covers the whole document', () => {
    const words = SAMPLE_DOCUMENT.split(/\s+/).filter(Boolean)
    const chunks = chunk(SAMPLE_DOCUMENT, 40, 8)
    expect(chunks[1].start).toBe(32)
    const last = chunks[chunks.length - 1]
    expect(last.start + last.text.split(' ').length).toBe(words.length)
  })

  it('retrieves the relevant chunk for each sample question', () => {
    const chunks = chunk(SAMPLE_DOCUMENT, 40, 8)
    const expectations = [/connection/i, /TTL|time-to-live/i, /shutdown|deploy/i]
    SAMPLE_QUESTIONS.forEach((q, i) => {
      const top = retrieve(chunks, q, 3)
      expect(top.length).toBeGreaterThan(0)
      expect(top[0].chunk.text).toMatch(expectations[i])
    })
  })

  it('answers with citations drawn only from retrieved chunks', () => {
    const chunks = chunk(SAMPLE_DOCUMENT, 40, 8)
    const top = retrieve(chunks, SAMPLE_QUESTIONS[0], 3)
    const a = answer(SAMPLE_QUESTIONS[0], top)
    expect(a.citations.length).toBeGreaterThan(0)
    for (const c of a.citations) expect(top.map((t) => t.chunk.id)).toContain(c)
  })

  it('admits when the context does not answer', () => {
    const chunks = chunk(SAMPLE_DOCUMENT, 40, 8)
    const top = retrieve(chunks, 'zebra xylophone', 3)
    expect(top).toEqual([])
    expect(answer('zebra xylophone', top).citations).toEqual([])
  })
})
