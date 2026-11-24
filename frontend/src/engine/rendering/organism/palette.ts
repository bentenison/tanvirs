/** Reads organism colours from CSS tokens so renderers follow the theme. */
export interface OrganismPalette {
  body: [number, number, number]
  rim: [number, number, number]
  light: [number, number, number]
  dot: [number, number, number]
  accent: [number, number, number]
  tension: [number, number, number]
  bg: [number, number, number]
}

function parse(color: string): [number, number, number] {
  const c = color.trim()
  if (c.startsWith('#')) {
    const hex = c.length === 4 ? c.slice(1).replace(/./g, (x) => x + x) : c.slice(1, 7)
    const n = parseInt(hex, 16)
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  }
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const [r, g, b] = m[1].split(/[\s,/]+/).map(Number)
    return [r / 255, g / 255, b / 255]
  }
  return [0, 0, 0]
}

export function readPalette(el: Element = document.documentElement): OrganismPalette {
  const s = getComputedStyle(el)
  const v = (name: string) => parse(s.getPropertyValue(name) || '#000')
  return {
    body: v('--organism-body'),
    rim: v('--organism-rim'),
    light: v('--organism-light'),
    dot: v('--organism-dot'),
    accent: v('--accent'),
    tension: v('--tension'),
    bg: v('--bg'),
  }
}

export function toCss([r, g, b]: [number, number, number], a = 1): string {
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`
}
