/**
 * Staggered reveal for [data-reveal] descendants of a root.
 *
 * Content is visible without JavaScript; this only opts elements that are
 * still below the fold into a short WAAPI entrance. Elements already in
 * view on load are left alone, so nothing above the fold ever flickers.
 */
export interface RevealOptions {
  stagger?: number
  distance?: number
  duration?: number
}

export function reveal(root: HTMLElement, opts: RevealOptions = {}): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {}
  const motion = document.documentElement.dataset.motion
  if (motion === 'minimal') return () => {}

  const stagger = opts.stagger ?? 70
  const distance = motion === 'reduced' ? 0 : (opts.distance ?? 18)
  const duration = motion === 'reduced' ? 220 : (opts.duration ?? 720)
  const vh = window.innerHeight

  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]')).filter(
    (el) => el.getBoundingClientRect().top > vh * 0.92,
  )
  for (const el of els) el.classList.add('is-pending')

  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement)
      visible.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      visible.forEach((el, i) => {
        io.unobserve(el)
        const delay = Number(el.dataset.revealDelay ?? 0) + i * stagger
        const anim = el.animate(
          [
            { opacity: 0, transform: `translate3d(0, ${distance}px, 0)` },
            { opacity: 1, transform: 'translate3d(0, 0, 0)' },
          ],
          { duration, delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
        )
        el.classList.remove('is-pending')
        anim.finished.catch(() => {})
      })
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
  )
  for (const el of els) io.observe(el)

  return () => {
    io.disconnect()
    for (const el of els) el.classList.remove('is-pending')
  }
}

/** Invoke `cb(visible)` as an element enters/leaves the viewport. */
export function whenVisible(el: Element, cb: (visible: boolean) => void, rootMargin = '120px'): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    cb(true)
    return () => {}
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) cb(e.isIntersecting)
  }, { rootMargin })
  io.observe(el)
  return () => io.disconnect()
}
