<template>
  <div ref="root" class="seg" role="radiogroup" :aria-label="label">
    <span class="seg__thumb" ref="thumb" aria-hidden="true" />
    <button
      v-for="(opt, i) in options"
      :key="opt.value"
      ref="buttons"
      type="button"
      role="radio"
      class="seg__opt"
      :class="{ 'is-active': opt.value === modelValue }"
      :aria-checked="opt.value === modelValue ? 'true' : 'false'"
      :tabindex="opt.value === modelValue || (!hasValue && i === 0) ? 0 : -1"
      :title="opt.hint"
      @click="select(opt.value)"
      @keydown="onKey($event, i)"
    >
      <AppIcon v-if="opt.icon" :name="opt.icon" :size="16" />
      <span :class="{ 'sr-only': iconOnly && opt.icon }">{{ opt.label }}</span>
    </button>
  </div>
</template>

<script lang="ts">
import { defineComponent, markRaw, type PropType } from 'vue'
import AppIcon, { type IconName } from './AppIcon.vue'
import { Spring } from '@/engine/physics/spring'
import { subscribe, type TickerHandle } from '@/engine/animation/ticker'

export interface SegmentOption {
  value: string
  label: string
  hint?: string
  icon?: IconName
}

/**
 * Accessible radiogroup with a thumb that morphs between options on
 * springs (position and width animate independently, so the thumb
 * visibly stretches as it travels).
 */
export default defineComponent({
  name: 'SegmentedControl',
  components: { AppIcon },
  props: {
    options: { type: Array as PropType<SegmentOption[]>, required: true },
    modelValue: { type: String as PropType<string | null>, default: null },
    label: { type: String, required: true },
    iconOnly: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  data() {
    return {
      ticker: null as TickerHandle | null,
      // Per-frame physics state stays outside Vue's reactivity.
      left: markRaw(new Spring(0, 'ui')),
      right: markRaw(new Spring(0, 'ui')),
      ro: null as ResizeObserver | null,
    }
  },
  computed: {
    hasValue(): boolean {
      return this.options.some((o) => o.value === this.modelValue)
    },
  },
  watch: {
    modelValue() {
      this.place(false)
    },
  },
  mounted() {
    this.ticker = markRaw(subscribe((dt) => this.tick(dt), false))
    this.place(true)
    this.ro = new ResizeObserver(() => this.place(true))
    this.ro.observe(this.$refs.root as Element)
  },
  beforeUnmount() {
    this.ticker?.dispose()
    this.ro?.disconnect()
  },
  methods: {
    select(v: string) {
      this.$emit('update:modelValue', v)
    },
    onKey(e: KeyboardEvent, i: number) {
      const n = this.options.length
      let next = -1
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % n
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + n) % n
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = n - 1
      if (next < 0) return
      e.preventDefault()
      this.select(this.options[next].value)
      this.$nextTick(() => (this.$refs.buttons as HTMLElement[])[next]?.focus())
    },
    place(snap: boolean) {
      const idx = this.options.findIndex((o) => o.value === this.modelValue)
      const thumb = this.$refs.thumb as HTMLElement | undefined
      if (!thumb) return
      if (idx < 0) {
        thumb.style.opacity = '0'
        return
      }
      const btn = (this.$refs.buttons as HTMLElement[])[idx]
      const l = btn.offsetLeft
      const r = l + btn.offsetWidth
      const motion = document.documentElement.dataset.motion
      // Leading edge moves first; trailing edge follows, a liquid stretch.
      const goingRight = l > this.left.value
      this.left.set(goingRight ? { stiffness: 260, damping: 30, mass: 1 } : 'ui')
      this.right.set(goingRight ? 'ui' : { stiffness: 260, damping: 30, mass: 1 })
      this.left.target = l
      this.right.target = r
      if (snap || motion === 'minimal' || thumb.style.opacity === '0') {
        this.left.snap(l)
        this.right.snap(r)
      }
      thumb.style.opacity = '1'
      this.render()
      this.ticker?.setActive(true)
    },
    tick(dt: number) {
      const moving = this.left.step(dt) || this.right.step(dt)
      this.render()
      if (!moving) this.ticker?.setActive(false)
    },
    render() {
      const thumb = this.$refs.thumb as HTMLElement | undefined
      if (!thumb) return
      thumb.style.transform = `translateX(${this.left.value}px)`
      thumb.style.width = `${Math.max(0, this.right.value - this.left.value)}px`
    },
  },
})
</script>

<style scoped>
.seg {
  position: relative;
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
}
.seg__thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 0;
  border-radius: 999px;
  background: var(--surface-raised);
  box-shadow: var(--shadow-raised);
  opacity: 0;
}
.seg__opt {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.25rem;
  min-width: 2.5rem;
  justify-content: center;
  padding: 0 0.8rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--step--1);
  cursor: pointer;
  transition: color var(--dur-ui) var(--ease-ui);
}
.seg__opt:hover,
.seg__opt.is-active {
  color: var(--text);
}
</style>
