import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spareMediaOrigin, spareFirebaseProject, spareUploadWorker } from './spare-dev-config.mjs';

export const spareIdentityPath = '/__spare-preview-identity.json';
export const spareDevIdentityPath = '/__spare-dev-identity.json';
export const spareIdentityHeader = 'x-luyentap-spare-preview';
export const spareIdentityFile = cwd => path.join(cwd, 'dist-spare', spareIdentityPath.slice(1));
const sha = /^[a-f0-9]{40}$/u;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

export function spareSourceIdentity(cwd) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
  return {
    worktree: path.resolve(cwd),
    revision: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    clean: !git('status', '--porcelain', '--untracked-files=all'),
  };
}

export const createSpareBuildIdentity = (source, env) => ({
  ...source,
  buildId: randomUUID(),
  environmentSha256: createHash('sha256').update(JSON.stringify(Object.entries(env)
    .filter(([key]) => key.startsWith('VITE_')).sort(([left], [right]) => left.localeCompare(right)))).digest('hex'),
  firebaseProject: spareFirebaseProject,
  workerOrigin: spareUploadWorker,
  publicMediaOrigin: spareMediaOrigin,
});

export function assertSpareBuildIdentity(identity, source) {
  if (!identity || identity.clean !== true || !sha.test(identity.revision) || !sha.test(identity.tree)
    || identity.revision !== source.revision || identity.tree !== source.tree || source.clean === false
    || !uuid.test(identity.buildId) || !/^[a-f0-9]{64}$/u.test(identity.environmentSha256)
    || identity.firebaseProject === 'temp-a1437' || identity.firebaseProject !== spareFirebaseProject || identity.workerOrigin !== spareUploadWorker
    || identity.publicMediaOrigin !== spareMediaOrigin
    || (typeof source?.worktree === 'string' && identity.worktree !== source.worktree)) {
    throw new Error('Spare preview does not match the clean candidate and expected endpoints. Rebuild and restart it.');
  }
}

export function spareDevMiddleware(cwd, { port = null } = {}) {
  return (req, res, next) => {
    if (req.url !== spareDevIdentityPath) return next();
    res.setHeader(spareIdentityHeader, '1');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ mode: 'dev', ...spareSourceIdentity(cwd), port, firebaseProject: spareFirebaseProject,
      workerOrigin: spareUploadWorker, publicMediaOrigin: spareMediaOrigin }));
  };
}

export function sparePreviewMiddleware(cwd) {
  const file = spareIdentityFile(cwd);
  let started;
  try { started = readFileSync(file, 'utf8'); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return (req, res, next) => {
    if (req.url !== spareIdentityPath) return next();
    res.setHeader(spareIdentityHeader, '1');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    let current;
    try { current = readFileSync(file, 'utf8'); } catch (error) {
      if (error.code !== 'ENOENT') return next(error);
    }
    if (!started || started !== current) {
      res.statusCode = 409;
      return res.end(JSON.stringify({ error: 'Rebuild and restart the spare preview.' }));
    }
    res.end(started);
  };
}
