<template>
  <section ref="root" class="rt" :class="[`rt--${phase}`, focus ? `rt--focus-${focus}` : '']" aria-labelledby="rt-title">
    <header class="rt__head">
      <p id="rt-title" class="caption rt__title">
        fig. 1: {{ trace.source === 'probe' ? 'a fresh request, traced' : 'your request for this page, traced' }}
      </p>
      <p class="rt__rid mono" :title="trace.requestId || undefined">
        <span class="rt__rid-label">request</span>
        {{ trace.requestId ? shortId(trace.requestId) : 'measuring…' }}
      </p>
    </header>

    <div class="rt__track">
      <span class="rt__rail rt__rail--out" aria-hidden="true" />
      <span class="rt__rail rt__rail--back" aria-hidden="true" />
      <span ref="packet" class="rt__packet" aria-hidden="true" />

      <ol class="rt__stages" role="list">
        <li
          v-for="(s, i) in outStages"
          :key="s.id"
          ref="rows"
          class="rt__stage"
          :class="[`is-${s.group}`, { 'is-active': active === s.id, 'is-done': done.has(s.id), 'is-skip': s.ms === null && s.id !== 'you' }]"
          :data-stage="s.id"
        >
          <span class="rt__dot" aria-hidden="true" />
          <span class="rt__body">
            <span class="rt__label">{{ s.label }}</span>
            <span class="rt__detail">{{ s.detail }}</span>
          </span>
          <span class="rt__ms mono">
            <template v-if="s.id === 'you'">{{ i === 0 && phase === 'done' ? formatMs(trace.totalMs) : '' }}</template>
            <template v-else-if="s.ms !== null">{{ shown(s) }}</template>
            <template v-else-if="s.note">{{ s.note }}</template>
          </span>
          <span v-if="s.group === 'server' && s.id === 'mw'" class="rt__box-label caption" aria-hidden="true">Go · single binary</span>
        </li>
      </ol>

      <ol class="rt__back" role="list" aria-label="On the way back">
        <li
          v-for="s in backStages"
          :key="s.id"
          class="rt__stage rt__stage--back"
          :class="{ 'is-active': active === s.id, 'is-done': done.has(s.id) }"
        >
          <span class="rt__dot" aria-hidden="true" />
          <span class="rt__body">
            <span class="rt__label">{{ s.label }}</span>
            <span class="rt__detail">{{ s.detail }}</span>
          </span>
          <span class="rt__ms mono">{{ s.ms !== null ? shown(s) : s.note }}</span>
        </li>
      </ol>
    </div>

    <footer class="rt__foot">
      <div class="rt__bar" role="img" :aria-label="barLabel">
        <span
          v-for="b in bars"
          :key="b.group"
          class="rt__seg"
          :class="`is-${b.group}`"
          :style="{ flexGrow: Math.max(b.share, 0.02) }"
        />
      </div>
      <ul class="rt__legend caption" role="list">
        <li v-for="b in bars" :key="b.group"><i :class="`is-${b.group}`" aria-hidden="true" />{{ groupLabel[b.group] }} {{ formatMs(b.ms) }}</li>
      </ul>
      <div class="rt__actions">
        <button type="button" class="sim-btn sim-btn--primary" :disabled="busy" @click="sendNew">
          {{ busy ? 'Tracing…' : 'Send a new request' }}
        </button>
        <button type="button" class="sim-btn" :disabled="busy || !measured" @click="replay">Replay</button>
      </div>
      <p class="rt__note caption" role="status" aria-live="polite">{{ status }}</p>
    </footer>
  </section>
</template>

<script lang="ts">
import { defineComponent, markRaw, type PropType } from 'vue'
import {
  animationMs,
  breakdown,
  formatMs,
  pageTrace,
  placeholderTrace,
  probe,
  type Stage,
  type StageGroup,
  type Trace,
} from '@/engine/trace/trace'
import { whenVisible } from '@/engine/animation/reveal'

/**
 * The landing-page centrepiece: the visitor's own request, traced through
 * the stack that served it. Numbers come from the browser's timing APIs and
 * the Go server's Server-Timing header. The packet's travel is slowed down
 * (log-scaled) so microseconds stay watchable; the labels show real times.
 */
