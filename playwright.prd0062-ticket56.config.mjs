import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'prd0062-ticket56-assembly-browser.spec.ts',
  timeout: 300_000,
  workers: 1,
  reporter: 'line',
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'mobile-375',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 900 },
      },
    },
  ],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173 --strictPort',
    env: {
      VITE_BOOK_ACTIVITY_MUTATION_PRESENTATION: 'enabled',
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: 'http://localhost:5173/',
  },
});
