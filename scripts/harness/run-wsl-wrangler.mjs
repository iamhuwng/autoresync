import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HARNESS_CONTRACT, wranglerDependencyCacheIdentity } from './contract.mjs';

const commandResult = (command, args, options = {}) => spawnSync(command, args, { encoding: 'utf8', shell: false, ...options });
const failure = (code, message) => Object.assign(new Error(message), { code });
const lockMarkerName = '.harness-wrangler-lock.json';
const lockGuardName = '.guard';
const lockProtocolVersion = 1;
const activeLeasePrefix = '.harness-wrangler-active-';
const contentHash = (value) => crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value.toString('utf8').replace(/\r\n/gu, '\n') : value).digest('hex');

function packageDependencies(manifest) {
  return { ...manifest.dependencies, ...manifest.devDependencies };
}

function explicitWranglerAliasKeys(argumentsList) {
  const keys = new Set();
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    const pair = argument === '--alias' ? argumentsList[index + 1] : argument.startsWith('--alias=') ? argument.slice('--alias='.length) : null;
    if (pair === null || pair === undefined) continue;
    const separator = pair.indexOf(':');
    if (separator > 0) keys.add(pair.slice(0, separator));
  }
  return keys;
}

function isWranglerBundleInvocation(argumentsList) {
  let command;
  let subcommand;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--') break;
    if (argument === '--alias' || argument === '--config') {
      index += 1;
      continue;
    }
    if (argument.startsWith('--alias=') || argument.startsWith('--config=')) continue;
    if (!argument.startsWith('-')) {
      if (command === undefined) command = argument;
      else {
        subcommand = argument;
        break;
      }
    }
  }
  return command === 'dev' || command === 'deploy'
    || (command === 'versions' && subcommand === 'upload');
}

function wranglerConfigPath(projectRoot, argumentsList) {
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    const configured = argument === '--config' ? argumentsList[index + 1] : argument.startsWith('--config=') ? argument.slice('--config='.length) : null;
    if (configured) return path.isAbsolute(configured) ? configured : path.resolve(projectRoot, configured);
  }
  return ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'].map((name) => path.join(projectRoot, name)).find((candidate) => fs.existsSync(candidate)) ?? null;
}

function configAliasKeys(cacheRoot, projectRoot, argumentsList) {
  // Let the selected cached Wrangler parse JSONC/TOML; do not guess at config syntax here.
  const configPath = wranglerConfigPath(projectRoot, argumentsList);
  if (!configPath) return new Set();
  const parserPath = path.join(cacheRoot, 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js');
  if (!fs.existsSync(parserPath)) throw failure('WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING', `cannot inspect aliases in the selected Wrangler config because its cached Wrangler parser is missing: ${configPath}`);
  const moduleUrl = pathToFileURL(parserPath).href;
  const source = `import * as wrangler from ${JSON.stringify(moduleUrl)}; const result = wrangler.experimental_readRawConfig({ config: ${JSON.stringify(configPath)} }); process.stdout.write(JSON.stringify(Object.keys(result.rawConfig?.alias ?? {})));`;
  const parsed = commandResult(process.execPath, ['--input-type=module', '-e', source], { cwd: projectRoot, env: cachedWranglerEnvironment(cacheRoot) });
  if (parsed.status !== 0) throw failure('WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING', `cannot inspect aliases in the selected Wrangler config with the cached Wrangler parser: ${configPath}: ${(parsed.stderr || parsed.error?.message || 'parser failed').trim()}`);
  try {
    const keys = JSON.parse(parsed.stdout);
    if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) throw new Error('parser returned non-string alias keys');
    return new Set(keys);
  } catch (error) {
    throw failure('WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING', `cached Wrangler parser returned invalid alias metadata for ${configPath}: ${error.message}`);
  }
}

