import { subscribe, onFrame, type TickerHandle } from '../../animation/ticker'
import { attachDrag } from '../../interaction/drag'
import { FrameMonitor, lowerTier, tierSettings, type QualityTier } from '../quality'
import { OrganismModel, type LobeSpec, type OrganismLayout, type OrganismMode } from './model'
import { readPalette } from './palette'
import type { OrganismRenderer } from './renderer'
import { WebGLOrganismRenderer } from './webgl'
import { CanvasOrganismRenderer } from './canvas'

export interface OrganismHostOptions {
  container: HTMLElement
  canvas: HTMLCanvasElement
  specs: LobeSpec[]
  tier: QualityTier
  motion: 'full' | 'reduced' | 'minimal'
  layout: (w: number, h: number) => Partial<OrganismLayout>
  /** Lobe index, -2 core, -1 background. */
  onSelect: (index: number) => void
  onHover?: (index: number) => void
  onTierChange?: (tier: QualityTier) => void
  /** Called after every simulated frame (for positioning DOM labels). */
  onFrame?: (model: OrganismModel) => void
  opening?: boolean
}

/**
 * Lifecycle owner for the organism: renderer selection and fallback,
 * resize handling, pointer interaction, adaptive quality and cleanup.
 * Framework-independent; the Vue component is a thin shell around it.
 */
export class OrganismHost {
  readonly model: OrganismModel
  private renderer: OrganismRenderer | null = null
  private tier: QualityTier
  private ticker: TickerHandle
  private disposers: (() => void)[] = []
  private visible = true
  private time = 0
  private monitor: FrameMonitor
  private width = 1
  private height = 1
  private motion: OrganismHostOptions['motion']
  private pressAt: { x: number; y: number; i: number } | null = null
  private openingTimers: number[] = []

  constructor(private opts: OrganismHostOptions) {
    this.model = new OrganismModel(opts.specs)
    this.tier = opts.tier
    this.motion = opts.motion
    this.model.idle = opts.motion === 'full'
    this.monitor = new FrameMonitor(() => this.degrade())

    this.createRenderer()
    this.measure(true)

    if (opts.opening && opts.motion === 'full') this.playOpening()

    this.ticker = subscribe((dt) => this.tick(dt))

    const ro = new ResizeObserver(() => this.measure(false))
    ro.observe(opts.container)
    this.disposers.push(() => ro.disconnect())

    this.disposers.push(onFrame((ms) => this.visible && this.renderer?.kind === 'webgl' && this.monitor.sample(ms)))

    this.bindPointer()
  }

  get currentTier(): QualityTier {
    return this.tier
  }

  private createRenderer(): void {
    const settings = tierSettings[this.tier]
    this.renderer?.dispose()
    this.renderer = null
    if (settings.renderer === 'svg') return
    // A canvas can only ever hold one context type; swap in a fresh element when falling back.
    if (settings.renderer === 'webgl') {
      try {
        this.renderer = new WebGLOrganismRenderer(this.opts.canvas, () => this.contextLost())
      } catch {
        this.tier = 'light'
        this.opts.onTierChange?.(this.tier)
        this.replaceCanvas()
      }
    }
    if (!this.renderer && tierSettings[this.tier].renderer === 'canvas') {
      try {
        this.renderer = new CanvasOrganismRenderer(this.opts.canvas)
      } catch {
        this.tier = 'static'
        this.opts.onTierChange?.(this.tier)
        return
      }
    }
    this.renderer?.setPalette(readPalette())
    this.renderer?.setRefraction(tierSettings[this.tier].refraction)
  }

  private replaceCanvas(): void {
    const old = this.opts.canvas
    const fresh = old.cloneNode(false) as HTMLCanvasElement
    old.replaceWith(fresh)
    this.opts.canvas = fresh
    this.rebindPointer()
  }

  private contextLost(): void {
    this.degradeTo('light')
  }

  private degrade(): void {
    this.degradeTo(lowerTier(this.tier))
  }

  private degradeTo(tier: QualityTier): void {
    if (tier === this.tier) return
    const wasWebGL = this.renderer?.kind === 'webgl'
    this.renderer?.dispose()
    this.renderer = null
    this.tier = tier
    if (wasWebGL && tierSettings[tier].renderer !== 'webgl') this.replaceCanvas()
    this.createRenderer()
    this.measure(false)
    this.monitor.reset()
    this.opts.onTierChange?.(this.tier)
  }

  private measure(snap: boolean): void {
    const r = this.opts.container.getBoundingClientRect()
    this.width = Math.max(1, r.width)
    this.height = Math.max(1, r.height)
    this.model.setLayout({ width: this.width, height: this.height, ...this.opts.layout(this.width, this.height) }, snap)
    const s = tierSettings[this.tier]
    const dpr = Math.min(window.devicePixelRatio || 1, s.maxDpr)
    this.renderer?.resize(this.width, this.height, dpr, s.resolution)
    this.draw()
  }

