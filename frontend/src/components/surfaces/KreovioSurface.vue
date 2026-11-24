<template>
  <SurfaceFrame url="workspace.example/live/K7Q2MX" caption="Live session · shared ink · learners voting from phones" @active="onActive">
    <template #default>
      <div class="kre">
        <div class="kre__toolbar">
          <span class="kre__live mono"><i aria-hidden="true" /> Live · {{ joined }} joined</span>
          <span class="kre__code mono" aria-label="Join code K7Q2MX">Join code <b>K7Q2MX</b></span>
          <div class="kre__tools" role="group" aria-label="Ink">
            <button
              v-for="c in inks"
              :key="c.id"
              type="button"
              class="kre__ink"
              :style="{ '--ink': c.color }"
              :aria-pressed="ink === c.id ? 'true' : 'false'"
              :aria-label="`${c.label} pen`"
              @click="ink = c.id"
            />
            <button type="button" class="kre__clear" @click="clearInk">Clear</button>
          </div>
        </div>

        <div class="kre__stage">
          <div class="kre__slide">
            <p class="kre__slide-kicker mono">Data structures · 3 / 8</p>
            <h4 class="kre__slide-title">Hash maps, briefly</h4>
            <div class="kre__diagram" aria-hidden="true">
              <div v-for="(b, i) in buckets" :key="i" class="kre__bucket">
                <span class="mono">{{ i }}</span>
                <span v-for="k in b" :key="k" class="kre__key">{{ k }}</span>
              </div>
            </div>
            <p class="kre__slide-note">A hash function picks the bucket, so a lookup touches one short chain instead of every item.</p>
            <canvas
              ref="ink"
              class="kre__canvas"
              aria-label="Shared whiteboard layer: draw on the slide"
              role="img"
              @pointerdown="inkDown"
              @pointermove="inkMove"
              @pointerup="inkUp"
              @pointercancel="inkUp"
            />
            <p v-if="!strokeCount" class="kre__draw-hint caption" aria-hidden="true">Draw on the slide</p>
          </div>

          <aside class="kre__results" aria-label="Poll results (synthetic)">
            <p class="mono kre__q-label">Poll · {{ totalVotes }} answers</p>
            <p class="kre__q">{{ poll.question }}</p>
            <ul role="list">
              <li v-for="(o, i) in poll.options" :key="o" class="kre__bar">
                <span class="kre__opt">{{ o }}</span>
                <span class="kre__track"><span class="kre__fill" :class="{ 'is-correct': i === poll.correct && revealed }" :style="{ transform: `scaleX(${share(i)})` }" /></span>
                <span class="mono kre__pct">{{ Math.round(share(i) * 100) }}%</span>
              </li>
            </ul>
            <button type="button" class="kre__reveal" :disabled="revealed" @click="revealed = true">
              {{ revealed ? 'Answer shown' : 'Reveal answer' }}
            </button>
          </aside>
        </div>
      </div>
    </template>

    <template #float>
      <div class="kre__phone" aria-label="A learner's phone (synthetic)">
        <div class="kre__phone-notch" aria-hidden="true" />
        <p class="mono kre__phone-k">Joined with K7Q2MX</p>
        <p class="kre__phone-q">{{ poll.question }}</p>
        <button
          v-for="(o, i) in poll.options"
          :key="o"
          type="button"
          class="kre__answer"
          :class="{ 'is-mine': mine === i, 'is-right': revealed && i === poll.correct, 'is-wrong': revealed && mine === i && i !== poll.correct }"
          :disabled="mine !== null"
          @click="vote(i)"
        >
          {{ o }}
        </button>
        <p class="kre__phone-status mono" role="status">{{ phoneStatus }}</p>
      </div>
    </template>
  </SurfaceFrame>
</template>

<script lang="ts">
import { defineComponent, markRaw } from 'vue'
import SurfaceFrame from './SurfaceFrame.vue'
import { mulberry32 } from '@/engine/sim/random'

interface Stroke {
  color: string
  points: { x: number; y: number }[]
}

/**
 * Kreovio demonstration: a presenter slide with a shared ink layer the
 * visitor can draw on, synthetic learners joining and answering a poll in
 * real time, and the visitor's own phone vote.
 */
