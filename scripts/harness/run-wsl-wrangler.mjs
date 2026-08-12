import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { wranglerDependencyCacheIdentity } from './contract.mjs';

const commandResult = (command, args, options = {}) => spawnSync(command, args, { encoding: 'utf8', shell: false, ...options });
const failure = (code, message) => Object.assign(new Error(message), { code });
const lockMarkerName = '.harness-wrangler-lock.json';
const lockGuardName = '.guard';
const lockProtocolVersion = 1;

function runtimeProbe() {
  const npm = commandResult('npm', ['--version']);
  return {
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    nodeAbi: process.versions.modules,
    executable: process.execPath,
    npmVersion: npm.status === 0 ? npm.stdout.trim() : null,
    npmError: npm.status === 0 ? null : (npm.stderr || npm.error?.message || 'npm unavailable').trim(),
  };
}

function readMarker(markerPath) {
  try { return JSON.parse(fs.readFileSync(markerPath, 'utf8')); }
  catch (error) { throw failure('WSL_WRANGLER_CACHE_INVALID', `invalid WSL Wrangler cache marker ${markerPath}: ${error.message}`); }
}

function validateCache(root, entry, markerPath, expected) {
  if (!fs.existsSync(markerPath) || !fs.existsSync(entry)) throw failure('WSL_WRANGLER_CACHE_INCOMPLETE', `incomplete WSL Wrangler cache: ${root}`);
  const marker = readMarker(markerPath);
  for (const [name, value] of Object.entries(expected)) {
    if (marker[name] !== value) throw failure('WSL_WRANGLER_CACHE_INVALID', `WSL Wrangler cache marker mismatch for ${name}: ${root}`);
  }
}

function processStartTime(processId) {
  try {
    const stat = fs.readFileSync(`/proc/${processId}/stat`, 'utf8');
    const closingParenthesis = stat.lastIndexOf(')');
    const fields = stat.slice(closingParenthesis + 2).trim().split(/\s+/u);
    const startTime = fields[19];
    return /^\d+$/u.test(startTime || '') ? startTime : null;
  } catch {
    return null;
  }
}

export function wslWranglerLockOwner(processId = process.pid, startTime = processStartTime(processId)) {
  if (!Number.isInteger(processId) || processId <= 0 || !/^\d+$/u.test(startTime || '')) {
    throw failure('WSL_WRANGLER_LOCK_UNPROVABLE', 'cannot establish WSL Wrangler lock owner identity');
  }
  return { processId, startTime };
}

