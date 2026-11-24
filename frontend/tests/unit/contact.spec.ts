import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateContact, submitContact, LIMITS } from '@/services/contact'

const ok = { name: 'Asha', email: 'asha@example.com', message: 'Hello, I would like to talk about a project.', company: '' }

describe('validateContact', () => {
  it('accepts a valid message', () => {
    expect(validateContact(ok)).toEqual({})
  })

  it.each([
    [{ name: '  ' }, { name: 'required' }],
    [{ name: 'x'.repeat(LIMITS.name + 1) }, { name: 'too_long' }],
    [{ name: 'a\u0007b' }, { name: 'invalid' }],
    [{ email: '' }, { email: 'required' }],
    [{ email: 'not-an-email' }, { email: 'invalid' }],
    [{ email: 'a@b' }, { email: 'invalid' }],
    [{ email: 'Name <a@b.com>' }, { email: 'invalid' }],
    [{ message: 'short' }, { message: 'too_short' }],
    [{ message: 'x'.repeat(LIMITS.messageMax + 1) }, { message: 'too_long' }],
  ])('rejects %j', (patch, expected) => {
    expect(validateContact({ ...ok, ...patch })).toEqual(expected)
  })

  it('counts characters, not UTF-16 units', () => {
    expect(validateContact({ ...ok, message: '🙂'.repeat(LIMITS.messageMin) })).toEqual({})
  })
})

describe('submitContact', () => {
  afterEach(() => vi.unstubAllGlobals())

  const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })),
    )

  it('reports success only when the server confirms', async () => {
    respond(200, { ok: true })
    expect(await submitContact(ok, 4000)).toEqual({ ok: true })
  })

  it('never reports success for a delivery failure', async () => {
    respond(502, { error: 'delivery_failed' })
    expect(await submitContact(ok, 4000)).toEqual({ ok: false, kind: 'delivery_failed' })
  })

  it('maps validation, rate limiting and network errors', async () => {
    respond(422, { error: 'invalid', fields: { email: 'invalid' } })
    expect(await submitContact(ok, 4000)).toEqual({ ok: false, kind: 'invalid', fields: { email: 'invalid' } })
    respond(429, { error: 'rate_limited' }, { 'Retry-After': '120' })
    expect(await submitContact(ok, 4000)).toEqual({ ok: false, kind: 'rate_limited', retryAfter: 120 })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    expect(await submitContact(ok, 4000)).toEqual({ ok: false, kind: 'network' })
  })

  it('sends trimmed fields, the honeypot and elapsed time', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    await submitContact({ ...ok, name: '  Asha  ' }, 3210.7)
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body))).toEqual({ name: 'Asha', email: ok.email, message: ok.message, company: '', elapsed_ms: 3211 })
  })
})
