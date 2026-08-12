import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fs.realpathSync.native(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));

function parseArguments(argv) {
  const result = { project: null, script: 'dev', url: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--script') { result.script = argv[index + 1] ?? ''; index += 1; }
    else if (value === '--url') { result.url = argv[index + 1] ?? ''; index += 1; }
    else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`);
    else if (!result.project) result.project = value;
    else throw new Error(`unexpected argument: ${value}`);
  }
  if (!result.project || !result.script) throw new Error('expected <project> [--script <name>] [--url <http://localhost:port/path>]');
  return result;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function nodeModulesState(projectRoot) {
  const location = path.join(projectRoot, 'node_modules');
  try {
    const metadata = fs.lstatSync(location);
    const kind = metadata.isSymbolicLink() ? 'link' : metadata.isDirectory() ? 'directory' : 'other';
    const resolvedTarget = fs.realpathSync.native(location);
    const canonicalProjectRoot = fs.realpathSync.native(projectRoot);
    return { path: location, kind, resolvedTarget, insideProject: isInside(canonicalProjectRoot, resolvedTarget) };
  } catch (error) {
    if (error.code === 'ENOENT') return { path: location, kind: 'absent', resolvedTarget: null, insideProject: false };
    return { path: location, kind: 'unavailable', resolvedTarget: null, insideProject: false, error: error.message };
  }
}

function packageScriptRoutesDirectlyToVite(command) {
  const normalized = command.trim();
  if (/(?:&&|\|\||[;|&<>`]|\$\(|[\r\n])/u.test(normalized)) return false;
  return /^(?:vite|(?:node(?:\.exe)?\s+)?(?:\.\\|\.\/)?node_modules[\\/]\.bin[\\/]vite(?:\.cmd)?)(?:\s+[^\s].*)?$/iu.test(normalized);
}

export function viteVersionFromCliOutput(output) {
  return output.match(/^vite\/([0-9]+(?:\.[0-9]+){2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?:\s|$)/mu)?.[1] ?? null;
}

function validateUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) throw new Error('--url must use http localhost or loopback');
  if (!url.port) throw new Error('--url requires an explicit port');
  return url;
}

function tcpReady(url) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: url.hostname.replaceAll('[', '').replaceAll(']', ''), port: Number(url.port) });
    const finish = (ready, error = null) => { socket.destroy(); resolve({ attempted: true, ready, error }); };
    socket.setTimeout(750, () => finish(false, 'timeout'));
    socket.once('connect', () => finish(true));
    socket.once('error', (error) => finish(false, error.code || error.message));
  });
}

function httpReady(url) {
  return new Promise((resolve) => {
    const request = http.request(url, { method: 'GET', timeout: 1000 }, (response) => {
      response.resume();
      resolve({ attempted: true, ready: true, statusCode: response.statusCode ?? null });
    });
    request.once('timeout', () => request.destroy(new Error('timeout')));
    request.once('error', (error) => resolve({ attempted: true, ready: false, statusCode: null, error: error.code || error.message }));
    request.end();
  });
}

