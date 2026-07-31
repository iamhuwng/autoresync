import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const children = [];
let stopping = false;
let readinessServer;

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

const waitFor = async (url, child, timeoutMs = 120_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`ticket77_browser_child_exited_${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The bounded readiness loop continues until the server accepts HTTP.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`ticket77_browser_readiness_timeout_${url}`);
};

const stopChildren = () => {
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
  readinessServer?.close();
};

process.once('SIGINT', () => { stopChildren(); process.exit(130); });
process.once('SIGTERM', () => { stopChildren(); process.exit(143); });
process.once('exit', stopChildren);

try {
  const remoteWorkerUrl = process.env.TICKET77_REMOTE_WORKER_URL?.trim();
  if (remoteWorkerUrl && !/^https:\/\/[A-Za-z0-9.-]+$/u.test(remoteWorkerUrl)) {
    throw new Error('ticket77_remote_worker_url_invalid');
  }
  const env = {
    VITE_BOOK_RESULT_WORKER_URL: remoteWorkerUrl || 'http://localhost:8799',
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

  if (remoteWorkerUrl) {
    readinessServer = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ready: true, remote: true }));
    });
    await new Promise((resolve, reject) => {
      readinessServer.once('error', reject);
      readinessServer.listen(8799, 'localhost', resolve);
    });
  } else {
    const fixture = launch(['scripts/qa/prd0062-ticket77-book-result-fixture.mjs']);
    await waitFor('http://localhost:8799/__health', fixture, 30_000);
  }
  console.log('ticket77_browser_harness_ready');
  await new Promise(() => {});
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  stopChildren();
  process.exit(1);
}
