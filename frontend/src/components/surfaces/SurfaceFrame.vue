<template>
  <figure ref="root" class="sframe" :class="[`sframe--${variant}`, { 'is-active': active, 'is-assembled': assembled }]">
    <div ref="tilt" class="sframe__tilt">
      <div class="sframe__window">
        <div v-if="variant === 'browser' || variant === 'window'" class="sframe__chrome" aria-hidden="true">
          <span class="sframe__lights"><i /><i /><i /></span>
          <span v-if="variant === 'browser'" class="sframe__url mono">{{ url }}</span>
          <span v-else class="sframe__wtitle mono">{{ url }}</span>
        </div>
        <div v-else class="sframe__notch" aria-hidden="true" />
        <div class="sframe__screen">
          <slot :active="active" />
        </div>
      </div>
      <div v-if="$slots.float" class="sframe__float">
        <slot name="float" :active="active" />
      </div>
    </div>
    <figcaption class="sframe__caption">
      <DemoLabel />
      <span v-if="caption" class="caption">{{ caption }}</span>
    </figcaption>
  </figure>
</template>

<script lang="ts">
import { defineComponent, markRaw, type PropType } from 'vue'
import DemoLabel from '@/components/ui/DemoLabel.vue'
import { Spring } from '@/engine/physics/spring'
import { subscribe, type TickerHandle } from '@/engine/animation/ticker'
import { whenVisible } from '@/engine/animation/reveal'

/**
 * Chrome for interactive product surfaces. Provides `active` to its slot
 * (false while offscreen, so demos pause), restrained pointer tilt on
 * heavy springs (≤ 6°), layered floating panels, and a one-time
 * assembly when it first enters the viewport.
 */
export default defineComponent({
  name: 'SurfaceFrame',
  components: { DemoLabel },
  props: {
    variant: { type: String as PropType<'browser' | 'window' | 'mobile'>, default: 'browser' },
    url: { type: String, default: '' },
    caption: { type: String, default: '' },
    maxTilt: { type: Number, default: 5 },
  },
  emits: ['active'],
  data() {
    return {
      active: false,
      assembled: false,
      cleanups: [] as (() => void)[],
      rx: markRaw(new Spring(0, 'heavy')),
      ry: markRaw(new Spring(0, 'heavy')),
      ticker: null as TickerHandle | null,
    }
  },
  mounted() {
    const root = this.$refs.root as HTMLElement
    this.cleanups.push(
      whenVisible(root, (v) => {
        this.active = v
        this.$emit('active', v)
        if (v) this.assembled = true
        if (!v) this.resetTilt()
      }, '0px'),
    )
    const fine = matchMedia('(pointer: fine)').matches
    if (fine) {
      this.ticker = markRaw(subscribe((dt) => this.tick(dt), false))
      const move = (e: PointerEvent) => {
        if (document.documentElement.dataset.motion !== 'full') return
        const r = root.getBoundingClientRect()
        const nx = (e.clientX - r.left) / r.width - 0.5
        const ny = (e.clientY - r.top) / r.height - 0.5
        this.ry.target = nx * this.maxTilt
        this.rx.target = -ny * this.maxTilt * 0.7
        root.style.setProperty('--hx', `${((nx + 0.5) * 100).toFixed(1)}%`)
        root.style.setProperty('--hy', `${((ny + 0.5) * 100).toFixed(1)}%`)
        this.ticker?.setActive(true)
      }
      const leave = () => this.resetTilt()
      root.addEventListener('pointermove', move)
      root.addEventListener('pointerleave', leave)
      this.cleanups.push(() => {
        root.removeEventListener('pointermove', move)
        root.removeEventListener('pointerleave', leave)
      })
    }
  },
  beforeUnmount() {
    this.cleanups.forEach((c) => c())
    this.ticker?.dispose()
  },
  methods: {
    resetTilt() {
      this.rx.target = 0
      this.ry.target = 0
      this.ticker?.setActive(true)
    },
    tick(dt: number) {
      const a = this.rx.step(dt)
      const b = this.ry.step(dt)
      const tilt = this.$refs.tilt as HTMLElement | undefined
      if (tilt) {
        tilt.style.transform =
          this.rx.value === 0 && this.ry.value === 0
            ? ''
            : `perspective(1400px) rotateX(${this.rx.value.toFixed(3)}deg) rotateY(${this.ry.value.toFixed(3)}deg)`
      }
      if (!a && !b) this.ticker?.setActive(false)
    },
  },
})
</script>

<style scoped>
.sframe {
  margin: 0;
  --hx: 50%;
  --hy: 30%;
}
.sframe__tilt {
  position: relative;
  transform-style: preserve-3d;
}
.sframe__window {
  position: relative;
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-float);
  overflow: hidden;
}
/* Pointer-responsive highlight: a soft sheen that follows the cursor. */
.sframe__window::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(600px circle at var(--hx) var(--hy), rgb(255 255 255 / 0.07), transparent 40%);
}
.sframe__screen {
  container: surface / inline-size;
}
.sframe__chrome {
  display: flex;
  align-items: center;
  gap: 1rem;
  height: 2.4rem;
  padding: 0 0.9rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.sframe__lights {
  display: inline-flex;
  gap: 0.35rem;
}
.sframe__lights i {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: var(--border-strong);
}
.sframe__url,
.sframe__wtitle {
  flex: 1;
  max-width: 24rem;
  margin-inline: auto;
  padding: 0.2rem 0.8rem;
  border-radius: 999px;
  background: var(--surface-sunken);
  color: var(--text-muted);
  font-size: 0.7rem;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sframe__wtitle {
  background: transparent;
}
.sframe--mobile .sframe__window {
  border-radius: 28px;
  border-width: 6px;
  border-color: var(--text);
  max-width: 300px;
  margin-inline: auto;
}
.sframe__notch {
  width: 5rem;
  height: 1.1rem;
  margin: 0.4rem auto 0;
  border-radius: 999px;
  background: var(--text);
}
.sframe__float {
  position: absolute;
  inset: 0;
  pointer-events: none;
  transform: translateZ(40px);
}
.sframe__float > :deep(*) {
  pointer-events: auto;
}
.sframe__caption {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-top: 1rem;
}

/* Surface unfolding: the window settles in from a slightly folded state. */
.js .sframe:not(.is-assembled) .sframe__window {
  opacity: 0;
  transform: perspective(1400px) rotateX(8deg) translateY(28px) scale(0.97);
}
.sframe.is-assembled .sframe__window {
  transition:
    opacity 600ms var(--ease-out),
    transform 900ms cubic-bezier(0.2, 1.15, 0.3, 1);
}
@media (max-width: 720px) {
  .sframe__float {
    position: static;
    transform: none;
  }
}
:root[data-motion='minimal'] .sframe .sframe__window,
:root[data-motion='reduced'] .sframe .sframe__window {
  opacity: 1;
  transform: none;
}
</style>
