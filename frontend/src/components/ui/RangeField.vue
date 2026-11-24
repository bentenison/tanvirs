<template>
  <div class="range">
    <div class="range__top">
      <label :for="inputId" class="range__label caption">{{ label }}</label>
      <output :for="inputId" class="range__value mono">{{ display }}</output>
    </div>
    <input
      :id="inputId"
      class="range__input"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :aria-valuetext="display"
      :style="{ '--fill': `${fill}%` }"
      @input="onInput"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

let uid = 0

/** Labelled native range input with a visible, announced value. */
export default defineComponent({
  name: 'RangeField',
  props: {
    label: { type: String, required: true },
    modelValue: { type: Number, required: true },
    min: { type: Number, default: 0 },
    max: { type: Number, default: 100 },
    step: { type: Number, default: 1 },
    unit: { type: String, default: '' },
    decimals: { type: Number, default: 0 },
  },
  emits: ['update:modelValue'],
  data() {
    uid++
    return { inputId: `range-${uid}` }
  },
  computed: {
    display(): string {
      return `${this.modelValue.toFixed(this.decimals)}${this.unit}`
    },
    fill(): number {
      return ((this.modelValue - this.min) / (this.max - this.min)) * 100
    },
  },
  methods: {
    onInput(e: Event) {
      this.$emit('update:modelValue', Number((e.target as HTMLInputElement).value))
    },
  },
})
</script>

<style scoped>
.range__top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.35rem;
}
.range__label {
  color: var(--text);
}
.range__value {
  font-size: var(--step--1);
}
.range__input {
  width: 100%;
  height: 2rem;
  margin: 0;
  background: transparent;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
}
.range__input::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 4px;
  background: linear-gradient(to right, var(--text) var(--fill), var(--border) var(--fill));
}
.range__input::-moz-range-track {
  height: 4px;
  border-radius: 4px;
  background: linear-gradient(to right, var(--text) var(--fill), var(--border) var(--fill));
}
.range__input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 1.25rem;
  height: 1.25rem;
  margin-top: -0.5rem;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--text);
  transition: transform 160ms var(--ease-ui);
}
.range__input::-moz-range-thumb {
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--text);
}
.range__input:active::-webkit-slider-thumb {
  transform: scale(1.2, 0.85);
}
.range__input:focus-visible {
  box-shadow: none;
  outline-offset: 4px;
}
</style>
