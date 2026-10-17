import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'prd0062-ticket77-grouped-results.spec.ts',
  timeout: 120_000,
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/qa/prd0062-ticket77-browser-harness.mjs',
    url: 'http://localhost:8799/__health',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
