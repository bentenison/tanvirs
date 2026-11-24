<template>
  <SurfaceFrame url="institute.example/attendance" caption="Attendance register → live analytics → gapless receipts" :max-tilt="4" @active="onActive">
    <template #default>
      <div class="edu">
        <aside class="edu__side" aria-hidden="true">
          <span class="edu__logo">E</span>
          <span v-for="n in nav" :key="n" class="edu__nav" :class="{ 'is-on': n === 'Attendance' }">{{ n }}</span>
        </aside>

        <div class="edu__main">
          <header class="edu__head">
            <div>
              <p class="edu__kicker mono">Today · Session {{ sessions.length + 1 }}</p>
              <h4 class="edu__title">Attendance</h4>
            </div>
            <div class="edu__batches" role="group" aria-label="Batch">
              <button
                v-for="b in batches"
                :key="b.id"
                type="button"
                class="edu__chip"
                :aria-pressed="b.id === batchId ? 'true' : 'false'"
                @click="pickBatch(b.id)"
              >
                {{ b.name }}
              </button>
            </div>
          </header>

          <div class="edu__grid">
            <section class="edu__register" aria-label="Attendance register (synthetic)">
              <div class="edu__regbar">
                <span class="mono">{{ presentCount }}/{{ students.length }} present</span>
                <button type="button" class="edu__link" @click="markAll">Mark all present</button>
              </div>
              <ul class="edu__students" role="list">
                <li v-for="s in students" :key="s.id">
                  <button
                    type="button"
                    class="edu__student"
                    :class="`is-${s.state}`"
                    :aria-pressed="s.state === 'present' ? 'true' : 'false'"
                    :aria-label="`${s.name}: ${s.state}`"
                    @click="toggle(s.id)"
                  >
                    <span class="edu__avatar" aria-hidden="true">{{ initials(s.name) }}</span>
                    <span class="edu__sname">{{ s.name }}</span>
                    <span class="edu__state mono">{{ s.state === 'unmarked' ? '-' : s.state === 'present' ? 'P' : 'A' }}</span>
                  </button>
                </li>
              </ul>
            </section>

            <section class="edu__analytics" aria-label="Batch attendance trend (synthetic)">
              <div class="edu__stat">
                <span class="edu__big">{{ todayPct }}<small>%</small></span>
                <span class="mono edu__delta" :class="{ 'is-down': delta < 0 }">{{ delta >= 0 ? '+' : '' }}{{ delta }} vs avg</span>
              </div>
              <svg class="edu__chart" viewBox="0 0 220 110" role="img" :aria-label="`Attendance over the last ${bars.length} sessions; today ${todayPct}%`">
                <line v-for="g in [25, 50, 75]" :key="g" x1="0" x2="220" :y1="100 - g" :y2="100 - g" class="edu__gridline" />
                <rect
                  v-for="(v, i) in bars"
                  :key="i"
                  :x="i * 27 + 4"
                  :width="19"
                  :y="100 - v"
                  :height="v"
                  rx="2"
                  class="edu__bar"
                  :class="{ 'is-today': i === bars.length - 1 }"
                />
              </svg>
              <div class="edu__fees">
                <p class="mono edu__fees-title">Fee defaulters · live</p>
                <ul role="list">
                  <li v-for="d in defaulters" :key="d.id" class="edu__def">
                    <span>{{ d.name }}</span>
                    <span class="mono">₹{{ d.due.toLocaleString('en-IN') }}</span>
                    <button type="button" class="edu__pay" @click="collect(d.id)">Collect</button>
                  </li>
                  <li v-if="!defaulters.length" class="edu__empty mono">No dues in this batch</li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>
    </template>
    <template #float>
      <div class="edu__toast" :class="{ 'is-on': !!receipt }" role="status" aria-live="polite">
        <template v-if="receipt">
          <span class="mono">Receipt {{ receipt.no }}</span>
          <span>{{ receipt.name }} · ₹{{ receipt.amount.toLocaleString('en-IN') }}</span>
        </template>
      </div>
    </template>
  </SurfaceFrame>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import SurfaceFrame from './SurfaceFrame.vue'
import { mulberry32 } from '@/engine/sim/random'

type State = 'unmarked' | 'present' | 'absent'
interface Student {
  id: number
  name: string
  state: State
  due: number
}

const NAMES = [
  'Aanya Kulkarni', 'Vihaan Rao', 'Diya Menon', 'Arjun Patil', 'Ira Joshi', 'Kabir Shah',
  'Meera Iyer', 'Rohan Das', 'Sara Khan', 'Neel Gupta', 'Tara Pillai', 'Yash More',
  'Anika Sen', 'Dev Bhatt', 'Riya Nair', 'Om Kale', 'Zoya Ali', 'Aditya Jain',
]

