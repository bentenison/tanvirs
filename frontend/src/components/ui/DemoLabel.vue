<template>
  <p class="demo-label caption">
    <span class="demo-label__mark" aria-hidden="true">◇</span>
    <slot>Simulated demo · synthetic data</slot>
  </p>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

/** Mandatory label for every simulated surface or playground. */
export default defineComponent({ name: 'DemoLabel' })
</script>

<style scoped>
.demo-label {
  margin: 0;
  display: inline-flex;
  gap: 0.5em;
  align-items: center;
}
.demo-label__mark {
  color: var(--accent-ink);
}
</style>