export function wranglerDependencyAliases(cacheRoot, dependencyNames, argumentsList, projectRoot = process.cwd()) {
  if (!isWranglerBundleInvocation(argumentsList)) return [];
  const explicitKeys = explicitWranglerAliasKeys(argumentsList);
  const configuredKeys = configAliasKeys(cacheRoot, projectRoot, argumentsList);
  return dependencyNames.flatMap((name) => {
    if (explicitKeys.has(name)) return [];
    if (configuredKeys.has(name)) throw failure('WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING', `selected Wrangler config alias collides with the direct dependency alias: ${name}`);
    const packageRoot = path.join(cacheRoot, 'node_modules', ...name.split('/'));
    if (!fs.existsSync(path.join(packageRoot, 'package.json'))) {
      throw failure('WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING', `selected dependency is not materialized in the WSL Wrangler cache: ${name}`);
    }
    return ['--alias', `${name}:${packageRoot}`];
  });
}

function insertBeforeTerminator(argumentsList, injected) {
  const terminator = argumentsList.indexOf('--');
  return terminator === -1
    ? [...argumentsList, ...injected]
    : [...argumentsList.slice(0, terminator), ...injected, ...argumentsList.slice(terminator)];
}

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

function validateInstalledDependencies(root, context) {
  for (const name of Object.keys(packageDependencies(context.manifest))) {
    const lockEntry = context.lock.packages?.[`node_modules/${name}`];
    const packageJsonPath = path.join(root, 'node_modules', ...name.split('/'), 'package.json');
    if (!lockEntry || !fs.existsSync(packageJsonPath)) {
      throw failure('WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING', `selected dependency is not materialized in the WSL Wrangler cache: ${name}`);
    }
    if (lockEntry.version) {
      let packageJson;
      try { packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')); }
      catch (error) { throw failure('WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING', `selected dependency metadata is unreadable in the WSL Wrangler cache: ${name}: ${error.message}`); }
      if (packageJson.version !== lockEntry.version) throw failure('WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING', `selected dependency version is not locked in the WSL Wrangler cache: ${name}`);
    }
  }
}

function validateCache(root, entry, markerPath, expected, context) {
  if (!fs.existsSync(markerPath) || !fs.existsSync(entry)) throw failure('WSL_WRANGLER_CACHE_INCOMPLETE', `incomplete WSL Wrangler cache: ${root}`);
  const marker = readMarker(markerPath);
  for (const [name, value] of Object.entries(expected)) {
    if (marker[name] !== value) throw failure('WSL_WRANGLER_CACHE_INVALID', `WSL Wrangler cache marker mismatch for ${name}: ${root}`);
  }
  validateInstalledDependencies(root, context);
}

export function readWranglerDependencyContext(projectRoot = process.cwd(), expected = {}) {
  const manifestPath = path.join(projectRoot, 'package.json');
  const lockPath = path.join(projectRoot, 'package-lock.json');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(lockPath)) throw failure('WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING', `selected project dependency context is missing package.json or package-lock.json: ${projectRoot}`);
  const manifestRaw = fs.readFileSync(manifestPath);
  const lockRaw = fs.readFileSync(lockPath);
  let manifest;
  let lock;
  try {
    manifest = JSON.parse(manifestRaw);
    lock = JSON.parse(lockRaw);
  } catch (error) {
    throw failure('WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING', `selected project dependency context is not valid JSON: ${error.message}`);
  }
  const dependencies = packageDependencies(manifest);
  const wranglerLockEntry = lock.packages?.['node_modules/wrangler'];
  if (!dependencies.wrangler || !wranglerLockEntry?.version) throw failure('WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING', `selected project package.json/package-lock.json does not declare a locked Wrangler dependency: ${projectRoot}`);
  const manifestSha256 = contentHash(manifestRaw);
  const lockSha256 = contentHash(lockRaw);
  const expectedLockSha256 = expected.lockSha256 ?? expected.sourceLockSha256;
  if ((expected.manifestSha256 && expected.manifestSha256 !== manifestSha256) || (expectedLockSha256 && expectedLockSha256 !== lockSha256)) {
    throw failure('WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING', `selected project dependency context changed before WSL staging: ${projectRoot}`);
  }
  if (expected.version && expected.version !== wranglerLockEntry.version) throw failure('WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING', `selected project lockfile Wrangler version does not match the dispatcher payload: ${projectRoot}`);
  return { projectRoot, manifestPath, lockPath, manifestRaw, lockRaw, manifest, lock, manifestSha256, lockSha256, wranglerVersion: wranglerLockEntry.version };
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

function installWrangler(staging) {
  const installed = commandResult('npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], {
    cwd: staging,
    env: { ...process.env, NODE_ENV: 'development', npm_config_production: 'false' },
  });
  if (installed.stdout) process.stderr.write(installed.stdout);
  if (installed.stderr) process.stderr.write(installed.stderr);
  if (installed.status !== 0) throw failure('WSL_WRANGLER_INSTALL_FAILED', `npm ci exited ${installed.status}; staging preserved at ${staging}`);
}

