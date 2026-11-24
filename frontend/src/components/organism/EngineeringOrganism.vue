<template>
  <div
    ref="stage"
    class="organism"
    :class="[`organism--${tier}`, { 'is-live': live, 'has-focus': selected !== null, 'is-inert': !interactive }]"
    :data-tier="tier"
  >
    <!-- Static specimen: server-rendered, shown before JS, in minimal motion and as the no-WebGL fallback. -->
    <svg
      v-if="!live"
      class="organism__static organism__frame"
      viewBox="0 0 1000 800"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter :id="gooId" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -11" />
        </filter>
        <pattern :id="dotsId" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="11" cy="11" r="1.05" class="organism__dot" />
        </pattern>
        <radialGradient :id="fadeId">
          <stop offset="0.45" stop-color="#fff" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
        <mask :id="maskId"><circle cx="500" cy="400" r="420" :fill="`url(#${fadeId})`" /></mask>
      </defs>
      <rect width="1000" height="800" :fill="`url(#${dotsId})`" :mask="`url(#${maskId})`" opacity="0.55" />
      <g :filter="`url(#${gooId})`" class="organism__body">
        <circle v-for="(b, i) in staticBlobs" :key="i" :cx="b.x" :cy="b.y" :r="b.r * 1.15" />
      </g>
      <circle :cx="staticCore.x" :cy="staticCore.y" :r="staticCore.r * 0.5" class="organism__nucleus" />
    </svg>

    <canvas v-show="live" ref="canvas" class="organism__canvas" aria-hidden="true" />

    <!-- Specimen annotations follow the lobes; decorative (the DomainIndex is the accessible control). -->
    <div v-if="annotated" class="organism__labels" :class="{ 'organism__frame': !live }" aria-hidden="true">
      <span
        v-for="(d, i) in domains"
        :key="d.id"
        ref="labels"
        class="organism__label mono"
        :class="{ 'is-on': selected === d.id || hover === i, 'is-dim': dimmed(d.id) }"
        :style="labelStyle(i)"
      >{{ d.short }}</span>
      <span ref="coreLabel" class="organism__label organism__label--core mono" :class="{ 'is-on': selected === 'core' }" :style="coreStyle">Go</span>
    </div>

    <p v-if="annotated && interactive" class="organism__hint caption" aria-hidden="true">
      <AppIcon name="drag" :size="14" /> {{ hintText }}
    </p>
  </div>
</template>

<script lang="ts">
import { defineComponent, markRaw, type PropType } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { domains, technologiesFor } from '@/config/technologies'
import type { DomainId } from '@/config/types'
import { OrganismModel, type OrganismMode } from '@/engine/rendering/organism/model'
import type { OrganismHost } from '@/engine/rendering/organism/host'
import { detectCapabilities, initialTier, type QualityTier } from '@/engine/rendering/quality'
import { whenVisible } from '@/engine/animation/reveal'
import { preferences, onPreferencesChange } from '@/services/preferences'
import { shouldPlayOpening, markOpeningSeen } from '@/services/session'

export type Selection = DomainId | 'core' | null

const VIEW_W = 1000
const VIEW_H = 800
const specs = domains.map((d) => ({ id: d.id, angle: d.angle, weight: d.weight }))

function layoutFor(w: number, _h: number) {
  const narrow = w < 640
  // On desktop the details panel sits bottom-left, so a focused body moves up and right.
  return narrow
    ? { originX: 0.5, originY: 0.5, scale: 0.92 }
    : { originX: 0.5, originY: 0.5, scale: 0.94, focusShiftX: 0.1, focusShiftY: -0.14, focusScale: 0.72 }
}

// Rest pose for the server-rendered specimen.
const restModel = new OrganismModel(specs)
restModel.idle = false
restModel.setLayout({ width: VIEW_W, height: VIEW_H, ...layoutFor(VIEW_W, VIEW_H) }, true)

let uid = 0

