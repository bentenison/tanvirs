<template>
  <SurfaceFrame variant="window" url="Studio · Order (draft)" caption="Model a field → review the migration → the form is generated">
    <template #default>
      <div class="forge">
        <section class="forge__palette" aria-label="Field types">
          <p class="mono forge__label">Field types</p>
          <button
            v-for="t in palette"
            :key="t.type"
            type="button"
            class="forge__type"
            :disabled="hasField(t.name)"
            :aria-label="`Add ${t.name} (${t.type}) field`"
            @pointerdown="dragStart($event, t)"
            @click="addIfClick(t)"
          >
            <span class="mono forge__type-kind">{{ t.type }}</span>{{ t.name }}
          </button>
          <p class="forge__tip caption">Drag onto the entity, or click.</p>
        </section>

        <section
          ref="drop"
          class="forge__entity"
          :class="{ 'is-target': dragging && over }"
          aria-label="Entity: Order"
        >
          <header class="forge__entity-head">
            <span class="mono">entity</span>
            <strong>Order</strong>
            <span class="forge__version mono">v{{ version }}{{ pending.length ? ' + draft' : '' }}</span>
          </header>
          <TransitionGroup tag="ul" name="fld" class="forge__fields" role="list">
            <li v-for="f in fields" :key="f.name" class="forge__field" :class="{ 'is-draft': f.draft }">
              <span class="forge__fname mono">{{ f.name }}</span>
              <span class="forge__ftype">{{ f.type }}</span>
              <button v-if="f.draft" type="button" class="forge__remove" :aria-label="`Remove ${f.name}`" @click="remove(f.name)">×</button>
            </li>
          </TransitionGroup>
        </section>

        <section class="forge__side">
          <div class="forge__migration" aria-label="Migration preview">
            <p class="mono forge__label">Migration plan {{ pending.length ? `· ${pending.length} change${pending.length > 1 ? 's' : ''}` : '' }}</p>
            <pre class="forge__sql" v-if="pending.length"><code><span class="forge__kw">BEGIN</span>;
<template v-for="f in pending" :key="f.name"><span class="forge__kw">ALTER TABLE</span> "order" <span class="forge__kw">ADD COLUMN</span> {{ f.name }} {{ sqlType(f.type) }};
</template><span class="forge__kw">COMMIT</span>;</code></pre>
            <p v-else class="forge__empty caption">No changes yet. Add a field to draft one.</p>
            <button type="button" class="forge__publish" :disabled="!pending.length" @click="publish">
              Publish v{{ version + 1 }}
            </button>
          </div>

          <div class="forge__form" aria-label="Generated form preview">
            <p class="mono forge__label">Generated form · v{{ version }}</p>
            <TransitionGroup tag="div" name="fld" class="forge__inputs">
              <label v-for="f in published" :key="f.name" class="forge__input">
                <span>{{ label(f.name) }}</span>
                <span class="forge__control" :data-type="f.type">{{ placeholder(f.type) }}</span>
              </label>
            </TransitionGroup>
          </div>
        </section>

        <div v-if="dragging" ref="ghost" class="forge__ghost mono" aria-hidden="true">{{ dragging.type }} · {{ dragging.name }}</div>
      </div>
    </template>
  </SurfaceFrame>
</template>

<script lang="ts">
import { defineComponent, markRaw } from 'vue'
import SurfaceFrame from './SurfaceFrame.vue'
import { Spring2D } from '@/engine/physics/spring'
import { subscribe, type TickerHandle } from '@/engine/animation/ticker'

interface Field {
  name: string
  type: string
  draft?: boolean
}

const BASE: Field[] = [
  { name: 'naming_series', type: 'naming series' },
  { name: 'customer', type: 'link → Customer' },
  { name: 'total', type: 'computed' },
  { name: 'status', type: 'choice' },
]

/**
 * Forge demonstration: a field type is dragged onto an entity (the ghost
 * follows the pointer on a spring and is "absorbed" on drop), the
 * migration plan previews the DDL, and publishing regenerates the form.
 */
