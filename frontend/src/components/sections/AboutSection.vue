<template>
  <section id="about" ref="root" class="about" aria-labelledby="about-title">
    <div class="shell about__grid">
      <div class="about__head">
        <SectionHeading id="about-title" index="06" kicker="About">
          Software from the <em>database</em> up.
        </SectionHeading>
        <dl class="about__facts" data-reveal>
          <div><dt class="caption">Focus</dt><dd>{{ profile.title }}</dd></div>
          <div><dt class="caption">Experience</dt><dd>{{ profile.experience }}</dd></div>
          <div v-if="profile.location"><dt class="caption">Based in</dt><dd>{{ profile.location }}</dd></div>
          <div><dt class="caption">Core stack</dt><dd>Go · Vue · PostgreSQL</dd></div>
        </dl>
      </div>

      <div class="about__body">
        <div class="about__prose prose">
          <p v-for="(p, i) in profile.biography" :key="i" data-reveal :class="{ 'about__first': i === 0 }">{{ p }}</p>
        </div>

        <ol class="about__principles" role="list">
          <li v-for="(pr, i) in profile.principles" :key="pr.title" class="about__principle" data-reveal>
            <span class="mono about__pidx">{{ String(i + 1).padStart(2, '0') }}</span>
            <h3 class="about__ptitle">{{ pr.title }}</h3>
            <p>{{ pr.body }}</p>
          </li>
        </ol>
        <NextLink href="#contact" label="Get in touch" />
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import NextLink from '@/components/ui/NextLink.vue'
import { profile } from '@/config/profile'
import { reveal } from '@/engine/animation/reveal'

export default defineComponent({
  name: 'AboutSection',
  components: { SectionHeading, NextLink },
  data() {
    return { profile, stop: null as null | (() => void) }
  },
  mounted() {
    this.stop = reveal(this.$refs.root as HTMLElement)
  },
  beforeUnmount() {
    this.stop?.()
  },
})
</script>

<style scoped>
.about {
  padding-block: clamp(5rem, 12vw, 10rem);
  border-top: 1px solid var(--border);
}
.about__grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: clamp(1rem, 2vw, 2rem);
  row-gap: 3rem;
}
.about__head {
  grid-column: 1 / span 5;
  align-self: start;
  position: sticky;
  top: calc(var(--nav-h) + 2rem);
}
.about__body {
  grid-column: 7 / span 6;
}
.about__facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem 1.5rem;
  margin: 3rem 0 0;
}
.about__facts dd {
  margin: 0.25rem 0 0;
  font-size: var(--step--1);
}
.about__prose {
  font-size: var(--step-0);
}
.about__first {
  font-family: var(--font-display);
  font-size: var(--step-2);
  line-height: 1.25;
}
.about__principles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem 2rem;
  margin: 4rem 0 0;
  padding: 0;
  list-style: none;
}
.about__principle {
  border-top: 1px solid var(--border-strong);
  padding-top: 1rem;
}
.about__pidx {
  font-size: var(--step--2);
  color: var(--accent-ink);
}
.about__ptitle {
  margin: 0.5rem 0;
  font-size: var(--step-1);
  font-weight: 500;
}
.about__principle p {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--step--1);
}
@media (max-width: 1023px) {
  .about__head,
  .about__body {
    grid-column: 1 / -1;
    position: static;
  }
}
@media (max-width: 600px) {
  .about__principles {
    grid-template-columns: 1fr;
  }
}
</style>
