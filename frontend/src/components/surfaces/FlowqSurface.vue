<template>
  <SurfaceFrame url="branch.example/counters" caption="Kiosk ticket → fair routing → counter call → live display" @active="onActive">
    <template #default>
      <div class="fq">
        <section class="fq__now" aria-label="Now serving display (synthetic)" aria-live="polite">
          <p class="mono fq__label">Now serving</p>
          <p class="fq__ticket display" :key="lastCall?.id ?? 'none'">{{ lastCall ? lastCall.id : '-' }}</p>
          <p class="fq__counter mono">{{ lastCall ? `→ Counter ${lastCall.counter}` : 'Waiting for first call' }}</p>
        </section>

        <section class="fq__queue" aria-label="Waiting queue">
          <div class="fq__qhead">
            <p class="mono fq__label">Waiting · {{ waiting.length }}</p>
            <button type="button" class="fq__kiosk" @click="takeTicket">Take ticket</button>
          </div>
          <TransitionGroup tag="ul" name="tk" class="fq__list" role="list">
            <li v-for="t in waiting" :key="t.id" class="fq__item" :class="{ 'is-priority': t.priority }">
              <span class="mono">{{ t.id }}</span>
              <span>{{ t.service }}</span>
              <span class="mono fq__wait">{{ waitLabel(t) }}</span>
            </li>
          </TransitionGroup>
          <p v-if="!waiting.length" class="fq__empty mono">Queue is empty</p>
        </section>

        <section class="fq__counters" aria-label="Counters">
          <article v-for="c in counters" :key="c.id" class="fq__c" :class="{ 'is-busy': !!c.serving }">
            <header>
              <span class="mono">Counter {{ c.id }}</span>
              <span class="fq__cstate mono">{{ c.serving ? 'Serving' : 'Available' }}</span>
            </header>
            <p class="fq__cticket">{{ c.serving ? c.serving.id : '-' }}</p>
            <div class="fq__cactions">
              <button type="button" :disabled="!!c.serving || !waiting.length" @click="callNext(c.id)">Call next</button>
              <button type="button" :disabled="!c.serving" @click="complete(c.id)">Complete</button>
            </div>
          </article>
        </section>

        <p class="fq__why mono" role="status">{{ reason }}</p>
      </div>
    </template>
  </SurfaceFrame>
</template>

<script lang="ts">
import { defineComponent, markRaw } from 'vue'
import SurfaceFrame from './SurfaceFrame.vue'
import { mulberry32 } from '@/engine/sim/random'

interface Ticket {
  id: string
  service: string
  priority: boolean
  at: number
}
interface Counter {
  id: number
  serving: Ticket | null
}

const SERVICES = ['Accounts', 'Loans', 'Cards', 'Enquiry']

/**
 * FlowQ demonstration: tickets arrive from a kiosk; calling the next
 * ticket applies a priority-then-FIFO rule and records why; the live
 * display announces the call. Synthetic and deterministic.
 */
export default defineComponent({
  name: 'FlowqSurface',
  components: { SurfaceFrame },
  data() {
    return {
      seq: 40,
      clock: 0,
      waiting: [] as Ticket[],
      counters: [1, 2, 3].map((id) => ({ id, serving: null })) as Counter[],
      lastCall: null as null | { id: string; counter: number },
      reason: 'Routing: priority tickets first, then first-come.',
      timer: 0,
      rnd: markRaw({ fn: mulberry32(19) }),
      touched: false,
    }
  },
  created() {
    for (let i = 0; i < 4; i++) this.issue(i === 2)
  },
  beforeUnmount() {
    clearInterval(this.timer)
  },
  methods: {
    onActive(v: boolean) {
      clearInterval(this.timer)
      if (!v || document.documentElement.dataset.motion === 'minimal') return
      this.timer = window.setInterval(() => this.tick(), 1100)
    },
    tick() {
      this.clock += 1
      const r = this.rnd.fn
      if (this.waiting.length < 6 && r() < 0.45) this.issue(r() < 0.15)
      if (this.touched) return
      // Autopilot: counters finish and call like a real branch.
      for (const c of this.counters) {
        if (c.serving && r() < 0.28) this.complete(c.id, true)
        else if (!c.serving && this.waiting.length && r() < 0.5) {
          this.callNext(c.id, true)
          break
        }
      }
    },
    issue(priority = false) {
      this.seq += 1
      const prefix = priority ? 'P' : 'A'
      this.waiting.push({
        id: `${prefix}-${String(this.seq).padStart(3, '0')}`,
        service: SERVICES[this.seq % SERVICES.length],
        priority,
        at: this.clock,
      })
    },
    takeTicket() {
      this.touched = true
      this.issue(false)
      this.reason = `Kiosk issued ${this.waiting[this.waiting.length - 1].id} . The QR code follows the customer.`
    },
    callNext(counterId: number, auto = false) {
      if (!auto) this.touched = true
      if (!this.waiting.length) return
      const pi = this.waiting.findIndex((t) => t.priority)
      const idx = pi >= 0 ? pi : 0
      const [t] = this.waiting.splice(idx, 1)
      const c = this.counters.find((x) => x.id === counterId)!
      c.serving = t
      this.lastCall = { id: t.id, counter: c.id }
      this.reason =
        pi >= 0 && pi !== 0
          ? `Called ${t.id} ahead of ${this.waiting[0]?.id ?? 'others'}: priority rule.`
          : `Called ${t.id}: first-come, waited ${this.waitLabel(t)}.`
    },
    complete(counterId: number, auto = false) {
      if (!auto) this.touched = true
      const c = this.counters.find((x) => x.id === counterId)!
      c.serving = null
    },
    waitLabel(t: Ticket): string {
      const m = (this.clock - t.at) * 1 + 1
      return `${m}m`
    },
  },
})
</script>

