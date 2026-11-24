import { Spring, Spring2D } from '../../physics/spring'
import { rubberBand } from '../../interaction/drag'

/**
 * The Engineering Organism, framework-independent simulation.
 *
 * One continuous soft body: a Go core fused to domain lobes through
 * membrane "necks". Each lobe is a spring-anchored point mass; each neck
 * is two bridge blobs on the segment core→lobe whose radii thin as the
 * lobe is pulled away. The renderer turns the blob list into an implicit
 * surface, so lobes fuse with the core rather than hang from lines.
 */

export interface LobeSpec {
  id: string
  angle: number // degrees
  weight: number
}

export type OrganismMode =
  | { kind: 'collapsed' }
  | { kind: 'whole' }
  | { kind: 'domains' }
  | { kind: 'product'; domains: string[] }

/** Packed per-blob data the renderers consume. */
export interface Blob {
  x: number
  y: number
  r: number
  /** Unit direction of deformation. */
  dx: number
  dy: number
  /** ≥1: stretch along (dx,dy). */
  stretch: number
  /** 0..1, drives the coral tension tint. */
  tension: number
  /** 0..1, dims receding lobes. */
  presence: number
}

export interface Organelle {
  x: number
  y: number
  r: number
  id: string
}

interface Lobe {
  spec: LobeSpec
  pos: Spring2D
  focus: Spring
  presence: Spring
  dragging: boolean
  /** Spread/recede multiplier for the current mode. */
  reach: Spring
  phase: number
}

const TAU = Math.PI * 2
const BRIDGE_T = [0.42, 0.7]

export interface OrganismLayout {
  width: number
  height: number
  /** Core centre as a fraction of width/height. */
  originX: number
  originY: number
  /** Overall size multiplier. */
  scale: number
}

export class OrganismModel {
  layout: OrganismLayout = { width: 1, height: 1, originX: 0.5, originY: 0.5, scale: 1 }
  readonly lobes: Lobe[]
  readonly blobs: Blob[]
  organelles: Organelle[] = []
  private organelleIds: string[] = []
  private focusedIndex = -1
  private dragIndex = -1
  private dragTarget = { x: 0, y: 0 }
  private pointer = { x: 0, y: 0, active: false }
  private lean: Spring2D = new Spring2D(0, 0, 'organic')
  private core: Spring = new Spring(1, 'organic')
  private coreFocus: Spring = new Spring(0, 'premium')
  private mode: OrganismMode = { kind: 'whole' }
  private time = 0
  /** Idle breathing and drift on/off (reduced motion turns it off). */
  idle = true

  constructor(specs: LobeSpec[]) {
    this.lobes = specs.map((spec, i) => ({
      spec,
      pos: new Spring2D(0, 0, 'organic'),
      focus: new Spring(0, 'premium'),
      presence: new Spring(1, 'premium'),
      reach: new Spring(1, 'organic'),
      dragging: false,
      phase: (i * 2.399) % TAU,
    }))
    // core + lobes + 2 bridges per lobe
    this.blobs = Array.from({ length: 1 + specs.length * 3 }, () => ({
      x: 0,
      y: 0,
      r: 0,
      dx: 0,
      dy: 0,
      stretch: 1,
      tension: 0,
      presence: 1,
    }))
  }

  get unit(): number {
    return Math.min(this.layout.width, this.layout.height) * this.layout.scale
  }

  get origin(): { x: number; y: number } {
    return { x: this.layout.width * this.layout.originX, y: this.layout.height * this.layout.originY }
  }

  get coreRadius(): number {
    return this.unit * 0.12
  }

  setLayout(l: Partial<OrganismLayout>, snap = false): void {
    this.layout = { ...this.layout, ...l }
    if (snap) this.settleImmediately()
  }

  /** Rest position of a lobe for the current mode, without drag/lean. */
  anchor(i: number): { x: number; y: number } {
    const lobe = this.lobes[i]
    const o = this.origin
    const a = (lobe.spec.angle * Math.PI) / 180
    const breathe = this.idle ? Math.sin(this.time * 0.9 + lobe.phase) * 0.012 : 0
    const dist = this.unit * (0.335 + breathe) * lobe.reach.value * (1 + lobe.focus.value * 0.12)
    // Slightly elliptical on wide layouts so lobes use the horizontal space.
    const aspect = Math.min(1.35, Math.max(0.85, this.layout.width / this.layout.height))
    return { x: o.x + Math.cos(a) * dist * Math.sqrt(aspect), y: o.y + Math.sin(a) * dist / Math.sqrt(aspect) }
  }

  lobeRadius(i: number): number {
    const lobe = this.lobes[i]
    const anyFocus = this.focusedIndex >= 0 && this.focusedIndex !== i
    const base = this.unit * 0.066 * lobe.spec.weight
    return base * (1 + lobe.focus.value * 0.75) * (anyFocus ? 0.9 : 1) * (0.55 + 0.45 * lobe.presence.value)
  }