export default defineComponent({
  name: 'ForgeSurface',
  components: { SurfaceFrame },
  data() {
    return {
      palette: [
        { type: 'date', name: 'due_date' },
        { type: 'choice', name: 'priority' },
        { type: 'link', name: 'assignee' },
        { type: 'decimal', name: 'discount' },
      ],
      fields: BASE.map((f) => ({ ...f })) as Field[],
      version: 3,
      dragging: null as null | { type: string; name: string },
      over: false,
      moved: false,
      ghostPos: markRaw(new Spring2D(0, 0, { stiffness: 600, damping: 40, mass: 1 })),
      ticker: null as TickerHandle | null,
      cleanup: null as null | (() => void),
    }
  },
  computed: {
    pending(): Field[] {
      return this.fields.filter((f) => f.draft)
    },
    published(): Field[] {
      return this.fields.filter((f) => !f.draft)
    },
  },
  beforeUnmount() {
    this.cleanup?.()
    this.ticker?.dispose()
  },
  methods: {
    hasField(name: string) {
      return this.fields.some((f) => f.name === name)
    },
    add(t: { type: string; name: string }) {
      if (this.hasField(t.name)) return
      this.fields.push({ name: t.name, type: t.type, draft: true })
    },
    addIfClick(t: { type: string; name: string }) {
      // Pointer drags handle their own drop; keyboard/tap clicks add directly.
      if (this.moved) {
        this.moved = false
        return
      }
      this.add(t)
    },
    remove(name: string) {
      this.fields = this.fields.filter((f) => f.name !== name)
    },
    publish() {
      this.fields = this.fields.map((f) => ({ ...f, draft: false }))
      this.version += 1
    },
    dragStart(e: PointerEvent, t: { type: string; name: string }) {
      if (this.hasField(t.name) || e.button !== 0) return
      const sx = e.clientX
      const sy = e.clientY
      this.moved = false
      const move = (ev: PointerEvent) => {
        if (!this.dragging) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
          if (ev.pointerType === 'touch' && Math.abs(ev.clientY - sy) > Math.abs(ev.clientX - sx)) {
            end()
            return
          }
          this.dragging = t
          this.moved = true
          this.ghostPos.snap(ev.clientX, ev.clientY)
          this.ticker = this.ticker ?? markRaw(subscribe((dt) => this.tickGhost(dt)))
          this.ticker.setActive(true)
        }
        this.ghostPos.setTarget(ev.clientX, ev.clientY)
        const r = (this.$refs.drop as HTMLElement).getBoundingClientRect()
        this.over = ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom
      }
      const up = () => {
        if (this.dragging && this.over) this.add(this.dragging)
        end()
      }
      const end = () => {
        this.dragging = null
        this.over = false
        this.ticker?.setActive(false)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', end)
        this.cleanup = null
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', end)
      this.cleanup = end
    },
    tickGhost(dt: number) {
      this.ghostPos.step(dt)
      const g = this.$refs.ghost as HTMLElement | undefined
      if (!g) return
      const vx = this.ghostPos.x.velocity
      const tiltDeg = Math.max(-12, Math.min(12, vx / 120))
      g.style.transform = `translate3d(${this.ghostPos.x.value}px, ${this.ghostPos.y.value}px, 0) translate(-50%, -50%) rotate(${tiltDeg}deg) scale(${this.over ? 1.06 : 1})`
    },
    sqlType(t: string) {
      return ({ date: 'date', choice: 'text', link: 'uuid REFERENCES "user"(id)', decimal: 'numeric(12,2)' } as Record<string, string>)[t] ?? 'text'
    },
    label(n: string) {
      return n.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
    },
    placeholder(t: string) {
      if (t.startsWith('link')) return 'Select…'
      if (t === 'computed') return '₹ 0.00 (computed)'
      if (t === 'choice') return 'Draft ▾'
      if (t === 'date') return 'dd/mm/yyyy'
      if (t === 'decimal') return '0.00'
      if (t === 'naming series') return 'SO-2026-#####'
      return ''
    },
  },
})
</script>

