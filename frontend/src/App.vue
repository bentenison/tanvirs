<template>
  <div id="top" class="app grain">
    <a class="skip-link" href="#main">Skip to content</a>
    <SiteNav />
    <main id="main" tabindex="-1">
      <RouterView v-slot="{ Component, route }">
        <component :is="Component" :key="route.name === 'project' ? route.fullPath.split('#')[0] : route.name" />
      </RouterView>
    </main>
    <SiteFooter />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { RouterView } from 'vue-router'
import SiteNav from '@/components/navigation/SiteNav.vue'
import SiteFooter from '@/components/sections/SiteFooter.vue'
import { applyHead } from '@/services/head'

export default defineComponent({
  name: 'App',
  components: { RouterView, SiteNav, SiteFooter },
  watch: {
    '$route.path'(path: string) {
      applyHead(path)
    },
  },
})
</script>

<style>
#main:focus {
  outline: none;
}
</style>
