<template>
  <div class="pipe">
    <ol class="pipe__stages" aria-label="Request lifecycle">
      <li
        v-for="(s, i) in stages"
        :key="s.name"
        class="pipe__stage"
        :class="{ 'is-pass': reached > i, 'is-now': reached === i && running, 'is-fail': failedAt === i }"
      >
        <span class="pipe__dot" aria-hidden="true" />
        <span class="pipe__name mono">{{ s.name }}</span>
        <span class="pipe__ms mono">{{ reached > i ? `${s.ms}ms` : '' }}</span>
      </li>
    </ol>
    <div class="pipe__bar">
      <button type="button" class="sim-btn sim-btn--primary" :disabled="running" @click="send">Send request</button>
      <label class="pipe__toggle">
        <input v-model="invalid" type="checkbox" /> Invalid payload
      </label>
      <p class="pipe__resp mono" role="status">{{ response }}</p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

const STAGES = [
  { name: 'recover', ms: 0 },
  { name: 'request-id', ms: 0 },
  { name: 'auth', ms: 1 },
  { name: 'validate', ms: 0 },
  { name: 'cache', ms: 1 },
  { name: 'handler', ms: 4 },
  { name: 'postgres', ms: 6 },
  { name: 'respond', ms: 0 },
]

/** A request travelling a Go middleware chain; invalid input stops at validation. Simulated timings. */
export default defineComponent({
  name: 'RequestPipeline',
  data() {
    return { stages: STAGES, reached: -1, running: false, invalid: false, failedAt: -1, response: 'Idle', timer: 0 }
  },
  beforeUnmount() {
    clearInterval(this.timer)
  },
  methods: {
    send() {
      clearInterval(this.timer)
      this.reached = 0
      this.failedAt = -1
      this.running = true
      this.response = '…'
      const motion = document.documentElement.dataset.motion
      const delay = motion === 'minimal' ? 0 : motion === 'reduced' ? 60 : 170
      const advance = () => {
        if (this.invalid && this.reached === 3) {
          this.failedAt = 3
          this.running = false
          this.response = '422 · {"error":"invalid","fields":{"email":"invalid"}}'
          clearInterval(this.timer)
          return false
        }
        this.reached++
        if (this.reached >= this.stages.length) {
          this.running = false
          const total = this.stages.reduce((n, s) => n + s.ms, 0)
          this.response = `200 · ${total}ms (simulated)`
          clearInterval(this.timer)
          return false
        }
        return true
      }
      if (!delay) {
        while (advance()) {
          /* run to completion instantly */
        }
        return
      }
      this.timer = window.setInterval(advance, delay)
    },
  },
})
</script>

<style scoped>
.pipe__stages {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.35rem;
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
}
.pipe__stage {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 0.45rem;
  padding: 0.5rem 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  transition: border-color 200ms, background-color 200ms;
}
.pipe__dot {
  grid-row: span 2;
  width: 0.55rem;
  height: 0.55rem;
  margin-top: 0.3rem;
  border-radius: 50%;
  background: var(--border-strong);
  transition: background-color 200ms, transform 300ms cubic-bezier(0.2, 1.6, 0.3, 1);
}
.pipe__name {
  font-size: 0.72rem;
}
.pipe__ms {
  font-size: 0.64rem;
  color: var(--text-muted);
  min-height: 1em;
}
.pipe__stage.is-pass .pipe__dot {
  background: var(--accent-ink);
}
.pipe__stage.is-now {
  border-color: var(--text);
}
.pipe__stage.is-now .pipe__dot {
  transform: scale(1.6);
  background: var(--accent);
}
.pipe__stage.is-fail {
  border-color: var(--tension);
  background: var(--tension-soft);
}
.pipe__stage.is-fail .pipe__dot {
  background: var(--tension);
}
.pipe__bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  align-items: center;
}
.pipe__toggle {
  display: inline-flex;
  gap: 0.45rem;
  align-items: center;
  font-size: var(--step--1);
}
.pipe__toggle input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: var(--tension);
}
.pipe__resp {
  margin: 0;
  font-size: 0.74rem;
  color: var(--text-muted);
  flex-basis: 100%;
}
@media (max-width: 560px) {
  .pipe__stages {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