const BATCHES = [
  { id: 'jee', name: 'JEE · A', seed: 11, size: 8, base: 86 },
  { id: 'neet', name: 'NEET · B', seed: 23, size: 7, base: 81 },
  { id: 'fnd', name: 'Foundation', seed: 37, size: 6, base: 90 },
]

function makeBatch(id: string) {
  const b = BATCHES.find((x) => x.id === id)!
  const rnd = mulberry32(b.seed)
  const start = Math.floor(rnd() * NAMES.length)
  const students: Student[] = Array.from({ length: b.size }, (_, i) => ({
    id: i,
    name: NAMES[(start + i * 5) % NAMES.length],
    state: 'unmarked',
    due: rnd() < 0.3 ? Math.round((4 + rnd() * 10)) * 500 : 0,
  }))
  const sessions = Array.from({ length: 7 }, () => Math.round(b.base - 8 + rnd() * 14))
  return { students, sessions }
}

/**
 * EduFlow demonstration: tap students to mark attendance; the trend chart,
 * stats and fee list update live; collecting a fee issues the next gapless
 * receipt number. Auto-plays gently while visible until the visitor acts.
 */
export default defineComponent({
  name: 'EduflowSurface',
  components: { SurfaceFrame },
  data() {
    const first = makeBatch('jee')
    return {
      nav: ['Dashboard', 'Students', 'Attendance', 'Fees', 'Tests'],
      batches: BATCHES,
      batchId: 'jee',
      students: first.students,
      sessions: first.sessions,
      receiptNo: 1041,
      receipt: null as null | { no: string; name: string; amount: number },
      touched: false,
      active: false,
      timer: 0,
      toastTimer: 0,
    }
  },
  computed: {
    presentCount(): number {
      return this.students.filter((s) => s.state === 'present').length
    },
    marked(): number {
      return this.students.filter((s) => s.state !== 'unmarked').length
    },
    todayPct(): number {
      if (!this.marked) return 0
      return Math.round((this.presentCount / this.students.length) * 100)
    },
    avg(): number {
      return Math.round(this.sessions.reduce((a, b) => a + b, 0) / this.sessions.length)
    },
    delta(): number {
      return this.marked ? this.todayPct - this.avg : 0
    },
    bars(): number[] {
      return [...this.sessions.slice(1), this.todayPct]
    },
    defaulters(): Student[] {
      return this.students.filter((s) => s.due > 0)
    },
  },
  beforeUnmount() {
    clearInterval(this.timer)
    clearTimeout(this.toastTimer)
  },
  methods: {
    onActive(active: boolean) {
      this.active = active
      this.syncAutoplay()
    },
    syncAutoplay() {
      clearInterval(this.timer)
      const motion = document.documentElement.dataset.motion
      if (!this.active || this.touched || motion === 'minimal') return
      this.timer = window.setInterval(() => this.autoStep(), 750)
    },
    autoStep() {
      const next = this.students.find((s) => s.state === 'unmarked')
      if (!next) {
        // Pause on the completed register, then start a fresh session.
        clearInterval(this.timer)
        this.timer = window.setTimeout(() => {
          this.students.forEach((s) => (s.state = 'unmarked'))
          this.syncAutoplay()
        }, 3200) as unknown as number
        return
      }
      next.state = (next.id * 7 + this.sessions.length) % 9 === 0 ? 'absent' : 'present'
    },
    stopAuto() {
      this.touched = true
      clearInterval(this.timer)
      clearTimeout(this.timer)
    },
    toggle(id: number) {
      this.stopAuto()
      const s = this.students.find((x) => x.id === id)
      if (!s) return
      s.state = s.state === 'present' ? 'absent' : 'present'
    },
    markAll() {
      this.stopAuto()
      this.students.forEach((s) => (s.state = 'present'))
    },
    pickBatch(id: string) {
      this.stopAuto()
      this.batchId = id
      const b = makeBatch(id)
      this.students = b.students
      this.sessions = b.sessions
    },
    collect(id: number) {
      this.stopAuto()
      const s = this.students.find((x) => x.id === id)
      if (!s) return
      this.receiptNo += 1
      this.receipt = { no: `R-${String(this.receiptNo).padStart(6, '0')}`, name: s.name, amount: s.due }
      s.due = 0
      clearTimeout(this.toastTimer)
      this.toastTimer = window.setTimeout(() => (this.receipt = null), 2800)
    },
    initials(n: string) {
      return n
        .split(' ')
        .map((p) => p[0])
        .join('')
    },
  },
})
</script>

