<template>
  <div class="fan">
    <div class="sim-buttons" role="group" aria-label="Execution strategy">
      <button type="button" class="sim-btn" :aria-pressed="!parallel ? 'true' : 'false'" @click="parallel = false">Sequential</button>
      <button type="button" class="sim-btn" :aria-pressed="parallel ? 'true' : 'false'" @click="parallel = true">errgroup (concurrent)</button>
    </div>
    <div class="fan__chart" role="img" :aria-label="`${parallel ? 'Concurrent' : 'Sequential'} calls finish in ${total} ms`">
      <div v-for="(c, i) in calls" :key="c.name" class="fan__row">
        <span class="mono fan__name">{{ c.name }}</span>
        <span class="fan__lane">
          <span class="fan__bar" :style="barStyle(i)" />
        </span>
      </div>
      <div class="fan__axis mono"><span>0</span><span>{{ scale }} ms</span></div>
    </div>
    <p class="fan__total mono" role="status">
      Total: <b>{{ total }} ms</b> {{ parallel ? `, bounded by the slowest call` : ', the sum of every call' }}
    </p>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

const CALLS = [
  { name: 'profile', ms: 180 },
  { name: 'courses', ms: 320 },
  { name: 'payments', ms: 140 },
  { name: 'notices', ms: 260 },
]

/** Independent calls run one after another vs concurrently with errgroup. Illustrative timings. */
export default defineComponent({
  name: 'FanOut',
  data() {
    return { calls: CALLS, parallel: false, scale: CALLS.reduce((n, c) => n + c.ms, 0) }
  },
  computed: {
    total(): number {
      return this.parallel ? Math.max(...CALLS.map((c) => c.ms)) : CALLS.reduce((n, c) => n + c.ms, 0)
    },
  },
  methods: {
    barStyle(i: number) {
      const start = this.parallel ? 0 : CALLS.slice(0, i).reduce((n, c) => n + c.ms, 0)
      return {
        transform: `translateX(${(start / this.scale) * 100}%)`,
        width: `${(CALLS[i].ms / this.scale) * 100}%`,
      }
    },
  },
})
</script>

<style scoped>
.fan__chart {
  display: grid;
  gap: 0.4rem;
  margin: 1rem 0 0.75rem;
}
.fan__row {
  display: grid;
  grid-template-columns: 5rem 1fr;
  align-items: center;
  gap: 0.6rem;
}
.fan__name {
  font-size: 0.72rem;
}
.fan__lane {
  position: relative;
  height: 1.1rem;
  border-radius: 4px;
  background: var(--surface-sunken);
}
.fan__bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 4px;
  background: var(--text);
  transition: transform 620ms cubic-bezier(0.2, 1.15, 0.3, 1);
}
.fan__axis {
  display: flex;
  justify-content: space-between;
  margin-left: 5.6rem;
  font-size: 0.64rem;
  color: var(--text-muted);
}
.fan__total {
  margin: 0;
  font-size: 0.78rem;
}
.fan__total b {
  color: var(--accent-ink);
}
</style>
