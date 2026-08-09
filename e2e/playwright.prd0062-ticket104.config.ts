import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
  testDir: root,
  testMatch: 'e2e/prd0062-ticket104-course-class-launch.spec.ts',
  workers: 1,
  reporter: 'line',
  use: { baseURL: 'http://localhost:5173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    cwd: root,
    url: 'http://localhost:5173',
    env: {
      VITE_FIREBASE_API_KEY: 'dummy',
      VITE_FIREBASE_AUTH_DOMAIN: 'dummy',
      VITE_FIREBASE_DATABASE_URL: 'https://dummy.firebaseio.com',
      VITE_FIREBASE_PROJECT_ID: 'dummy',
      VITE_FIREBASE_STORAGE_BUCKET: 'dummy',
      VITE_FIREBASE_MESSAGING_SENDER_ID: 'dummy',
      VITE_FIREBASE_APP_ID: 'dummy',
    },
    reuseExistingServer: true,
  },
});
