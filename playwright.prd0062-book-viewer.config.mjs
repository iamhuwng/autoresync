import { defineConfig, devices } from '@playwright/test';

const serverCommand = process.env.PRD0062_BOOK_VIEWER_SERVER_COMMAND
  ?? 'node node_modules/vite/bin/vite.js --host localhost --port 5173 --strictPort';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'prd0062-book-viewer.spec.ts',
  timeout: 180_000,
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: serverCommand,
    url: 'http://localhost:5173/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
