/**
 * Pointer-drag primitives shared by the organism, mockups and demos.
 */

/**
 * Rubber-band mapping (iOS-style): linear inside `limit`, then
 * asymptotically resisting. Always continuous and monotonic.
 */
export function rubberBand(distance: number, limit: number, constant = 0.55): number {
  const d = Math.abs(distance)
  if (d <= limit) return distance
  const over = d - limit
  const resisted = limit + (1 - 1 / ((over * constant) / limit + 1)) * limit
  return Math.sign(distance) * resisted
}

/**
 * Tracks pointer velocity over a short sliding window so a flick reads
 * as intent rather than as the last noisy sample.
 */
export class VelocityTracker {
  private samples: { x: number; y: number; t: number }[] = []
  constructor(private windowMs = 80) {}

  reset(): void {
    this.samples.length = 0
  }

  push(x: number, y: number, t: number): void {
    this.samples.push({ x, y, t })
    const cutoff = t - this.windowMs
    while (this.samples.length > 2 && this.samples[0].t < cutoff) this.samples.shift()
  }

  /** Velocity in units per second. */
  get(): { x: number; y: number } {
    const s = this.samples
    if (s.length < 2) return { x: 0, y: 0 }
    const a = s[0]
    const b = s[s.length - 1]
    const dt = (b.t - a.t) / 1000
    if (dt <= 0) return { x: 0, y: 0 }
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt }
  }
}

export interface DragCallbacks {
  /** Return false to refuse the drag (e.g. pointer missed every target). */
  start(x: number, y: number, e: PointerEvent): boolean
  move(x: number, y: number, vx: number, vy: number, e: PointerEvent): void
  end(vx: number, vy: number, e: PointerEvent | null): void
}

export interface DragOptions {
  /**
   * On touch, wait for this much movement before claiming the gesture,
   * and only claim it if it is more horizontal than vertical, vertical
   * scrolling always wins.
   */
  touchSlop?: number
  /** Immediately claim touch drags (used when the target is clearly grabbed). */
  touchImmediate?: boolean
}

/**
 * Attach a pointer-drag recogniser to an element. Coordinates are local to
 * the element's bounding box. Returns a disposer.
 */
export function attachDrag(el: HTMLElement, cb: DragCallbacks, opts: DragOptions = {}): () => void {
  const slop = opts.touchSlop ?? 8
  const tracker = new VelocityTracker()
  let id: number | null = null
  let pending: { x: number; y: number; e: PointerEvent } | null = null
  let rect: DOMRect | null = null
  let claimed = false

  const local = (e: PointerEvent) => {
    rect = rect ?? el.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const begin = (x: number, y: number, e: PointerEvent): boolean => {
    if (!cb.start(x, y, e)) return false
    claimed = true
    tracker.reset()
    tracker.push(x, y, e.timeStamp)
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* capture can fail if the pointer is already gone */
    }
    return true
  }

  const down = (e: PointerEvent) => {
    if (id !== null || (e.pointerType === 'mouse' && e.button !== 0)) return
    rect = el.getBoundingClientRect()
    const p = local(e)
    id = e.pointerId
    claimed = false
    if (e.pointerType === 'touch' && !opts.touchImmediate) {
      pending = { x: p.x, y: p.y, e }
      return
    }
    if (!begin(p.x, p.y, e)) id = null
  }

  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return
    const p = local(e)
    if (pending) {
      const dx = p.x - pending.x
      const dy = p.y - pending.y
      if (Math.hypot(dx, dy) < slop) return
      const start = pending
      pending = null
      if (Math.abs(dy) > Math.abs(dx) || !begin(start.x, start.y, start.e)) {
        id = null
        return
      }
    }
    if (!claimed) return
    tracker.push(p.x, p.y, e.timeStamp)
    const v = tracker.get()
    cb.move(p.x, p.y, v.x, v.y, e)
  }

  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return
    id = null
    pending = null
    rect = null
    if (!claimed) return
    claimed = false
    const v = tracker.get()
    cb.end(v.x, v.y, e)
  }

  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  return () => {
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
  }
}