<style scoped>
.edu {
  --edu: oklch(0.62 0.12 152);
  display: grid;
  grid-template-columns: 9.5rem 1fr;
  min-height: 25rem;
  font-size: 0.8rem;
  background: var(--surface-raised);
}
.edu__side {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.9rem 0.6rem;
  border-right: 1px solid var(--border);
  background: var(--surface);
}
.edu__logo {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  margin: 0 0 0.75rem 0.4rem;
  border-radius: 6px;
  background: var(--edu);
  color: #fff;
  font-weight: 700;
}
.edu__nav {
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
  color: var(--text-muted);
}
.edu__nav.is-on {
  background: var(--surface-sunken);
  color: var(--text);
  font-weight: 600;
}
.edu__main {
  padding: 1rem 1.1rem 1.1rem;
  min-width: 0;
}
.edu__head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.9rem;
}
.edu__kicker {
  margin: 0;
  font-size: 0.66rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.edu__title {
  margin: 0.1rem 0 0;
  font-size: 1.15rem;
  font-weight: 600;
}
.edu__batches {
  display: flex;
  gap: 0.3rem;
}
.edu__chip {
  min-height: 1.9rem;
  padding: 0 0.7rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.72rem;
  cursor: pointer;
}
.edu__chip[aria-pressed='true'] {
  border-color: var(--edu);
  color: var(--text);
  background: color-mix(in oklab, var(--edu) 14%, transparent);
}
.edu__grid {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 1rem;
}
.edu__regbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.4rem;
  color: var(--text-muted);
  font-size: 0.72rem;
}
.edu__link {
  border: 0;
  background: none;
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 2px;
  font-size: 0.72rem;
  cursor: pointer;
}
.edu__students {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.25rem;
}
.edu__student {
  display: grid;
  grid-template-columns: 1.75rem 1fr auto;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  min-height: 2.25rem;
  padding: 0.2rem 0.5rem 0.2rem 0.25rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  text-align: left;
  font-size: 0.78rem;
  cursor: pointer;
  transition:
    background-color 180ms var(--ease-ui),
    border-color 180ms var(--ease-ui),
    transform 120ms var(--ease-ui);
}
.edu__student:active {
  transform: scale(0.985);
}
.edu__avatar {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  background: var(--surface-sunken);
  font-size: 0.62rem;
  font-weight: 600;
}
.edu__student.is-present {
  border-color: color-mix(in oklab, var(--edu) 55%, var(--border));
  background: color-mix(in oklab, var(--edu) 10%, var(--surface));
}
.edu__student.is-present .edu__avatar {
  background: var(--edu);
  color: #fff;
}
.edu__student.is-absent {
  border-color: color-mix(in oklab, var(--tension) 45%, var(--border));
}
.edu__student.is-absent .edu__state {
  color: var(--tension);
}
.edu__state {
  font-weight: 600;
  color: var(--text-muted);
}
.edu__analytics {
  display: grid;
  gap: 0.6rem;
  align-content: start;
}
.edu__stat {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}
.edu__big {
  font-family: var(--font-display);
  font-size: 2.6rem;
  line-height: 1;
}
.edu__big small {
  font-size: 1.2rem;
}
.edu__delta {
  font-size: 0.7rem;
  color: var(--success);
}
.edu__delta.is-down {
  color: var(--tension);
}
.edu__chart {
  width: 100%;
  height: auto;
}
.edu__gridline {
  stroke: var(--border);
  stroke-dasharray: 2 3;
}
.edu__bar {
  fill: color-mix(in oklab, var(--edu) 35%, var(--surface-sunken));
  transition:
    y 420ms cubic-bezier(0.2, 1.2, 0.3, 1),
    height 420ms cubic-bezier(0.2, 1.2, 0.3, 1);
}
.edu__bar.is-today {
  fill: var(--edu);
}
.edu__fees {
  border-top: 1px solid var(--border);
  padding-top: 0.55rem;
}
.edu__fees-title {
  margin: 0 0 0.35rem;
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
.edu__fees ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.25rem;
}
.edu__def {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.5rem;
  align-items: center;
}
.edu__pay {
  min-height: 1.7rem;
  padding: 0 0.55rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 0.7rem;
  cursor: pointer;
}
.edu__pay:hover {
  background: var(--text);
  color: var(--bg);
}
.edu__empty {
  color: var(--text-muted);
  font-size: 0.7rem;
}
.edu__toast {
  position: absolute;
  right: 1.25rem;
  bottom: 1.25rem;
  display: grid;
  gap: 0.15rem;
  padding: 0.7rem 0.9rem;
  border-radius: 10px;
  background: var(--text);
  color: var(--bg);
  font-size: 0.75rem;
  box-shadow: var(--shadow-float);
  opacity: 0;
  transform: translateY(12px) scale(0.96);
  transition:
    opacity 220ms var(--ease-out),
    transform 480ms cubic-bezier(0.2, 1.3, 0.3, 1);
}
.edu__toast.is-on {
  opacity: 1;
  transform: none;
}
@container surface (max-width: 640px) {
  .edu {
    grid-template-columns: 1fr;
  }
  .edu__side {
    display: none;
  }
  .edu__grid {
    grid-template-columns: 1fr;
  }
}
</style>
