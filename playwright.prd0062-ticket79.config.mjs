import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'prd0062-ticket79-component-navigation.spec.ts',
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
    command: 'node scripts/harness/run-tool.mjs vite . dev --host localhost --port 5174',
    url: 'http://localhost:5174/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
