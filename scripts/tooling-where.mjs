import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let rootToolOwner = repoRoot;
if (!fs.existsSync(path.join(repoRoot, 'node_modules', 'vite', 'package.json'))) {
  try {
    const owner = path.dirname(path.dirname(path.dirname(createRequire(import.meta.url).resolve('vite/package.json'))));
    const ownPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const installedPackage = JSON.parse(fs.readFileSync(path.join(owner, 'package.json'), 'utf8'));
    const fields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
    if (fs.readFileSync(path.join(repoRoot, 'package-lock.json')).equals(fs.readFileSync(path.join(owner, 'package-lock.json')))
      && fields.every(field => JSON.stringify(ownPackage[field]) === JSON.stringify(installedPackage[field]))) rootToolOwner = owner;
  } catch {
    // Missing or incompatible ancestor dependencies remain an ordinary missing-tool error.
  }
}
const home = os.homedir();
const sharedToolsRoot =
  process.env.CODEX_WINDOWS_TOOLS_ROOT ||
  path.join(home, '.codex', 'tools', 'windows-arm64');
const x64Node = path.join(sharedToolsRoot, 'node', '22-x64', 'node.exe');
const x64NpmCli = path.join(
  path.dirname(x64Node),
  'node_modules',
  'npm',
  'bin',
  'npm-cli.js',
);
const workerToolNames = new Set([
  'cloudflare-vitest',
  'cloudflare-wrangler',
  'r2-vitest',
  'r2-wrangler',
]);

