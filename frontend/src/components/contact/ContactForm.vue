<template>
  <form class="cform" novalidate :aria-busy="state === 'sending' ? 'true' : 'false'" @submit.prevent="submit">
    <div class="cform__row">
      <div class="cform__field" :class="{ 'has-error': shown.name }">
        <label for="cf-name" class="cform__label">Name</label>
        <input
          id="cf-name"
          ref="name"
          v-model="form.name"
          name="name"
          type="text"
          autocomplete="name"
          :maxlength="limits.name + 20"
          required
          :aria-invalid="shown.name ? 'true' : 'false'"
          :aria-describedby="shown.name ? 'cf-name-err' : undefined"
          @blur="touch('name')"
        />
        <p v-if="shown.name" id="cf-name-err" class="cform__error">{{ text('name', shown.name) }}</p>
      </div>
      <div class="cform__field" :class="{ 'has-error': shown.email }">
        <label for="cf-email" class="cform__label">Email</label>
        <input
          id="cf-email"
          ref="email"
          v-model="form.email"
          name="email"
          type="email"
          autocomplete="email"
          inputmode="email"
          required
          :aria-invalid="shown.email ? 'true' : 'false'"
          :aria-describedby="shown.email ? 'cf-email-err' : undefined"
          @blur="touch('email')"
        />
        <p v-if="shown.email" id="cf-email-err" class="cform__error">{{ text('email', shown.email) }}</p>
      </div>
    </div>
    <div class="cform__field" :class="{ 'has-error': shown.message }">
      <label for="cf-message" class="cform__label">Message</label>
      <textarea
        id="cf-message"
        ref="message"
        v-model="form.message"
        name="message"
        rows="5"
        required
        :aria-invalid="shown.message ? 'true' : 'false'"
        :aria-describedby="shown.message ? 'cf-message-err cf-count' : 'cf-count'"
        @blur="touch('message')"
      />
      <div class="cform__meta">
        <p v-if="shown.message" id="cf-message-err" class="cform__error">{{ text('message', shown.message) }}</p>
        <p id="cf-count" class="cform__count mono">{{ count }}/{{ limits.messageMax }}</p>
      </div>
    </div>

    <!-- Honeypot: invisible to people and assistive tech, tempting to bots. -->
    <div class="cform__hp" aria-hidden="true">
      <label for="cf-company">Company</label>
      <input id="cf-company" v-model="form.company" name="company" type="text" tabindex="-1" autocomplete="off" />
    </div>

    <div class="cform__actions">
      <MagneticButton type="submit" icon="arrow-right" :disabled="state === 'sending'">
        {{ state === 'sending' ? 'Sending…' : 'Send message' }}
      </MagneticButton>
      <p class="cform__status" role="status" aria-live="polite" :class="`is-${state}`">{{ statusText }}</p>
    </div>
  </form>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import MagneticButton from '@/components/ui/MagneticButton.vue'
import {
  validateContact,
  submitContact,
  errorText,
  LIMITS,
  MIN_ELAPSED_MS,
  type FieldErrors,
  type FieldError,
} from '@/services/contact'

type Field = 'name' | 'email' | 'message'

/**
 * Optional contact form. Errors appear on blur and on submit, are linked
 * with aria-describedby, and focus moves to the first invalid field.
 * Success is shown only after the server confirms the message was saved.
 */
