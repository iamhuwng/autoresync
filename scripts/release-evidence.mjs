import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const origin = 'https://kahut1.web.app';
const manifestPath = '/.well-known/luyentap-release.json';
const defaultReadConcurrency = 8;
const defaultReadAttempts = 3;
const defaultRetryDelayMs = 250;
const retryableHttpStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const observations = new WeakSet();
export const isObserved = value => observations.has(value);

export function parseHostingChannelEvidence(payload) {
  const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const channel = parsed?.result?.channels?.find(entry => entry.name === 'projects/temp-a1437/sites/kahut1/channels/live');
  const release = channel?.release, version = release?.version;
  if (!channel || !release || !version || version.status !== 'FINALIZED' || !/^projects\/temp-a1437\/sites\/kahut1\/versions\/[a-z0-9]+$/u.test(version.name || '') || !release.releaseTime || !Number.isFinite(Number(version.fileCount))) throw new Error('Firebase Hosting provider evidence lacks a finalized kahut1 live release.');
  return { channel: channel.name, url: channel.url, version: version.name, releaseTime: release.releaseTime, fileCount: Number(version.fileCount), versionBytes: Number(version.versionBytes || 0), config: version.config || {}, deploymentTool: version.labels?.['deployment-tool'] || null };
}

function firebaseCliPath() {
  const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const candidates = [process.env.LUYENTAP_FIREBASE_CLI, path.join(scriptRoot, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js')].filter(Boolean);
  const worktrees = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: scriptRoot, encoding: 'utf8', windowsHide: true });
  if (worktrees.status === 0) for (const root of worktrees.stdout.split(/\r?\n/u).filter(line => line.startsWith('worktree ')).map(line => line.slice(9))) candidates.push(path.join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js'));
  return candidates.find(candidate => existsSync(candidate));
}

export function observeHostingProvider({ exec = spawnSync } = {}) {
  const cli = firebaseCliPath();
  const result = cli
    ? exec(process.execPath, [cli, 'hosting:channel:list', '--project', 'temp-a1437', '--site', 'kahut1', '--json', '--non-interactive'], { encoding: 'utf8', windowsHide: true })
    : { status: 1, stderr: 'repo-owned Firebase CLI was not found in this checkout or a Git worktree' };
  if (result.error || result.status !== 0) throw new Error(`Firebase Hosting provider readback unavailable: ${result.error?.message || result.stderr?.trim() || result.status}`);
  const provider = parseHostingChannelEvidence(result.stdout);
  const observation = Object.freeze({ service: 'hosting', identity: 'temp-a1437/kahut1', revision: null, tree: null, fingerprint: hash(JSON.stringify(provider)), evidenceRef: 'firebase-cli://temp-a1437/sites/kahut1/channels/live', observedAt: new Date().toISOString(), provider, sourceKnown: false });
  observations.add(observation);
  return observation;
}

const transientReadError = (message, cause) => {
  const error = new Error(message, cause ? { cause } : undefined);
  error.retryable = true;
  return error;
};

const readConcurrent = async (items, limit, read) => {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      await read(items[index]);
    }
  };
  const outcomes = await Promise.allSettled(Array.from({ length: Math.min(limit, items.length) }, worker));
  const failure = outcomes.find(outcome => outcome.status === 'rejected');
  if (failure) throw failure.reason;
};

