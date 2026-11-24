<template>
  <article v-if="project" ref="root" class="case" :style="{ '--hue': project.hue }" :aria-labelledby="'case-title'">
    <header class="case__hero shell">
      <RouterLink to="/#work" class="case__back caption"><AppIcon name="arrow-left" :size="14" /> All work</RouterLink>
      <p class="margin-note"><b>Case study</b><span>{{ project.category }}</span></p>
      <h1 id="case-title" class="case__name display">{{ project.name }}</h1>
      <p class="case__tagline">{{ project.tagline }}</p>
      <div class="case__meta">
        <StatusTag :status="project.status" />
        <span class="caption">{{ project.stack.join(' · ') }}</span>
        <span class="caption">For {{ project.audience.toLowerCase() }}</span>
      </div>
      <div class="case__actions">
        <MagneticButton v-if="project.url" :href="project.url" external icon="arrow-up-right" size="lg">Visit {{ project.name }}</MagneticButton>
      </div>
    </header>

    <div class="case__surface shell" :style="{ viewTransitionName: `surface-${project.slug}` }">
      <component :is="surface" />
    </div>

    <section class="case__section shell" aria-labelledby="case-overview">
      <div class="case__col-a">
        <p class="margin-note" data-reveal><b>01</b><span>Overview</span></p>
        <h2 id="case-overview" class="case__h2 display" data-reveal>What it does</h2>
      </div>
      <div class="case__col-b">
        <p class="case__summary" data-reveal>{{ project.summary }}</p>
        <ul class="case__highlights" role="list">
          <li v-for="h in project.highlights" :key="h" data-reveal>{{ h }}</li>
        </ul>
      </div>
    </section>

    <section class="case__section shell" aria-labelledby="case-capabilities">
      <div class="case__col-a">
        <p class="margin-note" data-reveal><b>02</b><span>Capabilities</span></p>
        <h2 id="case-capabilities" class="case__h2 display" data-reveal>Inside the product</h2>
      </div>
      <div class="case__col-b case__groups">
        <div v-for="g in project.capabilities" :key="g.title" class="case__group" data-reveal>
          <h3 class="case__h3">{{ g.title }}</h3>
          <ul role="list">
            <li v-for="item in g.items" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>
    </section>

    <section v-if="project.engineering?.length" class="case__section shell" aria-labelledby="case-engineering">
      <div class="case__col-a">
        <p class="margin-note" data-reveal><b>03</b><span>Engineering themes</span></p>
        <h2 id="case-engineering" class="case__h2 display" data-reveal>Where the <em>work</em> is</h2>
      </div>
      <div class="case__col-b case__themes">
        <div v-for="(t, i) in project.engineering" :key="t.title" class="case__theme" data-reveal>
          <span class="mono case__theme-idx">{{ String(i + 1).padStart(2, '0') }}</span>
          <h3 class="case__h3">{{ t.title }}</h3>
          <p>{{ t.body }}</p>
        </div>
      </div>
    </section>

    <nav v-if="next" class="case__next shell" aria-label="Next case study">
      <RouterLink :to="`/work/${next.slug}`" class="case__next-link">
        <span class="caption">Next case study</span>
        <span class="case__next-name display">{{ next.name }} <AppIcon name="arrow-right" :size="32" /></span>
      </RouterLink>
    </nav>
  </article>
</template>

<script lang="ts">
import { defineComponent, type Component } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import StatusTag from '@/components/ui/StatusTag.vue'
import MagneticButton from '@/components/ui/MagneticButton.vue'
import { surfaces } from '@/components/surfaces/registry'
import { featureProjects, projectBySlug } from '@/config/projects'
import type { Project } from '@/config/types'
import { reveal } from '@/engine/animation/reveal'

