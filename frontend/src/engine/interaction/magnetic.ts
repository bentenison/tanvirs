import { Spring } from '../physics/spring'
import { subscribe, type TickerHandle } from '../animation/ticker'

export interface MagneticOptions {
  /** Max translation toward the pointer, px. */
  strength?: number
  /** Scale stretch along the pull direction (0.04 = 4%). */
  stretch?: number
  /** Scale on press. */
  pressScale?: number
  /** Apply pull to a child (e.g. the label) at this fraction for parallax. */
  inner?: HTMLElement | null
  innerFactor?: number
}

/**
 * Magnetic + press-compression behaviour for a single element.
 * Only engages for fine pointers; touch gets press compression only.
 * Writes transforms directly, no reactive state per frame.
 */
export function magnetic(el: HTMLElement, opts: MagneticOptions = {}): () => void {
  const strength = opts.strength ?? 6
  const stretch = opts.stretch ?? 0.04
  const pressScale = opts.pressScale ?? 0.96
  const x = new Spring(0, 'playful')
  const y = new Spring(0, 'playful')
  const s = new Spring(1, 'ui')
  let handle: TickerHandle | null = null
  const fine = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches

  const render = () => {
    const dist = Math.hypot(x.value, y.value)
    const angle = Math.atan2(y.value, x.value)
    const k = 1 + (dist / Math.max(strength, 1)) * stretch
    // Stretch along the pull direction, compensate across it so area stays constant.
    el.style.transform =
      `translate3d(${x.value.toFixed(2)}px, ${y.value.toFixed(2)}px, 0) ` +
      `rotate(${angle}rad) scale(${(k * s.value).toFixed(4)}, ${((s.value / k)).toFixed(4)}) rotate(${-angle}rad)`
    if (opts.inner) {
      const f = opts.innerFactor ?? 0.4
      opts.inner.style.transform = `translate3d(${(x.value * f).toFixed(2)}px, ${(y.value * f).toFixed(2)}px, 0)`
    }
  }

  const tick = (dt: number) => {
    const moving = [x.step(dt), y.step(dt), s.step(dt)].some(Boolean)
    render()
    if (!moving) {
      handle?.setActive(false)
      if (x.value === 0 && y.value === 0 && s.value === 1) {
        el.style.transform = ''
        if (opts.inner) opts.inner.style.transform = ''
      }
    }
  }

  const wake = () => {
    if (document.documentElement.dataset.motion === 'minimal') return
    if (!handle) handle = subscribe(tick)
    else handle.setActive(true)
  }

  const onMove = (e: PointerEvent) => {
    if (!fine || e.pointerType !== 'mouse') return
    if (document.documentElement.dataset.motion !== 'full') return
    const r = el.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const nx = dx / (r.width / 2)
    const ny = dy / (r.height / 2)
    x.target = Math.max(-1, Math.min(1, nx)) * strength
    y.target = Math.max(-1, Math.min(1, ny)) * strength * 0.7
    wake()
  }
  const onLeave = () => {
    x.target = 0
    y.target = 0
    s.target = 1
    wake()
  }
  const onDown = () => {
    s.target = pressScale
    wake()
  }
  const onUp = () => {
    s.target = 1
    wake()
  }

  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerleave', onLeave)
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  el.addEventListener('blur', onLeave)

  return () => {
    handle?.dispose()
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerleave', onLeave)
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    el.removeEventListener('blur', onLeave)
    el.style.transform = ''
  }
}
