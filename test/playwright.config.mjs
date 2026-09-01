import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  // The supplied V2 experience is a self-contained ~2 MB template with
  // several inline renderers. Allow a cold browser load enough time while
  // keeping individual assertions bounded.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: process.env.CI ? [['dot'], ['json', { outputFile: 'artifacts/browser-acceptance.json' }]] : [['list']],
  use: {
    baseURL: process.env.NEXMARKETS_WEB_URL ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  webServer: {
    command: 'node --env-file=.env scripts/serve-web-testnet.mjs',
    url: 'http://localhost:4173/healthz',
    reuseExistingServer: true,
    timeout: 30_000
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ]
});
