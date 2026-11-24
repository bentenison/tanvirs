<template>
  <div class="iscan">
    <div class="iscan__bar">
      <code class="iscan__sql mono">SELECT * FROM learners WHERE email = 'r.nair@example.com'</code>
      <div class="iscan__ctl">
        <label class="iscan__toggle"><input v-model="indexed" type="checkbox" /> Index on email</label>
        <button type="button" class="sim-btn sim-btn--primary" :disabled="running" @click="run">Run query</button>
      </div>
    </div>
    <div class="iscan__rows" role="img" :aria-label="summary">
      <span
        v-for="i in total"
        :key="i"
        class="iscan__row"
        :class="{ 'is-read': read.has(i - 1), 'is-hit': i - 1 === target && done }"
      />
    </div>
    <p class="iscan__result mono" role="status">{{ summary }}</p>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

const TOTAL = 96
const TARGET = 71

/** Sequential scan vs B-tree index lookup on the same synthetic table. */
export default defineComponent({
  name: 'IndexScan',
  data() {
    return { total: TOTAL, target: TARGET, indexed: false, running: false, done: false, read: new Set<number>(), timer: 0 }
  },
  computed: {
    summary(): string {
      if (!this.done && !this.running) return `${TOTAL} rows · ${this.indexed ? 'B-tree index on email' : 'no index'}`
      const plan = this.indexed ? 'Index Scan' : 'Seq Scan'
      return `${plan} · rows read: ${this.read.size}${this.done ? ' · 1 row returned' : ''}`
    },
  },
  watch: {
    indexed() {
      this.reset()
    },
  },
  beforeUnmount() {
    clearInterval(this.timer)
  },
  methods: {
    reset() {
      clearInterval(this.timer)
      this.read = new Set()
      this.done = false
      this.running = false
    },
    run() {
      this.reset()
      this.running = true
      // Index: root → internal page → leaf → heap tuple.
      const path = this.indexed ? [47, 71 - 12, 71 - 3, TARGET] : Array.from({ length: TOTAL }, (_, i) => i)
      const motion = document.documentElement.dataset.motion
      const delay = motion === 'minimal' ? 0 : this.indexed ? 220 : 16
      let i = 0
      const step = () => {
        const next = new Set(this.read)
        next.add(path[i])
        this.read = next
        i++
        if (i >= path.length) {
          this.done = true
          this.running = false
          clearInterval(this.timer)
          return false
        }
        return true
      }
      if (!delay) {
        while (step()) {
          /* instant */
        }
        return
      }
      this.timer = window.setInterval(step, delay)
    },
  },
})
</script>

<style scoped>
.iscan__bar {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.iscan__sql {
  display: block;
  padding: 0.55rem 0.7rem;
  border-radius: 6px;
  background: var(--surface-sunken);
  font-size: 0.72rem;
  overflow-x: auto;
  white-space: nowrap;
}
.iscan__ctl {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  align-items: center;
}
.iscan__toggle {
  display: inline-flex;
  gap: 0.45rem;
  align-items: center;
  font-size: var(--step--1);
}
.iscan__toggle input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: var(--accent-ink);
}
.iscan__rows {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  gap: 3px;
}
.iscan__row {
  aspect-ratio: 1;
  border-radius: 2px;
  background: var(--surface-sunken);
  transition: background-color 120ms;
}
.iscan__row.is-read {
  background: var(--text-faint);
}
.iscan__row.is-hit {
  background: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-ink);
}
.iscan__result {
  margin: 0.8rem 0 0;
  font-size: 0.74rem;
  color: var(--text-muted);
}
@media (max-width: 560px) {
  .iscan__rows {
    grid-template-columns: repeat(16, 1fr);
  }
}
</style>
