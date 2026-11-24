// Captures review screenshots of the running site at representative sizes
// in both themes. Usage: node scripts/screenshots.mjs [baseUrl] [outDir]
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const base = process.argv[2] ?? 'http://127.0.0.1:18080'
const out = process.argv[3] ?? 'test-results/screens'
await mkdir(out, { recursive: true })

const shots = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'wide', width: 1920, height: 1080 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844, mobile: true },
  { name: 'small', width: 360, height: 760, mobile: true },
]
const targets = [
  { path: '/', label: 'hero', scroll: 0 },
  { path: '/', label: 'domains', scroll: 1.25 },
  { path: '/#work', label: 'work', scroll: null },
  { path: '/#capabilities', label: 'capabilities', scroll: null },
  { path: '/#playground', label: 'playground', scroll: null },
  { path: '/#contact', label: 'contact', scroll: null },
  { path: '/work/eduflow', label: 'case', scroll: 0 },
]

const browser = await chromium.launch()
for (const theme of ['light', 'dark']) {
  for (const s of shots) {
    const ctx = await browser.newContext({
      viewport: { width: s.width, height: s.height },
      deviceScaleFactor: 1,
      isMobile: !!s.mobile,
      hasTouch: !!s.mobile,
      colorScheme: theme,
    })
    const page = await ctx.newPage()
    await page.addInitScript((t) => {
      localStorage.setItem('portfolio:theme', t)
      sessionStorage.setItem('portfolio:opening-seen', '1')
    }, theme)
    for (const t of targets) {
      if (s.name !== 'desktop' && s.name !== 'mobile' && !['hero', 'work'].includes(t.label)) continue
      await page.goto(base + t.path, { waitUntil: 'networkidle' })
      if (t.scroll) await page.evaluate((k) => window.scrollTo(0, window.innerHeight * k), t.scroll)
      await page.waitForTimeout(1400)
      await page.screenshot({ timeout: 60000, caret: 'initial', path: `${out}/${theme}-${s.name}-${t.label}.png` })
    }
    await ctx.close()
  }
}
await browser.close()
console.log('screenshots written to', out)
