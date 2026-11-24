<template>
  <section v-if="articles.length" id="writing" class="writing" aria-labelledby="writing-title">
    <div class="shell">
      <SectionHeading id="writing-title" index="06b" kicker="Writing & experiments">Notes from the <em>workbench</em>.</SectionHeading>
      <ul class="writing__list" role="list">
        <li v-for="a in sorted" :key="a.url" class="writing__item">
          <a :href="a.url" class="writing__link" target="_blank" rel="noopener noreferrer">
            <span class="caption">{{ a.topic }} · <time :datetime="a.date">{{ format(a.date) }}</time></span>
            <span class="writing__title display">{{ a.title }}</span>
            <span class="sr-only">(opens in a new tab)</span>
          </a>
        </li>
      </ul>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import { articles } from '@/config/site'
import type { Article } from '@/config/types'

/** Renders only when real, published articles are configured. */
export default defineComponent({
  name: 'WritingSection',
  components: { SectionHeading },
  data() {
    return { articles }
  },
  computed: {
    sorted(): Article[] {
      return [...this.articles].sort((a, b) => b.date.localeCompare(a.date))
    },
  },
  methods: {
    format(d: string) {
      return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' })
    },
  },
})
</script>

<style scoped>
.writing {
  padding-block: clamp(4rem, 10vw, 8rem);
  border-top: 1px solid var(--border);
}
.writing__list {
  margin: 3rem 0 0;
  padding: 0;
  list-style: none;
}
.writing__link {
  display: grid;
  gap: 0.4rem;
  padding: 1.5rem 0;
  border-bottom: 1px solid var(--border);
  text-decoration: none;
  color: var(--text);
}
.writing__title {
  font-size: var(--step-3);
  transition: transform var(--dur-premium) var(--ease-premium);
}
.writing__link:hover .writing__title {
  transform: translateX(0.5rem);
  font-style: italic;
}
</style>
