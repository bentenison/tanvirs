<template>
  <article
    :id="`project-${project.slug}`"
    class="pfeat"
    :class="{ 'pfeat--mirror': mirror }"
    :style="{ '--hue': project.hue }"
    :aria-labelledby="`project-${project.slug}-title`"
  >
    <div class="pfeat__intro">
      <p class="margin-note" data-reveal><b>{{ number }}</b><span>{{ project.category }}</span></p>
      <h3 :id="`project-${project.slug}-title`" class="pfeat__name display" data-reveal>{{ project.name }}</h3>
      <p class="pfeat__tagline" data-reveal>{{ project.tagline }}</p>
      <div class="pfeat__meta" data-reveal>
        <StatusTag :status="project.status" />
        <span class="caption">{{ project.stack.join(' · ') }}</span>
      </div>
      <p class="pfeat__summary" data-reveal>{{ project.summary }}</p>
      <ul class="pfeat__highlights" role="list" data-reveal>
        <li v-for="h in project.highlights" :key="h">{{ h }}</li>
      </ul>
      <div class="pfeat__actions" data-reveal>
        <MagneticButton :to="`/work/${project.slug}`" icon="arrow-right" @click="markTransition">Case study</MagneticButton>
        <InteractiveLink v-if="project.url" :href="project.url" external icon="arrow-up-right">Visit {{ project.name }}</InteractiveLink>
      </div>
    </div>
    <div class="pfeat__surface" :style="{ viewTransitionName: vtName }">
      <component :is="surface" />
    </div>
  </article>
</template>

<script lang="ts">
import { defineComponent, type PropType, type Component } from 'vue'
import StatusTag from '@/components/ui/StatusTag.vue'
import MagneticButton from '@/components/ui/MagneticButton.vue'
import InteractiveLink from '@/components/ui/InteractiveLink.vue'
import { surfaces } from '@/components/surfaces/registry'
import type { Project } from '@/config/types'

/** A miniature product launch: editorial copy beside a live, interactive product surface. */
export default defineComponent({
  name: 'ProjectFeature',
  components: { StatusTag, MagneticButton, InteractiveLink },
  props: {
    project: { type: Object as PropType<Project>, required: true },
    number: { type: String, required: true },
    mirror: { type: Boolean, default: false },
  },
  data() {
    return { vtName: 'none' }
  },
  computed: {
    surface(): Component {
      return surfaces[this.project.surface]
    },
  },
  methods: {
    // Name only the clicked surface so the shared-element transition has one unique source.
    markTransition() {
      this.vtName = `surface-${this.project.slug}`
    },
  },
})
</script>

<style scoped>
.pfeat {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: clamp(1rem, 2vw, 2rem);
  row-gap: 2.5rem;
  align-items: center;
  padding-block: clamp(4rem, 10vw, 9rem);
}
.pfeat__intro {
  grid-column: 1 / span 4;
}
.pfeat__surface {
  grid-column: 6 / span 7;
  margin-right: calc(var(--gutter) * -0.5);
}
.pfeat--mirror .pfeat__intro {
  grid-column: 9 / span 4;
  grid-row: 1;
}
.pfeat--mirror .pfeat__surface {
  grid-column: 1 / span 7;
  grid-row: 1;
  margin-right: 0;
  margin-left: calc(var(--gutter) * -0.5);
}
.pfeat__name {
  font-size: var(--step-5);
  margin: 0.75rem 0 0.5rem;
}
.pfeat__tagline {
  font-family: var(--font-display);
  font-style: italic;
  font-size: var(--step-2);
  line-height: 1.15;
  margin: 0 0 1.25rem;
  text-wrap: balance;
}
.pfeat__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  margin-bottom: 1.25rem;
}
.pfeat__summary {
  color: var(--text-muted);
  margin: 0 0 1.25rem;
}
.pfeat__highlights {
  margin: 0 0 2rem;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.55rem;
  font-size: var(--step--1);
}
.pfeat__highlights li {
  display: grid;
  grid-template-columns: 1.25rem 1fr;
}
.pfeat__highlights li::before {
  content: '';
  width: 0.5rem;
  height: 0.5rem;
  margin-top: 0.5em;
  border-radius: 50%;
  border: 1.5px solid var(--accent-ink);
}
.pfeat__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem 1.5rem;
}
@media (max-width: 1099px) {
  .pfeat__intro,
  .pfeat--mirror .pfeat__intro {
    grid-column: 1 / -1;
    grid-row: 1;
    max-width: 40rem;
  }
  .pfeat__surface,
  .pfeat--mirror .pfeat__surface {
    grid-column: 1 / -1;
    grid-row: 2;
    margin: 0;
  }
}
</style>
