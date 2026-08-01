import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const children = [];
let stopping = false;

const launch = (args, extraEnv = {}) => {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    windowsHide: true,
  });
  children.push(child);
  return child;
};

const waitFor = async (url, child, timeoutMs = 180_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`ticket90_child_exited_${child.exitCode}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Continue the bounded readiness loop.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`ticket90_readiness_timeout_${url}`);
};

const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      child.kill('SIGTERM');
    }
  }
};

process.once('SIGINT', () => { stop(); process.exit(130); });
process.once('SIGTERM', () => { stop(); process.exit(143); });
process.once('exit', stop);

try {
  const fixture = launch([
    'scripts/harness/run-tool.mjs',
    'vite-node',
    '.',
    'scripts/qa/prd0062-ticket90-evaluation-fixture.ts',
  ]);
  await waitFor('http://localhost:8790/__health', fixture, 60_000);
  const env = {
    VITE_BOOK_ACTIVITY_EVALUATION_PRESENTATION: 'enabled',
    VITE_BOOK_EVALUATION_WORKER_URL: 'http://localhost:8790',
  };
  const student = launch([
    'scripts/harness/run-tool.mjs',
    'vite',
    '.',
    'dev',
    '--host',
    'localhost',
    '--port',
    '5174',
    '--strictPort',
  ], env);
  await waitFor('http://localhost:5174/', student);
  const teacher = launch([
    'scripts/harness/run-tool.mjs',
    'vite',
    '.',
    'dev',
    '--host',
    'localhost',
    '--port',
    '5173',
    '--strictPort',
  ], env);
  await waitFor('http://localhost:5173/', teacher);
  console.log('ticket90_browser_harness_ready');
  await new Promise(() => {});
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  stop();
  process.exit(1);
}
