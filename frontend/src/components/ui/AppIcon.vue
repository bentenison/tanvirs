<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'

/**
 * Custom icon set, 24px grid, 1.5 stroke, round joins, optically centred.
 * Drawn for this site; no third-party icon font.
 */
const ICONS = {
  'arrow-right': ['M4.5 12h14', 'M13 6.5 18.5 12 13 17.5'],
  'arrow-up-right': ['M7 17 17 7', 'M8.5 7H17v8.5'],
  'arrow-left': ['M19.5 12h-14', 'M11 6.5 5.5 12l5.5 5.5'],
  'arrow-down': ['M12 4.5v14', 'M6.5 13 12 18.5 17.5 13'],
  mail: ['M3.75 6.75h16.5v10.5H3.75z', 'm4.25 7.25 7.75 6 7.75-6'],
  github: [
    'M9 19.5c-4 1.2-4-2-5.5-2.5',
    'M15 21.5v-3.2c0-.9-.3-1.6-.8-2.1 2.7-.3 5.5-1.3 5.5-6a4.7 4.7 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6.2 0C6.4 3.5 5.4 3.8 5.4 3.8a4.3 4.3 0 0 0-.1 3.2A4.7 4.7 0 0 0 4 10.2c0 4.6 2.8 5.7 5.5 6-.5.5-.8 1.2-.8 2.1v3.2',
  ],
  linkedin: ['M4.5 9.5v10', 'M4.5 5.25v.01', 'M9 19.5v-10', 'M9 13.5a4 4 0 0 1 8 0v6', 'M17 19.5v-6'],
  sun: ['M12 16.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5z', 'M12 2.75v1.5M12 19.75v1.5M2.75 12h1.5M19.75 12h1.5M5.4 5.4l1.06 1.06M17.54 17.54l1.06 1.06M5.4 18.6l1.06-1.06M17.54 6.46 18.6 5.4'],
  moon: ['M19.5 14.5A7.75 7.75 0 0 1 9.5 4.5a7.75 7.75 0 1 0 10 10z'],
  system: ['M3.75 5.25h16.5v11H3.75z', 'M9 19.5h6', 'M12 16.25v3.25'],
  motion: ['M3.5 12c2.5 0 2.5-5 5-5s2.5 10 5 10 2.5-5 5-5h2'],
  menu: ['M4.5 8.5h15', 'M4.5 15.5h15'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  check: ['m5 12.5 4.5 4.5L19 7.5'],
  play: ['M7.5 5.5v13l11-6.5z'],
  pause: ['M8 5.5v13', 'M16 5.5v13'],
  reset: ['M4.5 12a7.5 7.5 0 1 0 2.2-5.3', 'M4.5 4.5v3.75h3.75'],
  external: ['M13.5 4.5h6v6', 'M19.5 4.5 11 13', 'M17.5 13.5v6h-13v-13h6'],
  copy: ['M8.5 8.5h11v11h-11z', 'M15.5 8.5v-4h-11v11h4'],
  download: ['M12 4.5v11', 'M7 10.5l5 5 5-5', 'M4.5 19.5h15'],
  settings: ['M4.5 7.5h9', 'M17.5 7.5h2', 'M15.5 5.5v4', 'M4.5 16.5h2', 'M10.5 16.5h9', 'M8.5 14.5v4'],
  drag: ['M9 5.5v.01', 'M15 5.5v.01', 'M9 12v.01', 'M15 12v.01', 'M9 18.5v.01', 'M15 18.5v.01'],
  pointer: ['M6.5 4.5 18 12l-5 1.5L10.5 19z'],
  dot: ['M12 12v.01'],
  search: ['M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z', 'm15.5 15.5 4 4'],
} as const

export type IconName = keyof typeof ICONS

export default defineComponent({
  name: 'AppIcon',
  props: {
    name: { type: String as PropType<IconName>, required: true },
    size: { type: [Number, String], default: 20 },
    stroke: { type: [Number, String], default: 1.5 },
  },
  computed: {
    paths(): readonly string[] {
      return ICONS[this.name] ?? []
    },
  },
})
</script>

<style scoped>
.app-icon {
  flex: none;
  overflow: visible;
}
</style>
