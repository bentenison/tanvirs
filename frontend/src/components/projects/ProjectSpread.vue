<template>
  <div class="spread">
    <article
      v-for="(p, i) in projects"
      :id="`project-${p.slug}`"
      :key="p.slug"
      class="spread__item"
      :aria-labelledby="`project-${p.slug}-title`"
    >
      <div class="spread__head">
        <p class="margin-note" data-reveal><b>{{ startIndex(i) }}</b><span>{{ p.category }}</span></p>
        <h3 :id="`project-${p.slug}-title`" class="spread__name display" data-reveal>{{ p.name }}</h3>
        <p class="spread__tagline" data-reveal>{{ p.tagline }}</p>
      </div>
      <div class="spread__surface" data-reveal>
        <component :is="surfaceFor(p)" />
      </div>
      <div class="spread__body">
        <p class="spread__summary">{{ p.summary }}</p>
        <ul class="spread__highlights" role="list">
          <li v-for="h in p.highlights.slice(0, 3)" :key="h">{{ h }}</li>
        </ul>
        <div class="spread__foot">
          <StatusTag :status="p.status" />
          <span class="caption">{{ p.stack.join(' · ') }}</span>
          <InteractiveLink v-if="p.url" :href="p.url" external icon="arrow-up-right">Visit {{ p.name }}</InteractiveLink>
        </div>
      </div>
    </article>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType, type Component } from 'vue'
import StatusTag from '@/components/ui/StatusTag.vue'
import InteractiveLink from '@/components/ui/InteractiveLink.vue'
import { surfaces } from '@/components/surfaces/registry'
import type { Project } from '@/config/types'

/** Two compact launches set side by side like a magazine spread. */
export default defineComponent({
  name: 'ProjectSpread',
  components: { StatusTag, InteractiveLink },
  props: {
    projects: { type: Array as PropType<Project[]>, required: true },
    offset: { type: Number, default: 0 },
  },
  methods: {
    surfaceFor(p: Project): Component {
      return surfaces[p.surface]
    },
    startIndex(i: number): string {
      return String(this.offset + i + 1).padStart(2, '0')
    },
  },
})
</script>

<style scoped>
.spread {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(2rem, 5vw, 5rem);
  padding-block: clamp(3rem, 8vw, 7rem);
  border-top: 1px solid var(--border);
}
.spread__item:nth-child(2) {
  margin-top: clamp(0rem, 10vw, 9rem);
}
.spread__name {
  font-size: var(--step-4);
  margin: 0.6rem 0 0.35rem;
}
.spread__tagline {
  font-family: var(--font-display);
  font-style: italic;
  font-size: var(--step-1);
  margin: 0 0 1.75rem;
}
.spread__surface {
  margin-bottom: 1.75rem;
}
.spread__summary {
  margin: 0 0 1rem;
  color: var(--text-muted);
  font-size: var(--step--1);
  max-width: 52ch;
}
.spread__highlights {
  margin: 0 0 1.25rem;
  padding: 0;
  list-style: none;
  columns: 2;
  column-gap: 1.5rem;
  font-size: var(--step--1);
}
.spread__highlights li {
  break-inside: avoid;
  padding: 0.35rem 0;
  border-top: 1px solid var(--border);
}
.spread__foot {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  align-items: center;
}
@media (max-width: 1099px) {
  .spread {
    grid-template-columns: 1fr;
  }
  .spread__item:nth-child(2) {
    margin-top: 0;
  }
}
@media (max-width: 560px) {
  .spread__highlights {
    columns: 1;
  }
}
</style>
