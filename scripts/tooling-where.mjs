import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const repoTool = (owner, relativePath) => ({ owner, path: path.join(repoRoot, relativePath), command: process.execPath });

export const entries = {
  'node-native': { owner: 'machine', path: process.execPath },
  vite: repoTool('root package', 'node_modules/vite/bin/vite.js'),
  vitest: repoTool('root package', 'node_modules/vitest/vitest.mjs'),
  'vite-node': repoTool('root package', 'node_modules/vite-node/vite-node.mjs'),
  playwright: repoTool('root package', 'node_modules/@playwright/test/cli.js'),
  firebase: repoTool('root package', 'node_modules/firebase-tools/lib/bin/firebase.js'),
  'cloudflare-vitest': repoTool('Cloudflare package', 'cloudflare/node_modules/vitest/vitest.mjs'),
  'cloudflare-wrangler': repoTool('Cloudflare package', 'cloudflare/node_modules/wrangler/bin/wrangler.js'),
  'r2-wrangler': repoTool('R2 backup package', 'r2-backup-worker/node_modules/wrangler/bin/wrangler.js'),
  'r2-vitest': repoTool('R2 backup package', 'r2-backup-worker/node_modules/vitest/vitest.mjs'),
  'functions-tsc': repoTool('Functions package', 'functions/node_modules/typescript/bin/tsc'),
  'firebase-emulators': { owner: 'user cache', path: path.join(os.homedir(), '.cache', 'firebase', 'emulators') },
  'codex-runtime': { owner: 'managed user runtime', path: path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime') },
};

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [mode, tool, ...args] = process.argv.slice(2);
  const exec = mode === '--exec';
  const names = exec ? [tool] : !mode || mode === '--all' ? Object.keys(entries).sort() : process.argv.slice(2);
  for (const name of names) {
    const entry = Object.hasOwn(entries, name) ? entries[name] : undefined;
    if (!entry) {
      console.error(`Unknown tool: ${name ?? '(missing)'}`);
      process.exitCode = 2;
      continue;
    }
    const exists = fs.existsSync(entry.path);
    if (!exec) {
      console.log(`${name}\n  owner: ${entry.owner}\n  path: ${entry.path}\n  exists: ${exists ? 'yes' : 'no'}`);
      if (!exists) process.exitCode ??= 1;
    } else if (!exists) {
      console.error(`Missing tool: ${entry.path}. Run npm ci in its package directory.`);
      process.exitCode = 1;
    } else {
      const command = entry.command ?? entry.path;
      const result = spawnSync(command, entry.command ? [entry.path, ...args] : args, { stdio: 'inherit' });
      if (result.error) console.error(result.error.message);
      process.exitCode = result.status ?? 1;
    }
  }
}
