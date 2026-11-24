<template>
  <div class="uis" :style="tokens">
    <div class="uis__controls">
      <SegmentedControl v-model="state" :options="stateOptions" label="Interface state" />
      <div class="uis__tokens">
        <SegmentedControl v-model="radius" :options="radiusOptions" label="Corner radius" />
        <SegmentedControl v-model="density" :options="densityOptions" label="Density" />
      </div>
    </div>

    <section class="uis__card" aria-label="Team members (synthetic)" :aria-busy="state === 'loading' ? 'true' : 'false'">
      <header class="uis__head">
        <div>
          <h4 class="uis__title">Team members</h4>
          <p class="uis__sub">Invite people and manage what they can access.</p>
        </div>
        <button type="button" class="uis__btn uis__btn--primary" :disabled="state === 'loading'">Invite</button>
      </header>

      <label class="uis__search">
        <span class="sr-only">Search members</span>
        <AppIcon name="search" :size="14" class="uis__search-icon" />
        <input v-model="query" type="search" placeholder="Search by name or email" :disabled="state !== 'ready'" />
      </label>

      <div v-if="state === 'loading'" class="uis__list" aria-hidden="true">
        <div v-for="n in 3" :key="n" class="uis__row">
          <span class="uis__sk uis__sk--avatar" />
          <span class="uis__sk-lines"><span class="uis__sk" style="width: 40%" /><span class="uis__sk" style="width: 62%" /></span>
          <span class="uis__sk" style="width: 4.5rem" />
        </div>
        <span class="sr-only" role="status">Loading members…</span>
      </div>

      <div v-else-if="state === 'error'" class="uis__alert" role="alert">
        <p class="uis__alert-title">Couldn’t load your team</p>
        <p class="uis__alert-body">The connection timed out. Your changes are safe.</p>
        <button type="button" class="uis__btn" @click="state = 'ready'">Try again</button>
      </div>

      <div v-else-if="state === 'empty'" class="uis__empty">
        <p class="uis__empty-title">No members yet</p>
        <p class="uis__empty-body">Invite your first teammate to start collaborating.</p>
        <button type="button" class="uis__btn uis__btn--primary">Invite a teammate</button>
      </div>

      <template v-else>
        <ul v-if="filtered.length" class="uis__list" role="list">
          <li v-for="m in filtered" :key="m.email" class="uis__row">
            <span class="uis__avatar" :style="{ '--h': m.hue }" aria-hidden="true">{{ initials(m.name) }}</span>
            <span class="uis__who">
              <span class="uis__name">{{ m.name }}</span>
              <span class="uis__email">{{ m.email }}</span>
            </span>
            <label class="uis__role">
              <span class="sr-only">Role for {{ m.name }}</span>
              <select v-model="m.role">
                <option>Owner</option>
                <option>Editor</option>
                <option>Viewer</option>
              </select>
            </label>
          </li>
        </ul>
        <p v-else class="uis__nomatch" role="status">No members match “{{ query }}”. <button type="button" class="uis__link" @click="query = ''">Clear search</button></p>
      </template>
    </section>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import SegmentedControl, { type SegmentOption } from '@/components/ui/SegmentedControl.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

interface Member {
  name: string
  email: string
  role: string
  hue: number
}

/**
 * A small product UI shown in every state it can be in. Design tokens
 * (radius, density) are CSS variables, so the same component adapts like
 * a Tailwind / shadcn-vue themed component would.
 */
