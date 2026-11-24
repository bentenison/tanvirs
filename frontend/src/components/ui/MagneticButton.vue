<template>
  <component
    :is="tag"
    ref="root"
    class="mbtn"
    :class="[`mbtn--${variant}`, `mbtn--${size}`]"
    v-bind="linkAttrs"
    @click="$emit('click', $event)"
  >
    <span ref="inner" class="mbtn__inner">
      <span class="mbtn__label"><slot /></span>
      <AppIcon v-if="icon" :name="icon" :size="size === 'lg' ? 22 : 18" class="mbtn__icon" />
    </span>
  </component>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon, { type IconName } from './AppIcon.vue'
import { magnetic } from '@/engine/interaction/magnetic'

/**
 * Button/link with magnetic pull, stretch toward the pointer and press
 * compression. The label counter-moves slightly for depth, but never
 * deforms, text stays crisp.
 */
export default defineComponent({
  name: 'MagneticButton',
  components: { AppIcon, RouterLink },
  props: {
    to: { type: String, default: '' },
    href: { type: String, default: '' },
    type: { type: String as PropType<'button' | 'submit'>, default: 'button' },
    variant: { type: String as PropType<'primary' | 'outline' | 'quiet'>, default: 'primary' },
    size: { type: String as PropType<'md' | 'lg'>, default: 'md' },
    icon: { type: String as PropType<IconName | ''>, default: '' },
    disabled: { type: Boolean, default: false },
    external: { type: Boolean, default: false },
    strength: { type: Number, default: 6 },
  },
  emits: ['click'],
  data() {
    return { dispose: null as null | (() => void) }
  },
  computed: {
    tag(): string | typeof RouterLink {
      if (this.to) return RouterLink
      if (this.href) return 'a'
      return 'button'
    },
    linkAttrs(): Record<string, unknown> {
      if (this.to) return { to: this.to }
      if (this.href) {
        return this.external
          ? { href: this.href, target: '_blank', rel: 'noopener noreferrer' }
          : { href: this.href }
      }
      return { type: this.type, disabled: this.disabled }
    },
  },
  mounted() {
    const root = this.$refs.root as HTMLElement | { $el: HTMLElement }
    const el = root instanceof HTMLElement ? root : root.$el
    this.dispose = magnetic(el, {
      strength: this.strength,
      inner: this.$refs.inner as HTMLElement,
      innerFactor: 0.35,
    })
  },
  beforeUnmount() {
    this.dispose?.()
  },
})
</script>

<style scoped>
.mbtn {
  --h: 3rem;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--h);
  padding: 0 1.35rem;
  border-radius: 999px;
  border: 1px solid transparent;
  font-family: var(--font-sans);
  font-size: var(--step--1);
  font-weight: 500;
  letter-spacing: 0.005em;
  text-decoration: none;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color var(--dur-ui) var(--ease-ui),
    color var(--dur-ui) var(--ease-ui),
    border-color var(--dur-ui) var(--ease-ui);
}
.mbtn--lg {
  --h: 3.6rem;
  padding: 0 1.75rem;
  font-size: var(--step-0);
}
.mbtn__inner {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  pointer-events: none;
}
.mbtn--primary {
  background: var(--text);
  color: var(--bg);
}
.mbtn--primary:hover {
  background: var(--accent);
  color: var(--on-accent);
}
.mbtn--outline {
  border-color: var(--border-strong);
  color: var(--text);
  background: transparent;
}
.mbtn--outline:hover {
  border-color: var(--text);
  background: var(--surface);
}
.mbtn--quiet {
  padding: 0 0.9rem;
  color: var(--text);
  background: transparent;
}
.mbtn--quiet:hover {
  background: var(--surface-sunken);
}
.mbtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.mbtn__icon {
  transition: transform var(--dur-premium) var(--ease-premium);
}
.mbtn:hover .mbtn__icon {
  transform: translateX(2px);
}
</style>
