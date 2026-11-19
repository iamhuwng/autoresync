import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadSpareDevelopmentEnv, spareFirebaseProject } from './spare-dev-config.mjs';
import { assertSpareBuildIdentity, createSpareBuildIdentity, spareIdentityFile, spareSourceIdentity } from './spare-preview-identity.mjs';

const [operation, ...args] = process.argv.slice(2);
const port = args.length === 0 ? '5173' : args.length === 1 ? args[0] : args[1];
const validPort = /^\d{1,5}$/u.test(port ?? '') && Number(port) > 0 && Number(port) <= 65535;

try {
  if (!['dev', 'build', 'preview'].includes(operation)) throw new Error('Choose dev, build, or preview.');
  if (operation === 'build' ? args.length !== 0 : !validPort || (args.length > 1 && (args.length !== 2 || args[0] !== '--port'))) {
    throw new Error('Use a numeric port, for example npm run dev -- --port 5174.');
  }
  const env = await loadSpareDevelopmentEnv();
  const repoRoot = fileURLToPath(new URL('../', import.meta.url));
  const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
  const options = operation === 'build'
    ? ['--outDir', 'dist-spare']
    : ['--host', 'localhost', '--port', port, '--strictPort', ...(operation === 'preview' ? ['--outDir', 'dist-spare'] : [])];
  console.log(`[${operation}] Using spare Firebase project ${spareFirebaseProject}.`);
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
} catch (error) {
  console.error(`[spare] ${error.message}`);
  process.exitCode = 1;
}