async function main() {
  let options;
  try { options = parseArguments(process.argv.slice(2)); } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, failureCode: 'ARGUMENT_INVALID', message: error.message })}\n`);
    process.stderr.write(`live-vite-doctor: ${error.message}\n`);
    return 2;
  }
  const requestedProjectRoot = path.resolve(repositoryRoot, options.project);
  let projectRoot = requestedProjectRoot;
  let canonicalProjectRoot = null;
  try { canonicalProjectRoot = fs.realpathSync.native(requestedProjectRoot); } catch { /* project-context validation below reports the missing path */ }
  const result = { ok: false, project: { requested: options.project, root: requestedProjectRoot, resolvedRoot: canonicalProjectRoot, insideRepository: Boolean(canonicalProjectRoot && isInside(repositoryRoot, canonicalProjectRoot)) }, script: { name: options.script }, dependency: null, vite: null, readiness: { tcp: { attempted: false }, http: { attempted: false } }, failures: [] };
  if (!result.project.insideRepository) result.failures.push('PROJECT_CONTEXT_INVALID');
  if (canonicalProjectRoot) projectRoot = canonicalProjectRoot;
  const manifestPath = path.join(projectRoot, 'package.json');
  const lockPath = path.join(projectRoot, 'package-lock.json');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(lockPath)) result.failures.push('PROJECT_CONTEXT_INVALID');
  let manifest = null;
  let lock = null;
  if (!result.failures.length) {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch { result.failures.push('PROJECT_CONTEXT_INVALID'); }
  }
  if (manifest) {
    const script = manifest.scripts?.[options.script];
    result.script.command = script ?? null;
    result.script.directVite = typeof script === 'string' && packageScriptRoutesDirectlyToVite(script);
    if (!result.script.directVite) result.failures.push('VITE_SCRIPT_ROUTE_INVALID');
    const declared = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies };
    const lockEntry = lock.packages?.['node_modules/vite'];
    result.vite = { declared: declared.vite ?? null, lockVersion: lockEntry?.version ?? null };
    if (!declared.vite || !lockEntry) result.failures.push('VITE_OWNERSHIP_INVALID');
  }
  result.dependency = nodeModulesState(projectRoot);
  if (result.dependency.kind === 'absent') result.failures.push('NODE_MODULES_MISSING');
  else if (result.dependency.kind === 'link' && !result.dependency.insideProject) result.failures.push('DEPENDENCY_CONTEXT_EXTERNAL_LINK');
  else if (result.dependency.kind === 'unavailable') result.failures.push('DEPENDENCY_CONTEXT_UNAVAILABLE');
  const viteEntry = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(viteEntry)) result.failures.push('VITE_ENTRY_MISSING');
  else {
    const packageRoot = fs.realpathSync.native(path.join(projectRoot, 'node_modules', 'vite'));
    const entry = fs.realpathSync.native(viteEntry);
    const dependencyRoot = result.dependency.resolvedTarget;
    const packageInsideProject = isInside(projectRoot, packageRoot) && isInside(projectRoot, entry);
    const packageInsideDependencies = typeof dependencyRoot === 'string' && isInside(dependencyRoot, packageRoot) && isInside(dependencyRoot, entry);
    result.vite = { ...result.vite, packageRoot, entry, packageInsideProject, packageInsideDependencies };
    if (!packageInsideProject || !packageInsideDependencies) result.failures.push('DEPENDENCY_CONTEXT_EXTERNAL_LINK');
    else {
      const probe = spawnSync(process.execPath, [entry, '--version'], { cwd: projectRoot, encoding: 'utf8', shell: false, timeout: 3000 });
      const output = probe.stdout.trim();
      const version = viteVersionFromCliOutput(output);
      result.vite.probe = { status: probe.status, output: output || null, version, error: probe.error?.code || null };
      if (probe.status !== 0) result.failures.push('VITE_PROBE_FAILED');
      else if (version !== result.vite.lockVersion) result.failures.push('VITE_VERSION_MISMATCH');
    }
  }
  let url = null;
  try { url = validateUrl(options.url); } catch (error) { result.failures.push('URL_INVALID'); process.stderr.write(`live-vite-doctor: ${error.message}\n`); }
  if (url) {
    result.readiness.tcp = await tcpReady(url);
    result.readiness.http = result.readiness.tcp.ready ? await httpReady(url) : { attempted: false, ready: false, reason: 'tcp-not-ready' };
    if (!result.readiness.tcp.ready) result.failures.push('LIVE_TCP_NOT_READY');
    else if (result.readiness.http.attempted && !result.readiness.http.ready) result.failures.push('LIVE_HTTP_NOT_READY');
  }
  result.ok = result.failures.length === 0;
  result.failureCodes = result.failures;
  process.stdout.write(`${JSON.stringify(result)}\n`);
  for (const failure of result.failures) process.stderr.write(`live-vite-doctor: ${failure}\n`);
  return result.ok ? 0 : 2;
}

process.exit(await main());
