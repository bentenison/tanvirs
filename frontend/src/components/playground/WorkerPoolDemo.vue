<template>
  <SimShell
    id="sim-workers"
    :index="index"
    kicker="Goroutine worker pool"
    title="Bounded concurrency"
    description="Jobs arrive on a buffered channel and N goroutines drain it. Add workers or arrivals and watch the queue either drain or grow without bound."
  >
    <template #viz>
      <canvas ref="canvas" class="viz-canvas" role="img" :aria-label="ariaSummary" />
    </template>
    <template #controls>
      <RangeField v-model="workers" label="Workers" :min="1" :max="32" />
      <RangeField v-model="rate" label="Arrivals" :min="0" :max="30" :step="0.5" unit="/s" :decimals="1" />
      <div class="sim-buttons">
        <button type="button" class="sim-btn" @click="burst">Burst +40 jobs</button>
        <button type="button" class="sim-btn sim-btn--icon" :aria-pressed="playing ? 'true' : 'false'" :aria-label="playing ? 'Pause' : 'Play'" @click="playing = !playing">
          <AppIcon :name="playing ? 'pause' : 'play'" :size="16" />
        </button>
        <button type="button" class="sim-btn sim-btn--icon" aria-label="Reset" @click="reset">
          <AppIcon name="reset" :size="16" />
        </button>
      </div>
    </template>
    <template #stats>
      <div><dt>Queued</dt><dd :class="{ 'is-tension': stats.queued > 30 }">{{ stats.queued }}</dd></div>
      <div><dt>In flight</dt><dd>{{ stats.inFlight }}</dd></div>
      <div><dt>Throughput</dt><dd>{{ stats.throughput.toFixed(1) }}/s</dd></div>
      <div><dt>Avg wait</dt><dd>{{ (stats.avgWait * 1000).toFixed(0) }} ms</dd></div>
      <div><dt>Capacity</dt><dd>{{ capacity.toFixed(1) }}/s</dd></div>
      <div><dt>Done</dt><dd>{{ stats.done }}</dd></div>
    </template>
    <template #insight>{{ insight }}</template>
  </SimShell>
</template>

<script lang="ts">
import { defineComponent, markRaw } from 'vue'
import SimShell from './SimShell.vue'
import simMixin from './simMixin'
import RangeField from '@/components/ui/RangeField.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { WorkerPoolSim, type WorkerPoolStats } from '@/engine/sim/workerPool'
import { fitCanvas, roundRect } from '@/engine/rendering/canvas2d'
import { reportLoad } from '@/services/pulse'

export default defineComponent({
  name: 'WorkerPoolDemo',
  components: { SimShell, RangeField, AppIcon },
  mixins: [simMixin],
  props: {
    index: { type: String, default: '§05.1' },
  },
  data() {
    return {
      sim: markRaw(new WorkerPoolSim(4)),
      workers: 4,
      rate: 6,
      loadSource: 'workers',
    }
  },
  computed: {
    stats(): WorkerPoolStats {
      void this.statsTick
      return this.sim.stats()
    },
    capacity(): number {
      void this.statsTick
      return this.sim.capacity()
    },
    insight(): string {
      const cap = this.capacity
      if (this.rate === 0) return 'Arrivals are off. Use a burst to see the pool drain a backlog.'
      if (this.rate > cap * 1.02) return `Arrivals (${this.rate.toFixed(1)}/s) exceed capacity (${cap.toFixed(1)}/s): the queue will grow until something applies back-pressure.`
      if (this.rate > cap * 0.85) return 'Running close to capacity, so small bursts cause long waits.'
      return 'Capacity comfortably exceeds arrivals; the queue stays near empty.'
    },
    ariaSummary(): string {
      return `Worker pool with ${this.workers} workers, ${this.stats.queued} jobs queued, ${this.stats.inFlight} in flight.`
    },
  },
  watch: {
    workers(n: number) {
      this.sim.setWorkers(n)
      this.draw()
    },
    rate(r: number) {
      this.sim.arrivalRate = r
    },
  },
  methods: {
    burst() {
      this.sim.burst(40)
      this.draw()
    },
    reset() {
      this.sim = markRaw(new WorkerPoolSim(this.workers))
      this.sim.arrivalRate = this.rate
      this.statsTick++
      this.draw()
    },
    simStep(dt: number) {
      this.sim.step(dt)
      reportLoad(this.loadSource, this.sim.queue.length / 60)
    },
    draw() {
      const canvas = this.$refs.canvas as HTMLCanvasElement | undefined
      const ink = this.ink
      if (!canvas || !ink) return
      const { ctx, w, h } = fitCanvas(canvas)
      ctx.clearRect(0, 0, w, h)
      const pad = 18
      const qW = w * 0.26
      const lanesX = qW + 34
      const lanesW = w - lanesX - pad - 44
      ctx.font = '500 10px "Geist Mono", ui-monospace, monospace'
      ctx.textBaseline = 'top'

      // Queue: stacked job dots, newest on top.
      ctx.fillStyle = ink.muted
      ctx.fillText('CHANNEL', pad, pad)
      const cols = 6
      const cell = Math.min(12, (qW - pad) / cols)
      const maxDots = Math.floor((h - pad * 3) / cell) * cols
      const q = this.sim.queue
      const shown = Math.min(q.length, maxDots)
      for (let i = 0; i < shown; i++) {
        const cx = pad + (i % cols) * cell + cell / 2
        const cy = h - pad - Math.floor(i / cols) * cell - cell / 2
        ctx.beginPath()
        ctx.arc(cx, cy, cell * 0.32, 0, Math.PI * 2)
        ctx.fillStyle = q.length > 30 ? ink.tension : ink.text
        ctx.fill()
      }
      if (q.length > shown) {
        ctx.fillStyle = ink.tension
        ctx.fillText(`+${q.length - shown}`, pad, pad + 14)
      }

      // Workers: one lane each, bar shows progress of the current job.
      ctx.fillStyle = ink.muted
      ctx.fillText('GOROUTINES', lanesX, pad)
      const n = this.sim.workers.length
      const top = pad + 20
      const laneH = Math.min(22, (h - top - pad) / n)
      const maxDone = Math.max(1, ...this.sim.workers.map((x) => x.completed))
      this.sim.workers.forEach((wk, i) => {
        const y = top + i * laneH
        const bh = Math.max(2, laneH - 4)
        roundRect(ctx, lanesX, y, lanesW, bh, bh / 2)
        ctx.fillStyle = ink.sunken
        ctx.fill()
        if (wk.job) {
          const p = 1 - Math.max(0, wk.remaining) / wk.job.cost
          roundRect(ctx, lanesX, y, Math.max(bh, lanesW * p), bh, bh / 2)
          ctx.fillStyle = ink.accent
          ctx.fill()
        }
        // Completed tally
        const tw = 36 * (wk.completed / maxDone)
        ctx.fillStyle = ink.faint
        ctx.fillRect(lanesX + lanesW + 8, y + bh / 2 - 1, Math.max(1, tw), 2)
      })
    },
  },
})
</script>

<style scoped>
.viz-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
