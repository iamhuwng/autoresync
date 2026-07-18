import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

const workerCount = Number.parseInt(process.env.PLAYWRIGHT_WORKERS || '1', 10);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: process.env.PLAYWRIGHT_FULLY_PARALLEL === 'true',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: Number.isFinite(workerCount) && workerCount > 0 ? workerCount : 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: process.env.PLAYWRIGHT_TRACE || (process.env.CI ? 'on-first-retry' : 'off'),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
