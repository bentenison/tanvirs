<template>
  <div class="gates">
    <ol class="gates__list" aria-label="Change pipeline">
      <li v-for="(g, i) in gates" :key="g.id" class="gates__gate" :class="`is-${status[i]}`">
        <span class="gates__icon" aria-hidden="true">{{ icon(status[i]) }}</span>
        <span class="gates__name">{{ g.name }}</span>
        <span class="gates__note caption">{{ notes[i] }}</span>
      </li>
    </ol>
    <div class="sim-buttons">
      <button type="button" class="sim-btn sim-btn--primary" :disabled="running" @click="run">
        {{ attempt === 0 ? 'Propose a change' : attempt === 1 ? 'Fix and re-run' : 'Run again' }}
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

type GateStatus = 'idle' | 'running' | 'pass' | 'fail'

const GATES = [
  { id: 'gen', name: 'AI-assisted draft' },
  { id: 'lint', name: 'Lint & vet' },
  { id: 'types', name: 'Type check' },
  { id: 'tests', name: 'Tests (incl. -race)' },
  { id: 'review', name: 'Human review' },
]

/**
 * How I use AI in development: models draft quickly, but the same gates
 * every change passes decide what ships. The first run fails a test on
 * purpose, that is the point.
 */
export default defineComponent({
  name: 'ReviewGates',
  data() {
    return {
      gates: GATES,
      status: GATES.map(() => 'idle') as GateStatus[],
      notes: GATES.map(() => '') as string[],
      attempt: 0,
      running: false,
      timers: [] as number[],
    }
  },
  beforeUnmount() {
    this.timers.forEach((t) => clearTimeout(t))
  },
  methods: {
    icon(s: GateStatus) {
      return s === 'pass' ? '✓' : s === 'fail' ? '×' : s === 'running' ? '•' : '○'
    },
    wait(ms: number) {
      const motion = document.documentElement.dataset.motion
      const d = motion === 'minimal' ? 0 : motion === 'reduced' ? ms / 3 : ms
      return new Promise<void>((r) => this.timers.push(window.setTimeout(r, d)))
    },
    async run() {
      this.running = true
      const failTests = this.attempt === 0
      this.status = GATES.map(() => 'idle')
      this.notes = GATES.map(() => '')
      for (let i = 0; i < GATES.length; i++) {
        this.status[i] = 'running'
        await this.wait(480)
        if (failTests && GATES[i].id === 'tests') {
          this.status[i] = 'fail'
          this.notes[i] = 'edge case: empty batch'
          this.attempt = 1
          this.running = false
          return
        }
        this.status[i] = 'pass'
        if (GATES[i].id === 'gen') this.notes[i] = this.attempt ? 'revised with a failing test' : 'draft in seconds'
        if (GATES[i].id === 'review') this.notes[i] = 'approved'
      }
      this.attempt = 2
      this.running = false
    },
  },
})
</script>

<style scoped>
.gates__list {
  display: grid;
  gap: 0.35rem;
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
}
.gates__gate {
  display: grid;
  grid-template-columns: 1.6rem 1fr auto;
  gap: 0.6rem;
  align-items: center;
  padding: 0.5rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: var(--step--1);
  transition: border-color 200ms, background-color 200ms;
}
.gates__icon {
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: var(--surface-sunken);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}
.gates__gate.is-running {
  border-color: var(--text);
}
.gates__gate.is-running .gates__icon {
  background: var(--accent);
  color: var(--on-accent);
  animation: gate-pulse 700ms ease-in-out infinite;
}
.gates__gate.is-pass .gates__icon {
  background: var(--text);
  color: var(--bg);
}
.gates__gate.is-fail {
  border-color: var(--tension);
  background: var(--tension-soft);
}
.gates__gate.is-fail .gates__icon {
  background: var(--tension);
  color: #fff;
}
@keyframes gate-pulse {
  50% {
    transform: scale(1.15);
  }
}
</style>
