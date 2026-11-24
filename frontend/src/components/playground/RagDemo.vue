<template>
  <SimShell
    id="sim-rag"
    :index="index"
    kicker="Retrieval-augmented generation"
    title="Grounding an answer"
    description="A document is chunked, chunks are scored against the question, the best are placed into the prompt, and the answer cites them. Every step is visible, and no model is called."
  >
    <template #viz>
      <div class="rag">
        <ol class="rag__stages" aria-label="Pipeline stages">
          <li
            v-for="(s, i) in stages"
            :key="s"
            class="rag__stage mono"
            :class="{ 'is-done': stage > i, 'is-now': stage === i }"
            :aria-current="stage === i ? 'step' : undefined"
          >
            <span>{{ i + 1 }}</span>{{ s }}
          </li>
        </ol>

        <div class="rag__cols">
          <div class="rag__chunks" aria-label="Chunks">
            <p class="caption">{{ chunks.length }} chunks · {{ chunkSize }} words · {{ overlap }} overlap</p>
            <ol class="rag__list">
              <li
                v-for="c in chunks"
                :key="c.id"
                class="rag__chunk"
                :class="{ 'is-picked': stage >= 2 && pickedIds.includes(c.id), 'is-cited': stage >= 4 && result.citations.includes(c.id) }"
              >
                <span class="rag__cid mono">[{{ c.id }}]</span>
                <span class="rag__score" :style="{ transform: `scaleX(${stage >= 1 ? scoreOf(c.id) : 0})` }" aria-hidden="true" />
                <span class="rag__ctext" v-html="highlight(c.text)" />
              </li>
            </ol>
          </div>

          <div class="rag__out">
            <div class="rag__block" :class="{ 'is-on': stage >= 3 }">
              <p class="caption">Augmented prompt</p>
              <pre class="rag__prompt">{{ stage >= 3 ? promptPreview : '-' }}</pre>
            </div>
            <div class="rag__block" :class="{ 'is-on': stage >= 4 }" aria-live="polite">
              <p class="caption">Answer (extractive)</p>
              <p class="rag__answer">{{ stage >= 4 ? result.text : '-' }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #controls>
      <div class="rag__q">
        <label :for="qId" class="caption rag__qlabel">Question</label>
        <select :id="qId" v-model="question" class="rag__select">
          <option v-for="q in questions" :key="q" :value="q">{{ q }}</option>
        </select>
      </div>
      <RangeField v-model="chunkSize" label="Chunk size" :min="20" :max="80" :step="5" unit=" words" />
      <RangeField v-model="overlap" label="Overlap" :min="0" :max="20" unit=" words" />
      <div class="sim-buttons">
        <button type="button" class="sim-btn sim-btn--primary" @click="run">Run pipeline</button>
      </div>
    </template>

    <template #stats>
      <div><dt>Top score</dt><dd>{{ top ? top.score.toFixed(2) : '-' }}</dd></div>
      <div><dt>Retrieved</dt><dd>{{ retrieved.length }}/{{ chunks.length }}</dd></div>
      <div><dt>Context</dt><dd>{{ contextWords }} words</dd></div>
      <div><dt>Cited</dt><dd>{{ result.citations.length ? result.citations.map((c) => `[${c}]`).join(' ') : '-' }}</dd></div>
    </template>
    <template #insight>
      Lexical BM25 scoring stands in for embeddings and the answer quotes the retrieved text, so the demo is deterministic and runs entirely in your browser.
    </template>
  </SimShell>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import SimShell from './SimShell.vue'
import RangeField from '@/components/ui/RangeField.vue'
import {
  answer,
  buildPrompt,
  chunk,
  retrieve,
  tokenize,
  SAMPLE_DOCUMENT,
  SAMPLE_QUESTIONS,
  type Chunk,
  type Scored,
} from '@/engine/sim/rag'

const STAGES = ['Chunk', 'Score', 'Retrieve', 'Augment', 'Answer']

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default defineComponent({
  name: 'RagDemo',
  components: { SimShell, RangeField },
  props: {
    index: { type: String, default: '§05.4' },
  },
  data() {
    return {
      stages: STAGES,
      questions: SAMPLE_QUESTIONS,
      question: SAMPLE_QUESTIONS[0],
      chunkSize: 40,
      overlap: 8,
      stage: 0,
      timer: 0,
      qId: 'rag-question',
    }
  },
  computed: {
    chunks(): Chunk[] {
      return chunk(SAMPLE_DOCUMENT, this.chunkSize, this.overlap)
    },
    scoredAll(): Scored[] {
      return retrieve(this.chunks, this.question, this.chunks.length)
    },
    retrieved(): Scored[] {
      return this.scoredAll.slice(0, 3)
    },
    top(): Scored | undefined {
      return this.retrieved[0]
    },
    pickedIds(): number[] {
      return this.retrieved.map((s) => s.chunk.id)
    },
    result(): { text: string; citations: number[] } {
      return answer(this.question, this.retrieved)
    },
    promptPreview(): string {
      const p = buildPrompt(this.question, this.retrieved)
      return p.length > 520 ? p.slice(0, 520) + '…' : p
    },
    contextWords(): number {
      return this.retrieved.reduce((n, s) => n + s.chunk.text.split(/\s+/).length, 0)
    },
    queryTerms(): Set<string> {
      return new Set(tokenize(this.question))
    },
  },
  watch: {
    question() {
      this.run()
    },
    chunkSize() {
      this.stage = Math.min(this.stage, 4)
    },
  },
  mounted() {
    this.stage = 4
  },
  beforeUnmount() {
    clearInterval(this.timer)
  },
  methods: {
    run() {
      clearInterval(this.timer)
      const motion = document.documentElement.dataset.motion
      if (motion === 'minimal') {
        this.stage = 4
        return
      }
      this.stage = 0
      this.timer = window.setInterval(() => {
        this.stage++
        if (this.stage >= 4) clearInterval(this.timer)
      }, motion === 'reduced' ? 180 : 520)
    },
    scoreOf(id: number): number {
      const max = this.scoredAll[0]?.score || 1
      const s = this.scoredAll.find((x) => x.chunk.id === id)
      return s ? s.score / max : 0
    },
    highlight(text: string): string {
      if (this.stage < 1) return escapeHtml(text)
      return escapeHtml(text).replace(/[A-Za-z0-9]+/g, (w) => {
        const t = tokenize(w)[0]
        return t && this.queryTerms.has(t) ? `<mark>${w}</mark>` : w
      })
    },
  },
})
</script>

<style scoped>
.rag {
  display: grid;
  gap: 1rem;
  padding: 1.1rem;
  height: 100%;
}
.rag__stages {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.rag__stage {
  display: inline-flex;
  gap: 0.45rem;
  align-items: center;
  padding: 0.3rem 0.7rem 0.3rem 0.35rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: all 260ms var(--ease-ui);
}
.rag__stage span {
  display: grid;
  place-items: center;
  width: 1.3rem;
  height: 1.3rem;
  border-radius: 50%;
  background: var(--surface-sunken);
}
.rag__stage.is-done {
  color: var(--text);
}
.rag__stage.is-done span {
  background: var(--text);
  color: var(--bg);
}
.rag__stage.is-now {
  color: var(--text);
  border-color: var(--text);
}
.rag__stage.is-now span {
  background: var(--accent);
  color: var(--on-accent);
}
.rag__cols {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 1rem;
  min-height: 0;
}
.rag__chunks .caption,
.rag__block .caption {
  margin: 0 0 0.4rem;
}
.rag__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.3rem;
  max-height: 22rem;
  overflow: auto;
  overscroll-behavior: contain;
}
.rag__chunk {
  position: relative;
  display: grid;
  grid-template-columns: 2rem 1fr;
  gap: 0.4rem;
  padding: 0.45rem 0.5rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface-raised);
  font-size: 0.72rem;
  line-height: 1.45;
  color: var(--text-muted);
  transition: border-color 260ms, opacity 260ms;
}
.rag__chunk.is-picked {
  border-color: var(--text);
  color: var(--text);
}
.rag__chunk.is-cited {
  border-color: var(--accent-ink);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.rag__cid {
  color: var(--text);
}
.rag__score {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  width: 100%;
  background: var(--accent-ink);
  transform-origin: left;
  transition: transform 520ms cubic-bezier(0.2, 1.1, 0.3, 1);
}
.rag__ctext :deep(mark) {
  background: var(--accent-soft);
  color: var(--text);
  border-radius: 2px;
  padding: 0 1px;
}
.rag__out {
  display: grid;
  gap: 0.8rem;
  align-content: start;
}
.rag__block {
  opacity: 0.45;
  transition: opacity 320ms var(--ease-out);
}
.rag__block.is-on {
  opacity: 1;
}
.rag__prompt {
  margin: 0;
  padding: 0.6rem;
  border-radius: 6px;
  background: var(--surface-sunken);
  font-family: var(--font-mono);
  font-size: 0.64rem;
  line-height: 1.5;
  white-space: pre-wrap;
  max-height: 12rem;
  overflow: auto;
}
.rag__answer {
  margin: 0;
  font-size: 0.82rem;
}
.rag__q {
  display: grid;
  gap: 0.35rem;
}
.rag__qlabel {
  color: var(--text);
}
.rag__select {
  width: 100%;
  min-width: 0;
  text-overflow: ellipsis;
  min-height: 2.6rem;
  padding: 0 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: var(--step--1);
}
@media (max-width: 640px) {
  .rag__cols {
    grid-template-columns: 1fr;
  }
}
</style>
