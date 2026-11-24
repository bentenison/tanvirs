// Lab performance measurement against the running Go binary.
// Usage: node scripts/measure.mjs [baseUrl]
// Reports LCP, CLS, long tasks, transferred JS/CSS, frame timing during
// organism interaction, and JS heap after repeated navigation.
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://127.0.0.1:18080'
const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] })

async function vitals(path, viewport, label, throttle) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  if (throttle) {
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  }
  await page.addInitScript(() => {
    window.__lcp = 0
    window.__cls = 0
    window.__long = []
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value })).observe({ type: 'layout-shift', buffered: true })
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: 'longtask', buffered: true })
  })
  const bytes = { js: 0, css: 0, font: 0, html: 0 }
  page.on('response', async (r) => {
    const len = Number((await r.allHeaders())['content-length'] ?? 0)
    const t = r.request().resourceType()
    if (t === 'script') bytes.js += len
    else if (t === 'stylesheet') bytes.css += len
    else if (t === 'font') bytes.font += len
    else if (t === 'document') bytes.html += len
  })
  await page.goto(base + path, { waitUntil: 'load' })
  await page.waitForTimeout(4000)
  const r = await page.evaluate(() => ({ lcp: window.__lcp, cls: window.__cls, long: window.__long }))
  await ctx.close()
  return {
    label,
    lcpMs: Math.round(r.lcp),
    cls: Number(r.cls.toFixed(4)),
    longTasks: r.long.length,
    longestTaskMs: Math.round(Math.max(0, ...r.long)),
    kb: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, Number((v / 1024).toFixed(1))])),
  }
}

async function frames() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(base + '/', { waitUntil: 'load' })
  await page.locator('.stage .organism.is-live').waitFor({ timeout: 15000 })
  const tier = await page.locator('.stage .organism').getAttribute('data-tier')
  await page.evaluate(() => {
    window.__frames = []
    let last = performance.now()
    const loop = (t) => { window.__frames.push(t - last); last = t; if (window.__frames.length < 600) requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
  })
  const box = await page.locator('.stage .organism').boundingBox()
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.3, { steps: 10 })
    await page.mouse.up()
  }
  await page.waitForTimeout(1500)
  const f = await page.evaluate(() => window.__frames.slice(5))
  const tierAfter = await page.locator('.stage .organism').getAttribute('data-tier')
  await ctx.close()
  f.sort((a, b) => a - b)
  const q = (p) => f[Math.floor(p * (f.length - 1))]
  return { initialTier: tier, tierAfter, frames: f.length, p50Ms: q(0.5).toFixed(1), p95Ms: q(0.95).toFixed(1), approxFps: Math.round(1000 / q(0.5)) }
}

async function memory() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(base + '/', { waitUntil: 'load' })
  await page.waitForTimeout(2000)
  const heap = async () => {
    await page.evaluate(() => window.gc && window.gc())
    return page.evaluate(() => performance.memory.usedJSHeapSize / 1048576)
  }
  const start = await heap()
  const samples = []
  for (let i = 0; i < 12; i++) {
    for (const link of ['/work/eduflow', '/playground', '/work/kreovio', '/']) {
      await page.evaluate((to) => {
        const a = document.createElement('a')
        a.href = to
        document.body.appendChild(a)
        window.history.pushState({}, '', to)
        window.dispatchEvent(new PopStateEvent('popstate'))
        a.remove()
      }, link)
      await page.waitForTimeout(350)
    }
    if (i % 4 === 3) samples.push(Number((await heap()).toFixed(1)))
  }
  const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length)
  await ctx.close()
  return { startMB: Number(start.toFixed(1)), afterRoundsMB: samples, canvasesOnHome: canvases, navigations: 48 }
}

const results = {
  desktop: await vitals('/', { width: 1440, height: 900 }, 'desktop, unthrottled', false),
  mobile: await vitals('/', { width: 390, height: 844 }, 'mobile, 4x CPU + slow 4G-ish', true),
  caseStudy: await vitals('/work/eduflow', { width: 390, height: 844 }, 'case study, 4x CPU + slow 4G-ish', true),
  frames: await frames(),
  memory: await memory(),
}
console.log(JSON.stringify(results, null, 2))
await browser.close()
