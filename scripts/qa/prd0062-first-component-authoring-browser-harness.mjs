import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const children = [];
const launch = (args, env = {}) => {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit', windowsHide: true });
  children.push(child);
  return child;
};
const waitFor = async (url, child) => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`first_component_child_exited_${child.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch { /* wait for readiness */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`first_component_readiness_timeout_${url}`);
};
const stop = () => {
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    else child.kill('SIGTERM');
  }
};
process.once('SIGINT', () => { stop(); process.exit(130); });
process.once('SIGTERM', () => { stop(); process.exit(143); });
process.once('exit', stop);

try {
  const fixture = launch(['scripts/tooling-where.mjs', '--exec', 'vite-node', '--config', 'cloudflare/vitest.ticket59.config.mjs', '--mode', 'test',
    'scripts/qa/prd0062-first-component-authoring-fixture.ts']);
  await waitFor('http://localhost:8791/__health', fixture);
  const reuseTeacher = await fetch('http://localhost:5173/').then((response) => response.ok).catch(() => false);
  const teacher = reuseTeacher ? null : launch(['scripts/tooling-where.mjs', '--exec', 'vite', 'dev', '--host', 'localhost', '--port', '5173', '--strictPort'], {
    VITE_FIREBASE_API_KEY: 'fixture-key', VITE_FIREBASE_AUTH_DOMAIN: 'fixture.test',
    VITE_FIREBASE_DATABASE_URL: 'https://dummy.firebaseio.com', VITE_FIREBASE_PROJECT_ID: 'first-component-fixture',
    VITE_FIREBASE_STORAGE_BUCKET: 'fixture.test', VITE_FIREBASE_MESSAGING_SENDER_ID: '123', VITE_FIREBASE_APP_ID: '1:123:web:fixture',
    // Vite validates these as production-style HTTPS origins. The browser
    // smoke page still routes the logical origin through its fixture fetcher.
    VITE_BOOK_SOURCE_CONTROL_WORKER_URL: 'https://first-component-worker.test',
    VITE_BOOK_SOURCE_RECONCILIATION_WORKER_URL: 'https://first-component-worker.test',
    VITE_BOOK_ASSEMBLY_WORKER_URL: 'https://first-component-worker.test',
    VITE_BOOK_ACTIVITY_AUTHORING_WORKER_URL: 'https://first-component-worker.test',
    VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN: 'https://s3.us-west-004.backblazeb2.com',
  });
  if (teacher) await waitFor('http://localhost:5173/', teacher);
  // Warm the composition Worker module before Playwright starts. Vite lazily
  // optimizes pdf-lib on the first combine action; without this request the
  // optimizer can trigger a full-page HMR reload in the middle of the proof,
  // making a valid saved draft appear to reset to the initial setup screen.
  if (teacher || reuseTeacher) {
    const workerModule = await fetch('http://localhost:5173/src/services/book-source-delivery/componentPdfComposition.worker.ts');
    if (!workerModule.ok) throw new Error(`first_component_worker_module_${workerModule.status}`);
  }
  console.log('first_component_browser_harness_ready');
  await new Promise(() => {});
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  stop();
  process.exit(1);
}
