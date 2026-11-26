<template>
  <p class="next">
    <a :href="href" class="next__link">
      <span class="caption next__label">Next</span>
      <span class="next__title">{{ label }}</span>
      <AppIcon name="arrow-down" :size="16" />
    </a>
  </p>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import AppIcon from './AppIcon.vue'

/** End-of-section pointer to what comes next, so the page reads as one path. */
export default defineComponent({
  name: 'NextLink',
  components: { AppIcon },
  props: {
    href: { type: String, required: true },
    label: { type: String, required: true },
  },
})
</script>

<style scoped>
.next {
  margin: 2.5rem 0 0;
}
.next__link {
  display: inline-flex;
  align-items: baseline;
  gap: 0.75rem;
  min-height: 2.75rem;
  padding: 0.6rem 0;
  color: var(--text);
  text-decoration: none;
  border-bottom: 1px solid var(--border-strong);
  transition: border-color var(--dur-fast, 160ms) ease, color var(--dur-fast, 160ms) ease;
}
.next__link:hover {
  color: var(--accent-ink);
  border-color: var(--accent-ink);
}
.next__label {
  color: var(--text-faint);
}
.next__title {
  font-size: var(--step-0);
}
.next__link :deep(.app-icon) {
  align-self: center;
}
</style>