  private playOpening(): void {
    const target = this.model.getMode()
    this.model.setMode({ kind: 'collapsed' })
    this.model.settleImmediately()
    // Release lobes one by one from the core, an ink drop finding its shape.
    this.model.lobes.forEach((lobe, i) => {
      const t = window.setTimeout(() => {
        lobe.reach.target = target.kind === 'domains' ? 1.18 : 1
        lobe.presence.target = 1
      }, 140 + i * 70)
      this.openingTimers.push(t)
    })
  }

  private tick(dt: number): void {
    if (!this.visible) return
    this.time += dt
    this.model.step(dt)
    this.draw()
    this.opts.onFrame?.(this.model)
    if (this.model.atRest) this.ticker.setActive(false)
  }

  private draw(): void {
    this.renderer?.render(this.model, this.time)
  }

  private wake(): void {
    if (this.visible) this.ticker.setActive(true)
  }

  private pointerDisposers: (() => void)[] = []

  private rebindPointer(): void {
    this.pointerDisposers.forEach((d) => d())
    this.pointerDisposers = []
    this.bindPointer()
  }

  private bindPointer(): void {
    const el = this.opts.container
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const p = local(e)
      this.model.pointerMove(p.x, p.y)
      const hit = this.model.hitTest(p.x, p.y)
      el.style.cursor = this.model.isDragging ? 'grabbing' : hit >= 0 ? 'grab' : hit === -2 ? 'pointer' : ''
      this.opts.onHover?.(hit)
      this.wake()
    }
    const leave = () => {
      this.model.pointerLeave()
      this.opts.onHover?.(-1)
      this.wake()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)

    const detach = attachDrag(
      el,
      {
        start: (x, y) => {
          const i = this.model.hitTest(x, y)
          this.pressAt = { x, y, i }
          if (i < 0) return true // still track for tap detection
          this.model.beginDrag(i, x, y)
          this.wake()
          return true
        },
        move: (x, y) => {
          if (this.model.isDragging) {
            this.model.drag(x, y)
            this.wake()
          }
        },
        end: (vx, vy, e) => {
          const press = this.pressAt
          this.pressAt = null
          if (this.model.isDragging) this.model.endDrag(vx, vy)
          this.wake()
          if (!press || !e) return
          const r = el.getBoundingClientRect()
          const moved = Math.hypot(e.clientX - r.left - press.x, e.clientY - r.top - press.y)
          if (moved < 6) this.opts.onSelect(press.i)
        },
      },
      { touchSlop: 6 },
    )
    // Touch taps never claim a drag before slop; detect them separately.
    const tapStart = new Map<number, { x: number; y: number; t: number }>()
    const tdown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      const p = local(e)
      tapStart.set(e.pointerId, { ...p, t: e.timeStamp })
    }
    const tup = (e: PointerEvent) => {
      const s = tapStart.get(e.pointerId)
      tapStart.delete(e.pointerId)
      if (!s || this.model.isDragging) return
      const p = local(e)
      if (Math.hypot(p.x - s.x, p.y - s.y) < 8 && e.timeStamp - s.t < 500) {
        const i = this.model.hitTest(p.x, p.y)
        this.opts.onSelect(i)
        if (i >= 0) this.model.pulse(i, 0.6)
        this.wake()
      }
    }
    el.addEventListener('pointerdown', tdown)
    el.addEventListener('pointerup', tup)

    this.pointerDisposers.push(detach, () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
      el.removeEventListener('pointerdown', tdown)
      el.removeEventListener('pointerup', tup)
    })
  }

  setMode(mode: OrganismMode): void {
    this.model.setMode(mode)
    if (this.motion === 'minimal') this.model.settleImmediately()
    this.wake()
  }

  focus(index: number, organelles: string[]): void {
    this.model.focus(index, organelles)
    if (index >= 0 && this.motion === 'full') this.model.pulse(index, 0.35)
    if (this.motion === 'minimal') this.model.settleImmediately()
    this.wake()
  }

  setMotion(level: OrganismHostOptions['motion']): void {
    this.motion = level
    this.model.idle = level === 'full'
    if (level === 'minimal') this.degradeTo('static')
    this.wake()
  }

  /** Re-read colours after a theme change. */
  refreshPalette(): void {
    this.renderer?.setPalette(readPalette())
    this.draw()
  }

  setVisible(v: boolean): void {
    this.visible = v
    this.ticker.setActive(v)
    if (v) this.monitor.reset()
  }

  dispose(): void {
    this.openingTimers.forEach((t) => clearTimeout(t))
    this.ticker.dispose()
    this.pointerDisposers.forEach((d) => d())
    this.disposers.forEach((d) => d())
    this.renderer?.dispose()
    this.renderer = null
  }
}
