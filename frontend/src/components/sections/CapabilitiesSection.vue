<template>
  <section id="capabilities" ref="root" class="caps" aria-labelledby="caps-title">
    <div class="shell">
      <SectionHeading id="caps-title" index="04" kicker="Engineering capabilities">
        Shown, <em>not</em> scored.
        <template #lede>No percentage bars. Six small working specimens of how I approach each layer. Try them.</template>
      </SectionHeading>

      <div class="caps__list">
        <article v-for="(c, i) in items" :key="c.id" class="caps__item" :class="{ 'caps__item--shift': i % 2 === 1 }" :aria-labelledby="`cap-${c.id}`">
          <div class="caps__text" data-reveal>
            <p class="margin-note"><b>04.{{ i + 1 }}</b><span>{{ c.domain }}</span></p>
            <h3 :id="`cap-${c.id}`" class="caps__title display">{{ c.title }}</h3>
            <p class="caps__body">{{ c.body }}</p>
            <ul class="caps__points" role="list">
              <li v-for="p in c.points" :key="p">{{ p }}</li>
            </ul>
          </div>
          <div class="caps__demo" data-reveal>
            <component :is="c.component" />
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent, markRaw, type Component } from 'vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import RequestPipeline from '@/components/capabilities/RequestPipeline.vue'
import UiStates from '@/components/capabilities/UiStates.vue'
import IndexScan from '@/components/capabilities/IndexScan.vue'
import RollingDeploy from '@/components/capabilities/RollingDeploy.vue'
import FanOut from '@/components/capabilities/FanOut.vue'
import ReviewGates from '@/components/capabilities/ReviewGates.vue'
import { reveal } from '@/engine/animation/reveal'

interface Capability {
  id: string
  domain: string
  title: string
  body: string
  points: string[]
  component: Component
}

export default defineComponent({
  name: 'CapabilitiesSection',
  components: { SectionHeading },
  data() {
    const items: Capability[] = [
      {
        id: 'backend',
        domain: 'Backend',
        title: 'Requests with a clear path',
        body: 'Middleware does one job each (recovery, request IDs, auth, validation), so handlers stay small and failures are explicit.',
        points: ['Gin and the standard library', 'Validation errors that name the field', 'Context-aware cancellation'],
        component: markRaw(RequestPipeline),
      },
      {
        id: 'frontend',
        domain: 'Frontend',
        title: 'Interfaces people understand',
        body: 'I design and build Vue interfaces with Tailwind CSS, shadcn-vue and other component libraries, and I treat loading, empty and error states as part of the design, not an afterthought.',
        points: ['Vue 3, Tailwind CSS, shadcn-vue', 'Design tokens and reusable components', 'UI/UX design for every state'],
        component: markRaw(UiStates),
      },
      {
        id: 'data',
        domain: 'Databases',
        title: 'Read less to answer faster',
        body: 'Most slow endpoints are slow queries. Indexes that match how data is filtered turn full scans into a handful of page reads.',
        points: ['PostgreSQL query plans', 'Indexing and partitioning', 'Safe schema migrations'],
        component: markRaw(IndexScan),
      },
      {
        id: 'infra',
        domain: 'Infrastructure',
        title: 'Deploys nobody notices',
        body: 'Readiness gates and graceful shutdown let new versions replace old ones without dropping a request.',
        points: ['Containers and Linux', 'Kubernetes probes and rollouts', 'Single static Go binaries'],
        component: markRaw(RollingDeploy),
      },
      {
        id: 'performance',
        domain: 'Performance',
        title: 'Concurrency where it pays',
        body: 'Independent work should not wait in line. Fanning out with an errgroup makes latency the slowest call, not the sum.',
        points: ['Goroutines, channels, errgroup', 'Worker pools and back-pressure', 'Profiling before optimising'],
        component: markRaw(FanOut),
      },
      {
        id: 'ai',
        domain: 'AI-assisted engineering',
        title: 'Fast drafts, same gates',
        body: 'I use models to draft and explore quickly, but lint, types, tests and review still decide what ships.',
        points: ['RAG and LLM integration', 'Prompt engineering', 'AI-assisted development workflows'],
        component: markRaw(ReviewGates),
      },
    ]
    return { items, stop: null as null | (() => void) }
  },
  mounted() {
    this.stop = reveal(this.$refs.root as HTMLElement)
  },
  beforeUnmount() {
    this.stop?.()
  },
})
</script>

<style scoped>
.caps {
  padding-block: clamp(5rem, 12vw, 10rem);
  background: var(--bg-deep);
  border-block: 1px solid var(--border);
}
.caps__list {
  display: grid;
  gap: clamp(3.5rem, 8vw, 7rem);
  margin-top: clamp(3rem, 8vw, 6rem);
}
.caps__item {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: clamp(1rem, 2vw, 2rem);
  row-gap: 1.5rem;
  align-items: start;
}
.caps__text {
  grid-column: 1 / span 4;
}
.caps__demo {
  grid-column: 6 / span 6;
  padding: 1.25rem;
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  border: 1px solid var(--border);
}
.caps__item--shift .caps__text {
  grid-column: 2 / span 4;
}
.caps__item--shift .caps__demo {
  grid-column: 7 / span 6;
}
.caps__title {
  font-size: var(--step-3);
  margin: 0.6rem 0 0.75rem;
}
.caps__body {
  margin: 0 0 1rem;
  color: var(--text-muted);
}
.caps__points {
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--font-mono);
  font-size: var(--step--2);
  letter-spacing: 0.04em;
  display: grid;
  gap: 0.35rem;
}
.caps__points li::before {
  content: '· ';
  color: var(--accent-ink);
}
@media (max-width: 1099px) {
  .caps__text,
  .caps__item--shift .caps__text,
  .caps__demo,
  .caps__item--shift .caps__demo {
    grid-column: 1 / -1;
  }
}
</style>
