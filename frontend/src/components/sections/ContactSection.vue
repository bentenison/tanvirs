<template>
  <section id="contact" ref="root" class="contact" aria-labelledby="contact-title">
    <div class="contact__organism" aria-hidden="true">
      <EngineeringOrganism :annotated="false" :interactive="false" :opening="false" />
    </div>
    <div class="shell contact__inner">
      <p class="margin-note" data-reveal><b>§07</b><span>Contact</span></p>
      <h2 id="contact-title" class="contact__title display" data-reveal>
        Have an idea that should be a <em>working</em> product?
      </h2>
      <p v-if="availability" class="contact__avail caption" data-reveal>
        <span class="contact__avail-dot" aria-hidden="true" />{{ availability }}
      </p>

      <div class="contact__grid">
        <div class="contact__direct" data-reveal>
          <a v-if="links.email" :href="`mailto:${links.email}`" class="contact__email display">
            <span>{{ emailUser }}</span><span class="contact__at">@{{ emailDomain }}</span>
          </a>
          <p v-else class="contact__note">
            Tell me what you're building. The form reaches me directly, and I reply personally, usually within two
            working days.
          </p>
          <div class="contact__links">
            <button v-if="links.email" type="button" class="sim-btn" @click="copyEmail">
              <AppIcon :name="copied ? 'check' : 'copy'" :size="16" />
              {{ copied ? 'Copied' : 'Copy email' }}
            </button>
            <InteractiveLink v-if="links.github" :href="links.github" external icon="arrow-up-right">GitHub</InteractiveLink>
            <InteractiveLink v-if="links.linkedin" :href="links.linkedin" external icon="arrow-up-right">LinkedIn</InteractiveLink>
            <InteractiveLink v-if="links.resume" :href="links.resume" icon="download">Résumé (PDF)</InteractiveLink>
          </div>
          <p class="sr-only" role="status" aria-live="polite">{{ copied ? 'Email address copied' : '' }}</p>
        </div>

        <div class="contact__form" :class="{ 'contact__form--boxed': formEnabled }" data-reveal>
          <template v-if="formEnabled">
            <p class="caption contact__form-title">{{ links.email ? 'Or send a message' : 'Send a message' }}</p>
            <ContactForm :email="links.email" />
          </template>
          <p v-else-if="checked && links.email" class="contact__fallback">
            The quickest way to reach me is email. I read everything that arrives at
            <a :href="`mailto:${links.email}`">{{ links.email }}</a>.
          </p>
          <p v-else-if="checked" class="contact__fallback">
            The contact form is unavailable right now.
            <template v-if="links.github">You can still reach me through <a :href="links.github" target="_blank" rel="noopener noreferrer">GitHub</a>.</template>
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import EngineeringOrganism from '@/components/organism/EngineeringOrganism.vue'
import ContactForm from '@/components/contact/ContactForm.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import InteractiveLink from '@/components/ui/InteractiveLink.vue'
import { profile, availabilityText } from '@/config/profile'
import { contactEnabled } from '@/services/contact'
import { reveal } from '@/engine/animation/reveal'

/**
 * Closing specimen: the organism returns behind the contact options. A
 * public email is shown only if one is configured; the form appears only
 * when the server reports that SMTP delivery is configured.
 */
export default defineComponent({
  name: 'ContactSection',
  components: { EngineeringOrganism, ContactForm, AppIcon, InteractiveLink },
  data() {
    return {
      links: profile.links,
      availability: availabilityText(),
      formEnabled: false,
      checked: false,
      copied: false,
      stop: null as null | (() => void),
      abort: null as AbortController | null,
      copyTimer: 0,
    }
  },
  computed: {
    emailUser(): string {
      return (this.links.email ?? '').split('@')[0]
    },
    emailDomain(): string {
      return (this.links.email ?? '').split('@')[1] ?? ''
    },
  },
  async mounted() {
    this.stop = reveal(this.$refs.root as HTMLElement)
    this.abort = new AbortController()
    this.formEnabled = await contactEnabled(this.abort.signal)
    this.checked = true
  },
  beforeUnmount() {
    this.stop?.()
    this.abort?.abort()
    clearTimeout(this.copyTimer)
  },
  methods: {
    async copyEmail() {
      if (!this.links.email) return
      try {
        await navigator.clipboard.writeText(this.links.email)
        this.copied = true
        clearTimeout(this.copyTimer)
        this.copyTimer = window.setTimeout(() => (this.copied = false), 2000)
      } catch {
        window.location.href = `mailto:${this.links.email}`
      }
    },
  },
})
</script>

<style scoped>
.contact {
  position: relative;
  overflow: hidden;
  padding-block: clamp(6rem, 14vw, 12rem) clamp(4rem, 8vw, 7rem);
  border-top: 1px solid var(--border);
}
.contact__organism {
  position: absolute;
  right: -14vw;
  top: -4rem;
  width: min(58vw, 900px);
  height: min(58vw, 760px);
  opacity: 0.9;
  pointer-events: none;
}
.contact__inner {
  position: relative;
}
.contact__title {
  font-size: var(--step-5);
  margin: 1.25rem 0 1.5rem;
  max-width: 16ch;
}
.contact__title em {
  color: var(--accent-ink);
}
.contact__avail {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  color: var(--text);
}
.contact__avail-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.contact__grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: clamp(1rem, 2vw, 2rem);
  row-gap: 3rem;
  margin-top: clamp(3rem, 7vw, 5rem);
}
.contact__direct {
  grid-column: 1 / span 6;
}
.contact__form {
  grid-column: 8 / span 5;
  align-self: start;
}
.contact__form--boxed {
  padding: 1.5rem;
  border-radius: var(--radius-md);
  background: color-mix(in oklab, var(--surface-raised) 92%, transparent);
  border: 1px solid var(--border);
  backdrop-filter: blur(6px);
}
.contact__form:empty {
  display: none;
}
.contact__form-title {
  margin: 0 0 1rem;
}
.contact__email {
  display: inline-flex;
  flex-wrap: wrap;
  font-size: clamp(1.9rem, 1rem + 3.6vw, 4.4rem);
  line-height: 1.05;
  color: var(--text);
  text-decoration: none;
  word-break: break-word;
  background-image: linear-gradient(var(--accent), var(--accent));
  background-size: 0% 0.12em;
  background-position: 0 92%;
  background-repeat: no-repeat;
  transition: background-size var(--dur-premium) var(--ease-premium);
}
.contact__email:hover {
  background-size: 100% 0.12em;
}
.contact__at {
  color: var(--text-muted);
  font-style: italic;
}
.contact__links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem 1.75rem;
  margin-top: 2rem;
}
.contact__note {
  margin: 0;
  max-width: 30ch;
  font-family: var(--font-display);
  font-size: var(--step-3);
  line-height: 1.15;
}
.contact__fallback {
  margin: 0;
  max-width: 34ch;
  color: var(--text-muted);
  font-size: var(--step-1);
  line-height: 1.45;
}
@media (max-width: 1023px) {
  .contact__direct,
  .contact__form {
    grid-column: 1 / -1;
  }
  .contact__organism {
    right: -30vw;
    top: -2rem;
    width: 110vw;
    height: 80vw;
    opacity: 0.35;
  }
}
</style>
