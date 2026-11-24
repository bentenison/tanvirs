<template>
  <header class="shead" :class="{ 'shead--center': center }">
    <p class="shead__note margin-note" data-reveal>
      <b>§{{ index }}</b><span>{{ kicker }}</span>
    </p>
    <component :is="level" :id="id" class="shead__title display" data-reveal>
      <slot />
    </component>
    <p v-if="$slots.lede" class="shead__lede lede" data-reveal>
      <slot name="lede" />
    </p>
  </header>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'

/** Journal-style section heading: margin index, serif title, optional lede. */
export default defineComponent({
  name: 'SectionHeading',
  props: {
    index: { type: String, required: true },
    kicker: { type: String, required: true },
    id: { type: String, default: undefined },
    level: { type: String as PropType<'h1' | 'h2' | 'h3'>, default: 'h2' },
    center: { type: Boolean, default: false },
  },
})
</script>

<style scoped>
.shead {
  display: grid;
  gap: 1.1rem;
  max-width: 60rem;
}
.shead--center {
  margin-inline: auto;
  text-align: center;
  justify-items: center;
}
.shead__title {
  font-size: var(--step-5);
  margin: 0;
}
.shead__title :deep(em) {
  color: var(--accent-ink);
}
.shead__lede {
  margin: 0.4rem 0 0;
  max-width: 44ch;
}
</style>