  setMode(mode: OrganismMode): void {
    this.mode = mode
    this.lobes.forEach((lobe) => {
      let reach = 1
      let presence = 1
      switch (mode.kind) {
        case 'collapsed':
          reach = 0.05
          presence = 0.6
          break
        case 'domains':
          reach = 1.18
          break
        case 'product': {
          const on = mode.domains.includes(lobe.spec.id)
          reach = on ? 0.92 : 1.32
          presence = on ? 1 : 0.35
          break
        }
      }
      lobe.reach.target = reach
      lobe.presence.target = presence
    })
  }

  getMode(): OrganismMode {
    return this.mode
  }

  /** Index of the lobe under (x,y), -2 for the core, -1 for none. */
  hitTest(x: number, y: number): number {
    let best = -1
    let bestD = Infinity
    this.lobes.forEach((lobe, i) => {
      const d = Math.hypot(lobe.pos.x.value - x, lobe.pos.y.value - y)
      const r = this.lobeRadius(i) * 1.6 + 10
      if (d < r && d < bestD) {
        best = i
        bestD = d
      }
    })
    if (best >= 0) return best
    const o = this.origin
    if (Math.hypot(o.x - x, o.y - y) < this.coreRadius * 1.1) return -2
    return -1
  }

  focus(index: number, organelleIds: string[] = []): void {
    this.focusedIndex = index
    this.organelleIds = organelleIds
    this.lobes.forEach((l, i) => (l.focus.target = i === index ? 1 : 0))
    this.coreFocus.target = index === -2 ? 1 : 0
  }

  get focused(): number {
    return this.focusedIndex
  }

  pointerMove(x: number, y: number): void {
    this.pointer = { x, y, active: true }
  }

  pointerLeave(): void {
    this.pointer.active = false
  }

  beginDrag(i: number, x: number, y: number): void {
    this.dragIndex = i
    this.lobes[i].dragging = true
    this.dragTarget = { x, y }
  }

  drag(x: number, y: number): void {
    this.dragTarget = { x, y }
  }

  endDrag(vx: number, vy: number): void {
    if (this.dragIndex < 0) return
    const lobe = this.lobes[this.dragIndex]
    lobe.dragging = false
    // Fling: carry the release velocity into the spring for natural overshoot.
    const cap = this.unit * 6
    lobe.pos.x.velocity = Math.max(-cap, Math.min(cap, vx))
    lobe.pos.y.velocity = Math.max(-cap, Math.min(cap, vy))
    this.dragIndex = -1
  }

  get isDragging(): boolean {
    return this.dragIndex >= 0
  }

  /** Nudge a lobe as if flicked (keyboard / demo). */
  pulse(i: number, strength = 1): void {
    const a = (this.lobes[i].spec.angle * Math.PI) / 180
    const v = this.unit * 2.2 * strength
    this.lobes[i].pos.x.velocity += Math.cos(a) * v
    this.lobes[i].pos.y.velocity += Math.sin(a) * v
  }

  settleImmediately(): void {
    this.lobes.forEach((l) => {
      l.reach.snap(l.reach.target)
      l.presence.snap(l.presence.target)
      l.focus.snap(l.focus.target)
    })
    this.lobes.forEach((l, i) => {
      const a = this.anchor(i)
      l.pos.snap(a.x, a.y)
    })
    this.lean.snap(0, 0)
    this.pack(0)
  }

  /** True when nothing is moving and idle motion is off (renderer may sleep). */
  get atRest(): boolean {
    if (this.idle || this.isDragging) return false
    return (
      this.lean.settled &&
      this.core.settled &&
      this.coreFocus.settled &&
      this.lobes.every((l) => l.pos.settled && l.focus.settled && l.reach.settled && l.presence.settled)
    )
  }

  step(dt: number): void {
    this.time += dt
    const U = this.unit
    const o = this.origin

    // Whole-body lean toward the pointer, subtle.
    if (this.pointer.active && !this.isDragging) {
      const dx = this.pointer.x - o.x
      const dy = this.pointer.y - o.y
      const d = Math.hypot(dx, dy) || 1
      const pull = Math.min(1, d / (U * 0.8)) * U * 0.025
      this.lean.setTarget((dx / d) * pull, (dy / d) * pull)
    } else {
      this.lean.setTarget(0, 0)
    }
    this.lean.step(dt)
    this.core.target = 1
    this.core.step(dt)
    this.coreFocus.step(dt)

    this.lobes.forEach((lobe, i) => {
      lobe.reach.step(dt)
      lobe.presence.step(dt)
      lobe.focus.step(dt)
      const a = this.anchor(i)
      let tx = a.x + this.lean.x.value * 1.6
      let ty = a.y + this.lean.y.value * 1.6
      // Pointer attraction: lobes near the cursor lean toward it.
      if (this.pointer.active && !lobe.dragging) {
        const dx = this.pointer.x - a.x
        const dy = this.pointer.y - a.y
        const d = Math.hypot(dx, dy)
        const reach = U * 0.22
        if (d < reach && d > 0.001) {
          const k = (1 - d / reach) ** 2 * U * 0.04
          tx += (dx / d) * k
          ty += (dy / d) * k
        }
      }
      if (lobe.dragging) {
        // Rubber-band: free near the anchor, increasingly resisted beyond.
        const dx = this.dragTarget.x - a.x
        const dy = this.dragTarget.y - a.y
        const d = Math.hypot(dx, dy) || 1
        const banded = rubberBand(d, U * 0.16, 0.6)
        const nx = a.x + (dx / d) * banded
        const ny = a.y + (dy / d) * banded
        // Drag directly drives the spring target; stiffer while held.
        lobe.pos.set({ stiffness: 900, damping: 48, mass: 1 })
        lobe.pos.setTarget(nx, ny)
      } else {
        lobe.pos.set('organic')
        lobe.pos.setTarget(tx, ty)
      }
      lobe.pos.step(dt)
    })

    this.pack(dt)
  }

