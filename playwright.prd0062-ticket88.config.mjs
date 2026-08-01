import { defineConfig, devices } from '@playwright/test';

const rolePort = Number(process.env.PRD0062_TICKET88_PORT ?? '5174');

export default defineConfig({
  testDir: './e2e',
  testMatch: 'prd0062-ticket88-book-completion.spec.ts',
  timeout: 180_000,
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [{
    command: `node scripts/harness/run-tool.mjs vite . dev --host 0.0.0.0 --port ${rolePort} --strictPort`,
    url: `http://localhost:${rolePort}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  }],
});
