<template>
  <SimShell
    id="sim-cache"
    :index="index"
    kicker="Cache"
    title="Hits, misses, expiry, eviction"
    description="An LRU cache with a time-to-live sits in front of a slow store. Request keys yourself or let skewed traffic run, and watch entries move, expire and fall out."
  >
    <template #viz>
      <div class="cache">
        <div class="cache__keys" role="group" aria-label="Request a key">
          <button
            v-for="(k, i) in keys"
            :key="k"
            type="button"
            class="cache__key mono"
            :style="{ '--heat': heat(i) }"
            @click="request(k)"
          >
            {{ k }}
          </button>
        </div>

        <div class="cache__store">
          <p class="caption">Cache · most recent first · {{ entries.length }}/{{ capacity }}</p>
          <TransitionGroup tag="ol" name="slot" class="cache__slots">
            <li
              v-for="e in entries"
              :key="e.key"
              class="cache__slot"
              :class="{ 'is-flash': flash === e.key, [`is-${flashKind}`]: flash === e.key }"
            >
              <span class="mono">{{ e.key }}</span>
              <span class="cache__ttl" :aria-label="`expires in ${ttlLeft(e)} seconds`">
                <span class="cache__ttl-fill" :style="{ transform: `scaleX(${remaining(e)})` }" />
              </span>
            </li>
            <li v-for="n in emptySlots" :key="`empty-${n}`" class="cache__slot cache__slot--empty" aria-hidden="true" />
          </TransitionGroup>
        </div>

        <ol class="cache__log" aria-label="Recent cache events" aria-live="polite">
          <li v-for="ev in events" :key="ev.seq" class="cache__ev" :class="`is-${ev.kind}`">
            <span class="cache__ev-kind mono">{{ ev.kind }}</span>
            <span class="mono">{{ ev.key }}</span>
          </li>
        </ol>
      </div>
    </template>
    <template #controls>
      <RangeField v-model="capacity" label="Capacity" :min="1" :max="8" />
      <RangeField v-model="ttl" label="Time to live" :min="1" :max="20" unit="s" />
      <div class="sim-buttons">
        <button type="button" class="sim-btn" :aria-pressed="playing ? 'true' : 'false'" @click="playing = !playing">
          {{ playing ? 'Pause traffic' : 'Run traffic' }}
        </button>
        <button type="button" class="sim-btn" @click="skip">Skip +5 s</button>
      </div>
    </template>
    <template #stats>
      <div><dt>Hit ratio</dt><dd>{{ Math.round(sim.hitRatio * 100) }}%</dd></div>
      <div><dt>Avg latency</dt><dd>{{ sim.avgLatency.toFixed(0) }} ms</dd></div>
      <div><dt>Hits</dt><dd>{{ sim.hits }}</dd></div>
      <div><dt>Misses</dt><dd>{{ sim.misses }}</dd></div>
    </template>
    <template #insight>{{ insight }}</template>
  </SimShell>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import SimShell from './SimShell.vue'
import simMixin from './simMixin'
import RangeField from '@/components/ui/RangeField.vue'
import { CacheSim, type CacheEntry, type CacheEvent, type CacheEventKind } from '@/engine/sim/cache'

/**
 * This simulation is small enough to live in Vue's reactivity: the
 * entries list *is* the visual, and Vue's TransitionGroup provides the
 * FLIP-animated reordering for free.
 */
