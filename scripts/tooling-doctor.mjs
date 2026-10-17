import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = os.homedir();
const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
const sharedToolsRoot =
  process.env.CODEX_WINDOWS_TOOLS_ROOT ||
  path.join(home, '.codex', 'tools', 'windows-arm64');
const x64Node = path.join(sharedToolsRoot, 'node', '22-x64', 'node.exe');
const legacyX64NodeOverride = process.env.CODEX_X64_NODE || '';
const x64NpmCli = path.join(
  path.dirname(x64Node),
  'node_modules',
  'npm',
  'bin',
  'npm-cli.js',
);

let failures = 0;
let warnings = 0;

function absolute(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function checkFile(label, relativePath, required = true) {
  const target = absolute(relativePath);
  if (fs.existsSync(target)) {
    console.log(`[ok] ${label}: ${relativePath}`);
    return true;
  }

  const level = required ? 'missing' : 'warn';
  console.log(`[${level}] ${label}: ${relativePath}`);
  if (required) failures += 1;
  else warnings += 1;
  return false;
}

function warning(message) {
  warnings += 1;
  console.log(`[warn] ${message}`);
}

function listDirectories(target, pattern) {
  if (!fs.existsSync(target)) return [];
  return fs
    .readdirSync(target, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
    .map((entry) => path.join(target, entry.name));
}

function worktreeRoots() {
  try {
    const output = execFileSync(
      'git',
      ['worktree', 'list', '--porcelain'],
      { cwd: repoRoot, encoding: 'utf8', windowsHide: true },
    );
    return output
      .split(/\r?\n/u)
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length));
  } catch {
    return [];
  }
}

function isRealDirectory(target) {
  if (!fs.existsSync(target)) return false;
  const stat = fs.lstatSync(target);
  return stat.isDirectory() && !stat.isSymbolicLink();
}

function sameLocation(left, right) {
  try {
    return fs.realpathSync.native(left).toLowerCase() === fs.realpathSync.native(right).toLowerCase();
  } catch {
    return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
  }
}

console.log('LuyenTap local tooling doctor');
console.log(`repo: ${repoRoot}`);
console.log(
  `runtime: Node ${process.version} ${process.platform}/${process.arch} (${process.execPath})`,
);
console.log('');

console.log('Repository-owned dependencies');
checkFile('root Vite', 'node_modules/vite/package.json');
checkFile('root Vitest', 'node_modules/vitest/package.json');
checkFile('root Playwright', 'node_modules/@playwright/test/package.json');
checkFile('root Firebase CLI', 'node_modules/firebase-tools/package.json');
if (process.platform === 'win32' && process.arch === 'arm64') {
  checkFile('root Windows ARM64 esbuild', 'node_modules/@esbuild/win32-arm64/package.json');
}

checkFile('Cloudflare Wrangler', 'cloudflare/node_modules/wrangler/package.json');
checkFile('Cloudflare Vitest', 'cloudflare/node_modules/vitest/package.json');
if (process.platform === 'win32' && process.arch === 'arm64') {
  checkFile(
    'Cloudflare x64 Rolldown binding',
    'cloudflare/node_modules/@rolldown/binding-win32-x64-msvc/package.json',
  );
}

checkFile('R2 backup Wrangler', 'r2-backup-worker/node_modules/wrangler/package.json');
checkFile('R2 backup Vitest', 'r2-backup-worker/node_modules/vitest/package.json');
checkFile('R2 backup TypeScript', 'r2-backup-worker/node_modules/typescript/package.json');
if (process.platform === 'win32' && process.arch === 'arm64') {
  checkFile(
    'R2 backup x64 workerd',
    'r2-backup-worker/node_modules/@cloudflare/workerd-windows-64/bin/workerd.exe',
  );
}

checkFile('legacy Functions TypeScript', 'functions/node_modules/typescript/package.json', false);
checkFile('legacy Functions Firebase SDK', 'functions/node_modules/firebase-functions/package.json', false);

console.log('');
console.log('Shared compatibility tools');
if (process.platform === 'win32' && process.arch === 'arm64') {
  if (fs.existsSync(x64Node) && fs.existsSync(x64NpmCli)) {
    console.log(`[ok] shared Windows x64 Node: ${x64Node}`);
  } else {
    failures += 1;
    console.log(
      `[missing] shared Windows x64 Node/npm under ${sharedToolsRoot}`,
    );
  }
  if (
    legacyX64NodeOverride &&
    !sameLocation(legacyX64NodeOverride, x64Node)
  ) {
    warning(
      `CODEX_X64_NODE points outside the canonical tools root: ${legacyX64NodeOverride}`,
    );
  }
} else {
  console.log('[ok] Windows ARM64 x64 helper not required on this runtime');
}

console.log('');
console.log('Cleanup candidates (doctor never deletes them)');
const legacyHarnessRoot = path.join(localAppData, 'codex-harness-v3');
if (fs.existsSync(legacyHarnessRoot)) {
  warning(`legacy harness cache exists: ${legacyHarnessRoot}`);
}

const runtimeRoot = path.join(home, '.cache', 'codex-runtimes');
for (const target of listDirectories(runtimeRoot, /^codex-runtime-install-/u)) {
  warning(`leftover Codex runtime installer: ${target}`);
}

for (const cli of ['wrangler', 'firebase']) {
  const shim = path.join(appData, 'npm', process.platform === 'win32' ? `${cli}.cmd` : cli);
  if (fs.existsSync(shim)) {
    warning(
      `global ${cli} shim exists at ${shim}; this repo should use locked local CLIs`,
    );
  }
}

const duplicateWorktreeModules = [];
for (const root of worktreeRoots()) {
  if (path.resolve(root) === repoRoot) continue;
  for (const relative of [
    'node_modules',
    'cloudflare/node_modules',
    'r2-backup-worker/node_modules',
    'functions/node_modules',
  ]) {
    const target = path.join(root, ...relative.split('/'));
    if (isRealDirectory(target)) duplicateWorktreeModules.push(target);
  }
}
for (const target of duplicateWorktreeModules) {
  warning(`real dependency tree in another worktree: ${target}`);
}

console.log('');
console.log(`result: ${failures} missing required item(s), ${warnings} warning(s)`);
if (failures > 0) {
  console.log('See documentation/system/local-tooling-layout.md before installing anything.');
  process.exitCode = 1;
}
