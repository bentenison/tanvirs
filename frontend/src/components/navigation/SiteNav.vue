<template>
  <header class="nav" :class="{ 'is-scrolled': scrolled }">
    <nav class="nav__bar shell" aria-label="Primary">
      <RouterLink to="/" class="nav__mark" :aria-label="`${name}, home`" @click="onHome">
        <OrganismPulse :size="26" />
        <span class="nav__name">{{ name }}</span>
      </RouterLink>

      <ul ref="list" class="nav__links" role="list">
        <span ref="indicator" class="nav__indicator" aria-hidden="true" />
        <li v-for="item in items" :key="item.id">
          <RouterLink
            :ref="(el) => setLinkRef(item.id, el)"
            :to="item.to"
            class="nav__link"
            :class="{ 'is-active': active === item.id }"
            :aria-current="active === item.id ? 'location' : undefined"
          >
            <span class="nav__index mono" aria-hidden="true">{{ item.index }}</span>
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>

      <div class="nav__end">
        <PopoverRoot>
          <PopoverTrigger class="nav__settings" aria-label="Display settings">
            <AppIcon name="settings" :size="18" />
          </PopoverTrigger>
          <PopoverPortal>
            <PopoverContent class="nav__popover" :side-offset="10" align="end">
              <p class="caption nav__popover-title">Display</p>
              <PreferenceControls stacked />
            </PopoverContent>
          </PopoverPortal>
        </PopoverRoot>
        <MagneticButton to="/#contact" variant="primary" class="nav__cta" :strength="4">Get in touch</MagneticButton>
      </div>
    </nav>

    <MobileNav :items="items" :active="active" />
    <span class="nav__progress" aria-hidden="true" />
  </header>
</template>

<script lang="ts">
import { defineComponent, markRaw, type ComponentPublicInstance } from 'vue'
import { RouterLink } from 'vue-router'
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui'
import OrganismPulse from './OrganismPulse.vue'
import MobileNav from './MobileNav.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import MagneticButton from '@/components/ui/MagneticButton.vue'
import PreferenceControls from '@/components/ui/PreferenceControls.vue'
import { navigation } from '@/config/navigation'
import { profile } from '@/config/profile'
import { Spring } from '@/engine/physics/spring'
import { subscribe, type TickerHandle } from '@/engine/animation/ticker'

/**
 * Floating navigation. A single indicator morphs between section links -
 * its leading edge travels first and the trailing edge catches up, so it
 * stretches like the organism's membrane.
 */
export default defineComponent({
  name: 'SiteNav',
  components: {
    RouterLink,
    PopoverRoot,
    PopoverTrigger,
    PopoverPortal,
    PopoverContent,
    OrganismPulse,
    MobileNav,
    AppIcon,
    MagneticButton,
    PreferenceControls,
  },
  data() {
    return {
      items: navigation,
      name: profile.name,
      active: '' as string,
      scrolled: false,
      links: markRaw({}) as Record<string, HTMLElement>,
      io: null as IntersectionObserver | null,
      left: markRaw(new Spring(0, 'ui')),
      right: markRaw(new Spring(0, 'ui')),
      ticker: null as TickerHandle | null,
      onScroll: null as null | (() => void),
      observed: false,
    }
  },
  watch: {
    active() {
      this.placeIndicator(false)
    },
    '$route.path'() {
      this.$nextTick(() => this.observeSections())
    },
  },
  mounted() {
    this.ticker = markRaw(subscribe((dt) => this.tick(dt), false))
    this.onScroll = () => {
      this.scrolled = window.scrollY > 24
    }
    window.addEventListener('scroll', this.onScroll, { passive: true })
    this.onScroll()
    this.observeSections()
  },
  beforeUnmount() {
    this.ticker?.dispose()
    this.io?.disconnect()
    if (this.onScroll) window.removeEventListener('scroll', this.onScroll)
  },
  methods: {
    setLinkRef(id: string, el: Element | ComponentPublicInstance | null) {
      const node = el && '$el' in el ? (el.$el as HTMLElement) : (el as HTMLElement | null)
      if (node) this.links[id] = node
    },
    onHome() {
      if (this.$route.path === '/') window.scrollTo({ top: 0 })
    },
    observeSections() {
      this.io?.disconnect()
      if (this.$route.path !== '/') {
        this.active = this.$route.path.startsWith('/work') ? 'work' : this.$route.path === '/playground' ? 'playground' : ''
        return
      }
      const visible = new Map<string, number>()
      this.io = markRaw(
        new IntersectionObserver(
          (entries) => {
            for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0)
            let best = ''
            let ratio = 0
            for (const item of this.items) {
              const r = visible.get(item.id) ?? 0
              if (r > ratio) {
                ratio = r
                best = item.id
              }
            }
            this.active = best
          },
          { rootMargin: '-35% 0px -55% 0px', threshold: [0, 0.01, 0.5, 1] },
        ),
      )
      for (const item of this.items) {
        const el = document.getElementById(item.id)
        if (el) this.io.observe(el)
      }
    },
    placeIndicator(snap: boolean) {
      const ind = this.$refs.indicator as HTMLElement | undefined
      const list = this.$refs.list as HTMLElement | undefined
      if (!ind || !list) return
      const link = this.links[this.active]
      if (!link) {
        ind.style.opacity = '0'
        return
      }
      const lr = list.getBoundingClientRect()
      const r = link.getBoundingClientRect()
      const l = r.left - lr.left
      const rr = r.right - lr.left
      const wasHidden = ind.style.opacity !== '1'
      const goingRight = l > this.left.value
      const lead = 'ui'
      const trail = { stiffness: 210, damping: 26, mass: 1 }
      this.left.set(goingRight ? trail : lead)
      this.right.set(goingRight ? lead : trail)
      this.left.target = l
      this.right.target = rr
      if (snap || wasHidden || document.documentElement.dataset.motion === 'minimal') {
        this.left.snap(l)
        this.right.snap(rr)
      }
      ind.style.opacity = '1'
      this.render()
      this.ticker?.setActive(true)
    },
    tick(dt: number) {
      const a = this.left.step(dt)
      const b = this.right.step(dt)
      this.render()
      if (!a && !b) this.ticker?.setActive(false)
    },
    render() {
      const ind = this.$refs.indicator as HTMLElement | undefined
      if (!ind) return
      ind.style.transform = `translateX(${this.left.value}px)`
      ind.style.width = `${Math.max(0, this.right.value - this.left.value)}px`
    },
  },
})
</script>

