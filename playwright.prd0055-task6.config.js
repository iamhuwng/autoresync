import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chrome-result-review',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'edge-result-review',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'desktop-safari-result-review',
      use: {
        browserName: 'webkit',
        viewport: { width: 1366, height: 900 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      },
    },
    {
      name: 'ios-safari-result-review',
      use: {
        browserName: 'webkit',
        ...devices['iPhone 15'],
      },
    },
  ],
});
