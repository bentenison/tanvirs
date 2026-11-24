export interface SpringConfig {
  stiffness: number
  damping: number
  mass: number
  /** Distance below which the spring is considered at rest. */
  restDelta?: number
  /** Speed below which the spring is considered at rest. */
  restSpeed?: number
}

/**
 * Motion presets. Values were tuned by eye against the brief:
 * functional controls settle fast with no visible bounce; organic and
 * playful motion are reserved for the organism and a few flourishes.
 */
export const springs = {
  /** Controls: settles < 180ms, ζ ≈ 0.83. */
  ui: { stiffness: 520, damping: 38, mass: 1 },
  /** Reveals and layout shifts, ζ ≈ 1.0. */
  premium: { stiffness: 170, damping: 26, mass: 1 },
  /** Organism lobes and tendrils, ζ ≈ 0.64, one soft overshoot. */
  organic: { stiffness: 120, damping: 14, mass: 1 },
  /** Mockup windows and large surfaces, ζ ≈ 0.65 with weight. */
  heavy: { stiffness: 80, damping: 20, mass: 3 },
  /** Magnetic flourishes, ζ ≈ 0.29, use sparingly. */
  playful: { stiffness: 300, damping: 10, mass: 1 },
} satisfies Record<string, SpringConfig>

export type SpringPreset = keyof typeof springs

/** Damping ratio ζ = c / (2√(km)). <1 under-damped, 1 critical, >1 over-damped. */
export function dampingRatio(c: SpringConfig): number {
  return c.damping / (2 * Math.sqrt(c.stiffness * c.mass))
}
