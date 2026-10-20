import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.mjs',
  timeout: 120_000,
  workers: 1,
  retries: 0,
  expect: { timeout: 10_000 },
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 20_000,
    baseURL: process.env.PROOF_URL || 'http://127.0.0.1:3902',
    browserName: 'chromium',
    channel: 'chromium',
    launchOptions: process.env.PROOF_CHROMIUM_PATH ? { executablePath: process.env.PROOF_CHROMIUM_PATH } : {},
    viewport: { width: 1440, height: 1000 },
    trace: 'on',
    screenshot: 'on',
  },
});
