<template>
  <div class="prefs" :class="{ 'prefs--stacked': stacked }">
    <div class="prefs__row">
      <p :id="themeId" class="caption">Appearance</p>
      <SegmentedControl
        :options="themeOptions"
        :model-value="ready ? theme : null"
        label="Colour theme"
        icon-only
        @update:model-value="onTheme"
      />
    </div>
    <div class="prefs__row">
      <p :id="motionId" class="caption">Motion</p>
      <SegmentedControl
        :options="motionOptions"
        :model-value="ready ? motion : null"
        label="Motion intensity"
        @update:model-value="onMotion"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import SegmentedControl, { type SegmentOption } from './SegmentedControl.vue'
import {
  preferences,
  setMotion,
  setTheme,
  motionLabels,
  type MotionLevel,
  type ThemeChoice,
} from '@/services/preferences'

let uid = 0

/** Theme + motion intensity controls. Values only render after mount to keep hydration exact. */
export default defineComponent({
  name: 'PreferenceControls',
  components: { SegmentedControl },
  props: {
    stacked: { type: Boolean, default: false },
  },
  data() {
    uid++
    return {
      ready: false,
      themeId: `prefs-theme-${uid}`,
      motionId: `prefs-motion-${uid}`,
      themeOptions: [
        { value: 'system', label: 'System', icon: 'system' },
        { value: 'light', label: 'Light', icon: 'sun' },
        { value: 'dark', label: 'Dark', icon: 'moon' },
      ] as SegmentOption[],
      motionOptions: (Object.keys(motionLabels) as MotionLevel[]).map((k) => ({
        value: k,
        label: motionLabels[k].label,
        hint: motionLabels[k].hint,
      })) as SegmentOption[],
    }
  },
  computed: {
    theme(): ThemeChoice {
      return preferences.theme
    },
    motion(): MotionLevel {
      return preferences.motion
    },
  },
  mounted() {
    this.ready = true
  },
  methods: {
    onTheme(v: string) {
      setTheme(v as ThemeChoice)
    },
    onMotion(v: string) {
      setMotion(v as MotionLevel)
    },
  },
})
</script>

<style scoped>
.prefs {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.prefs--stacked {
  flex-direction: column;
  gap: 1rem;
}
.prefs__row {
  display: grid;
  gap: 0.45rem;
}
.prefs__row .caption {
  margin: 0;
}
</style>
