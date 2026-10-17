import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'prd0062-ticket91-integrity.spec.ts',
  timeout: 180_000,
  expect: {
    timeout: 30_000,
  },
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [{
    command: 'node scripts/harness/run-tool.mjs vite . dev --host 0.0.0.0 --port 5174 --strictPort',
    url: 'http://localhost:5174/',
    reuseExistingServer: false,
    timeout: 120_000,
  }, {
    command: 'node scripts/harness/run-tool.mjs vite-node . scripts/prd0062-ticket87-proof-server.ts',
    url: 'http://localhost:5187/__proof/health',
    reuseExistingServer: true,
    timeout: 120_000,
  }],
});
