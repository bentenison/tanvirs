<template>
  <div class="mnav">
    <DialogRoot v-model:open="open">
      <div class="mnav__bar">
        <DialogTrigger class="mnav__menu" aria-label="Open menu">
          <OrganismPulse :size="24" />
          <span class="mnav__current">
            <span class="caption">{{ currentIndex }}</span>
            {{ currentLabel }}
          </span>
          <AppIcon name="menu" :size="18" />
        </DialogTrigger>
        <RouterLink to="/#contact" class="mnav__contact">Contact</RouterLink>
      </div>

      <DialogPortal>
        <DialogOverlay class="mnav__overlay" />
        <DialogContent class="mnav__sheet" :aria-describedby="undefined">
          <div class="mnav__grip" aria-hidden="true" />
          <DialogTitle class="caption mnav__title">Navigate</DialogTitle>
          <ul class="mnav__list" role="list">
            <li>
              <RouterLink to="/" class="mnav__link" @click="open = false">
                <span class="mono mnav__idx">01</span><span class="display">Home</span>
              </RouterLink>
            </li>
            <li v-for="item in items" :key="item.id">
              <RouterLink
                :to="item.to"
                class="mnav__link"
                :class="{ 'is-active': item.id === active }"
                :aria-current="item.id === active ? 'location' : undefined"
                @click="open = false"
              >
                <span class="mono mnav__idx">{{ item.index }}</span><span class="display">{{ item.label }}</span>
              </RouterLink>
            </li>
          </ul>
          <hr class="rule" />
          <PreferenceControls stacked />
          <DialogClose class="mnav__close" aria-label="Close menu">
            <AppIcon name="close" :size="20" />
          </DialogClose>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import { RouterLink } from 'vue-router'
import {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogClose,
} from 'reka-ui'
import OrganismPulse from './OrganismPulse.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import PreferenceControls from '@/components/ui/PreferenceControls.vue'
import type { NavItem } from '@/config/types'

/**
 * Mobile navigation: a thumb-reachable bottom bar whose pulse doubles as
 * the menu button, expanding into a sheet with sections and preferences.
 */
export default defineComponent({
  name: 'MobileNav',
  components: {
    RouterLink,
    DialogRoot,
    DialogTrigger,
    DialogPortal,
    DialogOverlay,
    DialogContent,
    DialogTitle,
    DialogClose,
    OrganismPulse,
    AppIcon,
    PreferenceControls,
  },
  props: {
    items: { type: Array as PropType<NavItem[]>, required: true },
    active: { type: String, default: '' },
  },
  data() {
    return { open: false }
  },
  computed: {
    current(): NavItem | undefined {
      return this.items.find((i) => i.id === this.active)
    },
    currentLabel(): string {
      return this.current?.label ?? 'Menu'
    },
    currentIndex(): string {
      return this.current?.index ?? ''
    },
  },
})
</script>

<style scoped>
.mnav {
  display: none;
}
@media (max-width: 899px) {
  .mnav {
    display: block;
  }
}
.mnav__bar {
  position: fixed;
  left: 50%;
  bottom: max(0.9rem, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  display: flex;
  gap: 0.4rem;
  padding: 0.35rem;
  border-radius: 999px;
  background: color-mix(in oklab, var(--surface-raised) 92%, transparent);
  backdrop-filter: blur(12px);
  box-shadow: 0 0 0 1px var(--border), var(--shadow-float);
  pointer-events: auto;
  max-width: calc(100vw - 2rem);
}
.mnav__menu {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  min-height: 3rem;
  padding: 0 1rem 0 0.7rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  font-size: var(--step--1);
  cursor: pointer;
}
.mnav__current {
  display: inline-flex;
  gap: 0.5rem;
  align-items: baseline;
  min-width: 6.5rem;
}
.mnav__contact {
  display: inline-flex;
  align-items: center;
  min-height: 3rem;
  padding: 0 1.1rem;
  border-radius: 999px;
  background: var(--text);
  color: var(--bg);
  text-decoration: none;
  font-size: var(--step--1);
  font-weight: 500;
}
:global(.mnav__overlay) {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgb(10 10 8 / 0.4);
  animation: fade-in 200ms var(--ease-out);
}
:global(.mnav__sheet) {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 81;
  max-height: 88svh;
  overflow: auto;
  padding: 0.75rem var(--gutter) calc(1.5rem + env(safe-area-inset-bottom));
  background: var(--surface-raised);
  border-radius: 18px 18px 0 0;
  box-shadow: var(--shadow-float);
  animation: sheet-in 420ms cubic-bezier(0.2, 1.1, 0.3, 1);
}
:global(.mnav__grip) {
  width: 2.5rem;
  height: 4px;
  margin: 0 auto 1rem;
  border-radius: 4px;
  background: var(--border-strong);
}
:global(.mnav__title) {
  margin: 0 0 0.5rem;
}
:global(.mnav__list) {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
}
:global(.mnav__link) {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  padding: 0.5rem 0;
  color: var(--text);
  text-decoration: none;
  font-size: var(--step-3);
}
:global(.mnav__link.is-active .display) {
  font-style: italic;
  color: var(--accent-ink);
}
:global(.mnav__idx) {
  font-size: var(--step--2);
  color: var(--text-muted);
  min-width: 1.6rem;
}
:global(.mnav__close) {
  position: absolute;
  top: 0.8rem;
  right: 0.8rem;
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: 999px;
  background: var(--surface-sunken);
  color: var(--text);
}
:global(.mnav__sheet .rule) {
  margin: 0.5rem 0 1.25rem;
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
}
@keyframes sheet-in {
  from {
    transform: translateY(100%);
  }
}
</style>