<style scoped>
.forge {
  --forge: oklch(0.66 0.15 32);
  display: grid;
  grid-template-columns: 9rem 1fr 1.25fr;
  gap: 0.9rem;
  padding: 1rem;
  font-size: 0.78rem;
  min-height: 22rem;
}
.forge__label {
  margin: 0 0 0.5rem;
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
.forge__palette {
  display: grid;
  gap: 0.35rem;
  align-content: start;
}
.forge__type {
  display: grid;
  gap: 0.1rem;
  min-height: 2.6rem;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  text-align: left;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  cursor: grab;
  touch-action: pan-y;
  transition: transform 120ms var(--ease-ui), border-color 160ms;
}
.forge__type:hover:not(:disabled) {
  border-color: var(--forge);
}
.forge__type:active:not(:disabled) {
  transform: scale(0.97);
}
.forge__type:disabled {
  opacity: 0.4;
  cursor: default;
}
.forge__type-kind {
  font-size: 0.6rem;
  color: var(--forge);
  text-transform: uppercase;
}
.forge__tip {
  margin: 0.25rem 0 0;
}
.forge__entity {
  border: 1.5px dashed var(--border-strong);
  border-radius: 10px;
  padding: 0.6rem;
  transition:
    border-color 160ms,
    background-color 160ms,
    transform 300ms cubic-bezier(0.2, 1.4, 0.3, 1);
}
.forge__entity.is-target {
  border-color: var(--forge);
  background: color-mix(in oklab, var(--forge) 8%, transparent);
  transform: scale(1.015);
}
.forge__entity-head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.forge__entity-head .mono {
  font-size: 0.62rem;
  color: var(--text-muted);
}
.forge__version {
  margin-left: auto;
}
.forge__fields {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.3rem;
}
.forge__field {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.forge__field.is-draft {
  border-color: var(--forge);
  background: color-mix(in oklab, var(--forge) 9%, var(--surface));
}
.forge__fname {
  font-size: 0.74rem;
}
.forge__ftype {
  color: var(--text-muted);
  font-size: 0.7rem;
}
.forge__remove {
  width: 1.4rem;
  height: 1.4rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.forge__side {
  display: grid;
  gap: 0.8rem;
  align-content: start;
}
.forge__migration {
  padding: 0.6rem;
  border-radius: 8px;
  background: var(--surface-sunken);
}
.forge__sql {
  margin: 0 0 0.6rem;
  font-family: var(--font-mono);
  font-size: 0.66rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.forge__kw {
  color: var(--forge);
}
.forge__empty {
  margin: 0 0 0.6rem;
}
.forge__publish {
  min-height: 2rem;
  padding: 0 0.8rem;
  border: 0;
  border-radius: 6px;
  background: var(--text);
  color: var(--bg);
  font-size: 0.74rem;
  cursor: pointer;
}
.forge__publish:disabled {
  background: var(--border);
  color: var(--text-muted);
  cursor: default;
}
.forge__inputs {
  position: relative;
  display: grid;
  gap: 0.4rem;
}
.forge__input {
  display: grid;
  gap: 0.15rem;
  font-size: 0.7rem;
  color: var(--text-muted);
}
.forge__control {
  padding: 0.4rem 0.55rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface-raised);
  color: var(--text-faint);
  font-size: 0.74rem;
}
.forge__ghost {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 90;
  padding: 0.45rem 0.7rem;
  border-radius: 8px;
  background: var(--text);
  color: var(--bg);
  font-size: 0.72rem;
  pointer-events: none;
  box-shadow: var(--shadow-float);
}
/* Layout transitions for inserted fields and inputs. */
.fld-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.96);
}
.fld-enter-active {
  transition:
    opacity 260ms var(--ease-out),
    transform 520ms cubic-bezier(0.2, 1.35, 0.3, 1);
}
.fld-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
.fld-leave-active {
  position: absolute;
  width: 100%;
  transition: opacity 160ms, transform 160ms;
}
.fld-move {
  transition: transform 520ms cubic-bezier(0.2, 1.2, 0.3, 1);
}
@container surface (max-width: 640px) {
  .forge {
    grid-template-columns: 1fr;
  }
  .forge__palette {
    grid-template-columns: repeat(2, 1fr);
  }
  .forge__tip,
  .forge__palette .forge__label {
    grid-column: 1 / -1;
  }
}
</style>
