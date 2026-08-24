import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { linkDependencies } from './run-isolated.mjs';

const failure = (code, message) => Object.assign(new Error(message), { code });
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function processIsActive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function samePath(first, second) {
  const normalize = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  return normalize(first) === normalize(second);
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function removeOwnedProjectLink(projectRoot, overlayRoot) {
  const projectModules = path.join(projectRoot, 'node_modules');
  const overlayModules = path.join(overlayRoot, 'node_modules');
  try {
    if (!fs.lstatSync(projectModules).isSymbolicLink()) return false;
    if (!samePath(fs.realpathSync.native(projectModules), fs.realpathSync.native(overlayModules))) return false;
    fs.rmSync(projectModules, { force: false });
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function removeOwnedOverlay(owner) {
  if (!owner?.projectRoot || !owner?.overlayRoot) return;
  removeOwnedProjectLink(owner.projectRoot, owner.overlayRoot);
  if (fs.existsSync(owner.overlayRoot)) fs.rmSync(owner.overlayRoot, { recursive: true, force: true });
}

async function acquireProjectLock(lockDirectory) {
  const ownerPath = path.join(lockDirectory, 'owner.json');
  const deadline = Date.now() + (30 * 60 * 1000);
  while (true) {
    try {
      fs.mkdirSync(lockDirectory);
      return { ownerPath, release: () => fs.rmSync(lockDirectory, { recursive: true, force: true }) };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = readJson(ownerPath);
      if (owner && !processIsActive(owner.pid)) {
        removeOwnedOverlay(owner);
        fs.rmSync(lockDirectory, { recursive: true, force: true });
        continue;
      }
      if (Date.now() >= deadline) throw failure('LIVE_DEPENDENCY_OVERLAY_BUSY', `timed out waiting for the active project adapter: ${lockDirectory}`);
      await sleep(250);
    }
  }
}

export function acquireDependencyLease(dependencyRoot) {
  if (!fs.existsSync(path.join(dependencyRoot, '.harness-dependencies.json'))) {
    throw failure('DEPENDENCY_CACHE_INCOMPLETE', `dependency cache disappeared before execution: ${dependencyRoot}`);
  }
  const lease = path.join(dependencyRoot, `.harness-active-${process.pid}-${crypto.randomUUID()}.json`);
  fs.writeFileSync(lease, `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`, { flag: 'wx' });
  return () => {
    try { fs.rmSync(lease, { force: true }); } catch { /* do not replace the tool result with lease cleanup */ }
  };
}

export function reuseInheritedLiveDependencyOverlay({ projectRoot, cacheBase, environment = process.env }) {
  const configuredOverlayRoot = environment.CODEX_HARNESS_LIVE_OVERLAY_ROOT;
  if (!configuredOverlayRoot) return null;

  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedOverlayRoot = path.resolve(configuredOverlayRoot);
  const configuredProjectRoot = environment.CODEX_HARNESS_LIVE_PROJECT_ROOT;
  const overlaysRoot = path.resolve(cacheBase, 'overlays');
  const overlayMarkerPath = path.join(resolvedOverlayRoot, '.harness-overlay.json');
  const projectModules = path.join(resolvedProjectRoot, 'node_modules');
  const overlayModules = path.join(resolvedOverlayRoot, 'node_modules');
  const marker = readJson(overlayMarkerPath);

  if (
    !configuredProjectRoot
    || !samePath(configuredProjectRoot, resolvedProjectRoot)
    || !isInside(overlaysRoot, resolvedOverlayRoot)
    || !marker
    || !samePath(marker.projectRoot, resolvedProjectRoot)
    || !samePath(marker.overlayRoot, resolvedOverlayRoot)
    || !fs.existsSync(overlayModules)
    || !fs.existsSync(projectModules)
    || !fs.lstatSync(projectModules).isSymbolicLink()
    || !samePath(fs.realpathSync.native(projectModules), fs.realpathSync.native(overlayModules))
  ) {
    throw failure('LIVE_DEPENDENCY_OVERLAY_INVALID', `inherited live dependency overlay is invalid for ${resolvedProjectRoot}`);
  }

  return {
    id: path.basename(resolvedOverlayRoot),
    root: resolvedOverlayRoot,
    cwd: resolvedProjectRoot,
    cleanup() {},
  };
}

export async function prepareLiveDependencyOverlay({ projectRoot, dependencyRoot, cacheBase }) {
  const id = crypto.randomUUID();
  const projectIdentity = crypto.createHash('sha256').update(path.resolve(projectRoot).toLowerCase()).digest('hex');
  const lockDirectory = path.join(cacheBase, 'normal-locks', `${projectIdentity}.lock`);
  const overlayRoot = path.join(cacheBase, 'overlays', id);
  fs.mkdirSync(path.dirname(lockDirectory), { recursive: true });
  fs.mkdirSync(path.dirname(overlayRoot), { recursive: true });
  const lock = await acquireProjectLock(lockDirectory);
  const owner = { pid: process.pid, projectRoot: path.resolve(projectRoot), overlayRoot };
  fs.writeFileSync(lock.ownerPath, `${JSON.stringify(owner)}\n`, { flag: 'wx' });
  try {
    const projectModules = path.join(projectRoot, 'node_modules');
    if (fs.existsSync(projectModules)) {
      throw failure('LIVE_DEPENDENCY_OVERLAY_COLLISION', `ordinary x64 execution will not replace existing project dependencies: ${projectModules}`);
    }
    fs.mkdirSync(overlayRoot);
    fs.writeFileSync(path.join(overlayRoot, '.harness-overlay.json'), `${JSON.stringify(owner)}\n`);
    linkDependencies(overlayRoot, dependencyRoot);
    fs.symlinkSync(path.join(overlayRoot, 'node_modules'), projectModules, process.platform === 'win32' ? 'junction' : 'dir');
    let cleaned = false;
    return {
      id,
      root: overlayRoot,
      cwd: projectRoot,
      cleanup() {
        if (cleaned) return;
        cleaned = true;
        try { removeOwnedOverlay(owner); }
        finally { lock.release(); }
      },
    };
  } catch (error) {
    removeOwnedOverlay(owner);
    lock.release();
    throw error;
  }
}
