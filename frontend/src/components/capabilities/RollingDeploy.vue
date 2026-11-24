<template>
  <div class="deploy">
    <ul class="deploy__pods" role="list" aria-label="Pods">
      <li v-for="p in pods" :key="p.id" class="deploy__pod" :class="`is-${p.state}`">
        <span class="mono deploy__ver">{{ p.version }}</span>
        <span class="caption deploy__state">{{ labels[p.state] }}</span>
      </li>
    </ul>
    <div class="deploy__bar">
      <button type="button" class="sim-btn sim-btn--primary" :disabled="running" @click="deploy">
        Roll out {{ nextVersion }}
      </button>
      <p class="mono deploy__traffic" role="status">
        Serving: {{ serving }}/{{ pods.length }} ready · {{ running ? 'rolling…' : 'stable' }}
      </p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

type PodState = 'ready' | 'starting' | 'draining'
interface Pod {
  id: number
  version: string
  state: PodState
}

/** Rolling update with readiness gates: capacity never drops below N−1 (maxUnavailable = 0, maxSurge = 1). */
export default defineComponent({
  name: 'RollingDeploy',
  data() {
    return {
      pods: [1, 2, 3, 4].map((id) => ({ id, version: 'v1', state: 'ready' })) as Pod[],
      labels: { ready: 'ready', starting: 'probing', draining: 'draining' } as Record<PodState, string>,
      major: 1,
      running: false,
      seq: 5,
      timers: [] as number[],
    }
  },
  computed: {
    serving(): number {
      return this.pods.filter((p) => p.state === 'ready').length
    },
    nextVersion(): string {
      return `v${this.major + 1}`
    },
  },
  beforeUnmount() {
    this.timers.forEach((t) => clearTimeout(t))
  },
  methods: {
    wait(ms: number) {
      const motion = document.documentElement.dataset.motion
      const d = motion === 'minimal' ? 0 : motion === 'reduced' ? ms / 3 : ms
      return new Promise<void>((r) => this.timers.push(window.setTimeout(r, d)))
    },
    async deploy() {
      this.running = true
      const version = this.nextVersion
      const olds = this.pods.filter((p) => p.version !== version).map((p) => p.id)
      for (const oldId of olds) {
        const fresh: Pod = { id: this.seq++, version, state: 'starting' }
        this.pods.push(fresh)
        await this.wait(700)
        fresh.state = 'ready'
        const old = this.pods.find((p) => p.id === oldId)
        if (old) old.state = 'draining'
        await this.wait(500)
        this.pods = this.pods.filter((p) => p.id !== oldId)
      }
      this.major += 1
      this.running = false
    },
  },
})
</script>

<style scoped>
.deploy__pods {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  min-height: 4.2rem;
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
}
.deploy__pod {
  display: grid;
  gap: 0.15rem;
  width: 4.75rem;
  padding: 0.55rem 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  animation: pod-in 420ms cubic-bezier(0.2, 1.4, 0.3, 1);
  transition: opacity 300ms, border-color 200ms;
}
.deploy__ver {
  font-weight: 600;
}
.deploy__pod.is-ready {
  border-color: var(--accent-ink);
}
.deploy__pod.is-starting {
  border-style: dashed;
}
.deploy__pod.is-draining {
  opacity: 0.45;
}
.deploy__bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  align-items: center;
}
.deploy__traffic {
  margin: 0;
  font-size: 0.74rem;
  color: var(--text-muted);
}
@keyframes pod-in {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
}
</style>