export default defineComponent({
  name: 'KreovioSurface',
  components: { SurfaceFrame },
  data() {
    return {
      poll: {
        question: 'Average lookup cost in a hash map?',
        options: ['O(1)', 'O(log n)', 'O(n)'],
        correct: 0,
      },
      votes: [0, 0, 0],
      joined: 3,
      mine: null as number | null,
      revealed: false,
      ink: 'accent',
      inks: [
        { id: 'accent', label: 'Green', color: 'var(--accent-ink)' },
        { id: 'tension', label: 'Coral', color: 'var(--tension)' },
        { id: 'text', label: 'Ink', color: 'var(--text)' },
      ],
      strokes: markRaw([]) as Stroke[],
      strokeCount: 0,
      drawing: null as Stroke | null,
      buckets: [['go'], [], ['vue', 'sql'], ['nats'], []],
      timer: 0,
      rnd: markRaw({ fn: mulberry32(7) }),
      ro: null as ResizeObserver | null,
      active: false,
    }
  },
  computed: {
    totalVotes(): number {
      return this.votes.reduce((a, b) => a + b, 0)
    },
    phoneStatus(): string {
      if (this.mine === null) return 'Tap an answer'
      if (!this.revealed) return 'Answer sent · waiting for the teacher'
      return this.mine === this.poll.correct ? 'Correct!' : 'Not quite: O(1) on average'
    },
  },
  mounted() {
    this.ro = markRaw(new ResizeObserver(() => this.sizeCanvas()))
    this.ro.observe(this.$refs.ink as Element)
  },
  beforeUnmount() {
    clearInterval(this.timer)
    this.ro?.disconnect()
  },
  methods: {
    onActive(v: boolean) {
      this.active = v
      clearInterval(this.timer)
      if (v && document.documentElement.dataset.motion !== 'minimal') {
        this.timer = window.setInterval(() => this.simulate(), 650)
      }
    },
    simulate() {
      const r = this.rnd.fn
      if (this.joined < 28 && r() < 0.7) this.joined += 1 + Math.floor(r() * 2)
      if (this.totalVotes < this.joined - 1) {
        const x = r()
        const i = x < 0.62 ? 0 : x < 0.86 ? 1 : 2
        this.votes[i] += 1
      }
      if (this.joined >= 28 && this.totalVotes >= this.joined - 1) {
        // Loop the session so returning visitors see it live again.
        clearInterval(this.timer)
        this.timer = window.setTimeout(() => {
          if (!this.active) return
          this.votes = [0, 0, 0]
          this.joined = 3
          this.revealed = false
          this.mine = null
          this.onActive(true)
        }, 6000) as unknown as number
      }
    },
    share(i: number): number {
      return this.totalVotes ? this.votes[i] / this.totalVotes : 0
    },
    vote(i: number) {
      this.mine = i
      this.votes[i] += 1
    },
    sizeCanvas() {
      const c = this.$refs.ink as HTMLCanvasElement | undefined
      if (!c) return
      const r = c.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      c.width = Math.round(r.width * dpr)
      c.height = Math.round(r.height * dpr)
      this.redraw()
    },
    point(e: PointerEvent) {
      const c = this.$refs.ink as HTMLCanvasElement
      const r = c.getBoundingClientRect()
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
    },
    color(): string {
      const v = this.inks.find((i) => i.id === this.ink)!.color
      const name = v.slice(4, -1)
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000'
    },
    inkDown(e: PointerEvent) {
      const c = this.$refs.ink as HTMLCanvasElement
      c.setPointerCapture(e.pointerId)
      this.drawing = markRaw({ color: this.color(), points: [this.point(e)] })
      this.strokes.push(this.drawing)
      this.strokeCount = this.strokes.length
    },
    inkMove(e: PointerEvent) {
      if (!this.drawing) return
      const pts = this.drawing.points
      const p = this.point(e)
      const last = pts[pts.length - 1]
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.003) return
      pts.push(p)
      this.redraw()
    },
    inkUp() {
      this.drawing = null
    },
    clearInk() {
      this.strokes.length = 0
      this.strokeCount = 0
      this.redraw()
    },
    redraw() {
      const c = this.$refs.ink as HTMLCanvasElement | undefined
      const ctx = c?.getContext('2d')
      if (!c || !ctx) return
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 3 * Math.min(window.devicePixelRatio || 1, 2)
      for (const s of this.strokes) {
        const pts = s.points
        if (!pts.length) continue
        ctx.strokeStyle = s.color
        ctx.beginPath()
        ctx.moveTo(pts[0].x * c.width, pts[0].y * c.height)
        // Quadratic smoothing through midpoints, ink, not polyline.
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = ((pts[i].x + pts[i + 1].x) / 2) * c.width
          const my = ((pts[i].y + pts[i + 1].y) / 2) * c.height
          ctx.quadraticCurveTo(pts[i].x * c.width, pts[i].y * c.height, mx, my)
        }
        const l = pts[pts.length - 1]
        ctx.lineTo(l.x * c.width, l.y * c.height)
        ctx.stroke()
      }
    },
  },
})
</script>

