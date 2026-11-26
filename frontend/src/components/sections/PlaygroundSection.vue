<template>
  <section id="playground" class="pg" aria-labelledby="pg-title">
    <div class="shell">
      <SectionHeading id="pg-title" index="05" kicker="Engineering playground">
        Experiments in <em>how</em> systems behave.
        <template #lede>Four simulations of the problems I think about most. Each runs on its own page so this one stays light.</template>
      </SectionHeading>

      <ul class="pg__grid" role="list">
        <li v-for="d in demos" :key="d.id">
          <RouterLink :to="`/playground#sim-${d.id}`" class="pg__card">
            <span class="mono pg__idx">§05.{{ d.index }}</span>
            <span class="pg__label">{{ d.label }}</span>
            <span class="pg__blurb">{{ d.blurb }}</span>
            <AppIcon name="arrow-right" :size="18" class="pg__arrow" />
          </RouterLink>
        </li>
      </ul>

      <div class="pg__foot">
        <MagneticButton to="/playground" icon="arrow-right">Open the playground</MagneticButton>
      </div>
      <NextLink href="#about" label="About" />
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { RouterLink } from 'vue-router'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import MagneticButton from '@/components/ui/MagneticButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import NextLink from '@/components/ui/NextLink.vue'
import { playgroundDemos } from '@/components/playground/demos'

/**
 * Home page teaser. The simulations themselves live on /playground, so the
 * home page shows what exists and how to reach it, without their weight.
 */
export default defineComponent({
  name: 'PlaygroundSection',
  components: { RouterLink, SectionHeading, MagneticButton, AppIcon, NextLink },
  data() {
    return { demos: playgroundDemos.map(({ id, index, label, blurb }) => ({ id, index, label, blurb })) }
  },
})
</script>

<style scoped>
.pg {
  padding-block: clamp(5rem, 12vw, 10rem);
}
.pg__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  margin: clamp(2.5rem, 6vw, 4rem) 0 0;
  padding: 0;
  list-style: none;
}
.pg__card {
  position: relative;
  display: grid;
  gap: 0.4rem;
  height: 100%;
  padding: 1.25rem 1.25rem 3rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  transition: border-color var(--dur-fast, 160ms) ease, transform var(--dur-fast, 160ms) ease;
}
.pg__card:hover {
  border-color: var(--accent-ink);
  transform: translateY(-2px);
}
.pg__idx {
  font-size: var(--step--2);
  color: var(--accent-ink);
}
.pg__label {
  font-family: var(--font-display);
  font-size: var(--step-2);
  line-height: 1.1;
}
.pg__blurb {
  color: var(--text-muted);
  font-size: var(--step--1);
}
.pg__arrow {
  position: absolute;
  right: 1.25rem;
  bottom: 1.1rem;
  color: var(--text-faint);
}
.pg__card:hover .pg__arrow {
  color: var(--accent-ink);
}
.pg__foot {
  margin-top: 2rem;
}
@media (max-width: 1023px) {
  .pg__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 520px) {
  .pg__grid {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pg__card:hover {
    transform: none;
  }
}
</style>
