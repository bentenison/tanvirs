import { test, expect, type Page } from '@playwright/test'

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 900

function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' || (m.type() === 'warning' && /hydration/i.test(m.text()))) errors.push(m.text())
  })
  return errors
}

test.describe('home', () => {
  test('communicates who this is immediately, with prerendered content', async ({ page, request }) => {
    const html = await (await request.get('/')).text()
    expect(html).toContain('Engineering ideas into')
    expect(html).toContain('Tanvir Shaikh')
    expect(html).toContain('application/ld+json')

    const errors = trackErrors(page)
    await page.goto('/')
    await expect(page).toHaveTitle(/Tanvir Shaikh/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('working')
    await expect(page.getByRole('link', { name: 'See the work' })).toBeVisible()
    await page.waitForTimeout(500)
    expect(errors).toEqual([])
  })

  test('the hero organism becomes live and survives rapid interaction', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/')
    const organism = page.locator('.stage .organism')
    await expect(organism).toHaveClass(/is-live/, { timeout: 10_000 })
    const box = (await organism.boundingBox())!
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    for (let i = 0; i < 6; i++) {
      await page.mouse.move(cx + box.width * 0.2, cy)
      await page.mouse.down()
      await page.mouse.move(cx + box.width * 0.45, cy - 60, { steps: 4 })
      await page.mouse.up()
    }
    await page.waitForTimeout(300)
    expect(errors).toEqual([])
  })

  test('falls back without WebGL', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext
      // @ts-expect-error test override
      HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
        if (type === 'webgl2' || type === 'webgl') return null
        // @ts-expect-error passthrough
        return orig.call(this, type, ...rest)
      }
    })
    await page.goto('/')
    const organism = page.locator('.stage .organism')
    await expect(organism).toHaveAttribute('data-tier', /light|static/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('domain index is keyboard operable and reveals details', async ({ page }) => {
    await page.goto('/')
    const data = page.getByRole('button', { name: 'Data', exact: true })
    await data.focus()
    await page.keyboard.press('Enter')
    const panel = page.getByRole('region', { name: 'Databases' })
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('PostgreSQL')
    await expect(data).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('button', { name: 'Performance', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
  })

  test('skip link is the first tab stop', async ({ page }) => {
    test.skip(isMobile(page), 'keyboard flow is desktop-only')
    await page.goto('/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main')).toBeFocused()
  })
})

test.describe('navigation', () => {
  test('desktop section links deep-link and highlight', async ({ page }) => {
    test.skip(isMobile(page), 'desktop navigation')
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /Playground/ }).click()
    await expect(page).toHaveURL(/#playground$/)
    await expect(page.locator('#playground')).toBeInViewport()
  })

  test('mobile sheet navigates and closes', async ({ page }) => {
    test.skip(!isMobile(page), 'mobile navigation')
    await page.goto('/')
    await page.getByRole('button', { name: 'Open menu' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await sheet.getByRole('link', { name: /About/ }).click()
    await expect(sheet).toBeHidden()
    await expect(page).toHaveURL(/#about$/)
    await expect(page.locator('#about')).toBeInViewport()
  })

  test('case study route, shared surface and browser history', async ({ page }) => {
    await page.goto('/')
    await page.locator('#project-eduflow').getByRole('link', { name: 'Case study' }).click()
    await expect(page).toHaveURL(/\/work\/eduflow$/)
    await expect(page.getByRole('heading', { level: 1, name: 'EduFlow' })).toBeVisible()
    await expect(page).toHaveTitle(/EduFlow/)
    await page.getByRole('link', { name: /Next case study/ }).click()
    await expect(page).toHaveURL(/\/work\/kreovio$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/work\/eduflow$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await page.goForward()
    await expect(page.getByRole('heading', { level: 1, name: 'EduFlow' })).toBeVisible()
  })

  test('deep links load directly; unknown routes 404', async ({ page }) => {
    const res = await page.goto('/work/kreovio')
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Kreovio' })).toBeVisible()

    const missing = await page.goto('/work/does-not-exist')
    expect(missing?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('detached')

    const play = await page.goto('/playground')
    expect(play?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 3, name: 'Bounded concurrency' })).toBeVisible()
  })
})

test.describe('preferences', () => {
  test('theme switching persists across reloads', async ({ page }) => {
    await page.goto('/')
    if (isMobile(page)) await page.getByRole('button', { name: 'Open menu' }).click()
    else await page.getByRole('button', { name: 'Display settings' }).click()
    await page.getByRole('radio', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(bg).toBe('rgb(18, 19, 17)')
  })

  test('respects prefers-reduced-motion', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await ctx.close()
  })

  test('minimal motion shows the static organism and keeps content', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('portfolio:motion', 'minimal'))
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'minimal')
    const organism = page.locator('.stage .organism')
    await expect(organism).toHaveAttribute('data-tier', 'static')
    await expect(organism.locator('svg.organism__static')).toBeVisible()
    await page.locator('#work').scrollIntoViewIfNeeded()
    await expect(page.locator('#project-eduflow').getByRole('heading', { name: 'EduFlow' })).toBeVisible()
  })
})

test.describe('interactive surfaces', () => {
  test('EduFlow register updates and issues a receipt', async ({ page }) => {
    await page.goto('/work/eduflow')
    const register = page.getByRole('region', { name: /Attendance register/ })
    await register.scrollIntoViewIfNeeded()
    await register.getByRole('button', { name: 'Mark all present' }).click()
    await expect(register).toContainText(/\d+\/\d+ present/)
    const collect = page.getByRole('button', { name: 'Collect' }).first()
    if (await collect.count()) {
      await collect.click()
      await expect(page.getByRole('status').filter({ hasText: /Receipt R-\d{6}/ })).toBeVisible()
    }
  })

  test('playground simulations respond to controls', async ({ page }) => {
    await page.goto('/playground')
    const workers = page.getByRole('slider', { name: 'Workers' })
    await workers.fill('16')
    await expect(workers).toHaveAttribute('aria-valuetext', '16')
    await expect(page.locator('#sim-workers output')).toHaveText('16')
    await page.getByRole('button', { name: 'Run pipeline' }).click()
    await expect(page.locator('#sim-rag').getByText(/\[\d+\]/).first()).toBeVisible()
  })
})

test.describe('responsive layout', () => {
  for (const width of [360, 390, 768, 1024, 1440, 1920]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      test.skip(isMobile(page) && width > 900, 'covered by desktop project')
      await page.setViewportSize({ width, height: 900 })
      for (const path of ['/', '/work/eduflow', '/playground']) {
        await page.goto(path)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0)
      }
    })
  }
})
