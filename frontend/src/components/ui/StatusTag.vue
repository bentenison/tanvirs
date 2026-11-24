<template>
  <span class="status caption" :class="`status--${status}`">
    <span class="status__dot" aria-hidden="true" />
    {{ label }}
  </span>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import type { ProjectStatus } from '@/config/types'
import { statusLabels } from '@/config/projects'

export default defineComponent({
  name: 'StatusTag',
  props: {
    status: { type: String as PropType<ProjectStatus>, required: true },
  },
  computed: {
    label(): string {
      return statusLabels[this.status]
    },
  },
})
</script>

<style scoped>
.status {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  color: var(--text);
}
.status__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--text-faint);
}
.status--released .status__dot {
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.status--in-development .status__dot {
  background: transparent;
  border: 1.5px solid var(--accent-ink);
}
.status--experimental .status__dot {
  background: var(--tension);
}
</style>
