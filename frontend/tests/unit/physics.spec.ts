import { describe, expect, it } from 'vitest'
import { Spring, settleTime, overshoot } from '@/engine/physics/spring'
import { springs, dampingRatio } from '@/engine/physics/presets'
import { rubberBand, VelocityTracker } from '@/engine/interaction/drag'

function simulate(spring: Spring, hz: number, seconds: number): number {
  const steps = Math.round(seconds * hz)
  for (let i = 0; i < steps; i++) spring.step(1 / hz)
  return spring.value
}

describe('Spring', () => {
  it('reaches its target and reports settled', () => {
    const s = new Spring(0, 'premium')
    s.target = 100
    simulate(s, 60, 3)
    expect(s.settled).toBe(true)
    expect(s.value).toBe(100)
    expect(s.velocity).toBe(0)
  })

  it('is frame-rate independent', () => {
    const a = new Spring(0, 'organic')
    const b = new Spring(0, 'organic')
    const c = new Spring(0, 'organic')
    for (const s of [a, b, c]) s.target = 1
    const at30 = simulate(a, 30, 0.2)
    const at60 = simulate(b, 60, 0.2)
    const at144 = simulate(c, 144, 0.2)
    expect(at60).toBeCloseTo(at30, 2)
    expect(at144).toBeCloseTo(at60, 2)
  })

  it('stays stable for very stiff springs and large frame gaps', () => {
    const s = new Spring(0, { stiffness: 2000, damping: 60, mass: 1 })
    s.target = 1
    for (let i = 0; i < 10; i++) s.step(0.1)
    expect(Number.isFinite(s.value)).toBe(true)
    expect(Math.abs(s.value - 1)).toBeLessThan(0.01)
  })

  it('snap() jumps without motion', () => {
    const s = new Spring(0)
    s.snap(5)
    expect(s.value).toBe(5)
    expect(s.target).toBe(5)
    expect(s.step(1 / 60)).toBe(false)
  })

  it('carries impulses as velocity', () => {
    const s = new Spring(0, 'organic')
    s.impulse(500)
    s.step(1 / 60)
    expect(s.value).toBeGreaterThan(0)
  })
})

describe('motion presets', () => {
  it('ui controls settle fast with negligible overshoot', () => {
    expect(settleTime('ui')).toBeLessThan(0.3)
    expect(overshoot('ui')).toBeLessThan(0.02)
  })

  it('premium transitions are close to critically damped', () => {
    expect(dampingRatio(springs.premium)).toBeGreaterThan(0.9)
    expect(overshoot('premium')).toBeLessThan(0.01)
  })

  it('organic and playful presets overshoot, playful more so', () => {
    expect(overshoot('organic')).toBeGreaterThan(0.05)
    expect(overshoot('playful')).toBeGreaterThan(overshoot('organic'))
  })

  it('heavy objects move slower than ui controls', () => {
    expect(settleTime('heavy')).toBeGreaterThan(settleTime('ui'))
  })
})

describe('rubberBand', () => {
  it('is linear inside the limit', () => {
    expect(rubberBand(40, 100)).toBe(40)
    expect(rubberBand(-40, 100)).toBe(-40)
  })

  it('is monotonic, continuous and bounded beyond the limit', () => {
    let prev = rubberBand(100, 100)
    expect(prev).toBe(100)
    for (let d = 101; d < 2000; d += 25) {
      const v = rubberBand(d, 100)
      expect(v).toBeGreaterThan(prev)
      expect(v).toBeLessThan(200)
      prev = v
    }
  })
})

describe('VelocityTracker', () => {
  it('measures velocity over the sample window', () => {
    const v = new VelocityTracker(100)
    v.push(0, 0, 0)
    v.push(10, 0, 10)
    v.push(20, 0, 20)
    expect(v.get().x).toBeCloseTo(1000)
    expect(v.get().y).toBe(0)
  })
})
