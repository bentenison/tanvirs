<template>
  <section id="ask" ref="root" class="ask" aria-labelledby="ask-title">
    <div class="shell ask__grid">
      <div class="ask__intro">
        <SectionHeading id="ask-title" index="03b" kicker="Ask my portfolio">
          Ask, and watch it <em>find</em> the answer.
          <template #lede>
            Retrieval over this site's own content, running in your browser. You see each step: the terms, the passages it
            ranks, and an answer that quotes and cites them.
          </template>
        </SectionHeading>
        <p class="ask__honest caption">No AI model and no server call: lexical retrieval (BM25) over what this site already says.</p>
        <NextLink href="#capabilities" label="Capabilities" />
      </div>

      <div class="ask__panel">
        <form class="ask__form" role="search" @submit.prevent="run(query)">
          <label for="ask-q" class="sr-only">Your question</label>
          <input
            id="ask-q"
            v-model="query"
            type="search"
            maxlength="160"
            autocomplete="off"
            placeholder="e.g. Have you built offline apps?"
          />
          <button class="sim-btn sim-btn--primary" type="submit" :disabled="!query.trim()">Ask</button>
        </form>
        <div class="ask__chips" role="group" aria-label="Suggested questions">
          <button v-for="s in suggestions" :key="s" type="button" class="ask__chip" @click="pick(s)">{{ s }}</button>
        </div>

        <ol class="ask__stages" aria-label="Retrieval steps">
          <li v-for="(st, i) in stages" :key="st.key" class="ask__stage mono" :class="{ 'is-done': step > i, 'is-now': step === i }">
            <span>{{ i + 1 }}</span>{{ st.label }}<em v-if="result && step > i">{{ stageTime(st.key) }}</em>
          </li>
        </ol>

        <div class="ask__out" aria-live="polite">
          <template v-if="result">
            <p v-if="step >= 1" class="ask__terms caption">
              Terms: <span v-for="t in result.terms" :key="t" class="ask__term mono">{{ t }}</span>
            </p>

            <div v-if="step >= 3" class="ask__answer">
              <p class="caption">Answer</p>
              <p v-if="result.found" class="ask__answer-text">
                <template v-for="(a, i) in result.answer" :key="i">
                  {{ a.text }}<a v-for="c in a.cites" :key="c" class="ask__cite" :href="`#ask-src-${c}`" :aria-label="`source ${c}`">{{ c }}</a>{{ ' ' }}
                </template>
              </p>
              <p v-else class="ask__answer-text">
                I couldn't find that on this site. Try rephrasing, or ask me directly through the
                <RouterLink to="/#contact">contact form</RouterLink>.
              </p>
            </div>

            <ol v-if="step >= 2 && result.hits.length" class="ask__sources" aria-label="Sources">
              <li v-for="(h, i) in result.hits" :id="`ask-src-${i + 1}`" :key="h.doc.id" class="ask__src">
                <span class="ask__src-n mono">{{ i + 1 }}</span>
                <span class="ask__src-body">
                  <RouterLink :to="h.doc.href" class="ask__src-title">{{ h.doc.title }} <span class="muted">· {{ h.doc.section }}</span></RouterLink>
                  <span class="ask__src-text" v-html="highlight(h.doc.text)" />
                  <span class="ask__score" aria-hidden="true"><i :style="{ transform: `scaleX(${h.score / maxScore})` }" /></span>
                </span>
              </li>
            </ol>
          </template>
          <p v-else class="ask__empty caption">Pick a question above, or type your own.</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent, markRaw } from 'vue'
import { RouterLink } from 'vue-router'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import NextLink from '@/components/ui/NextLink.vue'
import { ask, SUGGESTIONS, type AskResult } from '@/engine/ask/ask'
import { tokenize } from '@/engine/sim/rag'
import { reveal } from '@/engine/animation/reveal'

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default defineComponent({
  name: 'AskSection',
  components: { RouterLink, SectionHeading, NextLink },
  data() {
    return {
      query: '',
      suggestions: SUGGESTIONS,
      result: null as AskResult | null,
      step: -1,
      timer: 0,
      stop: null as null | (() => void),
      stages: [
        { key: 'tokenize', label: 'Understand' },
        { key: 'retrieve', label: 'Retrieve' },
        { key: 'rank', label: 'Rank' },
        { key: 'compose', label: 'Answer' },
      ],
    }
  },
  computed: {
    maxScore(): number {
      return this.result?.hits[0]?.score || 1
    },
    termSet(): Set<string> {
      return new Set(this.result?.terms ?? [])
    },
  },
  mounted() {
    this.stop = reveal(this.$refs.root as HTMLElement)
  },
  beforeUnmount() {
    clearInterval(this.timer)
    this.stop?.()
  },
  methods: {
    pick(s: string) {
      this.query = s
      this.run(s)
    },
    run(q: string) {
      if (!q.trim()) return
      clearInterval(this.timer)
      this.result = markRaw(ask(q))
      const motion = document.documentElement.dataset.motion
      if (motion === 'minimal') {
        this.step = 4
        return
      }
      this.step = 0
      this.timer = window.setInterval(
        () => {
          this.step++
          if (this.step >= 4) clearInterval(this.timer)
        },
        motion === 'reduced' ? 120 : 380,
      )
    },
    stageTime(key: string): string {
      const t = this.result?.timings
      if (!t) return ''
      const ms = key === 'tokenize' ? t.tokenize : key === 'compose' ? t.compose : key === 'retrieve' ? t.retrieve * 0.6 : t.retrieve * 0.4
      return ms < 1 ? `${Math.max(1, Math.round(ms * 1000))} µs` : `${ms.toFixed(1)} ms`
    },
    highlight(text: string): string {
      return escapeHtml(text).replace(/[A-Za-z0-9]+/g, (w) => {
        const t = tokenize(w)[0]
        return t && this.termSet.has(t) ? `<mark>${w}</mark>` : w
      })
    },
  },
})
</script>

