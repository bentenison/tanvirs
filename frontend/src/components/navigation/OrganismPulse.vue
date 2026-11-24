<template>
  <svg class="pulse" :width="size" :height="size" viewBox="-20 -20 40 40" aria-hidden="true" focusable="false">
    <path ref="body" class="pulse__body" :d="restPath" />
    <circle ref="nucleus" class="pulse__nucleus" r="4.2" />
  </svg>
</template>

<script lang="ts">
import { defineComponent, markRaw } from 'vue'
import { subscribe, type TickerHandle } from '@/engine/animation/ticker'
import { whenVisible } from '@/engine/animation/reveal'
import { currentLoad } from '@/services/pulse'
import { Spring } from '@/engine/physics/spring'

function blobPath(t: number, amp: number, load: number): string {
  const n = 40
  let d = ''
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const r =
      12.5 *
      (1 +
        amp * (0.06 * Math.sin(3 * a + t * 1.3) + 0.04 * Math.sin(5 * a - t * 0.9)) +
        load * 0.07 * Math.sin(2 * a + t * 4))
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2)
  }
  return d + 'Z'
}

/**
 * The organism, miniaturised into the navigation. It breathes slowly at
 * rest and beats faster, warming to coral, when playground simulations
 * report load (see services/pulse).
 */
export default defineComponent({
  name: 'OrganismPulse',
  props: {
    size: { type: Number, default: 28 },
  },
  data() {
    return {
      restPath: blobPath(0, 1, 0),
      ticker: null as TickerHandle | null,
      stopVisible: null as null | (() => void),
      t: 0,
      load: markRaw(new Spring(0, 'premium')),
    }
  },
  mounted() {
    const motion = document.documentElement.dataset.motion
    if (motion !== 'full') return
    this.ticker = markRaw(subscribe((dt) => this.tick(dt)))
    this.stopVisible = whenVisible(this.$el as Element, (v) => this.ticker?.setActive(v), '0px')
  },
  beforeUnmount() {
    this.ticker?.dispose()
    this.stopVisible?.()
  },
  methods: {
    tick(dt: number) {
      this.load.target = currentLoad()
      this.load.step(dt)
      const load = this.load.value
      this.t += dt * (1 + load * 2.5)
      const beat = 1 + Math.sin((this.t * Math.PI * 2) / 4.2) * (0.04 + load * 0.08)
      const body = this.$refs.body as SVGPathElement
      const nucleus = this.$refs.nucleus as SVGCircleElement
      if (!body || !nucleus) return
      body.setAttribute('d', blobPath(this.t, 1, load))
      body.style.transform = `scale(${beat.toFixed(4)})`
      body.style.fill = load > 0.02 ? `color-mix(in oklab, var(--text), var(--tension) ${Math.round(load * 70)}%)` : ''
      nucleus.setAttribute('r', (4.2 * (1 + (beat - 1) * 2)).toFixed(2))
    },
  },
})
</script>

<style scoped>
.pulse {
  overflow: visible;
}
.pulse__body {
  fill: var(--text);
  transform-origin: center;
  transform-box: fill-box;
}
.pulse__nucleus {
  fill: var(--accent);
}
</style>
