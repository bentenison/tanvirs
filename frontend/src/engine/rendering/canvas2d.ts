/** Helpers for the small 2D canvases used by playground visualisations. */
export interface Ink {
  text: string
  muted: string
  faint: string
  border: string
  surface: string
  sunken: string
  accent: string
  accentInk: string
  tension: string
}

export function readInk(): Ink {
  const s = getComputedStyle(document.documentElement)
  const v = (n: string) => s.getPropertyValue(n).trim()
  return {
    text: v('--text'),
    muted: v('--text-muted'),
    faint: v('--text-faint'),
    border: v('--border'),
    surface: v('--surface'),
    sunken: v('--surface-sunken'),
    accent: v('--accent'),
    accentInk: v('--accent-ink'),
    tension: v('--tension'),
  }
}

/**
 * Size a canvas to its CSS box at a capped device pixel ratio and return a
 * context pre-scaled to CSS pixels.
 */
export function fitCanvas(canvas: HTMLCanvasElement, maxDpr = 2): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const r = canvas.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
  const w = Math.max(1, r.width)
  const h = Math.max(1, r.height)
  const bw = Math.round(w * dpr)
  const bh = Math.round(h * dpr)
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw
    canvas.height = bh
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w, h }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
