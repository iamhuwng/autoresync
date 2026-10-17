import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'prd0062-public-library.spec.ts', workers: 1, reporter: 'line',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
