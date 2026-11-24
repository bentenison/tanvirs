import { defineComponent, markRaw } from 'vue'
import { subscribe, type TickerHandle } from '@/engine/animation/ticker'
import { whenVisible } from '@/engine/animation/reveal'
import { onPreferencesChange } from '@/services/preferences'
import { readInk, type Ink } from '@/engine/rendering/canvas2d'
import { clearLoad } from '@/services/pulse'

/**
 * Shared lifecycle for canvas simulations (an Options API mixin):
 * runs on the global ticker only while visible and playing, re-reads
 * theme colours on change, and releases everything on unmount.
 * Components implement `simStep(dt)` and `draw()`.
 */
export default defineComponent({
  data() {
    return {
      playing: true,
      visible: false,
      simTicker: null as TickerHandle | null,
      simCleanups: [] as (() => void)[],
      ink: null as Ink | null,
      loadSource: '',
      statsTick: 0,
    }
  },
  mounted() {
    this.ink = markRaw(readInk())
    const root = this.$el as HTMLElement
    let acc = 0
    this.simTicker = markRaw(
      subscribe((dt) => {
        ;(this as unknown as { simStep(dt: number): void }).simStep(dt)
        ;(this as unknown as { draw(): void }).draw()
        // Throttle reactive stat updates to ~8 Hz; drawing stays per-frame.
        acc += dt
        if (acc > 0.12) {
          acc = 0
          this.statsTick++
        }
      }, false),
    )
    if (document.documentElement.dataset.motion === 'minimal') this.playing = false
    this.simCleanups.push(
      whenVisible(root, (v) => {
        this.visible = v
        this.syncTicker()
      }, '0px'),
      onPreferencesChange(() =>
        requestAnimationFrame(() => {
          this.ink = markRaw(readInk())
          ;(this as unknown as { draw(): void }).draw()
        }),
      ),
    )
    const ro = new ResizeObserver(() => (this as unknown as { draw(): void }).draw())
    ro.observe(root)
    this.simCleanups.push(() => ro.disconnect())
  },
  beforeUnmount() {
    this.simTicker?.dispose()
    this.simCleanups.forEach((c) => c())
    if (this.loadSource) clearLoad(this.loadSource)
  },
  watch: {
    playing() {
      this.syncTicker()
    },
  },
  methods: {
    syncTicker() {
      this.simTicker?.setActive(this.playing && this.visible)
      if (!(this.playing && this.visible) && this.loadSource) clearLoad(this.loadSource)
    },
  },
})