function lockOwnerFromMarker(markerPath, label) {
  let marker;
  try { marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')); }
  catch {
    throw failure('WSL_WRANGLER_LOCK_UNPROVABLE', `${label} is legacy, malformed, or unreadable: ${markerPath}`);
  }
  const owner = marker?.owner;
  if (marker.lockProtocolVersion !== lockProtocolVersion || !Number.isInteger(owner?.processId) || owner.processId <= 0 || !/^\d+$/u.test(owner.startTime || '')) {
    throw failure('WSL_WRANGLER_LOCK_UNPROVABLE', `${label} has unprovable owner metadata: ${markerPath}`);
  }
  return owner;
}

function lockState(markerPath, label, processStartProbe) {
  const owner = lockOwnerFromMarker(markerPath, label);
  return { owner, active: processStartProbe(owner.processId) === owner.startTime };
}

export function wslWranglerLockState(lockDirectory, processStartProbe = processStartTime) {
  return lockState(path.join(lockDirectory, lockMarkerName), 'WSL Wrangler lock', processStartProbe);
}

const sameOwner = (first, second) => first.processId === second.processId && first.startTime === second.startTime;
const sleepFor = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function pendingGuard(guardPath) {
  try { return fs.readFileSync(guardPath, 'utf8').trim() === ''; }
  catch { return false; }
}

export async function acquireWslWranglerLockGuard(lockDirectory, options = {}) {
  const owner = options.owner ?? wslWranglerLockOwner();
  const guardPath = `${lockDirectory}${lockGuardName}`;
  const deadline = Date.now() + (options.timeoutMs ?? 30 * 60 * 1000);
  const publicationDeadline = Date.now() + (options.publicationTimeoutMs ?? 1000);
  const sleep = options.sleep ?? sleepFor;
  const processStartProbe = options.processStartProbe ?? processStartTime;
  while (true) {
    let descriptor;
    try {
      descriptor = fs.openSync(guardPath, 'wx', 0o600);
      fs.writeFileSync(descriptor, `${JSON.stringify({ lockProtocolVersion, owner })}\n`);
      fs.closeSync(descriptor);
      return async () => {
        const current = lockState(guardPath, 'WSL Wrangler lock guard', processStartProbe);
        if (!sameOwner(current.owner, owner)) throw failure('WSL_WRANGLER_LOCK_UNPROVABLE', `WSL Wrangler lock guard ownership changed: ${guardPath}`);
        fs.unlinkSync(guardPath);
      };
    } catch (error) {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (error.code !== 'EEXIST') throw error;
      if (pendingGuard(guardPath) && Date.now() < publicationDeadline) {
        await sleep(10);
        continue;
      }
      const state = lockState(guardPath, 'WSL Wrangler lock guard', processStartProbe);
      if (!state.active) throw failure('WSL_WRANGLER_LOCK_UNPROVABLE', `WSL Wrangler lock guard owner is not live and cannot be reclaimed automatically: ${guardPath}`);
      if (Date.now() >= deadline) throw failure('WSL_WRANGLER_LOCK_TIMEOUT', `timed out waiting for active WSL Wrangler lock guard ${guardPath}`);
      await sleep(25);
    }
  }
}

export async function acquireWslWranglerInstallLock(lockDirectory, options = {}) {
  const owner = options.owner ?? wslWranglerLockOwner();
  const deadline = Date.now() + (options.timeoutMs ?? 30 * 60 * 1000);
  const sleep = options.sleep ?? sleepFor;
  const processStartProbe = options.processStartProbe ?? processStartTime;
  while (true) {
    const releaseGuard = await acquireWslWranglerLockGuard(lockDirectory, { ...options, owner, processStartProbe });
    let activeOwner = false;
    try {
      if (!fs.existsSync(lockDirectory)) {
        fs.mkdirSync(lockDirectory);
        fs.writeFileSync(path.join(lockDirectory, lockMarkerName), `${JSON.stringify({ lockProtocolVersion, owner })}\n`);
        return async () => {
          const releaseReleaseGuard = await acquireWslWranglerLockGuard(lockDirectory, { ...options, owner, processStartProbe });
          try {
            const current = wslWranglerLockState(lockDirectory, processStartProbe);
            if (!sameOwner(current.owner, owner)) throw failure('WSL_WRANGLER_LOCK_UNPROVABLE', `WSL Wrangler lock ownership changed before release: ${lockDirectory}`);
            fs.rmSync(lockDirectory, { recursive: true, force: false });
          } finally {
            await releaseReleaseGuard();
          }
        };
      }
      const state = wslWranglerLockState(lockDirectory, processStartProbe);
      if (!state.active) {
        fs.rmSync(lockDirectory, { recursive: true, force: false });
        await options.afterStaleReclaim?.();
        continue;
      }
      activeOwner = true;
    } finally {
      await releaseGuard();
    }
    if (activeOwner && Date.now() >= deadline) throw failure('WSL_WRANGLER_LOCK_TIMEOUT', `timed out waiting for active WSL Wrangler cache lock ${lockDirectory}`);
    await sleep(25);
  }
}

export function wslCacheRoot(configuredRoot) {
  if (configuredRoot === undefined) return path.join(os.homedir(), '.cache', 'codex-harness', 'wrangler');
  if (typeof configuredRoot !== 'string' || configuredRoot === '/' || !path.posix.isAbsolute(configuredRoot) || path.posix.normalize(configuredRoot) !== configuredRoot) {
    throw failure('WSL_WRANGLER_PROTOCOL_INVALID', 'CODEX_HARNESS_WSL_ROOT must be an absolute normalized Linux path');
  }
  return configuredRoot;
}

function installWrangler(staging, version) {
  const initialized = commandResult('npm', ['init', '--yes'], { cwd: staging });
  if (initialized.status !== 0) throw failure('WSL_WRANGLER_INSTALL_FAILED', `npm init exited ${initialized.status}; staging preserved at ${staging}: ${initialized.stderr.trim()}`);
  const installed = commandResult('npm', ['install', '--no-audit', '--no-fund', '--save-exact', `wrangler@${version}`], { cwd: staging });
  if (installed.stdout) process.stderr.write(installed.stdout);
  if (installed.stderr) process.stderr.write(installed.stderr);
  if (installed.status !== 0) throw failure('WSL_WRANGLER_INSTALL_FAILED', `npm install exited ${installed.status}; staging preserved at ${staging}`);
}

export async function ensureWranglerCache(payload, runtime, options = {}) {
  if (!runtime.npmVersion) throw failure('WSL_NPM_PREREQUISITE_MISSING', runtime.npmError || 'npm unavailable in WSL');
  const identity = wranglerDependencyCacheIdentity({
    version: payload.version,
    nodeAbi: process.versions.modules,
    architecture: process.arch,
    npmVersion: runtime.npmVersion,
    sourceLockSha256: payload.sourceLockSha256,
    dependencyCacheProtocolVersion: payload.dependencyCacheProtocolVersion,
  });
  const root = path.join(wslCacheRoot(payload.wslCacheRoot), identity);
  const entry = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const markerPath = path.join(root, '.harness-wrangler.json');
  const expected = {
    identity,
    version: payload.version,
    npmVersion: runtime.npmVersion,
    sourceLockSha256: payload.sourceLockSha256,
    dependencyCacheProtocolVersion: payload.dependencyCacheProtocolVersion,
  };
  if (fs.existsSync(root)) {
    validateCache(root, entry, markerPath, expected);
    return { identity, root, npmVersion: runtime.npmVersion, sourceLockSha256: payload.sourceLockSha256 };
  }

  fs.mkdirSync(path.dirname(root), { recursive: true });
  const lock = `${root}.lock`;
  const release = await (options.acquireInstallLock ?? acquireWslWranglerInstallLock)(lock);
  try {
    if (!fs.existsSync(root)) {
      const staging = `${root}.install-${process.pid}-${crypto.randomUUID()}`;
      fs.mkdirSync(staging, { recursive: true });
      await (options.install ?? installWrangler)(staging, payload.version);
      fs.writeFileSync(path.join(staging, '.harness-wrangler.json'), `${JSON.stringify(expected, null, 2)}\n`);
      fs.renameSync(staging, root);
    }
  } finally {
    await release();
  }
  validateCache(root, entry, markerPath, expected);
  return { identity, root, npmVersion: runtime.npmVersion, sourceLockSha256: payload.sourceLockSha256 };
}

async function main() {
  if (process.argv[2] === '--probe') {
    process.stdout.write(`${JSON.stringify(runtimeProbe())}\n`);
    return 0;
  }
  let payload;
  try { payload = JSON.parse(Buffer.from(process.argv[2] || '', 'base64').toString('utf8')); }
  catch { throw failure('WSL_WRANGLER_PROTOCOL_INVALID', 'invalid WSL Wrangler payload'); }
  if (!payload.version || !Array.isArray(payload.arguments) || !Number.isInteger(payload.dependencyCacheProtocolVersion) || !/^[a-f0-9]{64}$/u.test(payload.sourceLockSha256 || '')) {
    throw failure('WSL_WRANGLER_PROTOCOL_INVALID', 'incomplete WSL Wrangler payload');
  }
  const runtime = runtimeProbe();
  const dependencyCache = await ensureWranglerCache(payload, runtime);
  const metadata = { ...runtime, dependencyCache };
  process.stderr.write(`HARNESS_WSL_RUNTIME ${Buffer.from(JSON.stringify(metadata), 'utf8').toString('base64')}\n`);
  process.stderr.write(`harness WSL: Wrangler ${payload.version}, Node ${process.version} ${process.arch}, cache ${dependencyCache.root}\n`);
  const entry = path.join(dependencyCache.root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const result = spawnSync(process.execPath, [entry, ...payload.arguments], { cwd: process.cwd(), stdio: 'inherit', shell: false });
  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main();
  } catch (error) {
    process.stderr.write(`HARNESS_WSL_FAILURE ${error.code || 'HARNESS_UNEXPECTED_FAILURE'}: ${error.message}\n`);
    process.exitCode = 2;
  }
}
