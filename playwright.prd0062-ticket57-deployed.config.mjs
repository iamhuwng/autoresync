import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'prd0062-ticket57-assembly-mapping-browser.spec.ts',
  timeout: 300_000,
  workers: 1,
  reporter: 'line',
  projects: [
    {
      name: 'deployed-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  use: {
    baseURL: process.env.PRD0062_TEACHER_ORIGIN,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
