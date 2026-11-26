<template>
  <div class="stage" :class="{ 'has-selection': !!selected }">
    <!--
      Both centrepieces are server-rendered; <html data-hero> (set by the
      server's /site-config.js before paint) decides which one is visible,
      and only that one starts measuring or rendering after mount.
    -->
    <div class="stage__organism">
      <div class="hv hv--organism" aria-label="Interactive engineering organism" role="group">
        <EngineeringOrganism :mode="mode" :selected="selected" :enabled="hero === 'organism'" @select="select" />
        <div class="stage__panel">
          <DomainPanel :id="panelId" :selected="selected" @close="select(null)" />
        </div>
      </div>
      <div class="hv hv--request">
        <RequestTrace :enabled="hero === 'request'" :focus="requestFocus" />
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
        <DomainIndex class="hero__index only-organism" :selected="selected" :panel-id="panelId" :active-domains="activeDomains" @select="select" />
      </section>

      <section class="eco" aria-labelledby="eco-title">
        <h2 id="eco-title" class="sr-only">How the ecosystem fits together</h2>
        <article
          v-for="(step, i) in requestSteps"
          :key="step.key"
          ref="steps"
          class="eco__step only-request"
          data-set="request"
          :data-step="i"
          :class="{ 'is-current': currentRequest === i }"
        >
          <p class="margin-note"><b>§02.{{ i + 1 }}</b><span>{{ step.kicker }}</span></p>
          <h3 class="eco__title display" v-html="step.title" />
          <p class="eco__body">{{ step.body }}</p>
        </article>
        <article
          v-for="(step, i) in steps"
          :key="step.key"
          ref="steps"
          class="eco__step only-organism"
          data-set="organism"
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
import RequestTrace from '@/components/request/RequestTrace.vue'
import MagneticButton from '@/components/ui/MagneticButton.vue'
import { profile, availabilityText } from '@/config/profile'
import { projects } from '@/config/projects'
import { domainById } from '@/config/technologies'
import type { DomainId } from '@/config/types'
import type { OrganismMode } from '@/engine/rendering/organism/model'
import type { StageGroup } from '@/engine/trace/trace'
import { siteRuntime, type HeroKind } from '@/services/site'

/**
 * §01 Hero + §02 Ecosystem share one stage: the organism stays pinned
 * (CSS sticky, native scrolling, never hijacked) while three short
 * steps scroll past and change its state.
 */
export default defineComponent({
  name: 'HeroStage',
  components: { EngineeringOrganism, DomainIndex, DomainPanel, MagneticButton, RequestTrace },
  data() {
    return {
      profile,
      projects,
      availability: availabilityText(),
      selected: null as Selection,
      // Unknown until mount so server and client render the same markup.
      hero: null as HeroKind | null,
      current: -1,
      currentRequest: -1,
      requestSteps: [
        {
          key: 'out',
          kicker: 'Your request',
          title: 'This page is <em>the demo</em>.',
          body: 'The panel traces the real request that loaded this page, hop by hop.',
          focus: 'network',
        },
        {
          key: 'server',
          kicker: 'Inside the Go binary',
          title: 'Fractions of a <em>millisecond</em>.',
          body: 'The page is embedded in the binary and sent pre-compressed; most of the wait is network.',
          focus: 'server',
        },
        {
          key: 'again',
          kicker: 'Try it',
          title: 'Send one <em>yourself</em>.',
          body: 'A fresh request also makes a real round trip to PostgreSQL.',
          focus: 'data',
        },
      ],
      productSlug: projects[0].slug,
      panelId: 'organism-panel',
      io: null as IntersectionObserver | null,
      steps: [
        {
          key: 'core',
          kicker: 'The core',
          title: 'Go at the <em>centre</em>.',
          body: 'Every product I build is a single, fast Go service at its core.',
        },
        {
          key: 'domains',
          kicker: 'Eight domains, one body',
          title: 'Not a list of skills. <em>One</em> system.',
          body: 'Frontend, data, infrastructure and AI are lobes of one body. Pull one and the rest respond.',
        },
        {
          key: 'product',
          kicker: 'Shaped by the product',
          title: 'Each product takes a <em>different</em> shape.',
          body: 'Pick a product to see which parts it leans on.',
        },
      ],
    }
  },
  computed: {
    requestFocus(): StageGroup | null {
      const step = this.requestSteps[this.currentRequest]
      return step ? (step.focus as StageGroup) : null
    },
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
    this.hero = siteRuntime().hero
    const els = this.$refs.steps as HTMLElement[]
    this.io = markRaw(
      new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const el = e.target as HTMLElement
            const i = Number(el.dataset.step)
            const key = el.dataset.set === 'request' ? 'currentRequest' : 'current'
            if (e.isIntersecting) this[key] = i
            else if (this[key] === i && e.boundingClientRect.top > 0) this[key] = i - 1
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
.hv {
  position: absolute;
  inset: 0;
}
.hv--request {
  align-items: center;
  justify-content: center;
  padding: calc(var(--nav-h) + 1rem) var(--gutter) 2rem;
}
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
  padding-bottom: 8vh;
}
.eco__step {
  min-height: 52svh;
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
    min-height: 0;
    padding-block: 2.5rem;
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

<style>
/* Variant switch: the server sets <html data-hero> before first paint.
   Unscoped on purpose: these selectors hang off the root element, and the
   :root prefix makes them outrank component rules such as .eco__step's
   display:flex, so hidden content stays hidden. Organism is the default. */
:root:not([data-hero='request']) .only-request,
:root:not([data-hero='request']) .hv--request,
:root[data-hero='request'] .only-organism,
:root[data-hero='request'] .hv--organism {
  display: none;
}
:root[data-hero='request'] .hv--request {
  display: flex;
}

/* Request hero on phones: the trace is too tall for the half-screen sticky
   area, so it sits in the flow above the headline instead. */
@media (max-width: 899px) {
  :root[data-hero='request'] .stage__organism {
    position: relative;
    height: auto;
    box-shadow: none;
  }
  :root[data-hero='request'] .hv--request {
    position: relative;
    padding: calc(1.5rem + env(safe-area-inset-top)) var(--gutter) 0.5rem;
  }
}
</style>
