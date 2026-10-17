import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_MIN_AGE_HOURS = 48;
export const WSL_DEPENDENCY_CACHE_PROTOCOL = 3;
const POSIX = path.posix;
const IDENTITY = /^[a-f0-9]{64}$/u;
const STAGING = /^([a-f0-9]{64})\.install-[0-9]+-[a-f0-9-]+$/u;
const LEASE = /^\.harness-wrangler-active-(\d+)-[a-f0-9-]+\.json$/u;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function isWithin(root, target) {
  const relative = POSIX.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${POSIX.sep}`) && !POSIX.isAbsolute(relative);
}

export function resolveWslCleanupRoot(configuredRoot, home = os.homedir()) {
  const root = configuredRoot === undefined ? POSIX.join(home, '.cache', 'codex-harness', 'wrangler') : configuredRoot;
  if (typeof root !== 'string' || !POSIX.isAbsolute(root) || root === '/' || POSIX.normalize(root) !== root) {
    throw new Error('WSL cleanup root must be an absolute normalized Linux path other than /');
  }
  return root;
}

function oldEnough(target, cutoff) {
  try { return fs.statSync(target).mtimeMs < cutoff; } catch { return false; }
}

function bytes(target) {
  try {
    const metadata = fs.statSync(target);
    if (metadata.isFile()) return metadata.size;
  } catch { return 0; }
  let total = 0;
  const pending = [target];
  while (pending.length) {
    const current = pending.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const child = POSIX.join(current, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(child);
      else if (entry.isFile()) {
        try { total += fs.statSync(child).size; } catch { /* best effort */ }
      }
    }
  }
  return total;
}

function candidate(kind, target, reason) {
  return { kind, path: target, bytes: bytes(target), reason };
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    return true;
  }
}

function leaseState(cacheRoot, cutoff) {
  return fs.readdirSync(cacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && LEASE.test(entry.name))
    .map((entry) => {
      const file = POSIX.join(cacheRoot, entry.name);
      const match = entry.name.match(LEASE);
      const record = readJson(file);
      const pid = Number(record?.pid ?? match?.[1]);
      const active = processAlive(pid);
      return {
        file,
        active,
        safeToRemove: !active && Boolean(record) && oldEnough(file, cutoff),
      };
    });
}

export function collectWslCleanupCandidates({ root, now = Date.now(), minAgeHours = DEFAULT_MIN_AGE_HOURS } = {}) {
  const resolvedRoot = resolveWslCleanupRoot(root);
  const ageHours = Number(minAgeHours);
  if (!Number.isFinite(ageHours) || ageHours < 1) throw new Error('--min-age-hours must be a number >= 1');
  if (!fs.existsSync(resolvedRoot)) return [];
  const cutoff = now - (ageHours * 60 * 60 * 1000);
  const candidates = [];
  for (const entry of fs.readdirSync(resolvedRoot, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const target = POSIX.join(resolvedRoot, entry.name);
    if (IDENTITY.test(entry.name) && entry.isDirectory()) {
      const leases = leaseState(target, cutoff);
      const protectedByLease = leases.some((lease) => !lease.safeToRemove);
      candidates.push(...leases.filter((lease) => lease.safeToRemove).map((lease) => candidate('lease', lease.file, 'stale Wrangler execution lease with a dead owner')));
      const marker = readJson(POSIX.join(target, '.harness-wrangler.json'));
      const lock = `${target}.lock`;
      if (!protectedByLease && marker?.identity === entry.name && marker.dependencyCacheProtocolVersion === WSL_DEPENDENCY_CACHE_PROTOCOL && !fs.existsSync(lock) && oldEnough(target, cutoff)) {
        candidates.push(candidate('cache', target, 'complete old Wrangler cache with no active lease or install lock'));
      }
      continue;
    }
    const staging = entry.name.match(STAGING);
    if (staging && entry.isDirectory() && !fs.existsSync(`${POSIX.join(resolvedRoot, staging[1])}.lock`) && oldEnough(target, cutoff)) {
      candidates.push(candidate('staging', target, 'old incomplete Wrangler install staging without an install lock'));
    }
  }
  return candidates.filter((item) => isWithin(resolvedRoot, item.path));
}

function removeCandidate(item, root) {
  const target = POSIX.resolve(item.path);
  if (!isWithin(root, target)) throw new Error(`refusing WSL cleanup target outside root: ${target}`);
  const metadata = fs.lstatSync(target);
  if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !(metadata.isFile() && item.kind === 'lease'))) throw new Error(`refusing invalid WSL cleanup target: ${target}`);
  fs.rmSync(target, { recursive: true, force: false });
}

export function cleanupWslStorage({ apply = false, root, now, minAgeHours = DEFAULT_MIN_AGE_HOURS } = {}) {
  const resolvedRoot = resolveWslCleanupRoot(root);
  const candidates = collectWslCleanupCandidates({ root: resolvedRoot, now, minAgeHours });
  const removed = [];
  const errors = [];
  if (apply) {
    for (const item of candidates) {
      try {
        removeCandidate(item, resolvedRoot);
        removed.push(item);
      } catch (error) {
        errors.push({ path: item.path, message: error.message });
      }
    }
  }
  return {
    mode: apply ? 'apply' : 'dry-run',
    root: resolvedRoot,
    minAgeHours: Number(minAgeHours),
    candidates,
    removed,
    errors,
    bytesReclaimable: candidates.reduce((total, item) => total + item.bytes, 0),
    bytesReclaimed: removed.reduce((total, item) => total + item.bytes, 0),
  };
}

function parseArguments(argumentsList) {
  const options = { apply: false, json: false, minAgeHours: DEFAULT_MIN_AGE_HOURS, root: undefined };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--dry-run') options.apply = false;
    else if (argument === '--json') options.json = true;
    else if (argument === '--root') options.root = argumentsList[++index];
    else if (argument === '--min-age-hours') {
      const value = Number(argumentsList[++index]);
      if (!Number.isFinite(value) || value < 1) throw new Error('--min-age-hours must be a number >= 1');
      options.minAgeHours = value;
    } else if (argument === '--help') options.help = true;
    else throw new Error(`unknown WSL cleanup argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: node scripts/harness/cleanup-wsl.mjs [--dry-run|--apply] [--json] [--root /absolute/path] [--min-age-hours N]\n');
    return;
  }
  if (process.platform !== 'linux') throw new Error('WSL cleanup must run inside Linux/WSL');
  const report = cleanupWslStorage(options);
  if (options.json) process.stdout.write(`${JSON.stringify(report)}\n`);
  else process.stdout.write(`${report.mode}: ${report.candidates.length} candidate(s), ${report.removed.length} removed, ${report.bytesReclaimed} bytes reclaimed\n`);
  if (report.errors.length) process.exitCode = 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