const observeHostingAttempt = async ({ fetchImpl, effectiveOrigin, expectedEnvironment, readConcurrency }) => {
  const get = async pathname => {
    let response;
    try {
      response = await fetchImpl(`${effectiveOrigin}${pathname}`, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    } catch (error) {
      throw transientReadError(`Hosting readback unavailable: ${error.message}`, error);
    }
    if (!response.ok) {
      const message = `Hosting readback unavailable (HTTP ${response.status}).`;
      throw retryableHttpStatuses.has(response.status) ? transientReadError(message) : new Error(message);
    }
    if (response.url && new URL(response.url).origin !== effectiveOrigin) throw new Error('Hosting readback unavailable or resource identity mismatch.');
    let bytes;
    try {
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw transientReadError(`Hosting response body read failed: ${error.message}`, error);
    }
    if (bytes.length > 32 * 1024 * 1024) throw new Error('Hosting evidence exceeds size limit.');
    return bytes;
  };

  const manifestBytes = await get(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    throw new Error('Invalid production Hosting manifest: response is not JSON.');
  }
  if (manifest.schemaVersion !== 1 || manifest.environment !== expectedEnvironment || manifest.project !== 'temp-a1437' || manifest.site !== 'kahut1' || !/^[a-f0-9]{40}$/u.test(manifest.revision || '') || !/^[a-f0-9]{40}$/u.test(manifest.tree || '') || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 2000) throw new Error(`Invalid ${expectedEnvironment} Hosting manifest.`);
  if (!manifest.files.some(file => file.path === '/index.html')) throw new Error('Hosting evidence lacks index.html.');
  for (const file of manifest.files) {
    if (!/^\/[a-zA-Z0-9_./-]+$/u.test(file.path) || file.path.includes('..') || !/^[a-f0-9]{64}$/u.test(file.sha256 || '')) throw new Error('Unsafe Hosting evidence path or hash.');
  }
  await readConcurrent(manifest.files, readConcurrency, async file => {
    if (hash(await get(file.path)) !== file.sha256) throw transientReadError(`Hosting content drift: ${file.path}`);
  });
  return Object.freeze({ service: 'hosting', identity: 'temp-a1437/kahut1', revision: manifest.revision, tree: manifest.tree, fingerprint: hash(JSON.stringify(manifest)), evidenceRef: `${effectiveOrigin}${manifestPath}`, observedAt: new Date().toISOString(), compatibility: manifest.compatibility || {}, manifest });
};

// Only fixed production HTTPS resources are read; supplied JSON never enters this trust boundary.
export async function observeHosting({ fetchImpl = fetch, originOverride, expectedEnvironment = 'production', readConcurrency = defaultReadConcurrency, maxAttempts = defaultReadAttempts, retryDelayMs = defaultRetryDelayMs } = {}) {
  const effectiveOrigin = originOverride || origin;
  if (!['production', 'acceptance'].includes(expectedEnvironment)) throw new Error('Invalid Hosting evidence environment.');
  if (!Number.isInteger(readConcurrency) || readConcurrency < 1) throw new Error('Hosting read concurrency must be a positive integer.');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('Hosting read attempts must be a positive integer.');
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) throw new Error('Hosting retry delay must be a non-negative number.');
  if (originOverride) {
    const parsed = new URL(originOverride);
    if (expectedEnvironment !== 'acceptance' || parsed.protocol !== 'http:' || parsed.hostname !== 'localhost') {
      throw new Error('Hosting origin override is restricted to localhost acceptance evidence.');
    }
  }
  // A deployment can change the manifest and assets between reads; retry the complete snapshot.
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const observation = await observeHostingAttempt({ fetchImpl, effectiveOrigin, expectedEnvironment, readConcurrency });
      observations.add(observation);
      return observation;
    } catch (error) {
      lastError = error;
      if (!error?.retryable || attempt === maxAttempts) throw error;
      if (retryDelayMs) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }
  throw lastError;
}

export async function writeHostingManifest({ cwd, envFingerprint, environment = 'production', hotfixes = [] }) {
  if (!['production', 'acceptance'].includes(environment)) throw new Error('Hosting manifest environment must be production or acceptance.');
  const git = expression => {
    const result = spawnSync('git', ['rev-parse', '--verify', expression], { cwd, encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error('Cannot bind Hosting bundle to Git source.');
    return result.stdout.trim();
  };
  const dist = path.join(cwd, 'dist'), files = [];
  const visit = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Hosting bundle contains a symlink.');
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile() && path.relative(dist, full).replaceAll('\\', '/') !== manifestPath.slice(1)) files.push({ path: `/${path.relative(dist, full).replaceAll('\\', '/')}`, sha256: hash(await readFile(full)) });
    }
  };
  await visit(dist);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = { schemaVersion: 1, environment, project: 'temp-a1437', site: 'kahut1', revision: git('HEAD^{commit}'), tree: git('HEAD^{tree}'), envFingerprint, files, hotfixes };
  const target = path.join(dist, manifestPath.slice(1));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(manifest)}\n`);
  return manifest;
}