export default defineComponent({
  name: 'EngineeringOrganism',
  components: { AppIcon },
  props: {
    mode: { type: Object as PropType<OrganismMode>, default: () => ({ kind: 'whole' }) },
    selected: { type: String as PropType<Selection>, default: null },
    /** Show lobe annotations. */
    annotated: { type: Boolean, default: true },
    /** Accept pointer input (decorative instances pass false). */
    interactive: { type: Boolean, default: true },
    /** Allowed to play the once-per-session opening sequence. */
    opening: { type: Boolean, default: true },
  },
  emits: ['select', 'tier'],
  data() {
    uid++
    return {
      domains,
      tier: 'static' as QualityTier,
      live: false,
      hover: -1,
      host: null as OrganismHost | null,
      cleanups: [] as (() => void)[],
      staticBlobs: restModel.blobs.map((b) => ({ x: b.x, y: b.y, r: b.r })),
      staticCore: { ...restModel.corePosition() },
      gooId: `goo-${uid}`,
      dotsId: `dots-${uid}`,
      fadeId: `fade-${uid}`,
      maskId: `mask-${uid}`,
      coarse: false,
    }
  },
  computed: {
    hintText(): string {
      return this.coarse ? 'Tap a lobe · drag sideways to stretch' : 'Drag a lobe · click to explore'
    },
    coreStyle(): Record<string, string> {
      return this.live ? {} : this.pctStyle(this.staticCore.x, this.staticCore.y + this.staticCore.r * 0.95)
    },
  },
  watch: {
    mode: {
      deep: true,
      handler(m: OrganismMode) {
        this.host?.setMode(m)
      },
    },
    selected(sel: Selection) {
      this.applySelection(sel)
    },
  },
  async mounted() {
    this.coarse = matchMedia('(pointer: coarse)').matches
    const caps = detectCapabilities(preferences.motion)
    const tier = initialTier(caps)
    this.tier = tier
    this.$emit('tier', tier)
    if (tier === 'static') return

    const { OrganismHost } = await import('@/engine/rendering/organism/host')
    // Component may have unmounted while the chunk loaded.
    if (!this.$refs.stage) return
    const opening = this.opening && shouldPlayOpening()
    if (opening) markOpeningSeen()

    const host = new OrganismHost({
      container: this.$refs.stage as HTMLElement,
      canvas: this.$refs.canvas as HTMLCanvasElement,
      specs,
      tier,
      motion: preferences.motion,
      layout: layoutFor,
      opening,
      onSelect: (i) => this.onSelect(i),
      onHover: (i) => (this.hover = i),
      onTierChange: (t) => {
        this.tier = t
        this.$emit('tier', t)
        if (t === 'static') this.teardown()
      },
      onFrame: (m) => this.positionLabels(m),
    })
    if (this.tier === 'static') {
      host.dispose()
      return
    }
    this.host = markRaw(host)
    host.setMode(this.mode)
    this.applySelection(this.selected)
    this.live = true

    this.cleanups.push(
      whenVisible(this.$refs.stage as Element, (v) => this.host?.setVisible(v), '80px'),
      onPreferencesChange(() => {
        this.host?.setMotion(preferences.motion)
        // Wait for the data-theme attribute to apply before reading tokens.
        requestAnimationFrame(() => this.host?.refreshPalette())
      }),
    )
  },
  beforeUnmount() {
    this.teardown()
  },
  methods: {
    teardown() {
      this.cleanups.forEach((c) => c())
      this.cleanups = []
      this.host?.dispose()
      this.host = null
      this.live = false
    },
    onSelect(i: number) {
      let sel: Selection = null
      if (i >= 0) sel = domains[i].id
      else if (i === -2) sel = 'core'
      this.$emit('select', sel === this.selected && sel !== null ? null : sel)
    },
    applySelection(sel: Selection) {
      if (!this.host) return
      if (sel === 'core') this.host.focus(-2, [])
      else if (sel) {
        const idx = domains.findIndex((d) => d.id === sel)
        const techs = technologiesFor(sel).slice(0, 8).map((t) => t.id)
        this.host.focus(idx, techs)
      } else this.host.focus(-1, [])
    },
    dimmed(id: DomainId): boolean {
      const m = this.mode
      return m.kind === 'product' && !m.domains.includes(id)
    },
    pctStyle(x: number, y: number): Record<string, string> {
      return { left: `${(x / VIEW_W) * 100}%`, top: `${(y / VIEW_H) * 100}%` }
    },
    labelStyle(i: number): Record<string, string> {
      if (this.live) return {}
      const b = this.staticBlobs[1 + i]
      const o = this.staticCore
      const dx = b.x - o.x
      const dy = b.y - o.y
      const d = Math.hypot(dx, dy) || 1
      const off = b.r * 1.7
      return this.pctStyle(b.x + (dx / d) * off, b.y + (dy / d) * off)
    },
    positionLabels(m: OrganismModel) {
      const labels = this.$refs.labels as HTMLElement[] | undefined
      if (!labels) return
      const core = m.corePosition()
      for (let i = 0; i < labels.length; i++) {
        const p = m.lobePosition(i)
        const dx = p.x - core.x
        const dy = p.y - core.y
        const d = Math.hypot(dx, dy) || 1
        const ax = dx / d
        const ay = dy / d
        // Sit just outside the lobe edge, anchored on the side facing away from the core.
        const off = p.r * 1.2 + 8
        let x = p.x + ax * off
        const y = p.y + ay * off
        const tx = -50 + 50 * Math.max(-1, Math.min(1, ax * 1.6))
        const ty = -50 + 50 * Math.max(-1, Math.min(1, ay * 1.6))
        const el = labels[i]
        // Keep the whole label inside the canvas.
        const w = el.offsetWidth
        const left = x + (tx / 100) * w
        const shift = Math.min(0, m.layout.width - 8 - (left + w)) + Math.max(0, 8 - left)
        x += shift
        el.style.left = '0'
        el.style.top = '0'
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(${tx.toFixed(0)}%, ${ty.toFixed(0)}%)`
      }
      const cl = this.$refs.coreLabel as HTMLElement | undefined
      if (cl) {
        cl.style.left = '0'
        cl.style.top = '0'
        cl.style.transform = `translate3d(${core.x.toFixed(1)}px, ${(core.y + core.r * 0.92).toFixed(1)}px, 0) translate(-50%, -50%)`
      }
    },
  },
})
</script>

<style scoped>
.organism {
  position: relative;
  width: 100%;
  height: 100%;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  contain: layout paint;
}
.organism {
  container-type: size;
}
.organism.is-inert {
  pointer-events: none;
}
.organism__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
/* Static specimen and its labels share one 5:4 box so annotations line up at any aspect. */
.organism__frame {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(100cqw, 125cqh);
  height: auto;
  aspect-ratio: 5 / 4;
  transform: translate(-50%, -50%);
}
.organism__labels.organism__frame {
  inset: auto;
}
.organism__body {
  fill: var(--organism-body);
}
.organism__nucleus {
  fill: var(--accent);
}
.organism__dot {
  fill: var(--organism-dot);
}
.organism__labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.organism__labels.organism__frame {
  inset: auto;
}
.organism__label {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  white-space: nowrap;
  transition:
    color var(--dur-ui) var(--ease-ui),
    opacity var(--dur-premium) var(--ease-premium);
  will-change: auto;
}
.organism__label.is-on {
  color: var(--text);
  font-weight: 600;
}
.organism__label.is-dim {
  opacity: 0.35;
}
.organism__label--core {
  color: var(--on-accent);
  font-weight: 600;
  font-size: 0.72rem;
}
:root[data-theme='dark'] .organism__label--core {
  color: var(--on-accent);
}
.organism__hint {
  /* Top edge: it scrolls away first when the stage releases. */
  position: absolute;
  right: 1rem;
  top: calc(var(--nav-h) + 0.5rem);
  margin: 0;
  display: inline-flex;
  gap: 0.4rem;
  align-items: center;
  opacity: 0;
  transition: opacity var(--dur-premium) var(--ease-premium);
}
.organism.is-live .organism__hint {
  opacity: 0.85;
}
.organism.has-focus .organism__hint {
  opacity: 0;
}
</style>
