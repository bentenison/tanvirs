import { springs, type SpringConfig, type SpringPreset } from './presets'

/**
 * Frame-rate-independent damped spring.
 *
 * Integration uses semi-implicit (symplectic) Euler at a fixed internal
 * step with an accumulator, so the same spring behaves identically at
 * 30, 60 or 144 Hz and stays stable for stiff configurations.
 */
export const PHYSICS_STEP = 1 / 240

export class Spring {
  value: number
  velocity = 0
  target: number
  config: Required<SpringConfig>
  private acc = 0

  constructor(value = 0, config: SpringConfig | SpringPreset = 'premium') {
    this.value = value
    this.target = value
    this.config = resolve(config)
  }

  set(config: SpringConfig | SpringPreset): this {
    this.config = resolve(config)
    return this
  }

  /** Jump immediately with no motion. */
  snap(value: number): this {
    this.value = value
    this.target = value
    this.velocity = 0
    this.acc = 0
    return this
  }

  /** Add an impulse (units per second). */
  impulse(v: number): this {
    this.velocity += v
    return this
  }

  get settled(): boolean {
    const { restDelta, restSpeed } = this.config
    return Math.abs(this.target - this.value) < restDelta && Math.abs(this.velocity) < restSpeed
  }

  /** Advance by dt seconds. Returns true while still moving. */
  step(dt: number): boolean {
    if (this.settled) {
      this.value = this.target
      this.velocity = 0
      return false
    }
    this.acc += dt
    const { stiffness: k, damping: c, mass: m } = this.config
    while (this.acc >= PHYSICS_STEP) {
      const force = -k * (this.value - this.target) - c * this.velocity
      this.velocity += (force / m) * PHYSICS_STEP
      this.value += this.velocity * PHYSICS_STEP
      this.acc -= PHYSICS_STEP
    }
    return true
  }
}

/** Two coupled springs sharing a config, convenient for 2D points. */
export class Spring2D {
  x: Spring
  y: Spring
  constructor(x = 0, y = 0, config: SpringConfig | SpringPreset = 'premium') {
    this.x = new Spring(x, config)
    this.y = new Spring(y, config)
  }
  setTarget(x: number, y: number): void {
    this.x.target = x
    this.y.target = y
  }
  snap(x: number, y: number): void {
    this.x.snap(x)
    this.y.snap(y)
  }
  set(config: SpringConfig | SpringPreset): void {
    this.x.set(config)
    this.y.set(config)
  }
  step(dt: number): boolean {
    const a = this.x.step(dt)
    const b = this.y.step(dt)
    return a || b
  }
  get settled(): boolean {
    return this.x.settled && this.y.settled
  }
}

function resolve(c: SpringConfig | SpringPreset): Required<SpringConfig> {
  const base = typeof c === 'string' ? springs[c] : c
  return { restDelta: 0.001, restSpeed: 0.01, ...base } as Required<SpringConfig>
}

/**
 * Closed-form-free settle estimate: simulate until rest (bounded).
 * Used in tests and to time hand-offs between choreographed steps.
 */
export function settleTime(config: SpringConfig | SpringPreset, distance = 1, maxSeconds = 5): number {
  const s = new Spring(0, config)
  s.config.restDelta = Math.abs(distance) * 0.005
  s.config.restSpeed = Math.abs(distance) * 0.01
  s.target = distance
  let t = 0
  const dt = 1 / 120
  while (!s.settled && t < maxSeconds) {
    s.step(dt)
    t += dt
  }
  return t
}

/** Peak overshoot as a fraction of the distance travelled. */
export function overshoot(config: SpringConfig | SpringPreset): number {
  const s = new Spring(0, config)
  s.target = 1
  let peak = 0
  for (let i = 0; i < 600; i++) {
    s.step(1 / 120)
    peak = Math.max(peak, s.value)
  }
  return Math.max(0, peak - 1)
}
