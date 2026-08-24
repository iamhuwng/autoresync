import { defineConfig, devices } from '@playwright/test';

const viteServer = (port) => (
  `node node_modules/vite/bin/vite.js --host localhost --port ${port} --strictPort`
);

const firebaseTestEnv = {
  VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY ?? 'dummy',
  VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'dummy',
  VITE_FIREBASE_DATABASE_URL: process.env.VITE_FIREBASE_DATABASE_URL ?? 'https://dummy.firebaseio.com',
  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID ?? 'dummy',
  VITE_FIREBASE_STORAGE_BUCKET: process.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'dummy',
  VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? 'dummy',
  VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID ?? 'dummy',
};

const acceptanceRole = process.env.PRD0062_ACCEPTANCE_ROLE;
const listing = process.argv.includes('--list');
if (acceptanceRole !== undefined && !['teacher', 'student'].includes(acceptanceRole)) {
  throw new Error('PRD0062_ACCEPTANCE_ROLE must be teacher or student');
}
if (!listing && acceptanceRole === undefined) {
  throw new Error('Set PRD0062_ACCEPTANCE_ROLE=teacher|student for execution; --list may inspect all projects without a server');
}

const allProjects = [
  {
    name: 'teacher-chromium',
    testMatch: /prd0062-(teacher-authoring-assignment|teacher-updates-replacement-results)\.spec\.ts/u,
    use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173' },
  },
  {
    name: 'student-chromium-desktop',
    testMatch: /prd0062-student-runtime-persistence\.spec\.ts/u,
    use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' },
  },
  {
    name: 'student-chromium-mobile',
    testMatch: /prd0062-student-accessibility-device\.spec\.ts/u,
    use: { ...devices['Pixel 5'], baseURL: 'http://localhost:5174' },
  },
];

const projects = listing
  ? allProjects
  : allProjects.filter(({ name }) => acceptanceRole === 'teacher'
    ? name === 'teacher-chromium'
    : name.startsWith('student-chromium-'));

const webServer = acceptanceRole === 'teacher'
  ? {
    command: viteServer(5173),
    url: 'http://localhost:5173/',
    env: {
      ...firebaseTestEnv,
      VITE_BOOK_ACTIVITY_MUTATION_PRESENTATION: 'enabled',
    },
    reuseExistingServer: true,
    timeout: 120_000,
  }
  : acceptanceRole === 'student'
    ? [{
      command: viteServer(5174),
      url: 'http://localhost:5174/',
      env: firebaseTestEnv,
      reuseExistingServer: true,
      timeout: 120_000,
    }, {
      command: 'node node_modules/vite-node/vite-node.mjs scripts/prd0062-ticket87-proof-server.ts',
      url: 'http://localhost:5187/__proof/health',
      env: {
        CODEX_HARNESS_EVIDENCE_FILE: 'artifacts/prd0062-acceptance/proof-server-harness.json',
      },
      reuseExistingServer: true,
      timeout: 120_000,
    }]
    : undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: 'line',
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects,
  webServer,
});
