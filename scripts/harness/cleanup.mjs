import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_MIN_AGE_HOURS = 48;
const DEPENDENCY_IDENTITY = /^[a-f0-9]{64}$/u;
const RUN_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const TIMEOUT_ARTIFACT = /^([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\.tool-timeout\.log$/iu;
const TEMP_PREFIX = 'codex-prd0062-';

const normalize = (value) => {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

export function isWithin(root, candidate) {
  const relative = path.relative(normalize(root), normalize(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isUnsafeRoot(root, allowCustom = false) {
  const resolved = path.resolve(root);
  const base = path.basename(resolved);
  return !path.isAbsolute(resolved)
    || resolved === path.parse(resolved).root
    || base === ''
    || base === '.'
    || base === '..'
    || (!allowCustom && !/^codex-(?:harness(?:-v\d+|-[A-Za-z0-9._-]+)?|prd0062-[A-Za-z0-9._-]+)$/u.test(base));
}

export function validateCleanupRoot(root, { allowCustom = false } = {}) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error(`refusing unsafe harness cleanup root: ${root}`);
  const resolved = path.resolve(root);
  if (isUnsafeRoot(resolved, allowCustom)) throw new Error(`refusing unsafe harness cleanup root: ${resolved}`);
  try {
    const metadata = fs.lstatSync(resolved);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error(`refusing non-directory or symlink harness cleanup root: ${resolved}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return resolved;
}

function defaultHarnessRoot(environment = process.env) {
  return validateCleanupRoot(path.join(environment.LOCALAPPDATA || os.tmpdir(), 'codex-harness-v3'));
}

function tempRoots(environment = process.env) {
  const root = path.resolve(environment.TEMP || environment.TMP || os.tmpdir());
  if (path.basename(root) === '' || path.parse(root).root === root) return [];
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); }
  catch { return []; }
  return entries
    .filter((entry) => entry.isDirectory() && (entry.name.startsWith(TEMP_PREFIX) || /^codex-harness(?:-v\d+|-[A-Za-z0-9._-]+)?$/u.test(entry.name)))
    .map((entry) => path.join(root, entry.name))
    .filter((candidate) => !isUnsafeRoot(candidate, true));
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function processIsActive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function hasActiveDependencyLease(dependencyPath) {
  return fs.readdirSync(dependencyPath)
    .filter((name) => name.startsWith('.harness-active-'))
    .some((name) => {
      const lease = readJson(path.join(dependencyPath, name));
      return !lease || processIsActive(lease.pid);
    });
}

function directoryBytes(root) {
  let total = 0;
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(candidate);
      else if (entry.isFile()) {
        try { total += fs.statSync(candidate).size; } catch { /* best-effort estimate */ }
      }
    }
  }
  return total;
}

function oldEnough(candidate, cutoff) {
  try { return fs.statSync(candidate).mtimeMs < cutoff; } catch { return false; }
}

function isFinalEvidence(evidence) {
  return evidence?.lifecycle?.status === 'final';
}

function evidenceRecords(root) {
  const evidenceRoot = path.join(root, 'evidence');
  if (!fs.existsSync(evidenceRoot)) return [];
  return fs.readdirSync(evidenceRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      const file = path.join(evidenceRoot, entry.name);
      return { file, evidence: readJson(file) };
    });
}

function receiptRecords(root) {
  const runsRoot = path.join(root, 'runs');
  if (!fs.existsSync(runsRoot)) return [];
  return fs.readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => {
      const file = path.join(runsRoot, entry.name, 'run-receipt.json');
      const receipt = readJson(file);
      return receipt ? { file, evidence: { lifecycle: { status: receipt.status }, dependencyCache: { root: receipt.dependencyRoot } } } : null;
    })
    .filter(Boolean);
}

function activeDependencyReferences(records) {
  return new Set(records
    .filter(({ evidence }) => evidence && !isFinalEvidence(evidence))
    .map(({ evidence }) => evidence.dependencyCache?.root)
    .filter(Boolean)
    .map(normalize));
}

function candidate(kind, target, reason) {
  let bytes = 0;
  try {
    const metadata = fs.statSync(target);
    bytes = metadata.isFile() ? metadata.size : directoryBytes(target);
  } catch { /* best-effort estimate */ }
  return { kind, path: target, bytes, reason };
}

function finalizedRunIds(root) {
  const runsRoot = path.join(root, 'runs');
  if (!fs.existsSync(runsRoot)) return new Set();
  return new Set(fs.readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && RUN_ID.test(entry.name))
    .filter((entry) => {
      const runPath = path.join(runsRoot, entry.name);
      const evidence = readJson(path.join(root, 'evidence', `${entry.name}.json`));
      const receiptPath = path.join(runPath, 'run-receipt.json');
      const receipt = readJson(receiptPath);
      return fs.existsSync(receiptPath) ? receipt?.status === 'final' : isFinalEvidence(evidence);
    })
    .map((entry) => entry.name));
}

function collectRunCandidates(root, cutoff) {
  const runsRoot = path.join(root, 'runs');
  const evidenceRoot = path.join(root, 'evidence');
  if (!fs.existsSync(runsRoot)) return [];
  return fs.readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && RUN_ID.test(entry.name))
    .map((entry) => {
      const runPath = path.join(runsRoot, entry.name);
      const evidencePath = path.join(evidenceRoot, `${entry.name}.json`);
      const receiptPath = path.join(runPath, 'run-receipt.json');
      const evidence = readJson(evidencePath);
      const receipt = readJson(receiptPath);
      const receiptExists = fs.existsSync(receiptPath);
      const final = receiptExists ? receipt?.status === 'final' : isFinalEvidence(evidence);
      if (!oldEnough(runPath, cutoff) || !final) return null;
      return candidate('run', runPath, evidence ? `final evidence preserved at ${evidencePath}` : `final run receipt preserved at ${receiptPath}`);
    })
    .filter(Boolean);
}

function collectDependencyCandidates(root, cutoff, activeReferences) {
  const dependenciesRoot = path.join(root, 'dependencies');
  if (!fs.existsSync(dependenciesRoot)) return [];
  return fs.readdirSync(dependenciesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && DEPENDENCY_IDENTITY.test(entry.name))
    .map((entry) => {
      const dependencyPath = path.join(dependenciesRoot, entry.name);
      const markerPath = path.join(dependencyPath, '.harness-dependencies.json');
      const lockPath = `${dependencyPath}.lock`;
      const marker = readJson(markerPath);
      if (!marker || marker.identity !== entry.name || !marker.dependencyCacheProtocolVersion) return null;
      if (!oldEnough(dependencyPath, cutoff)) return null;
      if (fs.existsSync(lockPath)) return null;
      if (hasActiveDependencyLease(dependencyPath)) return null;
      if (activeReferences.has(normalize(dependencyPath))) return null;
      return candidate('dependency', dependencyPath, `complete cache marker preserved at ${markerPath}`);
    })
    .filter(Boolean);
}

function collectArtifactCandidates(root, cutoff, finalRunIds) {
  const artifactsRoot = path.join(root, 'artifacts');
  if (!fs.existsSync(artifactsRoot)) return [];
  return fs.readdirSync(artifactsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
    .map((entry) => {
      const match = entry.name.match(TIMEOUT_ARTIFACT);
      const artifactPath = path.join(artifactsRoot, entry.name);
      if (!match || !finalRunIds.has(match[1]) || !oldEnough(artifactPath, cutoff)) return null;
      return candidate('artifact', artifactPath, `timeout artifact belongs to finalized run ${match[1]}`);
    })
    .filter(Boolean);
}

export function discoverCleanupRoots(environment = process.env) {
  const configured = environment.CODEX_HARNESS_ROOT
    ? [validateCleanupRoot(environment.CODEX_HARNESS_ROOT, { allowCustom: true })]
    : [];
  const roots = [defaultHarnessRoot(environment), ...configured, ...tempRoots(environment)];
  return [...new Set(roots)];
}

export function collectCleanupCandidates({ roots, now = Date.now(), minAgeHours = DEFAULT_MIN_AGE_HOURS, kinds } = {}) {
  const resolvedRoots = [...new Set((roots ?? discoverCleanupRoots()).map((root) => validateCleanupRoot(root, { allowCustom: roots !== undefined })) )];
  const ageHours = Number(minAgeHours);
  if (!Number.isFinite(ageHours) || ageHours < 0.25) throw new Error('--min-age-hours must be a number >= 0.25');
  const selectedKinds = kinds ? new Set(kinds) : null;
  if (selectedKinds && [...selectedKinds].some((kind) => !['run', 'dependency', 'artifact'].includes(kind))) throw new Error('cleanup kinds must be run, dependency, or artifact');
  const cutoff = now - (ageHours * 60 * 60 * 1000);
  const records = resolvedRoots.flatMap((root) => [...evidenceRecords(root), ...receiptRecords(root)]);
  const activeReferences = activeDependencyReferences(records);
  const candidates = resolvedRoots.flatMap((root) => {
    const finalRuns = finalizedRunIds(root);
    return [
      ...collectRunCandidates(root, cutoff),
      ...collectDependencyCandidates(root, cutoff, activeReferences),
      ...collectArtifactCandidates(root, cutoff, finalRuns),
    ];
  });
  return candidates.filter((item) => (!selectedKinds || selectedKinds.has(item.kind)) && resolvedRoots.some((root) => isWithin(root, item.path)));
}

function removeCandidate(item, roots) {
  const target = path.resolve(item.path);
  if (!roots.some((root) => isWithin(root, target))) throw new Error(`refusing cleanup target outside validated roots: ${target}`);
  const metadata = fs.lstatSync(target);
  if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !(metadata.isFile() && item.kind === 'artifact'))) throw new Error(`refusing invalid cleanup target: ${target}`);
  if (item.kind === 'dependency') {
    if (fs.existsSync(`${target}.lock`) || hasActiveDependencyLease(target)) {
      throw new Error(`refusing active dependency cache: ${target}`);
    }
  }
  fs.rmSync(target, { recursive: true, force: false });
}

export function cleanupHarnessStorage({ apply = false, json = false, roots, now, minAgeHours = DEFAULT_MIN_AGE_HOURS, kinds } = {}) {
  const validatedRoots = [...new Set((roots ?? discoverCleanupRoots()).map((root) => validateCleanupRoot(root, { allowCustom: roots !== undefined })) )];
  const candidates = collectCleanupCandidates({ roots: validatedRoots, now, minAgeHours, kinds });
  const removed = [];
  const errors = [];
  if (apply) {
    for (const item of candidates) {
      try {
        removeCandidate(item, validatedRoots);
        removed.push(item);
      } catch (error) {
        errors.push({ path: item.path, message: error.message });
      }
    }
  }
  return {
    mode: apply ? 'apply' : 'dry-run',
    minAgeHours: Number(minAgeHours),
    kinds: kinds ?? ['run', 'dependency', 'artifact'],
    roots: validatedRoots,
    candidates,
    removed,
    errors,
    bytesReclaimable: candidates.reduce((total, item) => total + item.bytes, 0),
    bytesReclaimed: removed.reduce((total, item) => total + item.bytes, 0),
    json,
  };
}

function windowsToWslPath(file) {
  const resolved = path.resolve(file);
  const drive = resolved.slice(0, 1).toLowerCase();
  if (!/^[a-z]$/iu.test(drive) || resolved[1] !== ':') throw new Error(`cannot map repository path into WSL: ${resolved}`);
  return `/mnt/${drive}${resolved.slice(2).replaceAll('\\', '/')}`;
}

function cleanupWslThroughAdapter({ apply, minAgeHours }) {
  if (process.platform !== 'win32') return { mode: 'skipped', reason: 'not running on Windows' };
  const script = windowsToWslPath(path.join(path.dirname(fileURLToPath(import.meta.url)), 'cleanup-wsl.mjs'));
  const argumentsList = [apply ? '--apply' : '--dry-run', '--json', '--min-age-hours', String(minAgeHours)];
  if (process.env.CODEX_HARNESS_WSL_ROOT) argumentsList.push('--root', process.env.CODEX_HARNESS_WSL_ROOT);
  const result = spawnSync('wsl.exe', ['--exec', 'node', script, ...argumentsList], { encoding: 'utf8', shell: false });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const parsed = output.split(/\r?\n/u).reverse().map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).find(Boolean);
  if (result.status !== 0 || !parsed) return { mode: 'blocked', status: result.status, message: output || result.error?.message || 'WSL cleanup did not return a report' };
  return { ...parsed, adapter: 'wsl.exe' };
}

export function cleanupHarnessStorageWithWsl(options = {}) {
  const report = cleanupHarnessStorage(options);
  if (!options.includeWsl) return report;
  const wsl = cleanupWslThroughAdapter({ apply: options.apply === true, minAgeHours: report.minAgeHours });
  const errors = [...report.errors];
  if (wsl.mode === 'blocked') errors.push({ path: 'wsl.exe', message: wsl.message });
  return { ...report, wsl, errors };
}

export function parseCleanupArguments(argumentsList) {
  const options = { apply: false, json: false, minAgeHours: DEFAULT_MIN_AGE_HOURS };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--wsl') options.includeWsl = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--runs-only') options.kinds = ['run'];
    else if (argument === '--dry-run') options.apply = false;
    else if (argument === '--min-age-hours') {
      const value = Number(argumentsList[++index]);
      if (!Number.isFinite(value) || value < 0.25) throw new Error('--min-age-hours must be a number >= 0.25');
      options.minAgeHours = value;
    } else if (argument === '--help') options.help = true;
    else throw new Error(`unknown cleanup argument: ${argument}`);
  }
  return options;
}

function printReport(report) {
  process.stdout.write(`${report.mode}: ${report.candidates.length} candidate(s), ${report.removed.length} removed, ${report.bytesReclaimed} bytes reclaimed\n`);
  for (const item of report.candidates) process.stdout.write(`${report.removed.includes(item) ? 'removed' : 'candidate'} ${item.kind} ${item.path} (${item.bytes} bytes)\n`);
  for (const error of report.errors) process.stderr.write(`cleanup: ${error.path}: ${error.message}\n`);
  if (report.wsl) process.stdout.write(`wsl: ${report.wsl.mode}${report.wsl.bytesReclaimed === undefined ? '' : `, ${report.wsl.bytesReclaimed} bytes reclaimed`}\n`);
}

async function main() {
  const options = parseCleanupArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: node scripts/harness/cleanup.mjs [--dry-run|--apply] [--runs-only] [--wsl] [--json] [--min-age-hours N]\n');
    return;
  }
  const report = cleanupHarnessStorageWithWsl(options);
  if (options.json) process.stdout.write(`${JSON.stringify(report)}\n`);
  else printReport(report);
  if (report.errors.length) process.exitCode = 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
