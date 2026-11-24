import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run against the real Go binary serving the embedded
 * build (not the Vite dev server), so routing, headers and prerendered HTML
 * are exercised exactly as in production.
 *
 *   npm run build && (copy to internal/web/dist) — or scripts/build.*
 *   npm run test:e2e
 */
const port = Number(process.env.E2E_PORT ?? 18080)
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // WebGL canvases are rendered in software in headless runs; keep parallelism modest.
  workers: 3,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'go run .',
    cwd: '..',
    url: `${baseURL}/healthz`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { PORTFOLIO_ADDR: `127.0.0.1:${port}`, PORTFOLIO_LOG_LEVEL: 'warn' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
})
