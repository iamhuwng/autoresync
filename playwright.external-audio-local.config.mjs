import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const localGateway = 'http://localhost:8787';
const realProvider = process.env.EXTERNAL_AUDIO_PUBLIC_REAL_QA === '1';
const realThcs = process.env.EXTERNAL_AUDIO_THCS_REAL_QA === '1';
const realCourse = process.env.EXTERNAL_AUDIO_COURSE_REAL_QA === '1';
const workerKeys = [
  'BACKUP', 'BOOK_ACTIVITY_AUTHORING', 'BOOK_ASSEMBLY', 'BOOK_DELIVERY', 'BOOK_EVALUATION',
  'BOOK_HOMEWORK', 'BOOK_INTEGRITY_REPORT', 'BOOK_RESULT', 'BOOK_RUNTIME', 'BOOK_SOURCE_CONTROL',
  'BOOK_SUBMISSION', 'BOOK_SOURCE_RECONCILIATION', 'BOOK_SUCCESSOR', 'LISTENING_AUTHORING',
  'LISTENING_LIVE_DELIVERY', 'LISTENING_RESULT_REVIEW_DELIVERY', 'LISTENING_SOLO_DELIVERY',
  'LISTENING_UPLOAD_SESSION', 'NOTIFICATION_COMMAND', 'R2_UPLOAD',
].map((key) => `VITE_${key}_WORKER_URL`);

const localEnv = {
  LUYENTAP_ENV_DIR: fileURLToPath(new URL('./tmp/external-audio-empty-env/', import.meta.url)),
  VITE_FIREBASE_LOCAL_ONLY: 'true',
  VITE_FIREBASE_PROJECT_ID: 'demo-luyentap-local',
  VITE_FIREBASE_AUTH_DOMAIN: 'localhost',
  VITE_FIREBASE_API_KEY: 'local-dev-key',
  VITE_FIREBASE_DATABASE_URL: 'http://localhost:9000?ns=demo-luyentap-local',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-luyentap-local.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'local-dev',
  VITE_FIREBASE_APP_ID: 'local-dev',
  VITE_FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
  VITE_FIREBASE_DATABASE_EMULATOR_HOST: 'localhost:9000',
  VITE_FIREBASE_FIRESTORE_EMULATOR_HOST: 'localhost:8080',
  VITE_LOCAL_DEV_BOOTSTRAP: 'true',
  ...Object.fromEntries(workerKeys.map((key) => [key, localGateway])),
  VITE_HOMEWORK_RESULT_AUTHORITY_URL: localGateway,
  VITE_COURSE_ENROLLMENT_APPROVAL_URL: localGateway,
  VITE_HOMEWORK_NOTIFICATION_URL: localGateway,
  VITE_WRITING_NOTIFICATION_URL: localGateway,
  VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN: 'https://s3.us-west-004.backblazeb2.com',
};

export default defineConfig({
  testDir: './e2e',
  testMatch: ['external-audio-local.spec.ts', 'external-audio-authoring-local.spec.ts', 'external-audio-multi-account-local.spec.ts'],
  workers: 1,
  timeout: 120_000,
  reporter: 'list',
  ...(realProvider || realThcs || realCourse
    ? { grep: realCourse ? /course-to-result/ : realThcs ? /THCS section publishes/ : /public IELTS audio/,
      reporter: [['list', { printSteps: false }]] } : {}),
  use: { ...devices['Desktop Chrome'], channel: 'chrome', serviceWorkers: 'block', trace: 'off', actionTimeout: 15_000 },
  webServer: [
    { command: 'node e2e/fixtures/external-audio-worker.mjs', url: `${localGateway}/health`, reuseExistingServer: false },
    ...[5173, 5174, 5175].map((port) => ({
      command: `node node_modules/vite/bin/vite.js --host localhost --port ${port} --strictPort`,
      url: `http://localhost:${port}/login`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        ...localEnv,
        VITE_EXTERNAL_AUDIO_LOCAL_QA: port === 5175 ? 'disabled' : 'enabled',
        VITE_EXTERNAL_AUDIO_AUTHORING_LOCAL_QA: port === 5175 ? 'disabled' : 'enabled',
        VITE_EXTERNAL_AUDIO_UPLOAD_ROLLOUT: port === 5175 ? 'disabled' : 'enabled',
        VITE_EXTERNAL_AUDIO_PRIVATE_HOMEWORK_LOCAL_QA: port === 5175 ? 'disabled' : 'enabled',
        VITE_EXTERNAL_AUDIO_PUBLIC_LISTENING_LOCAL_QA: port === 5175 ? 'disabled' : 'enabled',
        VITE_EXTERNAL_AUDIO_THCS_LOCAL_QA: port === 5175 ? 'disabled' : 'enabled',
      },
    })),
  ],
});