const entries = {
  'node-native': {
    owner: 'machine',
    path: process.execPath,
    runtime: `${process.platform}/${process.arch}`,
  },
  'node-x64': {
    owner: 'shared-user-tool',
    path: x64Node,
    runtime: 'win32/x64',
  },
  'npm-x64': {
    owner: 'shared-user-tool',
    path: x64NpmCli,
    runtime: 'win32/x64 via node-x64',
  },
  vite: {
    owner: 'root package',
    path: path.join(rootToolOwner, 'node_modules', 'vite', 'bin', 'vite.js'),
    runtime: 'native Node unless a demonstrated compatibility boundary requires x64',
    note: 'For local development use npm run dev or node scripts/local-dev.mjs <port>; this entry is for direct build tooling.',
  },
  vitest: {
    owner: 'root package',
    path: path.join(rootToolOwner, 'node_modules', 'vitest', 'vitest.mjs'),
    runtime: 'native Node unless a demonstrated compatibility boundary requires x64',
  },
  'vite-node': {
    owner: 'root package',
    path: path.join(rootToolOwner, 'node_modules', 'vite-node', 'vite-node.mjs'),
    runtime: 'native Node',
  },
  playwright: {
    owner: 'root package',
    path: path.join(rootToolOwner, 'node_modules', '@playwright', 'test', 'cli.js'),
    runtime: 'use the repo-locked Playwright package; browser assets remain shared user cache',
  },
  firebase: {
    owner: 'root package',
    path: path.join(rootToolOwner, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js'),
    runtime: 'use repo-locked Firebase CLI',
  },
  'cloudflare-vitest': {
    owner: 'cloudflare package',
    path: path.join(repoRoot, 'cloudflare', 'node_modules', 'vitest', 'vitest.mjs'),
    runtime: 'node-x64 on Windows ARM64; native Node elsewhere; WSL refused',
  },
  'cloudflare-wrangler': {
    owner: 'cloudflare package',
    path: path.join(repoRoot, 'cloudflare', 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    runtime: 'node-x64 on Windows ARM64; native Node elsewhere; WSL refused',
  },
  'r2-wrangler': {
    owner: 'r2-backup-worker package',
    path: path.join(repoRoot, 'r2-backup-worker', 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    runtime: 'node-x64 on Windows ARM64; native Node elsewhere; WSL refused',
  },
  'r2-vitest': {
    owner: 'r2-backup-worker package',
    path: path.join(repoRoot, 'r2-backup-worker', 'node_modules', 'vitest', 'vitest.mjs'),
    runtime: 'node-x64 on Windows ARM64; native Node elsewhere; WSL refused',
  },
  'functions-tsc': {
    owner: 'functions package',
    path: path.join(repoRoot, 'functions', 'node_modules', 'typescript', 'bin', 'tsc'),
    runtime: 'package declares Node 18; do not provision another runtime unless this package requires execution',
  },
  'firebase-emulators': {
    owner: 'shared-user-cache',
    path: path.join(home, '.cache', 'firebase', 'emulators'),
    runtime: 'shared cache; do not copy into a worktree',
  },
  'codex-runtime': {
    owner: 'managed-user-runtime',
    path: path.join(home, '.cache', 'codex-runtimes', 'codex-primary-runtime'),
    runtime: 'managed by Codex; do not copy into the repo',
  },
};

function detectWsl() {
  if (process.platform !== 'linux') return false;
  if (process.env.WSL_DISTRO_NAME) return true;
  try {
    return /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

function executionFor(
  name,
  entry,
  runtime = {
    platform: process.platform,
    arch: process.arch,
    isWsl: detectWsl(),
  },
) {
  if (name === 'node-x64') return { command: entry.path, args: [] };
  if (name === 'npm-x64') return { command: x64Node, args: [entry.path] };
  if (workerToolNames.has(name)) {
    if (runtime.isWsl) {
      throw new Error(
        `${name} must run from the Windows-authoritative checkout on Windows ARM64; WSL is an execution adapter, not a dependency/runtime source`,
      );
    }
    if (runtime.platform === 'win32' && runtime.arch === 'arm64') {
      return { command: x64Node, args: [entry.path] };
    }
    return { command: process.execPath, args: [entry.path] };
  }
  if (entry.path.endsWith('.js') || entry.path.endsWith('.mjs') || name === 'functions-tsc') {
    return { command: process.execPath, args: [entry.path] };
  }
  return { command: entry.path, args: [] };
}

function commandFor(name, entry) {
  const q = (value) => `"${value.replaceAll('"', '\\"')}"`;
  const execution = executionFor(name, entry);
  return [execution.command, ...execution.args].map(q).join(' ');
}

function printEntry(name) {
  const entry = entries[name];
  if (!entry) {
    console.error(`Unknown tool: ${name}`);
    console.error(`Known tools: ${Object.keys(entries).sort().join(', ')}`);
    process.exitCode = 2;
    return;
  }
  const exists = fs.existsSync(entry.path);
  console.log(`${name}`);
  console.log(`  owner: ${entry.owner}`);
  console.log(`  path: ${entry.path}`);
  console.log(`  exists: ${exists ? 'yes' : 'no'}`);
  console.log(`  runtime: ${entry.runtime}`);
  if (entry.note) console.log(`  note: ${entry.note}`);
  try {
    console.log(`  invoke: ${commandFor(name, entry)}`);
  } catch (error) {
    console.log(`  invoke: unavailable (${error.message})`);
    process.exitCode = 1;
  }
  if (!exists) process.exitCode = 1;
}

export { detectWsl, executionFor, entries };

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const requested = process.argv.slice(2);
  if (requested[0] === '--exec') {
    const [name, ...toolArguments] = requested.slice(1);
    const entry = entries[name];
    if (!entry) {
      console.error(`Unknown tool: ${name || '(missing)'}`);
      process.exitCode = 2;
    } else {
      let execution;
      try {
        execution = executionFor(name, entry);
      } catch (error) {
        console.error(`Cannot execute ${name}: ${error.message}`);
        process.exitCode = 1;
        execution = null;
      }
      if (!execution) {
        // The resolver already reported the owning environment boundary.
      } else if (!fs.existsSync(entry.path)) {
        console.error(`Missing tool: ${entry.path}`);
        process.exitCode = 1;
      } else {
        const environment = { ...process.env };
        if (execution.command !== process.execPath) {
          const pathKey = Object.keys(environment).find((key) => key.toUpperCase() === 'PATH') || 'PATH';
          environment[pathKey] = `${path.dirname(execution.command)}${path.delimiter}${environment[pathKey] || ''}`;
        }
        const result = spawnSync(execution.command, [...execution.args, ...toolArguments], {
          cwd: process.cwd(),
          env: environment,
          stdio: 'inherit',
          shell: false,
        });
        if (result.error) console.error(result.error.message);
        process.exitCode = result.status ?? 1;
      }
    }
  } else if (requested.length === 0 || requested.includes('--all')) {
    for (const name of Object.keys(entries).sort()) {
      printEntry(name);
      console.log('');
    }
  } else {
    for (const name of requested) {
      printEntry(name);
    }
  }
}
