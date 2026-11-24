<template>
  <div class="home">
    <HeroStage />
    <WorkSection />
    <CapabilitiesSection />
    <PlaygroundSection />
    <AboutSection />
    <WritingSection />
    <ContactSection />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import HeroStage from '@/components/sections/HeroStage.vue'
import WorkSection from '@/components/sections/WorkSection.vue'
import CapabilitiesSection from '@/components/sections/CapabilitiesSection.vue'
import PlaygroundSection from '@/components/sections/PlaygroundSection.vue'
import AboutSection from '@/components/sections/AboutSection.vue'
import WritingSection from '@/components/sections/WritingSection.vue'
import ContactSection from '@/components/sections/ContactSection.vue'

export default defineComponent({
  name: 'HomeView',
  components: {
    HeroStage,
    WorkSection,
    CapabilitiesSection,
    PlaygroundSection,
    AboutSection,
    WritingSection,
    ContactSection,
  },
})
</script>
