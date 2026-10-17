import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'prd0062-ticket53-document-transport.spec.ts',
  timeout: 300_000,
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173 --strictPort',
      url: 'http://localhost:5173/',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5174 --strictPort',
      url: 'http://localhost:5174/',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
