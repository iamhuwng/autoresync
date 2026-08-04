import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'prd0062-student-runtime-persistence.spec.ts',
  timeout: 180_000,
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/harness/run-tool.mjs vite . dev --host 0.0.0.0 --port 5174 --strictPort',
    url: 'http://localhost:5174/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