export default defineComponent({
  name: 'CacheDemo',
  components: { SimShell, RangeField },
  mixins: [simMixin],
  props: {
    index: { type: String, default: '§05.3' },
  },
  data() {
    const sim = new CacheSim(4, 8)
    return {
      sim,
      capacity: 4,
      ttl: 8,
      flash: '',
      flashKind: 'hit' as CacheEventKind,
      acc: 0,
      flashTimer: 0,
    }
  },
  computed: {
    keys(): string[] {
      return this.sim.keys
    },
    entries(): CacheEntry[] {
      return this.sim.entries
    },
    events(): CacheEvent[] {
      return this.sim.events.slice(0, 6)
    },
    emptySlots(): number {
      return Math.max(0, this.capacity - this.sim.entries.length)
    },
    insight(): string {
      const r = this.sim.hitRatio
      if (this.sim.hits + this.sim.misses < 6) return 'Popular keys (darker) are requested more often. Click any key to request it.'
      if (r > 0.7) return 'Hot keys stay resident: most reads skip the slow store entirely.'
      if (this.capacity < 3) return 'Too small to hold the hot set, so useful entries are evicted before they are reused.'
      return 'Shorter TTLs keep data fresher but turn would-be hits into misses.'
    },
  },
  watch: {
    capacity(n: number) {
      this.sim.setCapacity(n)
    },
    ttl(t: number) {
      this.sim.setTtl(t)
    },
  },
  beforeUnmount() {
    clearTimeout(this.flashTimer)
  },
  methods: {
    heat(i: number): number {
      return Math.max(0.12, 1 - i / this.keys.length)
    },
    request(key: string) {
      const res = this.sim.get(key)
      const last = res.events[res.events.length - 1]
      this.flash = key
      this.flashKind = res.events.some((e) => e.kind === 'expired') ? 'expired' : res.kind
      if (last.kind === 'evict') this.flashKind = 'miss'
      clearTimeout(this.flashTimer)
      this.flashTimer = window.setTimeout(() => (this.flash = ''), 520)
    },
    skip() {
      this.sim.advance(5)
    },
    remaining(e: CacheEntry): number {
      void this.statsTick
      return this.sim.remaining(e)
    },
    ttlLeft(e: CacheEntry): number {
      return Math.max(0, Math.round(e.expiresAt - this.sim.time))
    },
    simStep(dt: number) {
      this.sim.advance(dt)
      this.acc += dt
      if (this.acc > 0.8) {
        this.acc = 0
        this.request(this.sim.sampleKey())
      }
    },
    draw() {
      /* DOM-rendered */
    },
  },
})
</script>

<style scoped>
.cache {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  grid-template-rows: auto 1fr;
  gap: 1rem;
  height: 100%;
  padding: 1.1rem;
}
.cache__keys {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.cache__key {
  min-height: 2.25rem;
  padding: 0 0.65rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: color-mix(in oklab, var(--text) calc(var(--heat) * 16%), var(--surface-raised));
  color: var(--text);
  font-size: 0.72rem;
  cursor: pointer;
  transition: transform 120ms var(--ease-ui);
}
.cache__key:active {
  transform: scale(0.95);
}
.cache__store .caption {
  margin: 0 0 0.5rem;
}
.cache__slots {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.3rem;
}
.cache__slot {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  align-items: center;
  gap: 0.6rem;
  min-height: 2.1rem;
  padding: 0 0.65rem;
  border-radius: 6px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  font-size: 0.74rem;
}
.cache__slot--empty {
  border-style: dashed;
  background: transparent;
}
.cache__slot.is-flash.is-hit {
  border-color: var(--accent-ink);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.cache__slot.is-flash.is-miss,
.cache__slot.is-flash.is-expired {
  border-color: var(--tension);
  box-shadow: 0 0 0 3px var(--tension-soft);
}
.cache__ttl {
  height: 4px;
  border-radius: 4px;
  background: var(--surface-sunken);
  overflow: hidden;
}
.cache__ttl-fill {
  display: block;
  height: 100%;
  background: var(--accent-ink);
  transform-origin: left;
}
.cache__log {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.25rem;
  align-content: start;
  font-size: 0.72rem;
}
.cache__ev {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  gap: 0.5rem;
  animation: ev-in 360ms cubic-bezier(0.2, 1.2, 0.3, 1);
}
.cache__ev-kind {
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.cache__ev.is-hit .cache__ev-kind {
  color: var(--accent-ink);
}
.cache__ev.is-miss .cache__ev-kind,
.cache__ev.is-evict .cache__ev-kind,
.cache__ev.is-expired .cache__ev-kind {
  color: var(--tension);
}
.slot-move {
  transition: transform 420ms cubic-bezier(0.2, 1.2, 0.3, 1);
}
.slot-enter-from {
  opacity: 0;
  transform: translateX(-12px);
}
.slot-enter-active {
  transition: opacity 200ms, transform 420ms cubic-bezier(0.2, 1.3, 0.3, 1);
}
.slot-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
.slot-leave-active {
  position: absolute;
  width: 100%;
  transition: opacity 200ms, transform 240ms;
}
@keyframes ev-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
}
@media (max-width: 560px) {
  .cache {
    grid-template-columns: 1fr;
  }
}
</style>
