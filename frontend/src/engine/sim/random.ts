/** Small seeded PRNG so every simulation is deterministic and reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Exponentially distributed sample with the given mean. */
export function exponential(rnd: () => number, mean: number): number {
  return -Math.log(1 - rnd()) * mean
}

/** Log-normal-ish service time: mostly near `median`, with a long tail. */
export function serviceTime(rnd: () => number, median: number, spread = 0.45): number {
  // Box–Muller
  const u = Math.max(1e-9, rnd())
  const v = rnd()
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return median * Math.exp(z * spread)
}
