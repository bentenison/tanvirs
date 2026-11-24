<template>
  <RouterLink v-if="to" :to="to" class="ilink" :class="{ 'ilink--quiet': quiet }">
    <span class="ilink__text"><slot /></span>
    <AppIcon v-if="icon" :name="icon" :size="16" />
  </RouterLink>
  <a
    v-else
    :href="href"
    class="ilink"
    :class="{ 'ilink--quiet': quiet }"
    v-bind="external ? { target: '_blank', rel: 'noopener noreferrer' } : {}"
  >
    <span class="ilink__text"><slot /></span>
    <AppIcon v-if="icon" :name="icon" :size="16" />
    <span v-if="external" class="sr-only">(opens in a new tab)</span>
  </a>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon, { type IconName } from './AppIcon.vue'

/** Inline link whose underline draws from the left and retracts to the right. */
export default defineComponent({
  name: 'InteractiveLink',
  components: { AppIcon, RouterLink },
  props: {
    to: { type: String, default: '' },
    href: { type: String, default: '' },
    external: { type: Boolean, default: false },
    quiet: { type: Boolean, default: false },
    icon: { type: String as PropType<IconName | ''>, default: '' },
  },
})
</script>

<style scoped>
.ilink {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  color: var(--text);
  text-decoration: none;
  font-weight: 500;
}
.ilink__text {
  background-image: linear-gradient(currentColor, currentColor);
  background-size: 100% 1px;
  background-position: 0 100%;
  background-repeat: no-repeat;
  padding-bottom: 1px;
  transition: background-size var(--dur-premium) var(--ease-premium);
}
.ilink--quiet .ilink__text {
  background-size: 0% 1px;
}
.ilink:hover .ilink__text {
  background-size: 0% 1px;
  background-position: 100% 100%;
}
.ilink--quiet:hover .ilink__text {
  background-size: 100% 1px;
  background-position: 0 100%;
}
.ilink:hover {
  color: var(--interactive-hover);
}
.ilink :deep(svg) {
  transition: transform var(--dur-premium) var(--ease-premium);
}
.ilink:hover :deep(svg) {
  transform: translate(2px, -2px);
}
</style>
