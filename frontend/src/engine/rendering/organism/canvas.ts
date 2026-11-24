import { FIELD_REACH, FIELD_THRESHOLD, type OrganismModel } from './model'
import type { OrganismPalette } from './palette'
import type { OrganismRenderer } from './renderer'

/**
 * Canvas2D fallback. Evaluates the same field on a coarse grid, each
 * blob only touches the cells inside its influence box, then upscales
 * with smoothing, which naturally softens the edge. No lighting; rim,
 * tension tint and nucleus are kept so the identity survives.
 */
export class CanvasOrganismRenderer implements OrganismRenderer {
  readonly kind = 'canvas' as const
  private ctx: CanvasRenderingContext2D
  private buf: HTMLCanvasElement
  private bctx: CanvasRenderingContext2D
  private field = new Float32Array(0)
  private tension = new Float32Array(0)
  private presence = new Float32Array(0)
  private image: ImageData | null = null
  private gw = 0
  private gh = 0
  private cell = 1
  private dpr = 1
  private palette: OrganismPalette | null = null

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    this.ctx = ctx
    this.buf = document.createElement('canvas')
    const b = this.buf.getContext('2d', { willReadFrequently: false })
    if (!b) throw new Error('2d context unavailable')
    this.bctx = b
  }

  resize(w: number, h: number, dpr: number, resolution: number): void {
    this.dpr = dpr
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.cell = 1 / Math.max(0.15, resolution)
    this.gw = Math.max(1, Math.ceil(w / this.cell))
    this.gh = Math.max(1, Math.ceil(h / this.cell))
    const n = this.gw * this.gh
    this.field = new Float32Array(n)
    this.tension = new Float32Array(n)
    this.presence = new Float32Array(n)
    this.buf.width = this.gw
    this.buf.height = this.gh
    this.image = this.bctx.createImageData(this.gw, this.gh)
  }

  setPalette(p: OrganismPalette): void {
    this.palette = p
  }

  setRefraction(): void {
    /* not supported in the fallback */
  }

  render(model: OrganismModel): void {
    const p = this.palette
    const img = this.image
    if (!p || !img) return
    const { gw, gh, cell, field, tension, presence } = this
    field.fill(0)
    tension.fill(0)
    presence.fill(0)

    for (const b of model.blobs) {
      const R = b.r * FIELD_REACH
      if (R <= 0) continue
      const R2 = R * R
      const sx = Math.sqrt(b.stretch)
      const x0 = Math.max(0, Math.floor((b.x - R * b.stretch) / cell))
      const x1 = Math.min(gw - 1, Math.ceil((b.x + R * b.stretch) / cell))
      const y0 = Math.max(0, Math.floor((b.y - R * b.stretch) / cell))
      const y1 = Math.min(gh - 1, Math.ceil((b.y + R * b.stretch) / cell))
      for (let gy = y0; gy <= y1; gy++) {
        const py = (gy + 0.5) * cell - b.y
        for (let gx = x0; gx <= x1; gx++) {
          const px = (gx + 0.5) * cell - b.x
          const along = px * b.dx + py * b.dy
          const ax = px - along * b.dx
          const ay = py - along * b.dy
          const qx = b.dx * (along / b.stretch) + ax * sx
          const qy = b.dy * (along / b.stretch) + ay * sx
          const d2 = qx * qx + qy * qy
          if (d2 >= R2) continue
          const x = 1 - d2 / R2
          const w = x * x * x
          const idx = gy * gw + gx
          field[idx] += w
          tension[idx] += w * b.tension
          presence[idx] += w * b.presence
        }
      }
    }

    const core = model.corePosition()
    const data = img.data
    const T = FIELD_THRESHOLD
    for (let i = 0, n = gw * gh; i < n; i++) {
      const f = field[i]
      const o = i * 4
      if (f < T * 0.82) {
        data[o + 3] = 0
        continue
      }
      const alpha = Math.min(1, (f - T * 0.82) / (T * 0.36))
      const tw = tension[i] / f
      const pw = presence[i] / f
      const edge = 1 - Math.min(1, (f - T) / 0.12)
      const gx = (i % gw) + 0.5
      const gy = Math.floor(i / gw) + 0.5
      const cd = Math.hypot(gx * cell - core.x, gy * cell - core.y)
      const nucleus = Math.max(0, 1 - cd / (core.r * 0.55))
      let r = p.body[0], g = p.body[1], b = p.body[2]
      const mix = (c: [number, number, number], k: number) => {
        r += (c[0] - r) * k
        g += (c[1] - g) * k
        b += (c[2] - b) * k
      }
      mix(p.accent, Math.min(1, nucleus * 1.6) * 0.9)
      mix(p.tension, Math.min(1, tw * 1.25) * (0.35 + Math.max(0, edge) * 0.65))
      mix(p.rim, Math.max(0, edge) * 0.35)
      const k = 0.25 + 0.75 * pw
      r = p.bg[0] + (r - p.bg[0]) * k
      g = p.bg[1] + (g - p.bg[1]) * k
      b = p.bg[2] + (b - p.bg[2]) * k
      data[o] = r * 255
      data[o + 1] = g * 255
      data[o + 2] = b * 255
      data[o + 3] = alpha * 255
    }
    this.bctx.putImageData(img, 0, 0)

    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(this.buf, 0, 0, gw * cell * this.dpr, gh * cell * this.dpr)

    // Organelles drawn crisp on top.
    if (model.organelles.length) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      ctx.fillStyle = `rgb(${p.accent.map((c) => Math.round(c * 255)).join(',')})`
      for (const o of model.organelles) {
        ctx.beginPath()
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  dispose(): void {
    this.field = new Float32Array(0)
    this.image = null
    this.buf.width = 0
    this.buf.height = 0
  }
}
