import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadSpareDevelopmentEnv, spareFirebaseProject } from './spare-dev-config.mjs';
import { assertSpareBuildIdentity, createSpareBuildIdentity, spareIdentityFile, spareSourceIdentity } from './spare-preview-identity.mjs';

export const SPARE_AUTO_PORT_MIN = 5173;
export const SPARE_AUTO_PORT_MAX = 5182;
export const SPARE_AUTO_PORT_POOL = Object.freeze(
  Array.from({ length: SPARE_AUTO_PORT_MAX - SPARE_AUTO_PORT_MIN + 1 }, (_, index) => SPARE_AUTO_PORT_MIN + index),
);

const isWhitelistedSparePort = value => /^[1-9]\d{0,4}$/u.test(String(value ?? ''))
  && Number(value) >= SPARE_AUTO_PORT_MIN
  && Number(value) <= SPARE_AUTO_PORT_MAX;

export function parseSpareDevArgs(argv) {
  const [operation, ...args] = argv;
  if (!['dev', 'build', 'preview'].includes(operation)) throw new Error('Choose dev, build, or preview.');
  if (operation === 'build') {
    if (args.length !== 0) throw new Error('Build does not accept a port or extra arguments.');
    return { operation, portSpec: null };
  }
  if (args.length === 0) return { operation, portSpec: '5173' };
  const validSpec = value => value === 'auto' || isWhitelistedSparePort(value);
  if (args.length === 1 && validSpec(args[0])) {
    return { operation, portSpec: args[0] };
  }
  if (args.length === 2 && args[0] === '--port' && validSpec(args[1])) {
    return { operation, portSpec: args[1] };
  }
  throw new Error(`Use a whitelisted spare port (${SPARE_AUTO_PORT_MIN}-${SPARE_AUTO_PORT_MAX}) or auto, for example npm run dev -- --port 5174.`);
}

function probeAddressFree(host, port, { ignoreUnsupportedFamily = false } = {}) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    const finish = (error, isFree) => {
      if (server.listening) {
        server.close(closeError => {
          if (error) reject(error);
          else if (closeError) reject(closeError);
          else resolve(isFree);
        });
      } else if (error) {
        reject(error);
      } else {
        resolve(isFree);
      }
    };
    server.once('error', error => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') finish(null, false);
      else if (ignoreUnsupportedFamily && (error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT')) finish(null, true);
      else finish(error);
    });
    server.listen({ host, port, exclusive: true }, () => finish(null, true));
  });
}

async function probePortFree(host, port) {
  if (host === 'localhost') {
    if (!await probeAddressFree('127.0.0.1', port)) return false;
    return probeAddressFree('::1', port, { ignoreUnsupportedFamily: true });
  }
  return probeAddressFree(host, port);
}

export async function allocateFreePort(host = 'localhost', { pool = SPARE_AUTO_PORT_POOL, isPortFree } = {}) {
  if (!Array.isArray(pool) || pool.length === 0 || !pool.every(port => Number.isInteger(port) && port >= 1 && port <= 65535)) {
    throw new Error('Port pool must be a non-empty array of integers from 1 to 65535.');
  }
  const checkPort = isPortFree ?? (port => probePortFree(host, port));
  for (const port of pool) if (await checkPort(port)) return port;
  throw new Error(`All whitelisted spare localhost ports (${pool[0]}-${pool[pool.length - 1]}) are occupied. Stop an unused dev/preview server before starting another.`);
}

export async function resolveSparePort(portSpec, allocator = allocateFreePort) {
  if (portSpec === 'auto') {
    const port = await allocator();
    if (!Number.isInteger(port) || port < SPARE_AUTO_PORT_MIN || port > SPARE_AUTO_PORT_MAX) {
      throw new Error(`The port allocator returned a port outside the whitelisted spare range (${SPARE_AUTO_PORT_MIN}-${SPARE_AUTO_PORT_MAX}).`);
    }
    return port;
  }
  if (!isWhitelistedSparePort(portSpec)) {
    throw new Error(`Port must be a whitelisted spare port (${SPARE_AUTO_PORT_MIN}-${SPARE_AUTO_PORT_MAX}) or auto.`);
  }
  return Number(portSpec);
}

async function main(argv = process.argv.slice(2)) {
  const { operation, portSpec } = parseSpareDevArgs(argv);
  const repoRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  const resolvedPort = operation === 'build' ? null : await resolveSparePort(portSpec);
  const env = { ...(await loadSpareDevelopmentEnv()), ...(resolvedPort ? { LUYENTAP_SPARE_PORT: String(resolvedPort) } : {}) };
  const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
  const options = operation === 'build'
    ? ['--outDir', 'dist-spare']
    : ['--host', 'localhost', '--port', String(resolvedPort), '--strictPort', ...(operation === 'preview' ? ['--outDir', 'dist-spare'] : [])];
  if (operation === 'build') {
    console.log(`[build] Project: ${spareFirebaseProject} | Worktree: ${repoRoot}`);
  } else {
    console.log(`[${operation}] Origin: http://localhost:${resolvedPort} | Project: ${spareFirebaseProject} | Worktree: ${repoRoot}`);
  }
  const identityFile = spareIdentityFile(repoRoot);
  const source = operation === 'build' ? spareSourceIdentity(repoRoot) : null;
  if (source) rmSync(identityFile, { force: true });
  const result = spawnSync(process.execPath, [vite, operation, '--mode', 'spare', '--config', 'scripts/spare-vite.config.mjs', ...options], {
    cwd: repoRoot, env, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (source?.clean && result.status === 0) {
    const identity = createSpareBuildIdentity(source, env);
    assertSpareBuildIdentity(identity, spareSourceIdentity(repoRoot));
    writeFileSync(identityFile, JSON.stringify(identity) + '\n');
  }
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { await main(); } catch (error) {
    console.error(`[spare] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
