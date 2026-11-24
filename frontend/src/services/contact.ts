/**
 * Contact form client. Validation mirrors internal/contact/validate.go so
 * visitors get immediate feedback; the server remains the authority.
 */
export interface ContactInput {
  name: string
  email: string
  message: string
  /** Honeypot, must stay empty. */
  company: string
}

export type FieldError = 'required' | 'too_long' | 'too_short' | 'invalid'
export type FieldErrors = Partial<Record<'name' | 'email' | 'message', FieldError>>

export const LIMITS = { name: 100, email: 254, messageMin: 10, messageMax: 5000 }
export const MIN_ELAPSED_MS = 2500

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/

const runes = (s: string) => Array.from(s).length

export function validateContact(input: ContactInput): FieldErrors {
  const errors: FieldErrors = {}
  const name = input.name.trim()
  const email = input.email.trim()
  const message = input.message.trim()

  if (!name) errors.name = 'required'
  else if (runes(name) > LIMITS.name) errors.name = 'too_long'
  else if (/[\u0000-\u001f\u007f]/.test(name)) errors.name = 'invalid'

  if (!email) errors.email = 'required'
  else if (email.length > LIMITS.email) errors.email = 'too_long'
  else if (!EMAIL.test(email)) errors.email = 'invalid'

  if (!message) errors.message = 'required'
  else if (runes(message) < LIMITS.messageMin) errors.message = 'too_short'
  else if (runes(message) > LIMITS.messageMax) errors.message = 'too_long'

  return errors
}

export const errorText: Record<'name' | 'email' | 'message', Record<FieldError, string>> = {
  name: {
    required: 'Please add your name.',
    too_long: `Please keep your name under ${LIMITS.name} characters.`,
    too_short: 'Please add your name.',
    invalid: 'Your name contains characters that can’t be sent.',
  },
  email: {
    required: 'Please add an email address so I can reply.',
    too_long: 'That email address is too long.',
    too_short: 'Please add an email address.',
    invalid: 'That doesn’t look like an email address. Please check it.',
  },
  message: {
    required: 'Please write a short message.',
    too_short: `A little more detail, please: at least ${LIMITS.messageMin} characters.`,
    too_long: `Please keep it under ${LIMITS.messageMax} characters.`,
    invalid: 'Your message contains characters that can’t be sent.',
  },
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; kind: 'invalid'; fields: FieldErrors }
  | { ok: false; kind: 'too_fast' | 'rate_limited' | 'disabled' | 'delivery_failed' | 'network' | 'unknown'; retryAfter?: number }

export async function contactEnabled(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch('/api/contact', { headers: { Accept: 'application/json' }, signal })
    if (!res.ok) return false
    const body = (await res.json()) as { enabled?: boolean }
    return body.enabled === true
  } catch {
    return false
  }
}

export async function submitContact(input: ContactInput, elapsedMs: number): Promise<SubmitResult> {
  let res: Response
  try {
    res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: input.name.trim(),
        email: input.email.trim(),
        message: input.message.trim(),
        company: input.company,
        elapsed_ms: Math.round(elapsedMs),
      }),
    })
  } catch {
    return { ok: false, kind: 'network' }
  }
  let body: { ok?: boolean; error?: string; fields?: FieldErrors } = {}
  try {
    body = await res.json()
  } catch {
    /* non-JSON error page */
  }
  if (res.ok && body.ok) return { ok: true }
  switch (body.error) {
    case 'invalid':
      return { ok: false, kind: 'invalid', fields: body.fields ?? {} }
    case 'too_fast':
      return { ok: false, kind: 'too_fast' }
    case 'rate_limited':
      return { ok: false, kind: 'rate_limited', retryAfter: Number(res.headers.get('Retry-After')) || undefined }
    case 'contact_disabled':
      return { ok: false, kind: 'disabled' }
    case 'delivery_failed':
      return { ok: false, kind: 'delivery_failed' }
    default:
      return { ok: false, kind: 'unknown' }
  }
}
