<template>
  <div class="stage" :class="{ 'has-selection': !!selected }">
    <div class="stage__organism" aria-label="Interactive engineering organism" role="group">
      <EngineeringOrganism :mode="mode" :selected="selected" @select="select" />
      <div class="stage__panel">
        <DomainPanel :id="panelId" :selected="selected" @close="select(null)" />
      </div>
    </div>

    <div class="stage__text">
      <section class="hero" aria-labelledby="hero-title">
        <p class="hero__meta margin-note">
          <b>§01</b><span>{{ profile.title }}</span><span class="hero__sep" aria-hidden="true">/</span><span>{{ profile.experience }}</span>
        </p>
        <h1 id="hero-title" class="hero__title display">
          <span class="hero__line" data-line>{{ profile.headline.lead }}</span>
          <span class="hero__line" data-line><em>{{ profile.headline.emphasis }}</em> {{ profile.headline.tail }}</span>
        </h1>
        <p class="hero__name">
          <span class="mono caption">{{ profile.name }}</span>
          <span v-if="availability" class="hero__avail caption"><span class="hero__avail-dot" aria-hidden="true" />{{ availability }}</span>
        </p>
        <p class="hero__intro lede">{{ profile.introduction }}</p>
        <div class="hero__ctas">
          <MagneticButton to="/#work" size="lg" icon="arrow-down">See the work</MagneticButton>
          <MagneticButton to="/#about" variant="outline" size="lg">About me</MagneticButton>
          <MagneticButton to="/#contact" variant="quiet" size="lg" icon="arrow-right">Get in touch</MagneticButton>
        </div>
        <DomainIndex class="hero__index" :selected="selected" :panel-id="panelId" :active-domains="activeDomains" @select="select" />
      </section>

      <section class="eco" aria-labelledby="eco-title">
        <h2 id="eco-title" class="sr-only">How the ecosystem fits together</h2>
        <article
          v-for="(step, i) in steps"
          :key="step.key"
          ref="steps"
          class="eco__step"
          :data-step="i"
          :class="{ 'is-current': current === i }"
        >
          <p class="margin-note"><b>§02.{{ i + 1 }}</b><span>{{ step.kicker }}</span></p>
          <h3 class="eco__title display" v-html="step.title" />
          <p class="eco__body">{{ step.body }}</p>
          <div v-if="step.key === 'product'" class="eco__products" role="group" aria-label="Show the shape of a product">
            <button
              v-for="p in projects"
              :key="p.slug"
              type="button"
              class="eco__product"
              :aria-pressed="productSlug === p.slug ? 'true' : 'false'"
              @click="productSlug = p.slug"
            >
              {{ p.name }}
            </button>
          </div>
          <p v-if="step.key === 'product'" class="eco__note caption">
            {{ productNote }}
          </p>
        </article>
      </section>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, markRaw } from 'vue'
import EngineeringOrganism, { type Selection } from '@/components/organism/EngineeringOrganism.vue'
import DomainIndex from '@/components/organism/DomainIndex.vue'
import DomainPanel from '@/components/organism/DomainPanel.vue'
import MagneticButton from '@/components/ui/MagneticButton.vue'
import { profile, availabilityText } from '@/config/profile'
import { projects } from '@/config/projects'
import { domainById } from '@/config/technologies'
import type { DomainId } from '@/config/types'
import type { OrganismMode } from '@/engine/rendering/organism/model'

/**
 * §01 Hero + §02 Ecosystem share one stage: the organism stays pinned
 * (CSS sticky, native scrolling, never hijacked) while three short
 * steps scroll past and change its state.
 */
export default defineComponent({
  name: 'HeroStage',
  components: { EngineeringOrganism, DomainIndex, DomainPanel, MagneticButton },
  data() {
    return {
      profile,
      projects,
      availability: availabilityText(),
      selected: null as Selection,
      current: -1,
      productSlug: projects[0].slug,
      panelId: 'organism-panel',
      io: null as IntersectionObserver | null,
      steps: [
        {
          key: 'core',
          kicker: 'The core',
          title: 'Go at the <em>centre</em>.',
          body: 'Every product I build is a single Go service. It is the dense, steady core of the organism, the part that has to be fast, concurrent and boring in the best way.',
        },
        {
          key: 'domains',
          kicker: 'Eight domains, one body',
          title: 'Not a list of skills. <em>One</em> system.',
          body: 'Frontend, data, messaging, infrastructure, performance, tooling and AI are lobes of the same membrane. Pull one and the others feel it: that is what working on a real product is like.',
        },
        {
          key: 'product',
          kicker: 'Shaped by the product',
          title: 'Each product takes a <em>different</em> shape.',
          body: 'The same body reconfigures for every product. Pick one to see which parts of the organism it leans on.',
        },
      ],
    }
  },
  computed: {
    mode(): OrganismMode {
      if (this.current === 1) return { kind: 'domains' }
      if (this.current === 2) {
        const p = projects.find((x) => x.slug === this.productSlug)
        return { kind: 'product', domains: p?.domains ?? [] }
      }
      return { kind: 'whole' }
    },
    activeDomains(): DomainId[] | null {
      return this.mode.kind === 'product' ? this.mode.domains as DomainId[] : null
    },
    productNote(): string {
      const p = projects.find((x) => x.slug === this.productSlug)
      if (!p) return ''
      return `${p.name}: ${p.domains.map((d) => domainById(d).short).join(' · ')}`
    },
  },
  mounted() {
    const els = this.$refs.steps as HTMLElement[]
    this.io = markRaw(
      new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const i = Number((e.target as HTMLElement).dataset.step)
            if (e.isIntersecting) this.current = i
            else if (this.current === i && e.boundingClientRect.top > 0) this.current = i - 1
          }
        },
        { rootMargin: '-45% 0px -45% 0px' },
      ),
    )
    els.forEach((el) => this.io!.observe(el))
  },
  beforeUnmount() {
    this.io?.disconnect()
  },
  methods: {
    select(s: Selection) {
      this.selected = s
    },
  },
})
</script>

