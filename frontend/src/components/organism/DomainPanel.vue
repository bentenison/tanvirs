<template>
  <section
    :id="id"
    class="dpanel"
    :class="{ 'is-open': !!selected }"
    role="region"
    aria-live="polite"
    :aria-label="title || 'Engineering domain details'"
    @keydown.esc="$emit('close')"
  >
    <template v-if="selected">
      <header class="dpanel__head">
        <p class="caption">{{ selected === 'core' ? 'The core' : 'Domain' }}</p>
        <h3 class="dpanel__title display">{{ title }}</h3>
        <button type="button" class="dpanel__close" aria-label="Close details" @click="$emit('close')">
          <AppIcon name="close" :size="18" />
        </button>
      </header>
      <p class="dpanel__summary">{{ summary }}</p>

      <div v-if="techs.length > 1" class="dpanel__techs" role="group" aria-label="Technologies">
        <button
          v-for="t in techs"
          :key="t.id"
          type="button"
          class="dpanel__tech"
          :aria-pressed="current?.id === t.id ? 'true' : 'false'"
          @click="techId = t.id"
        >
          {{ t.name }}
        </button>
      </div>

      <div v-if="current" class="dpanel__detail">
        <p class="dpanel__role"><strong>{{ current.name }}</strong>: {{ current.role }}</p>
        <ul class="dpanel__caps" role="list">
          <li v-for="c in current.capabilities" :key="c">{{ c }}</li>
        </ul>
        <p v-if="related.length" class="dpanel__projects caption">
          Used in
          <template v-for="(p, i) in related" :key="p.slug">
            <RouterLink v-if="p.presentation === 'feature'" :to="`/work/${p.slug}`">{{ p.name }}</RouterLink>
            <RouterLink v-else :to="`/#project-${p.slug}`">{{ p.name }}</RouterLink><span v-if="i < related.length - 1">, </span>
          </template>
        </p>
      </div>
    </template>
  </section>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import { domainById, technologies, technologiesFor } from '@/config/technologies'
import { projectBySlug } from '@/config/projects'
import type { Project, Technology } from '@/config/types'
import type { Selection } from './EngineeringOrganism.vue'

/** Contextual details for the selected domain (or the Go core) and its technologies. */
export default defineComponent({
  name: 'DomainPanel',
  components: { AppIcon, RouterLink },
  props: {
    id: { type: String, required: true },
    selected: { type: String as PropType<Selection>, default: null },
  },
  emits: ['close'],
  data() {
    return { techId: '' }
  },
  computed: {
    techs(): Technology[] {
      if (!this.selected) return []
      if (this.selected === 'core') return technologies.filter((t) => t.id === 'go')
      return technologiesFor(this.selected)
    },
    title(): string {
      if (!this.selected) return ''
      return this.selected === 'core' ? 'Go' : domainById(this.selected).name
    },
    summary(): string {
      if (!this.selected) return ''
      return this.selected === 'core'
        ? 'The centre of the organism. Every product here is a single Go service, and Go is the language I reach for first for APIs, concurrent pipelines and tools.'
        : domainById(this.selected).summary
    },
    current(): Technology | undefined {
      return this.techs.find((t) => t.id === this.techId) ?? this.techs[0]
    },
    related(): Project[] {
      return (this.current?.projects ?? []).map((s) => projectBySlug(s)).filter((p): p is Project => !!p)
    },
  },
  watch: {
    selected() {
      this.techId = ''
    },
  },
})
</script>

<style scoped>
.dpanel {
  width: min(26rem, 100%);
  padding: 1.25rem 1.35rem 1.35rem;
  border-radius: var(--radius-md);
  background: color-mix(in oklab, var(--surface-raised) 94%, transparent);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-float);
  backdrop-filter: blur(8px);
}
.dpanel:not(.is-open) {
  display: none;
}
.dpanel.is-open {
  animation: panel-in 420ms cubic-bezier(0.2, 1.05, 0.3, 1);
}
.dpanel__head {
  position: relative;
  padding-right: 2.5rem;
}
.dpanel__head .caption {
  margin: 0 0 0.25rem;
}
.dpanel__title {
  margin: 0;
  font-size: var(--step-3);
}
.dpanel__close {
  position: absolute;
  top: -0.35rem;
  right: -0.4rem;
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.dpanel__close:hover {
  background: var(--surface-sunken);
}
.dpanel__summary {
  margin: 0.6rem 0 1rem;
  color: var(--text-muted);
  font-size: var(--step--1);
}
.dpanel__techs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.9rem;
}
.dpanel__tech {
  min-height: 2.1rem;
  padding: 0 0.75rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font-size: var(--step--1);
  cursor: pointer;
}
.dpanel__tech[aria-pressed='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.dpanel__role {
  margin: 0 0 0.5rem;
  font-size: var(--step--1);
}
.dpanel__caps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.3rem;
  font-size: var(--step--1);
  color: var(--text-muted);
}
.dpanel__caps li {
  padding-left: 1.1rem;
  position: relative;
}
.dpanel__caps li::before {
  content: '';
  position: absolute;
  left: 0.15rem;
  top: 0.62em;
  width: 0.4rem;
  height: 1px;
  background: var(--accent-ink);
}
.dpanel__projects {
  margin: 0.9rem 0 0;
}
.dpanel__projects a {
  color: var(--text);
}
@keyframes panel-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.98);
  }
}
</style>
