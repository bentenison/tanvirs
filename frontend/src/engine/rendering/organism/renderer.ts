import type { OrganismModel } from './model'
import type { OrganismPalette } from './palette'

export interface OrganismRenderer {
  readonly kind: 'webgl' | 'canvas'
  resize(cssWidth: number, cssHeight: number, dpr: number, resolution: number): void
  setPalette(p: OrganismPalette): void
  setRefraction(on: boolean): void
  render(model: OrganismModel, time: number): void
  dispose(): void
}
