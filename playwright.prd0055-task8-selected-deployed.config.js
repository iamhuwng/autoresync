import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'json',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'prd0055-selected-class-deployed-chromium',
      testMatch: /prd0055-task8-selected-class-deployed\.spec\.ts/,
    },
  ],
});
