<template>
  <section id="playground" class="pg" aria-labelledby="pg-title">
    <div class="shell">
      <SectionHeading id="pg-title" index="05" kicker="Engineering playground">
        Experiments in <em>how</em> systems behave.
        <template #lede>Four deterministic simulations of the problems I think about most. Change a parameter and watch the system respond.</template>
      </SectionHeading>

      <TabsRoot v-model="tab" class="pg__tabs" activation-mode="manual">
        <TabsList class="pg__list" aria-label="Simulations">
          <TabsTrigger v-for="t in tabs" :key="t.id" :value="t.id" class="pg__trigger">
            <span class="mono pg__tidx">{{ t.index }}</span>{{ t.label }}
          </TabsTrigger>
        </TabsList>
        <TabsContent v-for="t in tabs" :key="t.id" :value="t.id" class="pg__panel">
          <component :is="t.component" :index="`§05.${t.index}`" />
        </TabsContent>
      </TabsRoot>

      <p class="pg__more">
        <InteractiveLink to="/playground" icon="arrow-right">Open all four side by side</InteractiveLink>
      </p>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent, markRaw } from 'vue'
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import InteractiveLink from '@/components/ui/InteractiveLink.vue'
import { playgroundDemos } from '@/components/playground/demos'

/** Inactive tab panels unmount, so only one simulation runs at a time. */
export default defineComponent({
  name: 'PlaygroundSection',
  components: { TabsRoot, TabsList, TabsTrigger, TabsContent, SectionHeading, InteractiveLink },
  data() {
    return {
      tab: playgroundDemos[0].id,
      tabs: playgroundDemos.map((d) => ({ ...d, component: markRaw(d.component) })),
    }
  },
})
</script>

<style scoped>
.pg {
  padding-block: clamp(5rem, 12vw, 10rem);
}
.pg__tabs {
  margin-top: clamp(2.5rem, 6vw, 4.5rem);
}
.pg__list {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 2.5rem;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--border);
}
.pg__trigger {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  gap: 0.5rem;
  min-height: 3rem;
  padding: 0 1rem;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--step--1);
  white-space: nowrap;
  cursor: pointer;
}
.pg__trigger::after {
  content: '';
  position: absolute;
  left: 0.6rem;
  right: 0.6rem;
  bottom: -1px;
  height: 2px;
  background: var(--text);
  transform: scaleX(0);
  transition: transform var(--dur-premium) cubic-bezier(0.2, 1.3, 0.3, 1);
}
.pg__trigger[data-state='active'] {
  color: var(--text);
}
.pg__trigger[data-state='active']::after {
  transform: scaleX(1);
}
.pg__tidx {
  font-size: 0.68rem;
}
.pg__panel:focus-visible {
  outline-offset: 8px;
}
.pg__more {
  margin: 3rem 0 0;
}
</style>
