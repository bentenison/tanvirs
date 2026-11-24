<template>
  <section :id="id" ref="root" class="sim" :aria-labelledby="`${id}-title`">
    <header class="sim__head">
      <div>
        <p class="margin-note"><b>{{ index }}</b><span>{{ kicker }}</span></p>
        <h3 :id="`${id}-title`" class="sim__title display">{{ title }}</h3>
      </div>
      <p class="sim__desc">{{ description }}</p>
    </header>
    <div class="sim__body">
      <div class="sim__viz">
        <slot name="viz" />
      </div>
      <div class="sim__side">
        <div class="sim__controls" role="group" :aria-label="`${title} controls`">
          <slot name="controls" />
        </div>
        <dl class="sim__stats" aria-live="off">
          <slot name="stats" />
        </dl>
      </div>
    </div>
    <footer class="sim__foot">
      <DemoLabel>Deterministic simulation · simulated time, not a benchmark</DemoLabel>
      <p v-if="$slots.insight" class="sim__insight" role="status"><slot name="insight" /></p>
    </footer>
  </section>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import DemoLabel from '@/components/ui/DemoLabel.vue'

/** Shared layout for playground simulations: visual, controls, live stats, honest labelling. */
export default defineComponent({
  name: 'SimShell',
  components: { DemoLabel },
  props: {
    id: { type: String, required: true },
    index: { type: String, required: true },
    kicker: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
  },
})
</script>

<style scoped>
.sim {
  display: grid;
  gap: 1.75rem;
  min-width: 0;
}
.sim__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem 3rem;
  align-items: end;
}
.sim__title {
  margin: 0.6rem 0 0;
  font-size: var(--step-4);
}
.sim__desc {
  margin: 0;
  color: var(--text-muted);
  max-width: 48ch;
}
.sim__body {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(16rem, 1fr);
  gap: 1.5rem;
}
.sim__viz {
  position: relative;
  min-height: 20rem;
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
}
.sim__side {
  min-width: 0;
  display: grid;
  gap: 1.25rem;
  align-content: start;
}
.sim__controls {
  min-width: 0;
  display: grid;
  gap: 1rem;
}
.sim__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 1rem;
  margin: 0;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}
.sim__stats :deep(div) {
  display: grid;
  gap: 0.1rem;
}
.sim__stats :deep(dt) {
  font-family: var(--font-mono);
  font-size: var(--step--2);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.sim__stats :deep(dd) {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--step-1);
  font-variant-numeric: tabular-nums;
}
.sim__stats :deep(dd.is-tension) {
  color: var(--tension);
}
.sim__foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem 2rem;
  align-items: baseline;
}
.sim__insight {
  margin: 0;
  max-width: 60ch;
  font-size: var(--step--1);
}
@media (max-width: 899px) {
  .sim__head,
  .sim__body {
    grid-template-columns: 1fr;
  }
  .sim__viz {
    min-height: 15rem;
  }
}
</style>
