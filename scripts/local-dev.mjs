import { spawn, spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const workerSecrets = path.join(repoRoot, 'cloudflare', 'tmp', '.dev.vars');
try {
  accessSync(workerSecrets, constants.R_OK);
} catch {
  console.error(`Missing or unreadable ${workerSecrets}. Supply the reviewed local Worker secrets before starting Firebase; never commit them.`);
  process.exit(1);
}

const runSetup = (script, args) => {
  const result = spawnSync(process.execPath, [path.join(scriptDir, script), ...args], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

runSetup('dev-env.mjs', ['ensure']);
runSetup('local-firebase.mjs', ['start']);

const localWorkerOrigin = 'http://localhost:8787';
const rawViteArgs = process.argv.slice(2);
const vitePort = rawViteArgs.length === 1 && /^\d+$/u.test(rawViteArgs[0])
  ? rawViteArgs[0]
  : rawViteArgs.includes('--port')
    ? rawViteArgs[rawViteArgs.indexOf('--port') + 1]
    : '5173';
const localWorkerKeys = [
  'VITE_BACKUP_WORKER_URL',
  'VITE_BOOK_ACTIVITY_AUTHORING_WORKER_URL',
  'VITE_BOOK_ASSEMBLY_WORKER_URL',
  'VITE_BOOK_DELIVERY_WORKER_URL',
  'VITE_BOOK_EVALUATION_WORKER_URL',
  'VITE_BOOK_HOMEWORK_WORKER_URL',
  'VITE_BOOK_INTEGRITY_REPORT_WORKER_URL',
  'VITE_BOOK_RESULT_WORKER_URL',
  'VITE_BOOK_RUNTIME_WORKER_URL',
  'VITE_BOOK_SOURCE_CONTROL_WORKER_URL',
  'VITE_BOOK_SUBMISSION_WORKER_URL',
  'VITE_BOOK_SOURCE_RECONCILIATION_WORKER_URL',
  'VITE_BOOK_SUCCESSOR_WORKER_URL',
  'VITE_COURSE_ENROLLMENT_APPROVAL_URL',
  'VITE_HOMEWORK_NOTIFICATION_URL',
  'VITE_HOMEWORK_RESULT_AUTHORITY_URL',
  'VITE_LISTENING_AUTHORING_WORKER_URL',
  'VITE_LISTENING_LIVE_DELIVERY_WORKER_URL',
  'VITE_LISTENING_RESULT_REVIEW_DELIVERY_WORKER_URL',
  'VITE_LISTENING_SOLO_DELIVERY_WORKER_URL',
  'VITE_LISTENING_UPLOAD_SESSION_WORKER_URL',
  'VITE_NOTIFICATION_COMMAND_WORKER_URL',
  'VITE_R2_UPLOAD_WORKER_URL',
  'VITE_WRITING_NOTIFICATION_URL',
];

const localEnv = {
  ...process.env,
  VITE_FIREBASE_LOCAL_ONLY: 'true',
  VITE_FIREBASE_API_KEY: 'local-dev-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'localhost',
  VITE_FIREBASE_DATABASE_URL: 'http://localhost:9000?ns=demo-luyentap-local',
  VITE_FIREBASE_PROJECT_ID: 'demo-luyentap-local',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-luyentap-local.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'local-dev',
  VITE_FIREBASE_APP_ID: 'local-dev',
  VITE_FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
  VITE_FIREBASE_DATABASE_EMULATOR_HOST: 'localhost:9000',
  VITE_FIREBASE_FIRESTORE_EMULATOR_HOST: 'localhost:8080',
  VITE_LOCAL_DEV_BOOTSTRAP: 'true',
  LOCAL_VITE_ORIGIN: `http://localhost:${vitePort}`,
  ...Object.fromEntries(localWorkerKeys.map((key) => [key, localWorkerOrigin])),
  // shortcut: local AI is unavailable until an isolated gateway runtime is provided.
  VITE_THCS_GEMMA_WORKER_URL: '',
  VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN: 'https://s3.us-west-004.backblazeb2.com',
  VITE_READING_V2_SUBMISSION_ENDPOINT: '',
  VITE_READING_V2_SUBMISSION_EMULATOR_ORIGIN: 'http://localhost:5001',
  VITE_READING_PASSAGE_LIBRARY: 'enabled',
  VITE_MATERIAL_BOOKS: 'enabled',
  VITE_MATERIAL_BOOK_EDITOR: 'enabled',
  VITE_BOOK_ACTIVITY_CREATE_PRESENTATION: 'enabled',
  VITE_BOOK_ACTIVITY_PUBLISH_PRESENTATION: 'enabled',
  VITE_BOOK_ACTIVITY_ASSIGN_PLACE_PRESENTATION: 'enabled',
  VITE_BOOK_ACTIVITY_LAUNCH_DELIVERY_PRESENTATION: 'enabled',
  VITE_BOOK_ACTIVITY_MUTATION_PRESENTATION: 'enabled',
};

const viteBin = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const viteArgs = rawViteArgs.length === 1 && /^\d+$/u.test(rawViteArgs[0])
  ? ['--port', rawViteArgs[0]]
  : rawViteArgs;
const vite = spawn(process.execPath, [viteBin, ...viteArgs], {
  cwd: repoRoot,
  env: localEnv,
  stdio: 'inherit',
});
const bookSourceWorker = spawn(process.execPath, [path.join(scriptDir, 'local-book-source-worker.mjs')], {
  cwd: repoRoot,
  env: localEnv,
  stdio: 'inherit',
  windowsHide: true,
});

const forwardSignal = (signal) => {
  vite.kill(signal);
  bookSourceWorker.kill(signal);
};
process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));
bookSourceWorker.on('exit', (code, signal) => {
  if (code !== 0 || signal) {
    vite.kill('SIGTERM');
    process.exit(code ?? 1);
  }
});
vite.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
