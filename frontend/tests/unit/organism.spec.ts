import { describe, expect, it } from 'vitest'
import { OrganismModel } from '@/engine/rendering/organism/model'
import { initialTier, lowerTier, FrameMonitor } from '@/engine/rendering/quality'
import { domains } from '@/config/technologies'

const specs = domains.map((d) => ({ id: d.id, angle: d.angle, weight: d.weight }))

function model() {
  const m = new OrganismModel(specs)
  m.idle = false
  m.setLayout({ width: 1000, height: 800 }, true)
  return m
}

const run = (m: OrganismModel, s: number) => {
  for (let t = 0; t < s; t += 1 / 60) m.step(1 / 60)
}

describe('OrganismModel', () => {
  it('packs one core, one blob per lobe and two neck bridges per lobe', () => {
    expect(model().blobs.length).toBe(1 + specs.length * 3)
  })

  it('rests with no tension', () => {
    const m = model()
    run(m, 1)
    expect(Math.max(...m.blobs.map((b) => b.tension))).toBeLessThan(0.01)
    expect(m.atRest).toBe(true)
  })

  it('dragging stretches the neck and raises tension, release springs back', () => {
    const m = model()
    const i = 0
    const start = m.lobePosition(i)
    m.beginDrag(i, start.x, start.y)
    m.drag(start.x + 400, start.y)
    run(m, 0.5)
    const stretched = m.lobePosition(i)
    expect(stretched.x).toBeGreaterThan(start.x + 80)
    expect(m.blobs[1 + i].tension).toBeGreaterThan(0.2)
    // Necks thin under strain.
    const stretchedBridgeR = m.blobs[1 + specs.length + i * 2 + 1].r
    m.endDrag(0, 0)
    run(m, 3)
    const back = m.lobePosition(i)
    expect(Math.abs(back.x - start.x)).toBeLessThan(2)
    expect(m.blobs[1 + specs.length + i * 2 + 1].r).toBeGreaterThan(stretchedBridgeR)
  })

  it('rubber-bands extreme drags', () => {
    const m = model()
    const p = m.lobePosition(0)
    m.beginDrag(0, p.x, p.y)
    m.drag(p.x + 5000, p.y)
    run(m, 1)
    expect(m.lobePosition(0).x - p.x).toBeLessThan(m.unit * 0.35)
  })

  it('hit-tests lobes and the core', () => {
    const m = model()
    const p = m.lobePosition(3)
    expect(m.hitTest(p.x, p.y)).toBe(3)
    const c = m.corePosition()
    expect(m.hitTest(c.x, c.y)).toBe(-2)
    expect(m.hitTest(-500, -500)).toBe(-1)
  })

  it('focusing a lobe grows it and spawns organelles', () => {
    const m = model()
    const before = m.lobeRadius(2)
    m.focus(2, ['a', 'b', 'c'])
    run(m, 1)
    expect(m.lobeRadius(2)).toBeGreaterThan(before * 1.5)
    expect(m.organelles.map((o) => o.id)).toEqual(['a', 'b', 'c'])
  })

  it('product mode recedes unrelated domains', () => {
    const m = model()
    m.setMode({ kind: 'product', domains: ['backend'] })
    run(m, 2)
    const backend = specs.findIndex((s) => s.id === 'backend')
    const ai = specs.findIndex((s) => s.id === 'ai')
    expect(m.blobs[1 + ai].presence).toBeLessThan(0.5)
    expect(m.blobs[1 + backend].presence).toBeGreaterThan(0.95)
  })
})

describe('quality tiers', () => {
  const base = { webgl2: true, deviceMemory: 8, cores: 8, coarsePointer: false, saveData: false, motion: 'full' as const }
  it('chooses conservatively', () => {
    expect(initialTier(base)).toBe('high')
    expect(initialTier({ ...base, coarsePointer: true })).toBe('balanced')
    expect(initialTier({ ...base, deviceMemory: 2 })).toBe('light')
    expect(initialTier({ ...base, webgl2: false })).toBe('light')
    expect(initialTier({ ...base, saveData: true, webgl2: false })).toBe('static')
    expect(initialTier({ ...base, motion: 'minimal' })).toBe('static')
  })

  it('steps down one tier at a time and bottoms out', () => {
    expect(lowerTier('high')).toBe('balanced')
    expect(lowerTier('static')).toBe('static')
  })

  it('degrades only after sustained slow frames', () => {
    let calls = 0
    const mon = new FrameMonitor(() => calls++, 22, 2000, 500)
    for (let i = 0; i < 100; i++) mon.sample(16.7)
    for (let i = 0; i < 20; i++) mon.sample(40) // brief spike
    for (let i = 0; i < 100; i++) mon.sample(16.7)
    expect(calls).toBe(0)
    // 500ms warm-up already passed; ~2s of sustained 40ms frames triggers one step down.
    for (let i = 0; i < 60; i++) mon.sample(40)
    expect(calls).toBe(1)
    // Still slow after the step down: it degrades again only after a fresh warm-up + window.
    for (let i = 0; i < 30; i++) mon.sample(40)
    expect(calls).toBe(1)
    for (let i = 0; i < 60; i++) mon.sample(40)
    expect(calls).toBe(2)
  })

  it('ignores tab-switch gaps', () => {
    let calls = 0
    const mon = new FrameMonitor(() => calls++, 22, 500, 0)
    for (let i = 0; i < 50; i++) mon.sample(5000)
    expect(calls).toBe(0)
  })
})
