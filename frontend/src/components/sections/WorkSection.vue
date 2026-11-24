<template>
  <section id="work" ref="root" class="work" aria-labelledby="work-title">
    <div class="shell">
      <SectionHeading id="work-title" index="03" kicker="Selected work · independent products">
        Products I <em>designed</em>, built and run.
        <template #lede>
          Each one is a complete product: a single Go service, a Vue front end and PostgreSQL. The surfaces below are
          live, simplified re-creations you can use, running on synthetic data.
        </template>
      </SectionHeading>

      <ProjectFeature
        v-for="(p, i) in features"
        :key="p.slug"
        :project="p"
        :number="String(i + 1).padStart(2, '0')"
        :mirror="i % 2 === 1"
      />

      <ProjectSpread v-if="compact.length" :projects="compact" :offset="features.length" />
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import ProjectFeature from '@/components/projects/ProjectFeature.vue'
import ProjectSpread from '@/components/projects/ProjectSpread.vue'
import { featureProjects, compactProjects } from '@/config/projects'
import { reveal } from '@/engine/animation/reveal'

export default defineComponent({
  name: 'WorkSection',
  components: { SectionHeading, ProjectFeature, ProjectSpread },
  data() {
    return { features: featureProjects(), compact: compactProjects(), stop: null as null | (() => void) }
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
.work {
  padding-top: clamp(5rem, 12vw, 10rem);
}
</style>