<style scoped>
.ask {
  padding-block: clamp(4rem, 10vw, 8rem);
  border-top: 1px solid var(--border);
}
.ask__grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: clamp(1rem, 2vw, 2rem);
  row-gap: 2rem;
}
.ask__intro {
  grid-column: 1 / span 5;
}
.ask__honest {
  margin: 1.5rem 0 0;
  max-width: 40ch;
  text-transform: none;
  letter-spacing: 0.01em;
}
.ask__panel {
  grid-column: 7 / span 6;
  display: grid;
  gap: 1rem;
  align-content: start;
  padding: 1.25rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
}
.ask__form {
  display: flex;
  gap: 0.5rem;
}
.ask__form input {
  flex: 1;
  min-width: 0;
  min-height: 2.75rem;
  padding: 0 0.9rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: var(--step--1);
}
.ask__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.ask__chip {
  min-height: 2.1rem;
  padding: 0 0.75rem;
  border: 1px dashed var(--border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--step--2);
  cursor: pointer;
}
.ask__chip:hover {
  color: var(--text);
  border-style: solid;
}
.ask__stages {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ask__stage {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.65rem 0.25rem 0.3rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  transition: all 240ms var(--ease-ui);
}
.ask__stage span {
  display: grid;
  place-items: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: var(--surface-sunken);
}
.ask__stage em {
  font-style: normal;
  text-transform: none;
  color: var(--text-faint);
}
.ask__stage.is-done {
  color: var(--text);
}
.ask__stage.is-done span {
  background: var(--text);
  color: var(--bg);
}
.ask__stage.is-now {
  border-color: var(--text);
  color: var(--text);
}
.ask__stage.is-now span {
  background: var(--accent);
  color: var(--on-accent);
}
.ask__out {
  display: grid;
  gap: 1rem;
  min-height: 12rem;
}
.ask__terms {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
}
.ask__term {
  padding: 0.05rem 0.45rem;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--text);
  text-transform: none;
}
.ask__answer {
  padding: 0.9rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
  animation: ask-in 420ms var(--ease-out);
}
.ask__answer .caption {
  margin: 0 0 0.35rem;
}
.ask__answer-text {
  margin: 0;
  line-height: 1.55;
}
.ask__cite {
  display: inline-grid;
  place-items: center;
  min-width: 1.2rem;
  height: 1.2rem;
  margin: 0 0.15rem 0 0.2rem;
  padding: 0 0.25rem;
  border-radius: 4px;
  background: var(--text);
  color: var(--bg);
  font-family: var(--font-mono);
  font-size: 0.65rem;
  text-decoration: none;
  vertical-align: 0.15em;
}
.ask__sources {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ask__src {
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr);
  gap: 0.6rem;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  animation: ask-in 420ms var(--ease-out) backwards;
}
.ask__src:nth-child(2) {
  animation-delay: 80ms;
}
.ask__src:nth-child(3) {
  animation-delay: 160ms;
}
.ask__src:nth-child(4) {
  animation-delay: 240ms;
}
.ask__src:target {
  border-color: var(--accent-ink);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.ask__src-n {
  display: grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 4px;
  background: var(--surface-sunken);
  font-size: 0.7rem;
}
.ask__src-body {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}
.ask__src-title {
  font-size: var(--step--1);
  font-weight: 500;
  color: var(--text);
  text-decoration: none;
}
.ask__src-title:hover {
  text-decoration: underline;
}
.ask__src-title .muted {
  color: var(--text-muted);
  font-weight: 400;
}
.ask__src-text {
  font-size: var(--step--2);
  color: var(--text-muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ask__src-text :deep(mark) {
  background: var(--accent-soft);
  color: var(--text);
  border-radius: 2px;
}
.ask__score {
  height: 2px;
  background: var(--surface-sunken);
  border-radius: 2px;
  overflow: hidden;
}
.ask__score i {
  display: block;
  height: 100%;
  background: var(--accent-ink);
  transform-origin: left;
  transition: transform 600ms var(--ease-premium);
}
.ask__empty {
  margin: 0;
  align-self: center;
  text-align: center;
}
@keyframes ask-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
@media (max-width: 1023px) {
  .ask__intro,
  .ask__panel {
    grid-column: 1 / -1;
  }
}
</style>

<style>
/* Hidden by the server with PORTFOLIO_ASK=false (set before first paint). */
:root[data-ask='off'] #ask {
  display: none;
}
</style>
