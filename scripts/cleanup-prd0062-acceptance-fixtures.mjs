import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const FIXTURE_MANIFEST_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/prd0062-51a-acceptance-fixture-manifest.json',
);
export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURE_WORKSPACE_RELATIVE_ROOT = 'prd0062_acceptance';

const usage = 'Usage: node scripts/cleanup-prd0062-acceptance-fixtures.mjs --root prd0062_acceptance/<fixture-id> [--apply]';

const cleanupError = (code, message, root) => {
  const error = new Error(message);
  error.code = code;
  error.root = root;
  return error;
};

export const loadCleanupManifest = (manifestPath = FIXTURE_MANIFEST_PATH) =>
  JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const normalizeRoot = (root) => String(root).replaceAll('\\', '/').replace(/\/+/gu, '/').replace(/\/$/u, '');

const normalizedAbsolute = (value) => path.normalize(path.resolve(value)).replace(/^\\\?\\/u, '').toLowerCase();

const hasReparsePoint = (candidate, stats) => {
  if (stats.isSymbolicLink()) return true;
  try {
    const expected = path.join(fs.realpathSync.native(path.dirname(candidate)), path.basename(candidate));
    return normalizedAbsolute(fs.realpathSync.native(candidate)) !== normalizedAbsolute(expected);
  } catch (error) {
    throw cleanupError('prd0062_fixture_cleanup_reparse_check_failed', error instanceof Error ? error.message : String(error));
  }
};

const inspectDirectoryTree = (candidate, root) => {
  let stats;
  try {
    stats = fs.lstatSync(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw cleanupError('prd0062_fixture_cleanup_inspect_failed', error instanceof Error ? error.message : String(error), root);
  }
  if (hasReparsePoint(candidate, stats)) {
    throw cleanupError('prd0062_fixture_cleanup_reparse_point', `Refusing to inspect symbolic link, junction, or reparse point: ${candidate}`, root);
  }
  if (!stats.isDirectory()) {
    throw cleanupError('prd0062_fixture_cleanup_target_not_directory', `Cleanup target is not a directory: ${candidate}`, root);
  }
  for (const entry of fs.readdirSync(candidate, { withFileTypes: true })) {
    const child = path.join(candidate, entry.name);
    let childStats;
    try {
      childStats = fs.lstatSync(child);
    } catch (error) {
      throw cleanupError('prd0062_fixture_cleanup_inspect_failed', error instanceof Error ? error.message : String(error), root);
    }
    if (hasReparsePoint(child, childStats)) {
      throw cleanupError('prd0062_fixture_cleanup_reparse_point', `Refusing to traverse symbolic link, junction, or reparse point: ${child}`, root);
    }
    if (childStats.isDirectory()) inspectDirectoryTree(child, root);
  }
};

export const resolveCleanupTarget = ({ root, workspaceRoot = REPOSITORY_ROOT, manifest = loadCleanupManifest() }) => {
  const normalized = normalizeRoot(root);
  const allowedRoots = new Set((manifest.entries ?? []).map((entry) => entry.cleanupRoot));
  if (!allowedRoots.has(normalized)) {
    throw cleanupError('prd0062_fixture_cleanup_root_not_manifested', 'Cleanup root must exactly match a frozen fixture manifest entry.', root);
  }
  const absoluteWorkspaceRoot = path.resolve(workspaceRoot);
  const fixtureWorkspaceRoot = path.resolve(absoluteWorkspaceRoot, FIXTURE_WORKSPACE_RELATIVE_ROOT);
  const absolute = path.resolve(absoluteWorkspaceRoot, ...normalized.split('/'));
  for (const candidate of [absoluteWorkspaceRoot, fixtureWorkspaceRoot]) {
    try {
      const stats = fs.lstatSync(candidate);
      if (hasReparsePoint(candidate, stats)) throw cleanupError('prd0062_fixture_cleanup_reparse_point', `Refusing to use symbolic link, junction, or reparse point in the cleanup workspace: ${candidate}`, root);
      if (!stats.isDirectory()) throw cleanupError('prd0062_fixture_cleanup_workspace_not_directory', `Cleanup workspace is not a directory: ${candidate}`, root);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      if (error?.code) throw error;
      throw cleanupError('prd0062_fixture_cleanup_workspace_inspect_failed', error instanceof Error ? error.message : String(error), root);
    }
  }
  if (absolute === fixtureWorkspaceRoot || !absolute.startsWith(`${fixtureWorkspaceRoot}${path.sep}`)) {
    throw cleanupError('prd0062_fixture_cleanup_scope_denied', 'Cleanup target is outside the fixture workspace.', root);
  }
  return { normalized, absolute, fixtureWorkspaceRoot };
};

export const cleanupFixtureRoot = ({ root, workspaceRoot = REPOSITORY_ROOT, manifest = loadCleanupManifest(), apply = false }) => {
  const target = resolveCleanupTarget({ root, workspaceRoot, manifest });
  let exists = true;
  try {
    fs.lstatSync(target.absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') exists = false;
    else throw cleanupError('prd0062_fixture_cleanup_inspect_failed', error instanceof Error ? error.message : String(error), root);
  }
  if (!exists) return { ok: true, mode: 'already-absent', root: target.normalized };

  inspectDirectoryTree(target.absolute, root);
  if (!apply) return { ok: true, mode: 'dry-run', root: target.normalized };

  // Re-inspect the exact path immediately before deletion; no retries and no broader target are allowed.
  inspectDirectoryTree(target.absolute, root);
  try {
    fs.rmSync(target.absolute, { recursive: true, force: false, maxRetries: 0 });
  } catch (error) {
    throw cleanupError('prd0062_fixture_cleanup_delete_failed', error instanceof Error ? error.message : String(error), root);
  }
  return { ok: true, mode: 'applied', root: target.normalized };
};

const parseArgs = (args) => {
  const rootIndex = args.indexOf('--root');
  const rootValueIndex = rootIndex + 1;
  const invalid = args.some((arg, index) => {
    if (index === rootValueIndex) return false;
    return !['--root', '--apply'].includes(arg) || (arg === '--root' && index !== rootIndex);
  });
  if (invalid || rootIndex < 0 || rootIndex + 1 >= args.length || args[rootIndex + 1].startsWith('--')) {
    throw cleanupError('prd0062_fixture_cleanup_arguments_invalid', usage);
  }
  return { root: args[rootIndex + 1], apply: args.includes('--apply') };
};

export const main = (args = process.argv.slice(2)) => {
  try {
    const options = parseArgs(args);
    console.log(JSON.stringify(cleanupFixtureRoot(options), null, 2));
    return 0;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error?.code ?? 'prd0062_fixture_cleanup_failed', message: error instanceof Error ? error.message : String(error), root: error?.root }, null, 2));
    return 1;
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
