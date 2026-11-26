<template>
  <section id="work" ref="root" class="work" aria-labelledby="work-title">
    <div class="shell">
      <SectionHeading id="work-title" index="03" kicker="Selected work · independent products">
        Products I <em>designed</em>, built and run.
        <template #lede>
          {{ total }} products, each a single Go service with Vue and PostgreSQL. The surfaces are live re-creations you can
          use, on synthetic data.
        </template>
      </SectionHeading>

      <ProjectFeature
        v-for="(p, i) in features"
        :key="p.slug"
        :project="p"
        :number="String(i + 1).padStart(2, '0')"
        :mirror="i % 2 === 1"
        :next="nextAfter(i)"
      />

      <ProjectSpread v-if="compact.length" :projects="compact" :offset="features.length" />
      <NextLink :href="after.href" :label="after.label" />
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import ProjectFeature from '@/components/projects/ProjectFeature.vue'
import ProjectSpread from '@/components/projects/ProjectSpread.vue'
import NextLink from '@/components/ui/NextLink.vue'
import { featureProjects, compactProjects } from '@/config/projects'
import { reveal } from '@/engine/animation/reveal'
import { siteRuntime } from '@/services/site'

export default defineComponent({
  name: 'WorkSection',
  components: { SectionHeading, ProjectFeature, ProjectSpread, NextLink },
  data() {
    return { features: featureProjects(), compact: compactProjects(), ask: true, stop: null as null | (() => void) }
  },
  computed: {
    total(): string {
      const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six']
      const n = this.features.length + this.compact.length
      return words[n] ?? String(n)
    },
    // Where the work ends: Ask when the server enables it, otherwise Capabilities.
    after(): { href: string; label: string } {
      return this.ask ? { href: '#ask', label: 'Ask my portfolio' } : { href: '#capabilities', label: 'Capabilities' }
    },
  },
  mounted() {
    this.ask = siteRuntime().ask
    this.stop = reveal(this.$refs.root as HTMLElement)
  },
  beforeUnmount() {
    this.stop?.()
  },
  methods: {
    // Each project points at the next one, so the four read as one path.
    nextAfter(i: number): { href: string; label: string } | null {
      const f = this.features[i + 1]
      if (f) return { href: `#project-${f.slug}`, label: f.name }
      if (this.compact.length) return { href: `#project-${this.compact[0].slug}`, label: this.compact.map((p) => p.name).join(' and ') }
      return null
    },
  },
})
</script>

<style scoped>
.work {
  padding-top: clamp(5rem, 12vw, 10rem);
}
</style>