export default defineComponent({
  name: 'ProjectView',
  components: { RouterLink, AppIcon, StatusTag, MagneticButton },
  data() {
    return { stop: null as null | (() => void) }
  },
  computed: {
    project(): Project | undefined {
      return projectBySlug(String(this.$route.params.slug))
    },
    surface(): Component | null {
      return this.project ? surfaces[this.project.surface] : null
    },
    next(): Project | undefined {
      const list = featureProjects()
      const i = list.findIndex((p) => p.slug === this.project?.slug)
      return list.length > 1 ? list[(i + 1) % list.length] : undefined
    },
  },
  watch: {
    '$route.params.slug'() {
      this.$nextTick(() => this.setupReveal())
    },
  },
  mounted() {
    this.setupReveal()
  },
  beforeUnmount() {
    this.stop?.()
  },
  methods: {
    setupReveal() {
      this.stop?.()
      if (this.$refs.root) this.stop = reveal(this.$refs.root as HTMLElement)
    },
  },
})
</script>

<style scoped>
.case__hero {
  padding-top: calc(var(--nav-h) + clamp(2.5rem, 7vw, 6rem));
  padding-bottom: clamp(2.5rem, 6vw, 4rem);
}
.case__back {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 2.5rem;
  color: var(--text);
  text-decoration: none;
}
.case__name {
  font-size: clamp(3.5rem, 2rem + 9vw, 11rem);
  margin: 1rem 0 0.5rem;
}
.case__tagline {
  font-family: var(--font-display);
  font-style: italic;
  font-size: var(--step-3);
  line-height: 1.1;
  margin: 0 0 1.75rem;
  max-width: 24ch;
}
.case__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1.5rem;
  align-items: center;
  margin-bottom: 2rem;
}
.case__surface {
  padding-bottom: clamp(4rem, 9vw, 8rem);
}
.case__section {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: clamp(1rem, 2vw, 2rem);
  row-gap: 1.5rem;
  padding-block: clamp(3rem, 7vw, 6rem);
  border-top: 1px solid var(--border);
}
.case__col-a {
  grid-column: 1 / span 4;
}
.case__col-b {
  grid-column: 6 / span 7;
}
.case__h2 {
  font-size: var(--step-4);
  margin: 0.75rem 0 0;
}
.case__h2 em {
  color: var(--accent-ink);
}
.case__summary {
  font-size: var(--step-1);
  line-height: 1.45;
  margin: 0 0 2rem;
}
.case__highlights {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 2rem;
}
.case__highlights li {
  padding: 0.8rem 0;
  border-top: 1px solid var(--border);
}
.case__groups {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2.5rem 2rem;
}
.case__h3 {
  margin: 0 0 0.75rem;
  font-size: var(--step-1);
  font-weight: 500;
}
.case__group ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.45rem;
  color: var(--text-muted);
  font-size: var(--step--1);
}
.case__group li::before {
  content: '· ';
  color: var(--accent-ink);
}
.case__themes {
  display: grid;
  gap: 2.5rem;
}
.case__theme {
  display: grid;
  grid-template-columns: 3rem 1fr;
  column-gap: 1rem;
}
.case__theme-idx {
  grid-row: span 2;
  color: var(--accent-ink);
  font-size: var(--step--1);
  padding-top: 0.3rem;
}
.case__theme p {
  margin: 0;
  color: var(--text-muted);
  max-width: 58ch;
}
.case__next {
  padding-block: clamp(4rem, 10vw, 8rem);
  border-top: 1px solid var(--border);
}
.case__next-link {
  display: grid;
  gap: 0.5rem;
  color: var(--text);
  text-decoration: none;
}
.case__next-name {
  display: inline-flex;
  align-items: center;
  gap: 1rem;
  font-size: var(--step-5);
  transition: gap var(--dur-premium) var(--ease-premium);
}
.case__next-link:hover .case__next-name {
  gap: 2rem;
  font-style: italic;
}
@media (max-width: 1023px) {
  .case__col-a,
  .case__col-b {
    grid-column: 1 / -1;
  }
}
@media (max-width: 640px) {
  .case__highlights,
  .case__groups {
    grid-template-columns: 1fr;
  }
}
</style>
