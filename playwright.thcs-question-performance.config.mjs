import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'thcs-question-performance.spec.ts',
  timeout: 90_000,
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host localhost --port 5173 --strictPort',
    env: {
      VITE_FIREBASE_API_KEY: 'dummy',
      VITE_FIREBASE_AUTH_DOMAIN: 'dummy',
      VITE_FIREBASE_DATABASE_URL: 'https://dummy.firebaseio.com',
      VITE_FIREBASE_PROJECT_ID: 'dummy',
      VITE_FIREBASE_STORAGE_BUCKET: 'dummy',
      VITE_FIREBASE_MESSAGING_SENDER_ID: 'dummy',
      VITE_FIREBASE_APP_ID: 'dummy',
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: 'http://localhost:5173/',
  },
});