export default defineComponent({
  name: 'ContactForm',
  components: { MagneticButton },
  props: {
    email: { type: String, default: '' },
  },
  data() {
    return {
      form: { name: '', email: '', message: '', company: '' },
      touched: { name: false, email: false, message: false } as Record<Field, boolean>,
      serverErrors: {} as FieldErrors,
      state: 'idle' as 'idle' | 'sending' | 'sent' | 'error',
      errorKind: '' as string,
      openedAt: 0,
      limits: LIMITS,
    }
  },
  computed: {
    errors(): FieldErrors {
      return validateContact(this.form)
    },
    shown(): FieldErrors {
      const out: FieldErrors = {}
      for (const f of ['name', 'email', 'message'] as Field[]) {
        const e = this.serverErrors[f] ?? (this.touched[f] ? this.errors[f] : undefined)
        if (e) out[f] = e
      }
      return out
    },
    count(): number {
      return Array.from(this.form.message.trim()).length
    },
    statusText(): string {
      switch (this.state) {
        case 'sending':
          return 'Sending…'
        case 'sent':
          return 'Thank you. Your message has been received, and I’ll reply by email.'
        case 'error':
          return this.errorMessage()
        default:
          return ''
      }
    },
  },
  mounted() {
    this.openedAt = performance.now()
  },
  methods: {
    text(f: Field, e: FieldError) {
      return errorText[f][e]
    },
    touch(f: Field) {
      this.touched[f] = true
      delete this.serverErrors[f]
    },
    errorMessage(): string {
      const mail = this.email ? ` You can also email ${this.email} directly.` : ''
      switch (this.errorKind) {
        case 'too_fast':
          return 'That was quick. Please wait a moment and send again.'
        case 'rate_limited':
          return `Too many messages in a short time. Please try again later.${mail}`
        case 'save_failed':
          return `Your message couldn’t be saved just now. Please try again in a minute.${mail}`
        case 'disabled':
          return `The form is unavailable at the moment.${mail}`
        case 'network':
          return `Could not reach the server. Check your connection.${mail}`
        default:
          return `Something went wrong.${mail}`
      }
    },
    focusFirstError(errs: FieldErrors) {
      const first = (['name', 'email', 'message'] as Field[]).find((f) => errs[f])
      if (first) (this.$refs[first] as HTMLElement | undefined)?.focus()
    },
    async submit() {
      this.touched = { name: true, email: true, message: true }
      this.serverErrors = {}
      if (Object.keys(this.errors).length) {
        this.focusFirstError(this.errors)
        return
      }
      const elapsed = performance.now() - this.openedAt
      if (elapsed < MIN_ELAPSED_MS) {
        // Give humans a beat; bots are rejected server-side either way.
        await new Promise((r) => setTimeout(r, MIN_ELAPSED_MS - elapsed))
      }
      this.state = 'sending'
      const res = await submitContact(this.form, performance.now() - this.openedAt)
      if (res.ok) {
        this.state = 'sent'
        this.form = { name: '', email: '', message: '', company: '' }
        this.touched = { name: false, email: false, message: false }
        return
      }
      if (res.kind === 'invalid') {
        this.state = 'idle'
        this.serverErrors = res.fields
        this.focusFirstError(res.fields)
        return
      }
      this.state = 'error'
      this.errorKind = res.kind
    },
  },
})
</script>

<style scoped>
.cform {
  display: grid;
  gap: 1.1rem;
}
.cform__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.1rem;
}
.cform__field {
  display: grid;
  gap: 0.4rem;
}
.cform__label {
  font-family: var(--font-mono);
  font-size: var(--step--2);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text);
}
.cform input,
.cform textarea {
  width: 100%;
  min-height: 3rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: var(--step-0);
  transition: border-color var(--dur-ui) var(--ease-ui), box-shadow var(--dur-ui) var(--ease-ui);
}
.cform textarea {
  resize: vertical;
  min-height: 8rem;
}
.cform input:hover,
.cform textarea:hover {
  border-color: var(--text-muted);
}
.cform input:focus-visible,
.cform textarea:focus-visible {
  border-color: var(--text);
  border-radius: var(--radius-sm);
}
.has-error input,
.has-error textarea {
  border-color: var(--error);
}
.cform__error {
  margin: 0;
  color: var(--error);
  font-size: var(--step--1);
}
.cform__meta {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}
.cform__count {
  margin: 0 0 0 auto;
  font-size: var(--step--2);
  color: var(--text-muted);
}
.cform__hp {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
.cform__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.5rem;
  align-items: center;
}
.cform__status {
  margin: 0;
  font-size: var(--step--1);
  max-width: 44ch;
}
.cform__status.is-sent {
  color: var(--success);
}
.cform__status.is-error {
  color: var(--error);
}
@media (max-width: 640px) {
  .cform__row {
    grid-template-columns: 1fr;
  }
}
</style>
