<template>
  <div class="dindex">
    <p :id="labelId" class="caption dindex__title">fig. 1: the engineering organism</p>
    <ul class="dindex__list" role="list" :aria-labelledby="labelId">
      <li v-for="(item, i) in items" :key="item.id">
        <button
          ref="items"
          type="button"
          class="dindex__item"
          :class="{ 'dindex__item--core': item.id === 'core', 'is-dim': item.id !== 'core' && dimmed(item.id) }"
          :aria-pressed="selected === item.id ? 'true' : 'false'"
          :aria-controls="panelId"
          @click="toggle(item.id)"
          @keydown="onKey($event, i)"
        >
          <span class="dindex__swatch" :class="{ 'dindex__swatch--core': item.id === 'core' }" aria-hidden="true" />
          {{ item.label }}
        </button>
      </li>
    </ul>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import { domains } from '@/config/technologies'
import type { DomainId } from '@/config/types'
import type { Selection } from './EngineeringOrganism.vue'

/**
 * The accessible, keyboard-operable control for the organism. Arrow keys
 * move between domains; Enter/Space selects. Mirrors the canvas exactly.
 */
export default defineComponent({
  name: 'DomainIndex',
  props: {
    selected: { type: String as PropType<Selection>, default: null },
    panelId: { type: String, required: true },
    activeDomains: { type: Array as PropType<DomainId[] | null>, default: null },
  },
  emits: ['select'],
  data() {
    // One list (core first) so the template ref array matches visual order.
    const items: { id: 'core' | DomainId; label: string }[] = [
      { id: 'core', label: 'Go core' },
      ...domains.map((d) => ({ id: d.id, label: d.short })),
    ]
    return { items, labelId: 'domain-index-title' }
  },
  methods: {
    toggle(id: Selection) {
      this.$emit('select', this.selected === id ? null : id)
    },
    dimmed(id: 'core' | DomainId): boolean {
      if (id === 'core') return false
      return !!this.activeDomains && !this.activeDomains.includes(id)
    },
    onKey(e: KeyboardEvent, i: number) {
      const items = this.$refs.items as HTMLElement[]
      const n = items.length
      let next = -1
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (i + 1) % n
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (i - 1 + n) % n
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = n - 1
      else if (e.key === 'Escape' && this.selected) {
        this.$emit('select', null)
        return
      }
      if (next < 0) return
      e.preventDefault()
      items[next]?.focus()
    },
  },
})
</script>

<style scoped>
.dindex__title {
  margin: 0 0 0.6rem;
}
.dindex__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.35rem;
}
.dindex__item {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.25rem;
  padding: 0 0.75rem 0 0.6rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    color var(--dur-ui) var(--ease-ui),
    border-color var(--dur-ui) var(--ease-ui),
    background-color var(--dur-ui) var(--ease-ui),
    opacity var(--dur-premium) var(--ease-premium);
}
.dindex__item:hover {
  color: var(--text);
  border-color: var(--border-strong);
}
.dindex__item[aria-pressed='true'] {
  color: var(--bg);
  background: var(--text);
  border-color: var(--text);
}
.dindex__item.is-dim {
  opacity: 0.45;
}
.dindex__swatch {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--organism-body);
}
.dindex__item[aria-pressed='true'] .dindex__swatch {
  background: var(--accent);
}
.dindex__swatch--core {
  background: var(--accent);
}
@media (pointer: coarse) {
  .dindex__item {
    min-height: 2.75rem;
  }
}
</style>
