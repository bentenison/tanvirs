/**
 * Adaptive rendering quality.
 *
 * The initial tier comes from cheap, conservative capability checks, no
 * benchmarks. A frame-time monitor drops one tier when frames stay slow
 * for a sustained window. The organism host keeps that drop only when the
 * page was slow while idle; a drop during a drag is undone once input stops.
 */
export type QualityTier = 'high' | 'balanced' | 'light' | 'static'

export const TIERS: QualityTier[] = ['high', 'balanced', 'light', 'static']

export interface TierSettings {
  renderer: 'webgl' | 'canvas' | 'svg'
  maxDpr: number
  /** Fraction of CSS resolution used for the field. */
  resolution: number
  refraction: boolean
  idle: boolean
}

export const tierSettings: Record<QualityTier, TierSettings> = {
  high: { renderer: 'webgl', maxDpr: 2, resolution: 1, refraction: true, idle: true },
  balanced: { renderer: 'webgl', maxDpr: 1.5, resolution: 0.75, refraction: false, idle: true },
  light: { renderer: 'canvas', maxDpr: 1, resolution: 0.4, refraction: false, idle: true },
  static: { renderer: 'svg', maxDpr: 1, resolution: 1, refraction: false, idle: false },
}

export interface Capabilities {
  webgl2: boolean
  deviceMemory?: number
  cores?: number
  coarsePointer: boolean
  saveData: boolean
  motion: 'full' | 'reduced' | 'minimal'
}

export function detectCapabilities(motion: Capabilities['motion']): Capabilities {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  let webgl2 = false
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    webgl2 = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webgl2 = false
  }
  return {
    webgl2,
    deviceMemory: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    saveData: !!nav.connection?.saveData,
    motion,
  }
}

export function initialTier(c: Capabilities): QualityTier {
  if (c.motion === 'minimal') return 'static'
  if (!c.webgl2) return c.saveData ? 'static' : 'light'
  if (c.saveData) return 'light'
  const lowMem = c.deviceMemory !== undefined && c.deviceMemory <= 2
  const fewCores = c.cores !== undefined && c.cores <= 2
  if (lowMem || fewCores) return 'light'
  if (c.coarsePointer || (c.deviceMemory !== undefined && c.deviceMemory <= 4)) return 'balanced'
  return 'high'
}

export function lowerTier(t: QualityTier): QualityTier {
  return TIERS[Math.min(TIERS.indexOf(t) + 1, TIERS.length - 1)]
}

/**
 * Feed frame durations; calls `onDegrade` when the rolling average stays
 * above `budgetMs` for `windowMs`. Ignores the first frames after a
 * (re)start, which are dominated by compilation and layout.
 */
export class FrameMonitor {
  private slowSince = -1
  private elapsed = 0
  private avg = 16.7
  constructor(
    private onDegrade: () => void,
    private budgetMs = 22,
    private windowMs = 2000,
    private warmupMs = 1200,
  ) {}

  reset(): void {
    this.slowSince = -1
    this.elapsed = 0
    this.avg = 16.7
  }

  sample(frameMs: number): void {
    // Huge gaps are tab switches / breakpoints, not slowness.
    if (frameMs > 250) return
    this.elapsed += frameMs
    if (this.elapsed < this.warmupMs) return
    this.avg = this.avg * 0.9 + frameMs * 0.1
    if (this.avg > this.budgetMs) {
      if (this.slowSince < 0) this.slowSince = this.elapsed
      else if (this.elapsed - this.slowSince > this.windowMs) {
        this.reset()
        this.onDegrade()
      }
    } else {
      this.slowSince = -1
    }
  }

  get average(): number {
    return this.avg
  }
}
