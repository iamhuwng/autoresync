import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const outputDir = process.env.RELEASE_BROWSER_OUTPUT_DIR || 'tmp/release-browser';
const baseURL = process.env.RELEASE_BROWSER_BASE_URL;
if (!baseURL) throw new Error('RELEASE_BROWSER_BASE_URL is required');

export default defineConfig({
  testDir: './e2e',
  testMatch: 'release-promotion-browser.spec.ts',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  outputDir,
  reporter: [
    ['line'],
    ['json', { outputFile: path.join(outputDir, 'playwright-report.json') }],
    ['html', { outputFolder: path.join(outputDir, 'playwright-report'), open: 'never' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'on',
    screenshot: 'on',
    video: 'retain-on-failure',
    headless: true,
  },
});
