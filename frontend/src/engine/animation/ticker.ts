/**
 * One coordinated animation loop for the whole site.
 *
 * Subscribers receive (dt seconds, now ms). The loop runs only while at
 * least one subscriber is active and the document is visible, so an idle
 * page costs nothing. dt is clamped so a backgrounded tab or a long task
 * never produces a physics explosion.
 */
export type TickFn = (dt: number, now: number) => void

export interface TickerHandle {
  /** Stop receiving frames permanently. */
  dispose(): void
  /** Temporarily stop/resume (e.g. when offscreen). */
  setActive(active: boolean): void
}

const MAX_DT = 1 / 20

interface Sub {
  fn: TickFn
  active: boolean
}

const subs = new Set<Sub>()
let raf = 0
let last = 0
let visible = true
let frameListeners: ((frameMs: number) => void)[] = []

function hasBrowser(): boolean {
  return typeof window !== 'undefined' && typeof requestAnimationFrame === 'function'
}

function anyActive(): boolean {
  for (const s of subs) if (s.active) return true
  return false
}

function loop(now: number): void {
  raf = 0
  const frameMs = last ? now - last : 16.7
  const dt = Math.min(frameMs / 1000, MAX_DT)
  last = now
  for (const s of subs) if (s.active) s.fn(dt, now)
  for (const l of frameListeners) l(frameMs)
  schedule()
}

function schedule(): void {
  if (!hasBrowser() || raf || !visible || !anyActive()) {
    if (!raf) last = 0
    return
  }
  raf = requestAnimationFrame(loop)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    visible = document.visibilityState !== 'hidden'
    if (!visible && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    last = 0
    schedule()
  })
}

export function subscribe(fn: TickFn, active = true): TickerHandle {
  const sub: Sub = { fn, active }
  subs.add(sub)
  schedule()
  return {
    dispose() {
      subs.delete(sub)
    },
    setActive(a: boolean) {
      if (sub.active === a) return
      sub.active = a
      if (a) schedule()
    },
  }
}

/** Observe raw frame durations (used by adaptive quality). */
export function onFrame(listener: (frameMs: number) => void): () => void {
  frameListeners.push(listener)
  return () => {
    frameListeners = frameListeners.filter((l) => l !== listener)
  }
}

/** Test/diagnostic helper. */
export function activeSubscriberCount(): number {
  let n = 0
  for (const s of subs) if (s.active) n++
  return n
}