export async function ensureWranglerCache(payload, runtime, options = {}) {
  if (payload.dependencyCacheProtocolVersion !== HARNESS_CONTRACT.dependencyCacheProtocolVersion) throw failure('WSL_WRANGLER_PROTOCOL_INVALID', `unsupported WSL Wrangler dependency-cache protocol: ${payload.dependencyCacheProtocolVersion}`);
  if (!runtime.npmVersion) throw failure('WSL_NPM_PREREQUISITE_MISSING', runtime.npmError || 'npm unavailable in WSL');
  const context = options.context ?? readWranglerDependencyContext(options.projectRoot ?? process.cwd(), payload);
  const nodeVersion = runtime.nodeVersion ?? process.version;
  const nodeAbi = runtime.nodeAbi ?? process.versions.modules;
  const architecture = runtime.architecture ?? process.arch;
  const lockSha256 = payload.lockSha256 ?? payload.sourceLockSha256 ?? context.lockSha256;
  const identity = wranglerDependencyCacheIdentity({
    version: payload.version,
    nodeVersion,
    nodeAbi,
    architecture,
    npmVersion: runtime.npmVersion,
    manifestSha256: context.manifestSha256,
    lockSha256,
    dependencyCacheProtocolVersion: payload.dependencyCacheProtocolVersion,
  });
  const root = path.join(options.cacheRoot ?? wslCacheRoot(payload.wslCacheRoot), identity);
  const entry = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const markerPath = path.join(root, '.harness-wrangler.json');
  const expected = {
    identity,
    version: payload.version,
    nodeVersion,
    nodeAbi,
    architecture,
    npmVersion: runtime.npmVersion,
    manifestSha256: context.manifestSha256,
    lockSha256,
    sourceLockSha256: lockSha256,
    dependencyCacheProtocolVersion: payload.dependencyCacheProtocolVersion,
  };
  if (fs.existsSync(root)) {
    validateCache(root, entry, markerPath, expected, context);
    return { identity, root, npmVersion: runtime.npmVersion, manifestSha256: context.manifestSha256, lockSha256, sourceLockSha256: lockSha256, dependencyNames: Object.keys(packageDependencies(context.manifest)) };
  }

  fs.mkdirSync(path.dirname(root), { recursive: true });
  const lock = `${root}.lock`;
  const release = await (options.acquireInstallLock ?? acquireWslWranglerInstallLock)(lock);
  try {
    if (!fs.existsSync(root)) {
      const staging = `${root}.install-${process.pid}-${crypto.randomUUID()}`;
      fs.mkdirSync(staging, { recursive: true });
      fs.copyFileSync(context.manifestPath, path.join(staging, 'package.json'));
      fs.copyFileSync(context.lockPath, path.join(staging, 'package-lock.json'));
      await (options.install ?? installWrangler)(staging, payload, context);
      fs.writeFileSync(path.join(staging, '.harness-wrangler.json'), `${JSON.stringify(expected, null, 2)}\n`);
      fs.renameSync(staging, root);
    }
  } finally {
    await release();
  }
  validateCache(root, entry, markerPath, expected, context);
  return { identity, root, npmVersion: runtime.npmVersion, manifestSha256: context.manifestSha256, lockSha256, sourceLockSha256: lockSha256, dependencyNames: Object.keys(packageDependencies(context.manifest)) };
}