<style scoped>
.nav {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 50;
  pointer-events: none;
}
/* Reading progress: a hairline driven by the page's own scroll position.
   Pure CSS (scroll-driven animation), so it costs no script; browsers
   without support simply don't show it. */
.nav__progress {
  display: none;
}
@supports (animation-timeline: scroll()) {
  .nav__progress {
    display: block;
    position: absolute;
    inset: 0 0 auto 0;
    height: 2px;
    background: var(--accent);
    transform-origin: 0 50%;
    animation: nav-progress linear both;
    animation-timeline: scroll(root block);
  }
}
@keyframes nav-progress {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
.nav__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  height: var(--nav-h);
  pointer-events: none;
}
.nav__bar > * {
  pointer-events: auto;
}
.nav__mark {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  color: var(--text);
  text-decoration: none;
  font-weight: 500;
  font-size: var(--step--1);
  padding: 0.4rem 0.8rem 0.4rem 0.45rem;
  border-radius: 999px;
  transition: background-color var(--dur-premium) var(--ease-premium);
}
.is-scrolled .nav__mark,
.is-scrolled .nav__links,
.is-scrolled .nav__settings {
  background: color-mix(in oklab, var(--bg) 86%, transparent);
  backdrop-filter: blur(10px);
  box-shadow: 0 0 0 1px var(--border);
}
.nav__links {
  position: relative;
  display: flex;
  gap: 0.15rem;
  margin: 0;
  padding: 0.3rem;
  list-style: none;
  border-radius: 999px;
  transition: background-color var(--dur-premium) var(--ease-premium);
}
.nav__indicator {
  position: absolute;
  top: 0.3rem;
  bottom: 0.3rem;
  left: 0;
  border-radius: 999px;
  background: var(--text);
  opacity: 0;
}
.nav__link {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.5rem 0.9rem;
  border-radius: 999px;
  color: var(--text-muted);
  text-decoration: none;
  font-size: var(--step--1);
  transition: color var(--dur-ui) var(--ease-ui);
}
.nav__link:hover {
  color: var(--text);
}
.nav__link.is-active {
  color: var(--bg);
}
.nav__index {
  font-size: 0.68rem;
  opacity: 0.7;
}
.nav__end {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.nav__settings {
  display: inline-grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.nav__settings:hover {
  background: var(--surface-sunken);
}
:global(.nav__popover) {
  z-index: 70;
  padding: 1rem 1.1rem 1.15rem;
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-float);
  transform-origin: var(--reka-popover-content-transform-origin);
  animation: pop-in 220ms var(--ease-premium);
}
:global(.nav__popover-title) {
  margin: 0 0 0.9rem;
  color: var(--text);
}
@keyframes pop-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(-4px);
  }
}

@media (max-width: 899px) {
  /* Mobile uses the bottom bar; the top of the screen belongs to the organism. */
  .nav__bar {
    display: none;
  }
}
@media (max-width: 1099px) {
  .nav__index {
    display: none;
  }
}
</style>