export default defineComponent({
  name: 'UiStates',
  components: { SegmentedControl, AppIcon },
  data() {
    return {
      state: 'ready',
      radius: 'md',
      density: 'comfy',
      query: '',
      members: [
        { name: 'Asha Kulkarni', email: 'asha@example.com', role: 'Owner', hue: 150 },
        { name: 'Ravi Menon', email: 'ravi@example.com', role: 'Editor', hue: 30 },
        { name: 'Zoya Ali', email: 'zoya@example.com', role: 'Editor', hue: 210 },
        { name: 'Dev Bhatt', email: 'dev@example.com', role: 'Viewer', hue: 300 },
      ] as Member[],
      stateOptions: [
        { value: 'ready', label: 'Ready' },
        { value: 'loading', label: 'Loading' },
        { value: 'empty', label: 'Empty' },
        { value: 'error', label: 'Error' },
      ] as SegmentOption[],
      radiusOptions: [
        { value: 'sm', label: 'Sharp' },
        { value: 'md', label: 'Soft' },
        { value: 'lg', label: 'Round' },
      ] as SegmentOption[],
      densityOptions: [
        { value: 'compact', label: 'Compact' },
        { value: 'comfy', label: 'Comfortable' },
      ] as SegmentOption[],
    }
  },
  computed: {
    filtered(): Member[] {
      const q = this.query.trim().toLowerCase()
      return q ? this.members.filter((m) => m.name.toLowerCase().includes(q) || m.email.includes(q)) : this.members
    },
    tokens(): Record<string, string> {
      const r = { sm: '2px', md: '8px', lg: '16px' }[this.radius] ?? '8px'
      const d = this.density === 'compact' ? '0.4rem' : '0.7rem'
      return { '--ui-radius': r, '--ui-pad': d }
    },
  },
  methods: {
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
.uis {
  display: grid;
  gap: 1rem;
  font-size: 0.82rem;
}
.uis__controls {
  display: grid;
  gap: 0.5rem;
}
.uis__tokens {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.uis__card {
  display: grid;
  gap: calc(var(--ui-pad) + 0.3rem);
  padding: calc(var(--ui-pad) + 0.6rem);
  border: 1px solid var(--border);
  border-radius: calc(var(--ui-radius) + 4px);
  background: var(--surface);
  transition: border-radius 200ms var(--ease-ui), padding 200ms var(--ease-ui);
}
.uis__head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 1rem;
}
.uis__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}
.uis__sub {
  margin: 0.15rem 0 0;
  color: var(--text-muted);
  font-size: 0.76rem;
}
.uis__btn {
  min-height: 2.1rem;
  padding: 0 0.85rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--ui-radius);
  background: var(--surface-raised);
  color: var(--text);
  font-size: 0.76rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: border-radius 200ms var(--ease-ui);
}
.uis__btn--primary {
  background: var(--text);
  border-color: var(--text);
  color: var(--bg);
}
.uis__btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.uis__search {
  position: relative;
  display: block;
}
.uis__search-icon {
  position: absolute;
  left: 0.65rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}
.uis__search input {
  width: 100%;
  min-height: 2.25rem;
  padding: 0 0.7rem 0 2rem;
  border: 1px solid var(--border);
  border-radius: var(--ui-radius);
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
}
.uis__search input:disabled {
  opacity: 0.6;
}
.uis__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0;
  min-height: 9rem;
}
.uis__row {
  display: grid;
  grid-template-columns: 2rem 1fr auto;
  align-items: center;
  gap: 0.7rem;
  padding: var(--ui-pad) 0;
  border-top: 1px solid var(--border);
  transition: padding 200ms var(--ease-ui);
}
.uis__row:first-child {
  border-top: 0;
}
.uis__avatar {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: oklch(0.85 0.06 var(--h));
  color: oklch(0.3 0.06 var(--h));
  font-size: 0.66rem;
  font-weight: 600;
}
.uis__who {
  display: grid;
  min-width: 0;
}
.uis__name {
  font-weight: 500;
}
.uis__email {
  color: var(--text-muted);
  font-size: 0.72rem;
  overflow: hidden;
  text-overflow: ellipsis;
}
.uis__role select {
  min-height: 1.9rem;
  padding: 0 0.4rem;
  border: 1px solid var(--border);
  border-radius: var(--ui-radius);
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: 0.74rem;
}
.uis__sk {
  display: block;
  height: 0.6rem;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--surface-sunken), var(--border), var(--surface-sunken));
  background-size: 200% 100%;
  animation: uis-shimmer 1.4s linear infinite;
}
.uis__sk--avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
}
.uis__sk-lines {
  display: grid;
  gap: 0.35rem;
}
.uis__alert {
  display: grid;
  gap: 0.3rem;
  justify-items: start;
  min-height: 9rem;
  align-content: center;
  padding: 0.9rem 1rem;
  border: 1px solid color-mix(in oklab, var(--error) 45%, var(--border));
  border-radius: var(--ui-radius);
  background: color-mix(in oklab, var(--error) 7%, var(--surface));
}
.uis__alert-title,
.uis__empty-title {
  margin: 0;
  font-weight: 600;
}
.uis__alert-body,
.uis__empty-body {
  margin: 0 0 0.5rem;
  color: var(--text-muted);
}
.uis__empty {
  display: grid;
  justify-items: center;
  align-content: center;
  min-height: 9rem;
  text-align: center;
  border: 1px dashed var(--border-strong);
  border-radius: var(--ui-radius);
}
.uis__nomatch {
  min-height: 9rem;
  margin: 0;
  display: grid;
  place-content: center;
  text-align: center;
  color: var(--text-muted);
}
.uis__link {
  border: 0;
  background: none;
  color: var(--text);
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
}
@keyframes uis-shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
