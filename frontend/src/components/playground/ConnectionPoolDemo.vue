<template>
  <SimShell
    id="sim-pool"
    :index="index"
    kicker="Connection pool"
    title="When the pool runs dry"
    description="Concurrent clients borrow connections for short queries. Raise concurrency past the pool size and requests start to queue; past the timeout, they fail."
  >
    <template #viz>
      <canvas ref="canvas" class="viz-canvas" role="img" :aria-label="ariaSummary" />
    </template>
    <template #controls>
      <RangeField v-model="clients" label="Concurrent clients" :min="1" :max="64" />
      <RangeField v-model="pool" label="Pool size" :min="1" :max="24" />
      <RangeField v-model="timeout" label="Wait timeout" :min="0.2" :max="3" :step="0.1" unit="s" :decimals="1" />
      <div class="sim-buttons">
        <button type="button" class="sim-btn sim-btn--icon" :aria-pressed="playing ? 'true' : 'false'" :aria-label="playing ? 'Pause' : 'Play'" @click="playing = !playing">
          <AppIcon :name="playing ? 'pause' : 'play'" :size="16" />
        </button>
        <button type="button" class="sim-btn sim-btn--icon" aria-label="Reset" @click="reset">
          <AppIcon name="reset" :size="16" />
        </button>
      </div>
    </template>
    <template #stats>
      <div><dt>In use</dt><dd>{{ stats.inUse }}/{{ pool }}</dd></div>
      <div><dt>Waiting</dt><dd :class="{ 'is-tension': stats.waiting > 0 }">{{ stats.waiting }}</dd></div>
      <div><dt>p50 wait</dt><dd>{{ ms(stats.p50) }}</dd></div>
      <div><dt>p95 wait</dt><dd :class="{ 'is-tension': stats.p95 > timeout * 0.6 }">{{ ms(stats.p95) }}</dd></div>
      <div><dt>Queries/s</dt><dd>{{ stats.throughput.toFixed(1) }}</dd></div>
      <div><dt>Timeouts</dt><dd :class="{ 'is-tension': stats.errors > 0 }">{{ stats.errors }}</dd></div>
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
import { ConnectionPoolSim, type PoolStats } from '@/engine/sim/connectionPool'
import { fitCanvas, roundRect } from '@/engine/rendering/canvas2d'
import { reportLoad } from '@/services/pulse'