<style scoped>
.kre {
  --kre: oklch(0.7 0.13 52);
  font-size: 0.8rem;
  padding-bottom: 0.25rem;
}
.kre__toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid var(--border);
}
.kre__live {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.7rem;
}
.kre__live i {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--tension);
  animation: kre-blink 1.6s ease-in-out infinite;
}
.kre__code {
  font-size: 0.7rem;
  color: var(--text-muted);
}
.kre__code b {
  color: var(--text);
  letter-spacing: 0.12em;
}
.kre__tools {
  margin-left: auto;
  display: flex;
  gap: 0.35rem;
  align-items: center;
}
.kre__ink {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  border: 2px solid var(--surface-raised);
  background: var(--ink);
  box-shadow: 0 0 0 1px var(--border);
  cursor: pointer;
}
.kre__ink[aria-pressed='true'] {
  box-shadow: 0 0 0 2px var(--text);
}
.kre__clear {
  min-height: 1.75rem;
  padding: 0 0.6rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 0.72rem;
  cursor: pointer;
}
.kre__stage {
  display: grid;
  grid-template-columns: 1.55fr 1fr;
  gap: 1rem;
  padding: 1rem 1rem 1rem;
}
.kre__slide {
  position: relative;
  aspect-ratio: 16 / 10;
  padding: 1.1rem 1.25rem;
  border-radius: 8px;
  background: color-mix(in oklab, var(--kre) 9%, var(--surface));
  border: 1px solid var(--border);
  overflow: hidden;
}
.kre__slide-kicker {
  margin: 0;
  font-size: 0.62rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.kre__slide-title {
  margin: 0.25rem 0 0.8rem;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(1.3rem, 2.4vw, 1.9rem);
  line-height: 1;
}
.kre__diagram {
  display: flex;
  gap: 0.35rem;
}
.kre__bucket {
  flex: 1;
  display: grid;
  gap: 0.2rem;
  align-content: start;
  min-height: 4rem;
  padding: 0.3rem;
  border-radius: 6px;
  border: 1px dashed var(--border-strong);
  font-size: 0.62rem;
  color: var(--text-muted);
}
.kre__key {
  padding: 0.15rem 0.3rem;
  border-radius: 4px;
  background: var(--kre);
  color: #1a1206;
  font-family: var(--font-mono);
  text-align: center;
}
.kre__slide-note {
  margin: 0.7rem 0 0;
  max-width: 34ch;
  color: var(--text-muted);
  font-size: 0.74rem;
}
.kre__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  touch-action: none;
}
.kre__draw-hint {
  position: absolute;
  right: 0.8rem;
  bottom: 0.6rem;
  margin: 0;
  pointer-events: none;
}
.kre__results {
  display: grid;
  gap: 0.45rem;
  align-content: start;
}
.kre__q-label {
  margin: 0;
  font-size: 0.64rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
.kre__q {
  margin: 0 0 0.2rem;
  font-weight: 600;
}
.kre__results ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.45rem;
}
.kre__bar {
  display: grid;
  grid-template-columns: 4rem 1fr 2.4rem;
  gap: 0.5rem;
  align-items: center;
}
.kre__opt {
  font-family: var(--font-mono);
  font-size: 0.74rem;
}
.kre__track {
  height: 0.6rem;
  border-radius: 999px;
  background: var(--surface-sunken);
  overflow: hidden;
}
.kre__fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--text-muted);
  transform-origin: left;
  transition: transform 520ms cubic-bezier(0.2, 1.15, 0.3, 1);
}
.kre__fill.is-correct {
  background: var(--accent);
}
.kre__pct {
  font-size: 0.7rem;
  text-align: right;
}
.kre__reveal {
  justify-self: start;
  min-height: 2rem;
  margin-top: 0.3rem;
  padding: 0 0.8rem;
  border: 0;
  border-radius: 6px;
  background: var(--text);
  color: var(--bg);
  font-size: 0.74rem;
  cursor: pointer;
}
.kre__reveal:disabled {
  background: var(--surface-sunken);
  color: var(--text-muted);
  cursor: default;
}
.kre__phone {
  position: absolute;
  right: -1.5rem;
  bottom: -2.5rem;
  width: 10.5rem;
  padding: 0.5rem 0.65rem 0.8rem;
  border-radius: 22px;
  border: 5px solid var(--text);
  background: var(--surface-raised);
  box-shadow: var(--shadow-float);
  font-size: 0.72rem;
}
.kre__phone-notch {
  width: 2.75rem;
  height: 0.55rem;
  margin: 0 auto 0.5rem;
  border-radius: 999px;
  background: var(--text);
}
.kre__phone-k {
  margin: 0;
  font-size: 0.6rem;
  color: var(--text-muted);
}
.kre__phone-q {
  margin: 0.3rem 0 0.5rem;
  font-weight: 600;
  line-height: 1.3;
}
.kre__answer {
  display: block;
  width: 100%;
  min-height: 2.1rem;
  margin-bottom: 0.3rem;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  cursor: pointer;
  transition:
    transform 140ms var(--ease-ui),
    background-color 180ms var(--ease-ui);
}
.kre__answer:active:not(:disabled) {
  transform: scale(0.96);
}
.kre__answer:disabled {
  cursor: default;
}
.kre__answer.is-mine {
  background: var(--text);
  color: var(--bg);
}
.kre__answer.is-right {
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
}
.kre__answer.is-wrong {
  background: var(--tension);
  border-color: var(--tension);
  color: #fff;
}
.kre__phone-status {
  margin: 0.35rem 0 0;
  font-size: 0.6rem;
  color: var(--text-muted);
  min-height: 2em;
}
@keyframes kre-blink {
  50% {
    opacity: 0.35;
  }
}
@container surface (max-width: 640px) {
  .kre__stage {
    grid-template-columns: 1fr;
  }
}
/* The phone lives in the frame's float layer, outside the surface container. */
@media (max-width: 720px) {
  .kre__phone {
    position: relative;
    right: auto;
    bottom: auto;
    margin: 1.25rem auto 0;
  }
}
</style>
