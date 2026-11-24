/**
 * A single global "load" signal (0..1). Playground simulations report how
 * backed-up they are; the navigation pulse beats faster and warms toward
 * coral as load rises. Plain module state, read every frame, never reactive.
 */
const sources = new Map<string, number>()

export function reportLoad(source: string, load: number): void {
  if (load <= 0.001) sources.delete(source)
  else sources.set(source, Math.min(1, load))
}

export function clearLoad(source: string): void {
  sources.delete(source)
}

export function currentLoad(): number {
  let max = 0
  for (const v of sources.values()) max = Math.max(max, v)
  return max
}
