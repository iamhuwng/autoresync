import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadSpareDevelopmentEnv, spareFirebaseProject } from './spare-dev-config.mjs';
import { assertSpareBuildIdentity, createSpareBuildIdentity, spareIdentityFile, spareSourceIdentity } from './spare-preview-identity.mjs';

export function parseSpareDevArgs(argv) {
  const [operation, ...args] = argv;
  if (!['dev', 'build', 'preview'].includes(operation)) throw new Error('Choose dev, build, or preview.');
  if (operation === 'build') {
    if (args.length !== 0) throw new Error('Build does not accept a port or extra arguments.');
    return { operation, portSpec: null };
  }
  if (args.length === 0) return { operation, portSpec: '5173' };
  const validSpec = value => value === 'auto' || (/^[1-9]\d{0,4}$/u.test(value) && Number(value) >= 1 && Number(value) <= 65535);
  if (args.length === 1 && validSpec(args[0])) {
    return { operation, portSpec: args[0] };
  }
  if (args.length === 2 && args[0] === '--port' && validSpec(args[1])) {
    return { operation, portSpec: args[1] };
  }
  throw new Error('Use a numeric port or auto, for example npm run dev -- --port 5174.');
}

export function allocateFreePort(host = 'localhost') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    const finish = (error, port) => {
      if (server.listening) server.close(() => error ? reject(error) : resolve(port));
      else if (error) reject(error);
      else resolve(port);
    };
    server.once('error', error => finish(error));
    server.listen({ host, port: 0 }, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        finish(new Error('Could not allocate a valid localhost port.'));
      } else {
        finish(null, port);
      }
    });
  });
}

export async function resolveSparePort(portSpec, allocator = allocateFreePort) {
  if (portSpec === 'auto') {
    const port = await allocator();
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('The port allocator returned an invalid port.');
    return port;
  }
  if (!/^[1-9]\d{0,4}$/u.test(String(portSpec ?? ''))) throw new Error('Port must be a number from 1 to 65535 or auto.');
  const port = Number(portSpec);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be a number from 1 to 65535 or auto.');
  return port;
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