  /** Write the blob array from current state. */
  private pack(_dt: number): void {
    const U = this.unit
    const o = this.origin
    const heartbeat = this.idle ? 1 + Math.sin((this.time * TAU) / 4.2) * 0.015 : 1
    const core = this.blobs[0]
    core.x = o.x + this.lean.x.value
    core.y = o.y + this.lean.y.value
    core.r = this.coreRadius * heartbeat * this.core.value * (1 + this.coreFocus.value * 0.12)
    core.dx = 0
    core.dy = 0
    core.stretch = 1
    core.tension = 0
    core.presence = 1

    const n = this.lobes.length
    this.lobes.forEach((lobe, i) => {
      const px = lobe.pos.x.value
      const py = lobe.pos.y.value
      const a = this.anchor(i)
      const r = this.lobeRadius(i)

      const ex = px - core.x
      const ey = py - core.y
      const len = Math.hypot(ex, ey) || 1
      const rest = Math.hypot(a.x - o.x, a.y - o.y) || 1
      const strain = Math.max(0, len / rest - 1)
      const tension = Math.min(1, strain * 1.6)

      // Velocity-sensitive deformation (squash & stretch), clamped.
      const vx = lobe.pos.x.velocity
      const vy = lobe.pos.y.velocity
      const speed = Math.hypot(vx, vy)
      const stretch = 1 + Math.min(0.4, speed / (U * 9))

      const b = this.blobs[1 + i]
      b.x = px
      b.y = py
      b.r = r
      b.dx = speed > 1e-3 ? vx / speed : 0
      b.dy = speed > 1e-3 ? vy / speed : 0
      b.stretch = stretch
      b.tension = tension
      b.presence = lobe.presence.value

      // Neck: bridges thin with strain but never vanish until extreme pulls.
      BRIDGE_T.forEach((t, k) => {
        const bb = this.blobs[1 + n + i * 2 + k]
        bb.x = core.x + ex * t
        bb.y = core.y + ey * t
        const base = k === 0 ? core.r * 0.36 + r * 0.16 : r * 0.42
        const thin = 1 / (1 + strain * 2.2)
        bb.r = base * thin * (0.6 + 0.4 * lobe.presence.value) * Math.min(1, len / (core.r * 1.2))
        bb.dx = ex / len
        bb.dy = ey / len
        bb.stretch = 1 + Math.min(0.9, strain * 0.8)
        bb.tension = tension
        bb.presence = lobe.presence.value
      })
    })

    // Organelles: technologies inside the focused lobe.
    const fi = this.focusedIndex
    if (fi >= 0 && this.organelleIds.length) {
      const lobe = this.blobs[1 + fi]
      const f = this.lobes[fi].focus.value
      const count = this.organelleIds.length
      const ring = lobe.r * 0.55
      this.organelles = this.organelleIds.map((id, k) => {
        const ang = (k / count) * TAU + this.time * (this.idle ? 0.25 : 0) + this.lobes[fi].phase
        const rr = count === 1 ? 0 : ring * f
        return {
          id,
          x: lobe.x + Math.cos(ang) * rr,
          y: lobe.y + Math.sin(ang) * rr,
          r: Math.max(0, lobe.r * 0.13 * f),
        }
      })
    } else {
      this.organelles = []
    }
  }

  /** Current on-screen centre of a lobe (for DOM labels). */
  lobePosition(i: number): { x: number; y: number; r: number } {
    const b = this.blobs[1 + i]
    return { x: b.x, y: b.y, r: b.r }
  }

  corePosition(): { x: number; y: number; r: number } {
    const b = this.blobs[0]
    return { x: b.x, y: b.y, r: b.r }
  }
}

/** Kernel shared by all renderers: compact Wyvill falloff. */
export const FIELD_THRESHOLD = 0.3
/** Influence radius as a multiple of blob radius. */
export const FIELD_REACH = 2.0