<style scoped>
.stage {
  position: relative;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: clamp(1rem, 2vw, 2rem);
  padding-inline: var(--gutter);
  max-width: 1680px;
  margin-inline: auto;
}
.stage__text {
  grid-column: 1 / span 5;
  grid-row: 1;
  position: relative;
  z-index: 2;
}
.stage__organism {
  grid-column: 6 / span 7;
  grid-row: 1;
  position: sticky;
  top: 0;
  height: 100svh;
  margin-right: calc(var(--gutter) * -1);
  z-index: 1;
}
.stage__panel {
  position: absolute;
  left: 8%;
  bottom: 2.5rem;
  z-index: 3;
  max-width: calc(100% - 2rem);
}

.hero {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-top: calc(var(--nav-h) + 2rem);
  padding-bottom: 3rem;
}
.hero__meta {
  margin: 0 0 1.75rem;
  flex-wrap: wrap;
  row-gap: 0.25rem;
}
.hero__sep {
  color: var(--border-strong);
}
.hero__title {
  /* Sized to stay inside its own column so it never sits on top of the organism. */
  font-size: clamp(3rem, 1.4rem + 4.6vw, 7.25rem);
  margin: 0;
  max-width: 100%;
  overflow-wrap: break-word;
}
.hero__line {
  display: block;
}
.hero__title em {
  color: var(--accent-ink);
}
.hero__name {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1.25rem;
  align-items: center;
  margin: 1.75rem 0 0.5rem;
}
.hero__name .mono {
  color: var(--text);
}
.hero__avail {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  color: var(--text);
}
.hero__avail-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.hero__intro {
  margin: 0.25rem 0 2rem;
}
.hero__ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.hero__index {
  margin-top: 2.75rem;
  max-width: 30rem;
}

.eco {
  padding-bottom: 20vh;
}
.eco__step {
  min-height: 82svh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 30rem;
  opacity: 0.38;
  transition: opacity var(--dur-premium) var(--ease-premium);
}
.eco__step.is-current {
  opacity: 1;
}
.eco__title {
  font-size: var(--step-4);
  margin: 1rem 0 1rem;
}
.eco__title :deep(em) {
  color: var(--accent-ink);
}
.eco__body {
  margin: 0;
  color: var(--text-muted);
}
.eco__products {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 1.5rem;
}
.eco__product {
  min-height: 2.5rem;
  padding: 0 1rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  font-size: var(--step--1);
  cursor: pointer;
}
.eco__product[aria-pressed='true'] {
  background: var(--text);
  color: var(--bg);
  border-color: var(--text);
}
.eco__note {
  margin-top: 1rem;
}

/* Mobile composition: organism owns the upper half; text reads below it. */
@media (max-width: 899px) {
  .stage {
    display: block;
    padding-inline: 0;
  }
  .stage__organism {
    position: sticky;
    top: 0;
    height: 50svh;
    margin: 0;
    background: var(--bg);
    z-index: 3;
    box-shadow: 0 1px 0 var(--border);
  }
  .stage__text {
    padding-inline: var(--gutter);
  }
  .stage__panel {
    position: fixed;
    left: 0.75rem;
    right: 0.75rem;
    bottom: calc(5.25rem + env(safe-area-inset-bottom));
    max-width: none;
    z-index: 40;
  }
  .stage__panel :deep(.dpanel) {
    width: 100%;
    max-height: 46svh;
    overflow: auto;
  }
  .hero {
    min-height: 0;
    padding-top: 2rem;
    padding-bottom: 2rem;
  }
  .hero__title {
    font-size: clamp(2.9rem, 12.5vw, 4.5rem);
    width: auto;
    max-width: none;
  }
  .hero__ctas :deep(.mbtn--quiet) {
    display: none;
  }
  .eco__step {
    min-height: 60svh;
    opacity: 1;
  }
}

@media (min-width: 900px) and (max-width: 1199px) {
  .stage__text {
    grid-column: 1 / span 6;
  }
  .stage__organism {
    grid-column: 7 / span 6;
  }
}
</style>
