<template>
  <footer class="footer">
    <div class="shell footer__inner">
      <p class="caption">© {{ year }} {{ name }}</p>
      <p class="caption footer__colophon">
        Set in Instrument Serif, Geist &amp; Geist Mono.
      </p>
      <a href="#top" class="caption footer__top" @click.prevent="toTop">Back to top ↑</a>
    </div>
  </footer>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { profile } from '@/config/profile'

export default defineComponent({
  name: 'SiteFooter',
  data() {
    return { name: profile.name, year: new Date().getFullYear() }
  },
  methods: {
    toTop() {
      window.scrollTo({ top: 0 })
      ;(document.getElementById('main') as HTMLElement | null)?.focus({ preventScroll: true })
    },
  },
})
</script>

<style scoped>
.footer {
  padding: 2rem 0 calc(2rem + 5rem);
  border-top: 1px solid var(--border);
}
@media (min-width: 900px) {
  .footer {
    padding-bottom: 2rem;
  }
}
.footer__inner {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.75rem 2rem;
}
.footer__inner p {
  margin: 0;
}
.footer__colophon {
  max-width: 60ch;
  text-transform: none;
  letter-spacing: 0.02em;
}
.footer__top {
  color: var(--text);
  text-decoration: none;
}
</style>
