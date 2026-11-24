<template>
  <section class="nf shell" aria-labelledby="nf-title">
    <div class="nf__organism" aria-hidden="true">
      <svg viewBox="-60 -60 120 120">
        <path class="nf__body" d="M0-38c18 0 22 14 33 20s8 24-2 32-16 22-34 22S-20 26-30 18-38-6-30-18-18-38 0-38z" />
        <circle class="nf__detached" cx="52" cy="-30" r="9" />
        <circle class="nf__nucleus" r="10" />
      </svg>
    </div>
    <p class="margin-note"><b>404</b><span>Not found</span></p>
    <h1 id="nf-title" class="nf__title display">This lobe <em>detached</em>.</h1>
    <p class="nf__text lede">The page you were looking for isn’t part of the organism. It may have moved, or never existed.</p>
    <div class="nf__actions">
      <MagneticButton to="/" icon="arrow-right">Back to the start</MagneticButton>
      <MagneticButton to="/#work" variant="outline">See the work</MagneticButton>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import MagneticButton from '@/components/ui/MagneticButton.vue'

export default defineComponent({
  name: 'NotFoundView',
  components: { MagneticButton },
})
</script>

<style scoped>
.nf {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-top: var(--nav-h);
  padding-bottom: 6rem;
}
.nf__organism {
  width: 9rem;
  margin-bottom: 2rem;
}
.nf__body {
  fill: var(--organism-body);
}
.nf__detached {
  fill: var(--tension);
  animation: drift 6s ease-in-out infinite;
}
.nf__nucleus {
  fill: var(--accent);
}
.nf__title {
  font-size: var(--step-5);
  margin: 1rem 0;
}
.nf__title em {
  color: var(--tension);
}
.nf__text {
  margin: 0 0 2rem;
}
.nf__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
@keyframes drift {
  50% {
    transform: translate(4px, -6px);
  }
}
:root[data-motion='reduced'] .nf__detached {
  animation: none;
}
</style>