export default defineComponent({
  name: 'RequestTrace',
  props: {
    /** Only the active hero measures and animates. */
    enabled: { type: Boolean, default: false },
    /** Group highlighted by the scroll story. */
    focus: { type: String as PropType<StageGroup | null>, default: null },
  },
  data() {
    return {
      trace: placeholderTrace() as Trace,
      measured: false,
      phase: 'idle' as 'idle' | 'playing' | 'done',
      active: '' as string,
      done: new Set<string>(),
      busy: false,
      status: '',
      runId: 0,
      started: false,
      cleanups: [] as (() => void)[],
      abort: null as AbortController | null,
      groupLabel: { network: 'Network', server: 'Go server', data: 'Database', browser: 'Browser' } as Record<StageGroup, string>,
    }
  },
  computed: {
    outStages(): Stage[] {
      return this.trace.stages.filter((s) => s.leg === 'out')
    },
    backStages(): Stage[] {
      return this.trace.stages.filter((s) => s.leg === 'back')
    },
    bars() {
      return this.measured ? breakdown(this.trace) : []
    },
    barLabel(): string {
      if (!this.measured) return 'Measuring where the time goes'
      return 'Where the time went: ' + this.bars.map((b) => `${this.groupLabel[b.group]} ${formatMs(b.ms)}`).join(', ')
    },
  },
  watch: {
    enabled(on: boolean) {
      if (on) this.start()
    },
  },
  mounted() {
    if (this.enabled) this.start()
  },
  beforeUnmount() {
    this.runId++
    this.abort?.abort()
    this.cleanups.forEach((c) => c())
  },
  methods: {
    formatMs,
    shortId(id: string) {
      return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
    },
    shown(s: Stage): string {
      return this.done.has(s.id) || this.phase === 'done' ? formatMs(s.ms) : ''
    },
    start() {
      if (this.started) return
      this.started = true
      // The app-mounted mark lands right after mount; give it a frame.
      requestAnimationFrame(() =>
        setTimeout(() => {
          const t = pageTrace()
          if (t) {
            this.trace = markRaw(t)
            this.measured = true
          }
          this.cleanups.push(
            whenVisible(this.$refs.root as Element, (v) => {
              if (v && this.phase === 'idle') this.play()
            }, '0px'),
          )
        }, 60),
      )
    },
    async sendNew() {
      this.busy = true
      this.status = ''
      this.abort?.abort()
      this.abort = new AbortController()
      try {
        this.trace = markRaw(await probe(this.abort.signal))
        this.measured = true
        await this.play()
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        this.status =
          (e as Error).message === 'rate_limited'
            ? 'That is a lot of requests. Give it a minute.'
            : 'The request did not come back. Try again in a moment.'
      } finally {
        this.busy = false
      }
    },
    async replay() {
      await this.play()
    },
    rowCenter(id: string): number | null {
      const root = this.$refs.root as HTMLElement | undefined
      const el = root?.querySelector<HTMLElement>(`[data-stage="${id}"] .rt__dot`)
      const track = root?.querySelector<HTMLElement>('.rt__track')
      if (!el || !track) return null
      const a = el.getBoundingClientRect()
      const b = track.getBoundingClientRect()
      return a.top - b.top + a.height / 2
    },
    async move(y: number, ms: number, back: boolean) {
      const p = this.$refs.packet as HTMLElement | undefined
      if (!p) return
      const to = `translate3d(0, ${y}px, 0)`
      p.classList.toggle('is-back', back)
      const anim = p.animate([{ transform: getComputedStyle(p).transform === 'none' ? to : getComputedStyle(p).transform }, { transform: to }], {
        duration: ms,
        easing: 'cubic-bezier(0.45, 0, 0.2, 1)',
        fill: 'forwards',
      })
      await anim.finished.catch(() => {})
    },
    async play() {
      const run = ++this.runId
      const motion = document.documentElement.dataset.motion
      const instant = motion === 'minimal' || motion === 'reduced'
      this.phase = 'playing'
      this.done = new Set()
      const stages = this.outStages.filter((s) => s.id === 'you' || s.ms !== null)
      const visit = async (s: Stage, back: boolean, anchorId: string) => {
        if (run !== this.runId) return false
        this.active = s.id
        const y = this.rowCenter(anchorId)
        if (!instant && y !== null) await this.move(y, animationMs(s.ms), back)
        if (run !== this.runId) return false
        this.done = new Set([...this.done, s.id])
        return true
      }
      for (const s of stages) if (!(await visit(s, false, s.id))) return
      // The response climbs back up the right-hand rail to "Your browser".
      for (const s of this.backStages) if (!(await visit(s, true, 'you'))) return
      for (const s of this.trace.stages) this.done.add(s.id)
      this.active = ''
      this.phase = 'done'
      const server = this.trace.serverMs !== null ? `, of which the Go server took ${formatMs(this.trace.serverMs)}` : ''
      this.status = this.trace.cached
        ? 'This page came from your browser cache. Send a new request to see the server.'
        : `Traced: ${formatMs(this.trace.totalMs)} end to end${server}.`
    },
  },
})
</script>

