<template>
  <div class="home">
    <HeroStage />
    <WorkSection />
    <AskSection />
    <CapabilitiesSection />
    <PlaygroundSection />
    <AboutSection />
    <WritingSection />
    <ContactSection />
  </div>
</template>

<script lang="ts">
import { defineAsyncComponent, defineComponent, hydrateOnVisible, type Component } from 'vue'
import HeroStage from '@/components/sections/HeroStage.vue'
import WritingSection from '@/components/sections/WritingSection.vue'

/**
 * Below-the-fold sections are server-rendered as complete HTML, but their
 * JavaScript loads and hydrates only when they approach the viewport.
 * This keeps the first interaction fast without hiding any content.
 */
const lazy = (loader: () => Promise<{ default: Component }>) =>
  defineAsyncComponent({ loader, hydrate: hydrateOnVisible({ rootMargin: '400px' }) })

export default defineComponent({
  name: 'HomeView',
  components: {
    HeroStage,
    WritingSection,
    AskSection: lazy(() => import('@/components/sections/AskSection.vue')),
    WorkSection: lazy(() => import('@/components/sections/WorkSection.vue')),
    CapabilitiesSection: lazy(() => import('@/components/sections/CapabilitiesSection.vue')),
    PlaygroundSection: lazy(() => import('@/components/sections/PlaygroundSection.vue')),
    AboutSection: lazy(() => import('@/components/sections/AboutSection.vue')),
    ContactSection: lazy(() => import('@/components/sections/ContactSection.vue')),
  },
})
</script>