export default defineComponent({
  name: 'ConnectionPoolDemo',
  components: { SimShell, RangeField, AppIcon },
  mixins: [simMixin],
  props: {
    index: { type: String, default: '§05.2' },
  },
  data() {
    return {
      sim: markRaw(new ConnectionPoolSim(16, 4)),
      clients: 16,
      pool: 4,
      timeout: 1,
      loadSource: 'pool',
    }
  },
  computed: {
    stats(): PoolStats {
      void this.statsTick
      return this.sim.stats()
    },
    insight(): string {
      const s = this.stats
      if (s.errors > 0 && s.waiting > 0) return 'The pool is exhausted: waits exceed the timeout and requests fail fast instead of piling up.'
      if (s.waiting > 0) return 'Requests are queueing for connections, so latency now includes time spent waiting, not just the query.'
      return 'Every request finds an idle connection; wait time stays near zero.'
    },
    ariaSummary(): string {
      return `${this.stats.inUse} of ${this.pool} connections in use, ${this.stats.waiting} requests waiting, ${this.stats.errors} timeouts.`
    },
  },
  watch: {
    clients(n: number) {
      this.sim.setClients(n)
      this.draw()
    },
    pool(n: number) {
      this.sim.setPoolSize(n)
      this.draw()
    },
    timeout(t: number) {
      this.sim.timeout = t
    },
  },
  methods: {
    ms(s: number) {
      return `${Math.round(s * 1000)} ms`
    },
    reset() {
      this.sim = markRaw(new ConnectionPoolSim(this.clients, this.pool))
      this.sim.timeout = this.timeout
      this.statsTick++
      this.draw()
    },
    simStep(dt: number) {
      this.sim.step(dt)
      reportLoad(this.loadSource, this.sim.waitQueue.length / Math.max(8, this.sim.clients.length * 0.6))
    },
    draw() {
      const canvas = this.$refs.canvas as HTMLCanvasElement | undefined
      const ink = this.ink
      if (!canvas || !ink) return
      const { ctx, w, h } = fitCanvas(canvas)
      ctx.clearRect(0, 0, w, h)
      const pad = 18
      ctx.font = '500 10px "Geist Mono", ui-monospace, monospace'
      ctx.textBaseline = 'top'

      // Columns: clients | pool | database
      const clientsW = w * 0.34
      const poolX = w * 0.48
      const dbX = w - pad - 56
      const n = this.sim.clients.length
      const cols = Math.ceil(Math.sqrt(n * (clientsW / (h - pad * 3))))
      const rows = Math.ceil(n / cols)
      const cell = Math.min((clientsW - pad) / cols, (h - pad * 3) / rows, 26)
      const pos: { x: number; y: number }[] = []

      ctx.fillStyle = ink.muted
      ctx.fillText('CLIENTS', pad, pad)
      ctx.fillText('POOL', poolX, pad)
      ctx.fillText('DB', dbX, pad)

      const slots = this.sim.conns.length
      const slotH = Math.min(26, (h - pad * 3) / slots)
      const slotTop = pad + 22 + ((h - pad * 3 - 4) - slotH * slots) / 2

      this.sim.clients.forEach((_c, i) => {
        const x = pad + (i % cols) * cell + cell / 2
        const y = pad + 26 + Math.floor(i / cols) * cell + cell / 2
        pos.push({ x, y })
      })

      // Connection lines for active queries, requests travelling through the pool.
      ctx.lineWidth = 1
      this.sim.clients.forEach((c, i) => {
        if (c.state !== 'querying' || c.conn < 0) return
        const sy = slotTop + c.conn * slotH + slotH / 2
        ctx.strokeStyle = ink.accentInk
        ctx.globalAlpha = 0.5
        ctx.beginPath()
        ctx.moveTo(pos[i].x, pos[i].y)
        ctx.bezierCurveTo(poolX - 40, pos[i].y, poolX - 40, sy, poolX, sy)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(poolX + 54, sy)
        ctx.lineTo(dbX, h / 2)
        ctx.stroke()
        ctx.globalAlpha = 1
      })

      this.sim.clients.forEach((c, i) => {
        const r = cell * 0.3
        ctx.beginPath()
        ctx.arc(pos[i].x, pos[i].y, r, 0, Math.PI * 2)
        ctx.fillStyle =
          c.state === 'querying' ? ink.accent : c.state === 'waiting' ? ink.tension : c.state === 'failed' ? ink.text : ink.border
        ctx.fill()
        if (c.state === 'failed') {
          ctx.strokeStyle = ink.tension
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      })

      for (let s = 0; s < slots; s++) {
        const y = slotTop + s * slotH
        roundRect(ctx, poolX, y + 2, 54, slotH - 4, 4)
        ctx.fillStyle = this.sim.conns[s] === null ? ink.sunken : ink.text
        ctx.fill()
      }

      // Database
      const dbY = h / 2 - 30
      ctx.fillStyle = ink.sunken
      roundRect(ctx, dbX, dbY, 56, 60, 10)
      ctx.fill()
      ctx.strokeStyle = ink.border
      ctx.stroke()
      ctx.fillStyle = ink.muted
      ctx.fillText('pg', dbX + 21, dbY + 24)

      // Waiting queue count
      if (this.sim.waitQueue.length) {
        ctx.fillStyle = ink.tension
        ctx.fillText(`${this.sim.waitQueue.length} WAITING`, poolX, h - pad - 10)
      }
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
