import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

export default defineConfig({
  testDir: fileURLToPath(new URL('./browser', import.meta.url)),
  // The supplied V2 experience is a self-contained ~2 MB template with
  // several inline renderers. Allow a cold browser load enough time while
  // keeping individual assertions bounded.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: process.env.CI ? [['dot'], ['json', { outputFile: 'artifacts/browser-acceptance.json' }]] : [['list']],
  use: {
    baseURL: process.env.NEXMARKETS_WEB_URL ?? 'http://localhost:4173',
    // Playwright 1.62's default headless-shell artifact is not present on
    // every CI/managed runner. Use the installed Chromium channel so the
    // same pinned browser binary works in headless and headed runs.
    channel: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  webServer: {
    command: 'node --env-file=.env scripts/serve-web-testnet.mjs',
    cwd: repoRoot,
    url: 'http://localhost:4173/healthz',
    reuseExistingServer: true,
    timeout: 30_000
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ]
});
