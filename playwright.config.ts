import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // Tests reseed the shared in-memory database before each test, so they
  // must run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Requires an existing production build (`npm run build`).
    command: 'node tests/e2e/server.ts',
    url: 'http://127.0.0.1:3100',
    // Never attach to an already running server (e.g. `npm run dev`, which
    // reads .env.local and points at the production database).
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
})
