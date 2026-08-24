import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARNESS_CONTRACT } from './contract.mjs';
import {
  assertDispatcherProtocol,
  assertToolDeclared,
  composeToolEnvironment,
  contentHash,
  ensureDependencies,
  forwardedResult,
  preflightTool,
  projectContext,
  runWslWrangler,
} from './run-isolated.mjs';
import {
  acquireDependencyLease,
  prepareLiveDependencyOverlay,
  reuseInheritedLiveDependencyOverlay,
} from './source-adapter.mjs';

const harnessDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(harnessDirectory, '..', '..');
const failure = (code, message) => Object.assign(new Error(message), { code });

function repositoryCacheIdentity() {
  const dotGit = path.join(repositoryRoot, '.git');
  let gitDirectory = dotGit;
  if (fs.existsSync(dotGit) && fs.statSync(dotGit).isFile()) {
    const match = fs.readFileSync(dotGit, 'utf8').trim().match(/^gitdir:\s*(.+)$/u);
    if (match) gitDirectory = path.resolve(repositoryRoot, match[1]);
  }
  const commonFile = path.join(gitDirectory, 'commondir');
  const common = fs.existsSync(commonFile)
    ? path.resolve(gitDirectory, fs.readFileSync(commonFile, 'utf8').trim())
    : gitDirectory;
  const canonical = fs.existsSync(common) ? fs.realpathSync.native(common) : fs.realpathSync.native(repositoryRoot);
  return crypto.createHash('sha256').update(canonical.toLowerCase()).digest('hex');
}

function applyEnvironmentDefaults(environment, tool, command) {
  for (const [name, value] of Object.entries(tool.environmentDefaultsByCommand?.[command] ?? {})) {
    if (!environment[name]) environment[name] = value;
  }
  return environment;
}

async function runWindowsTool(invocation, project, tool, cacheBase) {
  const dependency = await ensureDependencies(project, cacheBase, { repositoryIdentity: repositoryCacheIdentity() });
  const releaseLease = acquireDependencyLease(dependency.root);
  let overlay;
  try {
    const prepared = preflightTool(project, dependency, invocation.tool, invocation.toolArguments[0], cacheBase);
    overlay = reuseInheritedLiveDependencyOverlay({
      projectRoot: project.projectRoot,
      cacheBase,
    }) ?? await prepareLiveDependencyOverlay({
      projectRoot: project.projectRoot,
      dependencyRoot: dependency.root,
      cacheBase,
    });
    const environment = applyEnvironmentDefaults(composeToolEnvironment(prepared), tool, invocation.toolArguments[0]);
    environment.CODEX_HARNESS_LIVE_OVERLAY_ROOT = overlay.root;
    environment.CODEX_HARNESS_LIVE_PROJECT_ROOT = project.projectRoot;
    const configuredTimeout = Number(process.env.CODEX_HARNESS_TIMEOUT_MS);
    const timeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : HARNESS_CONTRACT.defaultSnapshotTimeoutMs;
    const result = await forwardedResult(process.execPath, [prepared.entry, ...invocation.toolArguments], {
      cwd: overlay.cwd,
      env: environment,
      timeout,
      inheritStdin: true,
    });
    return result.timedOut ? 124 : (result.status ?? 1);
  } finally {
    overlay?.cleanup();
    releaseLease();
  }
}

async function runWrangler(invocation, project, tool) {
  const version = project.lock.packages[`node_modules/${tool.package}`].version;
  const result = await runWslWrangler(
    project.projectRoot,
    repositoryRoot,
    invocation.toolArguments,
    version,
    contentHash(project.manifestRaw),
    contentHash(project.lockRaw),
  );
  return result.timedOut ? 124 : (result.status ?? 1);
}

async function main() {
  const encoded = process.env.CODEX_HARNESS_INVOCATION_B64;
  if (!encoded) throw failure('DISPATCH_PROTOCOL_MISSING', 'missing dispatcher invocation protocol');
  const invocation = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  assertDispatcherProtocol(invocation);
  if (invocation.audit || invocation.mode !== 'run') throw failure('DISPATCH_PROTOCOL_MISMATCH', 'normal runner accepts ordinary tool execution only');
  const project = projectContext(invocation.relativeProjectPath);
  const tool = assertToolDeclared(project, invocation.tool);
  const cacheBase = path.resolve(process.env.CODEX_HARNESS_ROOT || path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'codex-harness-v3'));
  return tool.runtime === 'wsl'
    ? runWrangler(invocation, project, tool)
    : runWindowsTool(invocation, project, tool, cacheBase);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); }
  catch (error) {
    process.stderr.write(`HARNESS_FAILURE ${error.code || 'HARNESS_UNEXPECTED_FAILURE'}: ${error.message}\n`);
    process.exitCode = 2;
  }
}