<style scoped>
.rt {
  --rail-x: 11px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: min(34rem, 100%);
  container-type: inline-size;
}
.rt__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  flex-wrap: wrap;
}
.rt__title {
  margin: 0;
}
.rt__rid {
  margin: 0;
  font-size: var(--step--1);
  color: var(--text);
}
.rt__rid-label {
  color: var(--text-muted);
  margin-right: 0.35rem;
  font-size: var(--step--2);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.rt__track {
  position: relative;
  padding: 0.25rem 0;
}
.rt__rail {
  position: absolute;
  top: 1.1rem;
  bottom: 1.1rem;
  width: 2px;
  border-radius: 2px;
}
.rt__rail--out {
  left: var(--rail-x);
  background: linear-gradient(var(--border-strong), var(--border-strong));
}
.rt__rail--back {
  right: 0;
  background: repeating-linear-gradient(to bottom, var(--accent-ink) 0 4px, transparent 4px 9px);
  opacity: 0.35;
}
.rt__packet {
  position: absolute;
  top: 0;
  left: calc(var(--rail-x) - 7px);
  width: 16px;
  height: 16px;
  margin-top: -8px;
  border-radius: 50%;
  background: var(--text);
  box-shadow:
    0 0 0 4px var(--bg),
    0 0 18px 4px color-mix(in oklab, var(--accent) 60%, transparent);
  opacity: 0;
  transition:
    left 360ms var(--ease-premium),
    background-color 200ms;
  z-index: 2;
}
.rt--playing .rt__packet {
  opacity: 1;
}
.rt__packet.is-back {
  left: calc(100% - 7px);
  background: var(--accent);
}
.rt__stages,
.rt__back {
  list-style: none;
  margin: 0;
  padding: 0;
}
.rt__back {
  margin-top: 0.4rem;
  padding-top: 0.4rem;
  border-top: 1px dashed var(--border);
}
.rt__stage {
  position: relative;
  display: grid;
  grid-template-columns: calc(var(--rail-x) * 2 + 2px) minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  min-height: 3.1rem;
  padding: 0.3rem 1.25rem 0.3rem 0;
  transition: opacity 300ms var(--ease-out);
}
.rt__dot {
  justify-self: center;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--bg);
  border: 2px solid var(--border-strong);
  transition:
    background-color 200ms,
    border-color 200ms,
    transform 300ms cubic-bezier(0.2, 1.6, 0.3, 1);
  z-index: 1;
}
.rt__body {
  display: grid;
  min-width: 0;
}
.rt__label {
  font-weight: 500;
  font-size: var(--step--1);
}
.rt__detail {
  color: var(--text-muted);
  font-size: var(--step--2);
  line-height: 1.35;
}
.rt__ms {
  font-size: var(--step--1);
  text-align: right;
  white-space: nowrap;
  color: var(--text);
}
.rt__stage.is-skip .rt__ms {
  color: var(--text-faint);
  font-size: var(--step--2);
  white-space: normal;
  max-width: 11rem;
}
.rt__stage.is-skip {
  opacity: 0.55;
}
.rt__stage.is-active .rt__dot {
  transform: scale(1.5);
  border-color: var(--text);
}
.rt__stage.is-done .rt__dot {
  background: var(--text);
  border-color: var(--text);
}
.rt__stage.is-server.is-done .rt__dot,
.rt__stage.is-data.is-done .rt__dot {
  background: var(--accent);
  border-color: var(--accent-ink);
}
/* The two Go stages sit inside one box: a single binary. */
.rt__stage.is-server {
  background: color-mix(in oklab, var(--accent) 7%, transparent);
}
.rt__stage[data-stage='mw'] {
  border-radius: 10px 10px 0 0;
  margin-top: 1.1rem;
}
.rt__stage[data-stage='app'] {
  border-radius: 0 0 10px 10px;
}
.rt__box-label {
  position: absolute;
  top: -1.15rem;
  left: calc(var(--rail-x) * 2 + 0.75rem);
  font-size: 0.62rem;
  color: var(--accent-ink);
}
.rt__stage--back .rt__dot {
  border-style: dashed;
}
.rt__stage--back.is-done .rt__dot {
  background: var(--accent);
  border: 2px solid var(--accent-ink);
}
.rt--focus-network .rt__stage:not(.is-network),
.rt--focus-server .rt__stage:not(.is-server),
.rt--focus-data .rt__stage:not(.is-data) {
  opacity: 0.4;
}
.rt__foot {
  display: grid;
  gap: 0.6rem;
}
.rt__bar {
  display: flex;
  gap: 2px;
  height: 8px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface-sunken);
}
.rt__seg {
  flex-basis: 0;
  transition: flex-grow 700ms var(--ease-premium);
}
.is-network {
  --c: var(--text-muted);
}
.is-server {
  --c: var(--accent);
}
.is-data {
  --c: var(--accent-ink);
}
.is-browser {
  --c: var(--tension);
}
.rt__seg {
  background: var(--c);
}
.rt__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
  text-transform: none;
}
.rt__legend i {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 0.4rem;
  border-radius: 2px;
  background: var(--c);
}
.rt__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.rt__note {
  margin: 0;
  min-height: 1.4em;
  text-transform: none;
  letter-spacing: 0.01em;
}
@media (min-width: 900px) and (max-height: 820px) {
  .rt__detail {
    display: none;
  }
  .rt__stage {
    min-height: 2.35rem;
  }
}
@container (max-width: 380px) {
  .rt__detail {
    display: none;
  }
  .rt__stage {
    min-height: 2.4rem;
  }
}
</style>