<style scoped>
.fq {
  --fq: oklch(0.62 0.12 230);
  /* Fixed geometry: the queue and the status line reserve their full size,
     so the surface never grows or shrinks as tickets come and go. */
  --fq-row: 1.95rem;
  --fq-gap: 0.25rem;
  --fq-rows: 6;
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  grid-template-areas:
    'now queue'
    'counters counters'
    'why why';
  gap: 0.9rem;
  padding: 1rem;
  font-size: 0.78rem;
}
.fq__label {
  margin: 0;
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
.fq__now {
  grid-area: now;
  display: grid;
  align-content: center;
  padding: 1rem;
  border-radius: 10px;
  background: var(--text);
  color: var(--bg);
}
.fq__now .fq__label {
  color: color-mix(in oklab, var(--bg) 70%, transparent);
}
.fq__ticket {
  margin: 0.3rem 0;
  font-size: clamp(2.4rem, 5vw, 3.6rem);
  line-height: 1;
  animation: fq-call 620ms cubic-bezier(0.2, 1.4, 0.3, 1);
}
.fq__counter {
  margin: 0;
  color: var(--accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fq__queue {
  grid-area: queue;
  position: relative;
}
.fq__qhead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.4rem;
}
.fq__kiosk {
  min-height: 1.9rem;
  padding: 0 0.7rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 0.72rem;
  cursor: pointer;
}
.fq__list {
  position: relative;
  height: calc(var(--fq-rows) * var(--fq-row) + (var(--fq-rows) - 1) * var(--fq-gap));
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-auto-rows: var(--fq-row);
  align-content: start;
  gap: var(--fq-gap);
  overflow: hidden;
}
/* More tickets than rows: fade the last row instead of growing. */
.fq__list:has(> :nth-child(7)) {
  mask-image: linear-gradient(to bottom, #000 calc(100% - var(--fq-row)), transparent);
}
.fq__empty {
  position: absolute;
  inset: auto 0 0 0;
  top: 2.3rem;
  display: grid;
  place-items: center;
  margin: 0;
  border: 1px dashed var(--border);
  border-radius: 6px;
  color: var(--text-faint);
  font-size: 0.68rem;
}
.fq__item {
  display: grid;
  grid-template-columns: 3.6rem 1fr auto;
  align-items: center;
  gap: 0.5rem;
  height: var(--fq-row);
  box-sizing: border-box;
  padding: 0 0.55rem;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.fq__item.is-priority {
  border-color: var(--fq);
  background: color-mix(in oklab, var(--fq) 10%, var(--surface));
}
.fq__wait {
  color: var(--text-muted);
}
.fq__counters {
  grid-area: counters;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}
.fq__c {
  padding: 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  transition: border-color 200ms, background-color 200ms;
}
.fq__c.is-busy {
  border-color: var(--fq);
}
.fq__c header {
  display: flex;
  justify-content: space-between;
  font-size: 0.66rem;
}
.fq__cstate {
  color: var(--text-muted);
}
.fq__cticket {
  margin: 0.3rem 0 0.5rem;
  font-family: var(--font-mono);
  font-size: 1.15rem;
  font-weight: 600;
}
.fq__cactions {
  display: flex;
  gap: 0.3rem;
}
.fq__cactions button {
  flex: 1;
  min-height: 1.9rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 0.68rem;
  cursor: pointer;
}
.fq__cactions button:disabled {
  opacity: 0.4;
  cursor: default;
}
.fq__why {
  grid-area: why;
  margin: 0;
  font-size: 0.68rem;
  line-height: 1.45;
  /* Always two lines tall, whatever the message. */
  height: calc(2 * 1.45em);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  color: var(--text-muted);
}
.tk-enter-from {
  opacity: 0;
  transform: translateX(14px);
}
.tk-enter-active {
  transition: opacity 240ms, transform 460ms cubic-bezier(0.2, 1.3, 0.3, 1);
}
.tk-leave-to {
  opacity: 0;
  transform: translateX(-18px) scale(0.96);
}
.tk-leave-active {
  position: absolute;
  width: 100%;
  transition: opacity 200ms, transform 260ms;
}
.tk-move {
  transition: transform 460ms cubic-bezier(0.2, 1.2, 0.3, 1);
}
@keyframes fq-call {
  from {
    transform: scale(0.8);
    opacity: 0;
  }
}
@container surface (max-width: 640px) {
  .fq {
    grid-template-columns: 1fr;
    grid-template-areas: 'now' 'queue' 'counters' 'why';
  }
  .fq__counters {
    grid-template-columns: 1fr;
  }
}
</style>
