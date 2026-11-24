<template>
  <div class="pgv">
    <header class="pgv__hero shell">
      <RouterLink to="/#playground" class="pgv__back caption"><AppIcon name="arrow-left" :size="14" /> Back</RouterLink>
      <SectionHeading id="pgv-title" index="05" kicker="Engineering playground" level="h1">
        Four systems, <em>under load</em>.
        <template #lede>
          Deterministic simulations of a worker pool, a connection pool, a cache and a RAG pipeline. Simulated time and
          synthetic data. They explain behaviour; they do not benchmark anything.
        </template>
      </SectionHeading>
    </header>
    <div class="pgv__list shell">
      <component :is="d.component" v-for="d in demos" :key="d.id" :index="`§05.${d.index}`" class="pgv__demo" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, markRaw } from 'vue'
import { RouterLink } from 'vue-router'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { playgroundDemos } from '@/components/playground/demos'

export default defineComponent({
  name: 'PlaygroundView',
  components: { RouterLink, SectionHeading, AppIcon },
  data() {
    return { demos: playgroundDemos.map((d) => ({ ...d, component: markRaw(d.component) })) }
  },
})
</script>

<style scoped>
.pgv__hero {
  padding-top: calc(var(--nav-h) + clamp(2.5rem, 7vw, 6rem));
  padding-bottom: clamp(3rem, 7vw, 5rem);
}
.pgv__back {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 2.5rem;
  color: var(--text);
  text-decoration: none;
}
.pgv__list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: clamp(4rem, 9vw, 8rem);
  padding-bottom: clamp(5rem, 10vw, 9rem);
}
.pgv__demo + .pgv__demo {
  padding-top: clamp(4rem, 9vw, 8rem);
  border-top: 1px solid var(--border);
}
</style>