export function cachedWranglerEnvironment(cacheRoot, base = process.env) {
  const nodeModules = path.join(cacheRoot, 'node_modules');
  return {
    ...base,
    NODE_PATH: nodeModules,
    PATH: `${path.join(nodeModules, '.bin')}${path.delimiter}${base.PATH || ''}`,
  };
}

export function runCachedWrangler(cacheRoot, argumentsList, options = {}) {
  const entry = path.join(cacheRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const dependencyAliasArguments = options.dependencyAliasArguments ?? wranglerDependencyAliases(cacheRoot, options.dependencyNames ?? [], argumentsList, options.cwd ?? process.cwd());
  return spawnSync(process.execPath, [entry, ...insertBeforeTerminator(argumentsList, dependencyAliasArguments)], {
    cwd: options.cwd ?? process.cwd(),
    env: cachedWranglerEnvironment(cacheRoot, options.baseEnvironment ?? process.env),
    stdio: options.stdio ?? 'inherit',
    encoding: 'utf8',
    shell: false,
  });
}

export function withWranglerCacheLease(cacheRoot, callback, { pid = process.pid } = {}) {
  const lease = path.join(cacheRoot, `${activeLeasePrefix}${pid}-${crypto.randomUUID()}.json`);
  fs.writeFileSync(lease, `${JSON.stringify({ pid, process: 'run-wsl-wrangler', startedAt: new Date().toISOString() })}\n`, { flag: 'wx' });
  try {
    return callback();
  } finally {
    try { fs.rmSync(lease, { force: true }); } catch { /* preserve the command result when cleanup itself is interrupted */ }
  }
}

async function main() {
  if (process.argv[2] === '--probe') {
    process.stdout.write(`${JSON.stringify(runtimeProbe())}\n`);
    return 0;
  }
  let payload;
  try { payload = JSON.parse(Buffer.from(process.argv[2] || '', 'base64').toString('utf8')); }
  catch { throw failure('WSL_WRANGLER_PROTOCOL_INVALID', 'invalid WSL Wrangler payload'); }
  if (!payload.version || !Array.isArray(payload.arguments) || !['run', 'doctor'].includes(payload.mode ?? 'run') || payload.dependencyCacheProtocolVersion !== HARNESS_CONTRACT.dependencyCacheProtocolVersion || !/^[a-f0-9]{64}$/u.test(payload.manifestSha256 || '') || !/^[a-f0-9]{64}$/u.test(payload.lockSha256 || payload.sourceLockSha256 || '')) {
    throw failure('WSL_WRANGLER_PROTOCOL_INVALID', 'incomplete WSL Wrangler payload');
  }
  const runtime = runtimeProbe();
  const dependencyCache = await ensureWranglerCache(payload, runtime, { projectRoot: process.cwd() });
  const metadata = { ...runtime, dependencyCache };
  process.stderr.write(`HARNESS_WSL_RUNTIME ${Buffer.from(JSON.stringify(metadata), 'utf8').toString('base64')}\n`);
  process.stderr.write(`harness WSL: Wrangler ${payload.version}, Node ${process.version} ${process.arch}, cache ${dependencyCache.root}\n`);
  if (payload.mode === 'doctor') return 0;
  const result = withWranglerCacheLease(dependencyCache.root, () => runCachedWrangler(dependencyCache.root, payload.arguments, { dependencyNames: dependencyCache.dependencyNames }));
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
