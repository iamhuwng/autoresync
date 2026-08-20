import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { HARNESS_CONTRACT, remediationFor, toolNames } from './contract.mjs';

const harnessDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(harnessDirectory, '..', '..');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const contentHash = (value) => hash(Buffer.isBuffer(value) ? value.toString('utf8').replace(/\r\n/gu, '\n') : value);
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const commandResult = (command, args, options = {}) => spawnSync(command, args, { encoding: 'utf8', shell: false, ...options });
const failure = (code, message) => Object.assign(new Error(message), { code });
const evidenceTimestamp = () => new Date().toISOString();
const EVIDENCE_PHASES = Object.freeze(['dependencyPreparation', 'capabilityPreparation', 'sourceMirror', 'toolExecution', 'finalization']);
const FORWARDED_OUTPUT_TAIL_BYTES = 4 * 1024 * 1024;
const TIMEOUT_OUTPUT_TAIL_BYTES = 256 * 1024;
export function selectedNodeEnvironment(source = process.env) {
  const environment = {
    ...source,
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${source.PATH || ''}`,
  };
  for (const name of Object.keys(environment)) {
    if (/^npm_config_(?:arch|platform|target_arch|target_platform|libc)$/iu.test(name)) delete environment[name];
  }
  return environment;
}

export function composeToolEnvironment(prepared, base = selectedNodeEnvironment()) {
  const environment = { ...base, ...prepared.environment };
  if (prepared.pathPrepend?.length) environment.PATH = `${prepared.pathPrepend.join(path.delimiter)}${path.delimiter}${base.PATH || ''}`;
  return environment;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function playwrightEnvironment(cacheBase, dependencyRoot, configured = process.env.PLAYWRIGHT_BROWSERS_PATH) {
  if (!configured) return { environment: {}, selection: 'default-user-cache' };
  const resolved = configured === '0' ? null : path.resolve(configured);
  const unsafe = configured === '0' || !path.isAbsolute(configured) || isInside(repositoryRoot, resolved) || isInside(dependencyRoot, resolved);
  const selected = unsafe ? path.join(cacheBase, 'browsers') : resolved;
  return { environment: { PLAYWRIGHT_BROWSERS_PATH: selected }, selection: unsafe ? 'adapted-harness-cache' : 'configured-absolute-cache' };
}

export function parseJavaMajor(versionText) {
  return Number(versionText.match(/version "(?:1\.)?(\d+)/u)?.[1]);
}

export function selectJavaRuntime(candidates, minimumMajor, probe = (executable) => commandResult(executable, ['-version'])) {
  const discoveries = [];
  for (const executable of [...new Set(candidates)]) {
    const result = probe(executable);
    const versionText = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    const major = parseJavaMajor(versionText);
    discoveries.push({ executable, available: result.status === 0, major: Number.isFinite(major) ? major : null, version: versionText.split(/\r?\n/u)[0] || null });
    if (result.status === 0 && Number.isFinite(major) && major >= minimumMajor) {
      const binDirectory = path.dirname(executable);
      return { selected: { kind: 'java', executable, home: path.dirname(binDirectory), major }, discoveries };
    }
  }
  return { selected: null, discoveries };
}

function javaCandidates() {
  const candidates = [];
  const addFile = (file) => { if (file && fs.existsSync(file) && fs.statSync(file).isFile()) candidates.push(path.resolve(file)); };
  const javaName = process.platform === 'win32' ? 'java.exe' : 'java';
  if (process.env.JAVA_HOME) addFile(path.join(process.env.JAVA_HOME, 'bin', javaName));
  const located = commandResult(process.platform === 'win32' ? 'where.exe' : 'which', process.platform === 'win32' ? ['java.exe'] : ['-a', 'java']);
  if (located.status === 0) for (const file of located.stdout.split(/\r?\n/u).filter(Boolean)) addFile(file.trim());
  if (process.platform === 'win32') {
    const roots = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Java'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Eclipse Adoptium'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Zulu'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Amazon Corretto'),
      process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.jdks'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Eclipse Adoptium'),
    ].filter(Boolean);
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      addFile(path.join(root, 'bin', javaName));
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) if (entry.isDirectory()) addFile(path.join(root, entry.name, 'bin', javaName));
    }
    addFile(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr', 'bin', javaName));
  }
  return [...new Set(candidates.map((candidate) => fs.realpathSync.native(candidate)))];
}

function resolveJavaRuntime(minimumMajor) {
  const resolution = selectJavaRuntime(javaCandidates(), minimumMajor);
  if (!resolution.selected) {
    const error = failure('JAVA_PREREQUISITE_MISSING', `Java ${minimumMajor}+ is required; no compatible runtime was discovered`);
    error.discovery = { kind: 'java', candidates: resolution.discoveries };
    throw error;
  }
  return resolution;
}

export function dependencyCacheIdentity(input) {
  return hash(JSON.stringify({
    dependencyProtocol: input.dependencyCacheProtocolVersion ?? HARNESS_CONTRACT.dependencyCacheProtocolVersion,
    repositoryIdentity: input.repositoryIdentity,
    project: input.project,
    manifestSha256: input.manifestSha256,
    lockSha256: input.lockSha256,
    platform: input.platform,
    architecture: input.architecture,
    nodeVersion: input.nodeVersion,
    nodeAbi: input.nodeAbi,
    npmVersion: input.npmVersion,
  }));
}

export function classifyResult({ error, exitCode, stderr = '', stdout = '', wslRuntimeMetadata }) {
  if (error?.code === 'ETIMEDOUT') return 'harness_transport_failure';
  if (error) return 'harness_startup_failure';
  if (wslRuntimeMetadata === false && exitCode !== 0) return 'harness_startup_failure';
  const combined = `${stdout}\n${stderr}`;
  if (/\bNo test files found\b|\bNo tests found\b/iu.test(combined)) return 'zero_tests_collected';
  if (/HARNESS_WSL_FAILURE|Unsupported platform:|Failed to start.+workerd|workerd.+failed to start/isu.test(combined)) return 'harness_startup_failure';
  return exitCode === 0 ? 'completed' : 'product_failure';
}

export function wslFailureCodeFromStderr(stderr = '') {
  return stderr.match(/^HARNESS_WSL_FAILURE ([A-Z0-9_]+)(?::|$)/mu)?.[1] ?? null;
}

export function mergeEvidenceDiscovery(existing, discovered) {
  return { ...existing, ...discovered };
}

export function assertInvocationMode(toolName, tool, args) {
  const command = args[0];
  if ((tool.rejectEmptyCommand && !command) || tool.rejectedCommands?.includes(command)) {
    throw failure('LIVE_WORKLOAD_REQUIRES_CHECKOUT', `${toolName} ${command || 'default'} must run against the active checkout, not a snapshot workspace`);
  }
  if (tool.requireOneShot && command !== 'run' && !args.includes('--run')) {
    throw failure('LIVE_WORKLOAD_REQUIRES_CHECKOUT', `${toolName} watch mode must run against the active checkout; use an explicit one-shot run in the harness`);
  }
}

export function proofPhase(invocation) {
  if (invocation.mode === 'doctor') return 'doctor';
  const [command, ...rest] = invocation.toolArguments;
  if (invocation.tool === 'playwright' && command === 'test' && rest.includes('--list')) return 'collection';
  return 'execution';
}

function protectedPathState(file) {
  try {
    const metadata = fs.lstatSync(file);
    const kind = metadata.isSymbolicLink() ? 'link' : metadata.isDirectory() ? 'directory' : metadata.isFile() ? 'file' : 'other';
    return {
      kind,
      ...(kind === 'file' ? { sha256: hash(fs.readFileSync(file)) } : {}),
      ...(kind === 'link' ? { target: fs.readlinkSync(file), resolvedTarget: fs.realpathSync.native(file) } : {}),
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { kind: 'absent' };
    throw error;
  }
}

export function protectedProjectState(project) {
  return {
    packageJson: protectedPathState(project.manifestPath),
    packageLock: protectedPathState(project.lockPath),
    nodeModules: protectedPathState(path.join(project.projectRoot, 'node_modules')),
  };
}

function proofFor(phase) {
  const collection = phase === 'collection';
  return {
    phase,
    counts: {
      collected: null,
      executed: collection ? 0 : null,
      passed: collection ? 0 : null,
      failed: collection ? 0 : null,
      skipped: collection ? 0 : null,
    },
  };
}

const emptyProofCounts = () => ({ collected: null, executed: null, passed: null, failed: null, skipped: null });
const withoutAnsi = (value) => value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, '');

export function proofCountsFromResult({ tool, phase, stdout = '', stderr = '', exitCode }) {
  void exitCode;
  const output = withoutAnsi(`${stdout}\n${stderr}`);
  if (phase === 'collection' && tool === 'playwright') {
    const match = output.match(/\bTotal:\s*(\d+)\s+tests?\s+in\s+\d+\s+files?\b/iu);
    return match ? { collected: Number(match[1]), executed: 0, passed: 0, failed: 0, skipped: 0 } : { collected: null, executed: 0, passed: 0, failed: 0, skipped: 0 };
  }
  if (phase !== 'execution') return emptyProofCounts();
  if (tool === 'vitest') {
    const summaries = [...output.matchAll(/^\s*Tests\s+(.+?)\s*$/gimu)];
    if (summaries.length !== 1) return emptyProofCounts();
    const outcomes = [...summaries[0][1].matchAll(/(\d+)\s+(passed|failed|skipped)\b/giu)];
    if (!outcomes.length) return emptyProofCounts();
    const counts = { passed: 0, failed: 0, skipped: 0 };
    const seen = new Set();
    for (const [, count, outcome] of outcomes) {
      if (seen.has(outcome)) return emptyProofCounts();
      seen.add(outcome);
      counts[outcome] = Number(count);
    }
    const executed = counts.passed + counts.failed + counts.skipped;
    return { collected: executed, executed, ...counts };
  }
  if (tool === 'playwright') {
    const counts = { passed: 0, failed: 0, skipped: 0 };
    const seen = new Set();
    let found = false;
    for (const line of output.split(/\r?\n/iu)) {
      const match = line.match(/^\s*(\d+)\s+(passed|failed|skipped)(?:\s+\([^)]*\))?\s*$/iu);
      if (!match) continue;
      const outcome = match[2].toLowerCase();
      if (seen.has(outcome)) return emptyProofCounts();
      seen.add(outcome);
      counts[outcome] = Number(match[1]);
      found = true;
    }
    if (!found) return emptyProofCounts();
    const executed = counts.passed + counts.failed + counts.skipped;
    return { collected: executed, executed, ...counts };
  }
  return emptyProofCounts();
}

function finalizeProtectedState(evidence, project) {
  evidence.protectedState.after = protectedProjectState(project);
  if (JSON.stringify(evidence.protectedState.before) === JSON.stringify(evidence.protectedState.after)) return true;
  evidence.classification = 'harness_transport_failure';
  attachRemediation(evidence, 'PROTECTED_STATE_CHANGED');
  evidence.exitCode = 2;
  return false;
}

function requiredGitValue(args, cwd = repositoryRoot) {
  const result = commandResult('git', args, { cwd });
  if (result.status !== 0) throw failure('SOURCE_PROVENANCE_UNAVAILABLE', `git ${args.join(' ')} failed: ${(result.stderr || result.error?.message || `exit ${result.status}`).trim()}`);
  return result.stdout.trim();
}

export function sourceIdentity(root = repositoryRoot) {
  const commit = requiredGitValue(['rev-parse', 'HEAD'], root);
  const commonDirectory = path.resolve(root, requiredGitValue(['rev-parse', '--git-common-dir'], root));
  const canonicalCommonDirectory = fs.existsSync(commonDirectory) ? fs.realpathSync.native(commonDirectory) : commonDirectory;
  const status = commandResult('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root });
  if (status.status !== 0) throw failure('SOURCE_PROVENANCE_UNAVAILABLE', `git status failed: ${(status.stderr || status.error?.message || `exit ${status.status}`).trim()}`);
  const fingerprint = crypto.createHash('sha256');
  const trackedDiff = commandResult('git', ['diff', '--binary', '--no-ext-diff', 'HEAD', '--'], { cwd: root, encoding: null });
  if (trackedDiff.status !== 0) throw failure('SOURCE_PROVENANCE_UNAVAILABLE', `git diff failed: ${(trackedDiff.stderr?.toString() || trackedDiff.error?.message || `exit ${trackedDiff.status}`).trim()}`);
  if (trackedDiff.status === 0 && trackedDiff.stdout) fingerprint.update(trackedDiff.stdout);
  const untracked = requiredGitValue(['ls-files', '--others', '--exclude-standard', '-z'], root).split('\0').filter(Boolean).sort();
  for (const relative of untracked) {
    const file = path.join(root, relative);
    fingerprint.update(`untracked\0${relative}\0`);
    const item = fs.lstatSync(file);
    fingerprint.update(item.isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file));
  }
  return {
    commit,
    dirty: Boolean(status.stdout),
    dirtyFingerprint: fingerprint.digest('hex'),
    repositoryCommonDirectory: canonicalCommonDirectory,
    repositoryIdentity: hash(canonicalCommonDirectory.toLowerCase()),
  };
}

function npmInvocation() {
  if (process.env.CODEX_HARNESS_NPM_COMMAND) return { command: process.env.CODEX_HARNESS_NPM_COMMAND, prefix: [] };
  if (process.platform === 'win32') {
    const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    return { command: process.execPath, prefix: [cli] };
  }
  return { command: 'npm', prefix: [] };
}

function packageDependencies(manifest) {
  return { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies };
}

export function projectContext(relativeProjectPath) {
  const projectRoot = relativeProjectPath === '.' ? repositoryRoot : path.join(repositoryRoot, relativeProjectPath);
  const manifestPath = path.join(projectRoot, 'package.json');
  const lockPath = path.join(projectRoot, 'package-lock.json');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(lockPath)) throw failure('PROJECT_CONTEXT_INVALID', `explicit project lacks package.json/package-lock.json: ${projectRoot}`);
  const manifestRaw = fs.readFileSync(manifestPath);
  const lockRaw = fs.readFileSync(lockPath);
  return { projectRoot, manifestPath, lockPath, manifestRaw, lockRaw, manifest: JSON.parse(manifestRaw), lock: JSON.parse(lockRaw) };
}

export function assertToolDeclared(project, toolName) {
  const tool = HARNESS_CONTRACT.tools[toolName];
  if (!tool) throw failure('TOOL_UNSUPPORTED', `unsupported tool: ${toolName}`);
  const dependencies = packageDependencies(project.manifest);
  if (!dependencies[tool.package]) throw failure('PROJECT_DEPENDENCY_MISSING', `${tool.package} is not declared by ${project.projectRoot}`);
  if (!project.lock.packages?.[`node_modules/${tool.package}`]) throw failure('PROJECT_LOCK_ENTRY_MISSING', `${tool.package} is absent from the selected project lockfile`);
  return tool;
}

async function acquireInstallLock(lockDirectory) {
  const deadline = Date.now() + 30 * 60 * 1000;
  while (true) {
    try {
      fs.mkdirSync(lockDirectory);
      return () => fs.rmdirSync(lockDirectory);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw failure('DEPENDENCY_LOCK_TIMEOUT', `timed out waiting for ${lockDirectory}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

function systemErrorDetails(error) {
  return Object.fromEntries(['name', 'code', 'message', 'errno', 'syscall', 'path', 'dest']
    .filter((name) => error?.[name] !== undefined)
    .map((name) => [name, error[name]]));
}

export function publishDependencyCache(staging, root, rename = fs.renameSync) {
  try {
    rename(staging, root);
  } catch (error) {
    const publication = failure('DEPENDENCY_CACHE_PUBLISH_FAILED', `unable to atomically publish immutable dependency cache: ${root}`);
    publication.dependencyCachePublication = {
      operation: 'staging_to_immutable_rename',
      staging,
      immutableRoot: root,
      systemError: systemErrorDetails(error),
    };
    throw publication;
  }
}

async function ensureDependencies(project, cacheBase, source) {
  const npm = npmInvocation();
  const npmVersionResult = commandResult(npm.command, [...npm.prefix, '--version']);
  if (npmVersionResult.status !== 0) throw failure('NPM_UNAVAILABLE', `npm failed: ${npmVersionResult.stderr || npmVersionResult.error?.message || npm.command}`);
  const identity = dependencyCacheIdentity({
    repositoryIdentity: source.repositoryIdentity,
    project: path.relative(repositoryRoot, project.projectRoot) || '.',
    manifestSha256: contentHash(project.manifestRaw),
    lockSha256: contentHash(project.lockRaw),
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    nodeAbi: process.versions.modules,
    npmVersion: npmVersionResult.stdout.trim(),
  });
  const root = path.join(cacheBase, 'dependencies', identity);
  const markerPath = path.join(root, '.harness-dependencies.json');
  if (!fs.existsSync(markerPath)) {
    fs.mkdirSync(path.dirname(root), { recursive: true });
    const release = await acquireInstallLock(`${root}.lock`);
    try {
      if (!fs.existsSync(markerPath)) {
        if (fs.existsSync(root)) throw failure('DEPENDENCY_CACHE_INCOMPLETE', `dependency cache exists without a valid marker: ${root}`);
        const staging = `${root}.install-${process.pid}-${crypto.randomUUID()}`;
        fs.mkdirSync(staging, { recursive: true });
        fs.copyFileSync(project.manifestPath, path.join(staging, 'package.json'));
        fs.copyFileSync(project.lockPath, path.join(staging, 'package-lock.json'));
        for (const value of Object.values(packageDependencies(project.manifest))) {
          if (typeof value !== 'string' || !value.startsWith('file:')) continue;
          const relative = value.slice('file:'.length);
          const sourcePath = path.resolve(project.projectRoot, relative);
          const destinationPath = path.resolve(staging, relative);
          if (!(destinationPath === staging || destinationPath.startsWith(`${staging}${path.sep}`))) throw failure('LOCAL_DEPENDENCY_OUTSIDE_PROJECT', `file dependency must stay inside the selected project: ${value}`);
          fs.cpSync(sourcePath, destinationPath, { recursive: true });
        }
        const install = spawnSync(npm.command, [...npm.prefix, 'ci', '--install-links', '--no-audit', '--no-fund'], { cwd: staging, env: selectedNodeEnvironment(), encoding: 'utf8', shell: false });
        if (install.stdout) process.stderr.write(install.stdout);
        if (install.stderr) process.stderr.write(install.stderr);
        if (install.status !== 0) throw failure('DEPENDENCY_INSTALL_FAILED', `npm ci exited ${install.status}; staging preserved at ${staging}`);
        publishDependencyCache(staging, root);
        for (const [name, value] of Object.entries(packageDependencies(project.manifest))) {
          if (typeof value !== 'string' || !value.startsWith('file:')) continue;
          const relative = value.slice('file:'.length);
          const link = path.join(root, 'node_modules', ...name.split('/'));
          const target = path.resolve(root, relative);
          if (!target.startsWith(`${root}${path.sep}`)) throw failure('LOCAL_DEPENDENCY_OUTSIDE_PROJECT', `file dependency must stay inside the selected project: ${value}`);
          if (fs.lstatSync(link).isSymbolicLink()) {
            fs.unlinkSync(link);
            fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
          }
        }
        fs.writeFileSync(markerPath, `${JSON.stringify({ identity, dependencyCacheProtocolVersion: HARNESS_CONTRACT.dependencyCacheProtocolVersion }, null, 2)}\n`);
      }
    } finally {
      release();
    }
  }
  const marker = readJson(markerPath);
  if (marker.identity !== identity || marker.dependencyCacheProtocolVersion !== HARNESS_CONTRACT.dependencyCacheProtocolVersion) throw failure('DEPENDENCY_CACHE_IDENTITY_MISMATCH', `dependency marker mismatch: ${root}`);
  return { identity, root, npmVersion: npmVersionResult.stdout.trim() };
}

function requireFile(file, code, label) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw failure(code, `${label} missing: ${file}`);
}

export function discoverNativeRequirements(dependencyRoot) {
  const checks = [
    ['esbuild/package.json', '@esbuild/win32-x64/esbuild.exe', 'NATIVE_ESBUILD_MISSING'],
    ['workerd/package.json', '@cloudflare/workerd-windows-64/bin/workerd.exe', 'NATIVE_WORKERD_MISSING'],
  ];
  for (const [sentinel, binary, code] of checks) {
    if (fs.existsSync(path.join(dependencyRoot, 'node_modules', sentinel))) requireFile(path.join(dependencyRoot, 'node_modules', binary), code, binary);
  }
  if (fs.existsSync(path.join(dependencyRoot, 'node_modules', 'rolldown', 'package.json'))) {
    const bindingDirectory = path.join(dependencyRoot, 'node_modules', '@rolldown', 'binding-win32-x64-msvc');
    if (!fs.existsSync(bindingDirectory) || !fs.readdirSync(bindingDirectory).some((name) => name.endsWith('.node'))) throw failure('NATIVE_ROLLDOWN_MISSING', `Rolldown x64 binding missing: ${bindingDirectory}`);
  }
}

export function verifyCapabilities(tool, dependencyRoot, command = null, cacheBase = path.dirname(dependencyRoot)) {
  const result = { environment: {}, pathPrepend: [], resources: [] };
  for (const capability of tool.capabilities ?? []) {
    const requiredForCommand = !command || !capability.commands || capability.commands.includes(command);
    if (capability.kind === 'java') {
      if (!requiredForCommand) continue;
      const resolution = resolveJavaRuntime(capability.minimumMajor);
      result.environment.JAVA_HOME = resolution.selected.home;
      result.pathPrepend.push(path.dirname(resolution.selected.executable));
      result.resources.push({ ...resolution.selected, discoveries: resolution.discoveries });
    }
    if (capability.kind === 'browser') {
      const browserEnvironment = playwrightEnvironment(cacheBase, dependencyRoot);
      Object.assign(result.environment, browserEnvironment.environment);
      if (!requiredForCommand) continue;
      const probe = `const{createRequire}=require('node:module');const r=createRequire(${JSON.stringify(path.join(dependencyRoot, 'package.json'))});const p=r('@playwright/test')[${JSON.stringify(capability.name)}].executablePath();process.stdout.write(p)`;
      const browser = commandResult(process.execPath, ['-e', probe], { env: { ...selectedNodeEnvironment(), ...result.environment } });
      const executable = browser.stdout.trim();
      if (browser.status !== 0 || !fs.existsSync(executable)) {
        const error = failure('BROWSER_RUNTIME_MISSING', `${capability.name} browser binary is not installed for the selected Playwright dependency`);
        error.discovery = { kind: 'browser', name: capability.name, expectedExecutable: executable || null, browsersPath: result.environment.PLAYWRIGHT_BROWSERS_PATH || 'default-user-cache', selection: browserEnvironment.selection };
        throw error;
      }
      result.resources.push({ kind: 'browser', name: capability.name, executable, browsersPath: result.environment.PLAYWRIGHT_BROWSERS_PATH || 'default-user-cache', selection: browserEnvironment.selection });
    }
  }
  return result;
}

function preflightTool(project, dependency, toolName, command = null, cacheBase) {
  const tool = assertToolDeclared(project, toolName);
  const entry = path.join(dependency.root, 'node_modules', ...tool.entry.split('/'));
  requireFile(entry, 'TOOL_ENTRYPOINT_MISSING', `${toolName} entrypoint`);
  discoverNativeRequirements(dependency.root);
  const capabilities = verifyCapabilities(tool, dependency.root, command, cacheBase);
  return { tool, entry, ...capabilities };
}

function mirrorRepository(destination) {
  fs.mkdirSync(destination, { recursive: true });
  if (process.platform === 'win32') {
    const copy = spawnSync('robocopy', [repositoryRoot, destination, '/MIR', '/XJ', '/R:2', '/W:1', '/XD', path.join(repositoryRoot, '.git'), path.join(repositoryRoot, 'node_modules')], { encoding: 'utf8', shell: false });
    if ((copy.status ?? 16) > 7) throw failure('SOURCE_MIRROR_FAILED', `robocopy exited ${copy.status}: ${(copy.stderr || copy.stdout || copy.error?.message || 'no diagnostics').trim().slice(-4000)}`);
    return;
  }
  fs.cpSync(repositoryRoot, destination, { recursive: true, filter: (source) => !['.git', 'node_modules'].includes(path.basename(source)) });
}

function linkDependencies(executionProjectRoot, dependencyRoot) {
  const destination = path.join(executionProjectRoot, 'node_modules');
  if (fs.existsSync(destination)) throw failure('EXECUTION_WORKSPACE_COLLISION', `execution node_modules already exists: ${destination}`);
  fs.symlinkSync(path.join(dependencyRoot, 'node_modules'), destination, process.platform === 'win32' ? 'junction' : 'dir');
}

function publishOutputs(tool, command, executionProjectRoot, projectRoot) {
  for (const relative of tool.publishedOutputsByCommand?.[command] ?? []) {
    const source = path.resolve(executionProjectRoot, relative);
    const destination = path.resolve(projectRoot, relative);
    if (!source.startsWith(`${executionProjectRoot}${path.sep}`) || !destination.startsWith(`${projectRoot}${path.sep}`)) throw failure('OUTPUT_PATH_INVALID', `published output escapes project: ${relative}`);
    if (!fs.existsSync(source)) throw failure('OUTPUT_MISSING', `successful tool did not create declared output: ${source}`);
    fs.cpSync(source, destination, { recursive: true, force: true });
  }
}

function evidencePath(cacheBase, runId) {
  const explicit = process.env.CODEX_HARNESS_EVIDENCE_FILE;
  const file = explicit ? path.resolve(explicit) : path.join(cacheBase, 'evidence', `${runId}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  return file;
}

function writeAtomically(file, content) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

function writeEvidence(file, evidence, announce = false) {
  writeAtomically(file, `${JSON.stringify(evidence, null, 2)}\n`);
  if (announce) process.stderr.write(`HARNESS_EVIDENCE ${file}\n`);
}

function newPhaseTimings() {
  return Object.fromEntries(EVIDENCE_PHASES.map((name) => [name, { status: 'not_started', startedAt: null, endedAt: null, durationMs: null }]));
}

function beginEvidencePhase(evidence, name, evidenceFile) {
  const phase = evidence.phaseTimings[name];
  if (phase.status !== 'not_started') return;
  phase.status = 'in_progress';
  phase.startedAt = evidenceTimestamp();
  evidence.lifecycle.updatedAt = phase.startedAt;
  writeEvidence(evidenceFile, evidence);
}

function endEvidencePhase(evidence, name, evidenceFile, status = 'completed') {
  const phase = evidence.phaseTimings[name];
  if (phase.status !== 'in_progress') return;
  phase.status = status;
  phase.endedAt = evidenceTimestamp();
  phase.durationMs = Math.max(0, Date.parse(phase.endedAt) - Date.parse(phase.startedAt));
  evidence.lifecycle.updatedAt = phase.endedAt;
  writeEvidence(evidenceFile, evidence);
}

function closeOpenEvidencePhases(evidence) {
  for (const name of EVIDENCE_PHASES) {
    const phase = evidence.phaseTimings[name];
    if (phase.status !== 'in_progress') continue;
    phase.status = 'aborted';
    phase.endedAt = evidenceTimestamp();
    phase.durationMs = Math.max(0, Date.parse(phase.endedAt) - Date.parse(phase.startedAt));
  }
}

function finalizeEvidence(file, evidence, project) {
  beginEvidencePhase(evidence, 'finalization', file);
  if (project) finalizeProtectedState(evidence, project);
  endEvidencePhase(evidence, 'finalization', file);
  evidence.lifecycle.status = 'final';
  evidence.lifecycle.finalizedAt = evidenceTimestamp();
  evidence.lifecycle.updatedAt = evidence.lifecycle.finalizedAt;
  writeEvidence(file, evidence);
}

function utf8SafeTail(buffer) {
  let start = 0;
  while (start < buffer.length && (buffer[start] & 0b11000000) === 0b10000000) start += 1;
  let end = start;
  while (end < buffer.length) {
    const leading = buffer[end];
    const width = leading < 0x80 ? 1 : (leading & 0b11100000) === 0b11000000 ? 2 : (leading & 0b11110000) === 0b11100000 ? 3 : (leading & 0b11111000) === 0b11110000 ? 4 : 1;
    if (end + width > buffer.length) break;
    end += width;
  }
  return buffer.subarray(start, end);
}

function appendTimeoutTail(current, chunk) {
  const combined = Buffer.concat([current, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
  return combined.subarray(Math.max(0, combined.length - TIMEOUT_OUTPUT_TAIL_BYTES));
}

function timeoutArtifactFailure(error) {
  return { code: 'TIMEOUT_OUTPUT_ARTIFACT_PUBLISH_FAILED', systemError: systemErrorDetails(error) };
}

export function publishTimeoutOutputArtifact(cacheBase, runId, result, { write = writeAtomically } = {}) {
  const stdout = utf8SafeTail(result.timeoutStdoutTail ?? Buffer.alloc(0));
  const stderr = utf8SafeTail(result.timeoutStderrTail ?? Buffer.alloc(0));
  const content = Buffer.concat([Buffer.from('--- stdout tail ---\n'), stdout, Buffer.from('\n--- stderr tail ---\n'), stderr]);
  const file = path.join(cacheBase, 'artifacts', `${runId}.tool-timeout.log`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    write(file, content);
    return {
      artifact: {
        path: file,
        sha256: hash(content),
        bytes: content.length,
        retainedTailBytes: { stdout: stdout.length, stderr: stderr.length },
      },
      failure: null,
    };
  } catch (error) {
    return { artifact: null, failure: timeoutArtifactFailure(error) };
  }
}

function attachRemediation(evidence, code, tool = evidence.invocation.tool) {
  if (!code) return;
  evidence.failureCode = code;
  evidence.remediation = remediationFor(code, evidence.invocation.project, tool);
}

function writeRemediation(remediation) {
  if (!remediation) return;
  process.stderr.write(`harness remediation: ${remediation.summary}\n`);
  for (const stage of HARNESS_CONTRACT.resolutionOrder) {
    for (const action of remediation.stages[stage]) process.stderr.write(`harness ${stage}: ${action}\n`);
  }
}

function forwardedResult(command, args, options) {
  return new Promise((resolve) => {
    const { timeout, inheritStdin = false, suppressStderrLine, ...spawnOptions } = options;
    const child = spawn(command, args, { ...spawnOptions, shell: false, stdio: [inheritStdin ? 'inherit' : 'ignore', 'pipe', 'pipe'] });
    let stdoutBytes = Buffer.alloc(0);
    let stderrBytes = Buffer.alloc(0);
    let pendingStderr = '';
    const suppressedStderrLines = [];
    let settled = false;
    let timedOut = false;
    let timeoutHandle = null;
    const append = (current, chunk) => {
      const combined = Buffer.concat([current, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      return combined.subarray(Math.max(0, combined.length - FORWARDED_OUTPUT_TAIL_BYTES));
    };
    const resultOutput = () => ({ stdout: utf8SafeTail(stdoutBytes).toString('utf8'), stderr: utf8SafeTail(stderrBytes).toString('utf8') });
    let timeoutStdoutTail = Buffer.alloc(0);
    let timeoutStderrTail = Buffer.alloc(0);
    child.stdout.on('data', (chunk) => { process.stdout.write(chunk); stdoutBytes = append(stdoutBytes, chunk); timeoutStdoutTail = appendTimeoutTail(timeoutStdoutTail, chunk); });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrBytes = append(stderrBytes, chunk);
      timeoutStderrTail = appendTimeoutTail(timeoutStderrTail, chunk);
      if (!suppressStderrLine) {
        process.stderr.write(chunk);
        return;
      }
      pendingStderr += text;
      const lines = pendingStderr.split(/(?<=\n)/u);
      pendingStderr = lines.pop() || '';
      for (const line of lines) {
        if (suppressStderrLine.test(line.trimEnd())) suppressedStderrLines.push(line.trimEnd());
        else process.stderr.write(line);
      }
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({ status: null, error, ...resultOutput(), timeoutStdoutTail, timeoutStderrTail, timedOut: false });
    });
    child.on('close', (status, signal) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (pendingStderr) {
        if (suppressStderrLine?.test(pendingStderr.trimEnd())) suppressedStderrLines.push(pendingStderr.trimEnd());
        else process.stderr.write(pendingStderr);
      }
      resolve({ status, signal, error: timedOut ? Object.assign(new Error('tool timed out'), { code: 'ETIMEDOUT' }) : null, ...resultOutput(), timeoutStdoutTail, timeoutStderrTail, timedOut, suppressedStderrLines });
    });
    if (timeout > 0) timeoutHandle = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      if (process.platform === 'win32' && Number.isInteger(child.pid) && child.pid > 0) {
        spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: false });
      } else {
        child.kill('SIGTERM');
      }
    }, timeout);
    timeoutHandle?.unref();
  });
}

function wslHelperPath(executionProjectRoot, executionRepositoryRoot) {
  return path.relative(executionProjectRoot, path.join(executionRepositoryRoot, 'scripts', 'harness', 'run-wsl-wrangler.mjs')).split(path.sep).join('/');
}

function wslPayload({ mode = 'run', toolArguments, version, manifestSha256, lockSha256 }) {
  const wslCacheRoot = process.env.CODEX_HARNESS_WSL_ROOT;
  return Buffer.from(JSON.stringify({
    mode,
    arguments: toolArguments,
    version,
    manifestSha256,
    lockSha256,
    sourceLockSha256: lockSha256,
    dependencyCacheProtocolVersion: HARNESS_CONTRACT.dependencyCacheProtocolVersion,
    ...(wslCacheRoot !== undefined ? { wslCacheRoot } : {}),
  }), 'utf8').toString('base64');
}

async function runWslWrangler(executionProjectRoot, executionRepositoryRoot, toolArguments, version, manifestSha256, lockSha256) {
  const helper = wslHelperPath(executionProjectRoot, executionRepositoryRoot);
  const payload = wslPayload({ toolArguments, version, manifestSha256, lockSha256 });
  const runtimeLine = /^HARNESS_WSL_RUNTIME [A-Za-z0-9+/=]+$/u;
  const result = await forwardedResult('wsl.exe', ['--cd', executionProjectRoot, '--', 'node', helper, payload], {
    cwd: repositoryRoot,
    env: process.env,
    timeout: 0,
    inheritStdin: true,
    suppressStderrLine: runtimeLine,
  });
  const metadataMatch = result.suppressedStderrLines?.join('\n').match(/^HARNESS_WSL_RUNTIME ([A-Za-z0-9+/=]+)$/mu);
  result.wslRuntimeMetadata = Boolean(metadataMatch);
  if (metadataMatch) result.harnessRuntime = JSON.parse(Buffer.from(metadataMatch[1], 'base64').toString('utf8'));
  return result;
}

function runWslDependencyDoctor(project, version, manifestSha256, lockSha256) {
  const helper = wslHelperPath(project.projectRoot, repositoryRoot);
  const payload = wslPayload({ mode: 'doctor', toolArguments: [], version, manifestSha256, lockSha256 });
  const result = commandResult('wsl.exe', ['--cd', project.projectRoot, '--', 'node', helper, payload], {
    cwd: repositoryRoot,
    env: process.env,
  });
  const runtimeLine = result.stderr?.match(/^HARNESS_WSL_RUNTIME ([A-Za-z0-9+/=]+)$/mu)?.[1];
  if (result.status !== 0) {
    const code = wslFailureCodeFromStderr(result.stderr) ?? 'WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING';
    const error = failure(code, `WSL Wrangler dependency-context doctor exited ${result.status}: ${(result.stderr || result.error?.message || 'no diagnostics').trim()}`);
    error.discovery = { kind: 'wsl', doctor: { status: result.status, stderr: result.stderr?.trim() || null } };
    throw error;
  }
  if (!runtimeLine) {
    const error = failure('WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING', 'WSL Wrangler dependency-context doctor returned no runtime metadata');
    error.discovery = { kind: 'wsl', doctor: { status: result.status, stdout: result.stdout?.trim() || null, stderr: result.stderr?.trim() || null } };
    throw error;
  }
  return JSON.parse(Buffer.from(runtimeLine, 'base64').toString('utf8'));
}

function discoverWslRuntime(toolName, project = null, verifyWranglerContext = false) {
  const status = commandResult('wsl.exe', ['--status']);
  if (status.status !== 0) {
    const error = failure('WSL_PREREQUISITE_MISSING', `WSL is required for ${toolName}`);
    error.discovery = { kind: 'wsl', status: status.status, node: null };
    throw error;
  }
  const helper = 'scripts/harness/run-wsl-wrangler.mjs';
  const node = commandResult('wsl.exe', ['--cd', repositoryRoot, '--', 'node', helper, '--probe']);
  if (node.status !== 0) {
    const error = failure('WSL_NODE_PREREQUISITE_MISSING', `Node is required inside the selected/default WSL distribution for ${toolName}`);
    error.discovery = { kind: 'wsl', status: status.status, node: { available: false, message: node.stderr.trim() || node.error?.message || 'unavailable' } };
    throw error;
  }
  let runtime;
  try {
    runtime = JSON.parse(node.stdout.trim());
  } catch {
    const error = failure('WSL_NODE_PREREQUISITE_MISSING', `WSL Node returned invalid discovery output for ${toolName}`);
    error.discovery = { kind: 'wsl', status: status.status, node: { available: true, response: node.stdout.trim() } };
    throw error;
  }
  if (!runtime.npmVersion) {
    const error = failure('WSL_NPM_PREREQUISITE_MISSING', `npm is required inside the selected/default WSL distribution for ${toolName}`);
    error.discovery = { kind: 'wsl', status: status.status, node: runtime };
    throw error;
  }
  if (verifyWranglerContext && toolName === 'wrangler') {
    const version = project.lock.packages['node_modules/wrangler'].version;
    const dependencyContext = runWslDependencyDoctor(project, version, contentHash(project.manifestRaw), contentHash(project.lockRaw));
    return { kind: 'wsl', ...runtime, dependencyCache: dependencyContext.dependencyCache };
  }
  return { kind: 'wsl', ...runtime };
}

async function main() {
  const invocationRaw = process.env.CODEX_HARNESS_INVOCATION_B64;
  if (!invocationRaw) throw failure('DISPATCH_PROTOCOL_MISSING', 'missing CODEX_HARNESS_INVOCATION_B64');
  const invocation = JSON.parse(Buffer.from(invocationRaw, 'base64').toString('utf8'));
  const cacheBase = path.resolve(process.env.CODEX_HARNESS_ROOT || path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'codex-harness-v3'));
  const runId = crypto.randomUUID();
  const evidenceFile = evidencePath(cacheBase, runId);
  let project = null;
  let source = null;
  const evidence = {
    harness: { name: HARNESS_CONTRACT.name, version: HARNESS_CONTRACT.version, protocolVersion: HARNESS_CONTRACT.protocolVersion },
    invocation: {
      command: invocation.mode === 'doctor'
        ? ['node', 'scripts/harness/run-tool.mjs', '--doctor', invocation.relativeProjectPath, ...invocation.toolArguments]
        : ['node', 'scripts/harness/run-tool.mjs', invocation.tool, invocation.relativeProjectPath, ...invocation.toolArguments],
      cwd: process.cwd(), project: invocation.relativeProjectPath, tool: invocation.tool, arguments: invocation.toolArguments,
    },
    source,
    runtime: { platform: process.platform, architecture: process.arch, nodeVersion: process.version, nodeAbi: process.versions.modules, executable: process.execPath },
    discovery: process.env.CODEX_HARNESS_X64_DISCOVERY_B64
      ? { x64Node: JSON.parse(Buffer.from(process.env.CODEX_HARNESS_X64_DISCOVERY_B64, 'base64').toString('utf8')) }
      : {},
    capabilities: [],
    dependencyCache: null,
    executionWorkspace: null,
    storage: { privateRoot: cacheBase, artifactRoot: path.join(cacheBase, 'artifacts'), sidecar: evidenceFile, access: 'owner-only-best-effort' },
    proof: proofFor(proofPhase(invocation)),
    protectedState: { before: null, after: null },
    lifecycle: { status: 'in_progress', startedAt: evidenceTimestamp(), updatedAt: null, finalizedAt: null },
    phaseTimings: newPhaseTimings(),
    exitCode: 2,
    classification: 'harness_preflight_failure',
    failureCode: null,
  };
  evidence.lifecycle.updatedAt = evidence.lifecycle.startedAt;
  writeEvidence(evidenceFile, evidence, true);
  let remediationTool = invocation.tool;
  try {
    project = projectContext(invocation.relativeProjectPath);
    evidence.protectedState.before = protectedProjectState(project);
    writeEvidence(evidenceFile, evidence);
    source = sourceIdentity();
    evidence.source = source;
    if (invocation.mode === 'doctor') {
      const requested = invocation.toolArguments.length ? invocation.toolArguments : toolNames.filter((name) => packageDependencies(project.manifest)[HARNESS_CONTRACT.tools[name].package]);
      remediationTool = requested[0] || 'doctor';
      for (const name of requested) if (!toolNames.includes(name)) throw failure('TOOL_UNSUPPORTED', `unsupported doctor capability: ${name}`);
      const windowsTools = requested.filter((name) => HARNESS_CONTRACT.tools[name]?.runtime === 'windows-x64');
      if (windowsTools.length) beginEvidencePhase(evidence, 'dependencyPreparation', evidenceFile);
      const dependency = windowsTools.length ? await ensureDependencies(project, cacheBase, source) : null;
      if (windowsTools.length) endEvidencePhase(evidence, 'dependencyPreparation', evidenceFile);
      beginEvidencePhase(evidence, 'capabilityPreparation', evidenceFile);
      if (dependency) for (const name of windowsTools) evidence.capabilities.push(...preflightTool(project, dependency, name, null, cacheBase).resources);
      const wslTools = requested.filter((name) => HARNESS_CONTRACT.tools[name]?.runtime === 'wsl');
      for (const name of wslTools) {
        assertToolDeclared(project, name);
        evidence.capabilities.push(discoverWslRuntime(name, project, true));
      }
      endEvidencePhase(evidence, 'capabilityPreparation', evidenceFile);
      evidence.dependencyCache = dependency ? { identity: dependency.identity, root: dependency.root, npmVersion: dependency.npmVersion } : null;
      evidence.exitCode = 0;
      evidence.classification = 'completed';
      finalizeEvidence(evidenceFile, evidence, project);
      process.stdout.write(`${JSON.stringify({ ok: evidence.classification === 'completed', project: invocation.relativeProjectPath, tools: requested, evidence: evidenceFile })}\n`);
      return evidence.exitCode;
    }

    const declaredTool = assertToolDeclared(project, invocation.tool);
    assertInvocationMode(invocation.tool, declaredTool, invocation.toolArguments);
    if (declaredTool.runtime === 'windows-x64') beginEvidencePhase(evidence, 'dependencyPreparation', evidenceFile);
    const dependency = declaredTool.runtime === 'windows-x64' ? await ensureDependencies(project, cacheBase, source) : null;
    if (declaredTool.runtime === 'windows-x64') endEvidencePhase(evidence, 'dependencyPreparation', evidenceFile);
    beginEvidencePhase(evidence, 'capabilityPreparation', evidenceFile);
    let prepared = null;
    if (dependency) prepared = preflightTool(project, dependency, invocation.tool, invocation.toolArguments[0], cacheBase);
    if (prepared) evidence.capabilities.push(...prepared.resources);
    if (declaredTool.runtime === 'wsl') evidence.capabilities.push(discoverWslRuntime(invocation.tool));
    endEvidencePhase(evidence, 'capabilityPreparation', evidenceFile);
    const executionRoot = path.join(cacheBase, 'runs', runId);
    let executionRepositoryRoot = repositoryRoot;
    let executionProjectRoot = project.projectRoot;
    if (declaredTool.sourceMode === 'snapshot') {
      executionRepositoryRoot = path.join(executionRoot, 'repository');
      beginEvidencePhase(evidence, 'sourceMirror', evidenceFile);
      mirrorRepository(executionRepositoryRoot);
      endEvidencePhase(evidence, 'sourceMirror', evidenceFile);
      executionProjectRoot = invocation.relativeProjectPath === '.' ? executionRepositoryRoot : path.join(executionRepositoryRoot, invocation.relativeProjectPath);
      if (dependency) linkDependencies(executionProjectRoot, dependency.root);
    } else {
      fs.mkdirSync(executionRoot, { recursive: true });
    }
    evidence.dependencyCache = dependency ? { identity: dependency.identity, root: dependency.root, npmVersion: dependency.npmVersion } : null;
    evidence.executionWorkspace = { identity: runId, mode: declaredTool.sourceMode, root: executionRoot, repository: executionRepositoryRoot, project: executionProjectRoot };
    process.stderr.write(`harness ${HARNESS_CONTRACT.version}: ${invocation.tool} project=${invocation.relativeProjectPath} run=${runId}\n`);
    beginEvidencePhase(evidence, 'toolExecution', evidenceFile);
    let result;
    if (declaredTool.runtime === 'wsl') {
      const version = project.lock.packages[`node_modules/${declaredTool.package}`].version;
      result = await runWslWrangler(executionProjectRoot, executionRepositoryRoot, invocation.toolArguments, version, contentHash(project.manifestRaw), contentHash(project.lockRaw));
    } else {
      const toolEnvironment = composeToolEnvironment(prepared);
      for (const [name, value] of Object.entries(declaredTool.environmentDefaultsByCommand?.[invocation.toolArguments[0]] ?? {})) {
        if (!toolEnvironment[name]) toolEnvironment[name] = value;
      }
      const configuredTimeout = Number(process.env.CODEX_HARNESS_TIMEOUT_MS);
      const timeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : HARNESS_CONTRACT.defaultSnapshotTimeoutMs;
      result = await forwardedResult(process.execPath, [prepared.entry, ...invocation.toolArguments], { cwd: executionProjectRoot, env: toolEnvironment, timeout });
    }
    const exitCode = result.timedOut ? 124 : (result.status ?? 1);
    if (result.harnessRuntime) {
      evidence.toolRuntime = result.harnessRuntime;
      if (result.harnessRuntime.dependencyCache) evidence.dependencyCache = result.harnessRuntime.dependencyCache;
    }
    endEvidencePhase(evidence, 'toolExecution', evidenceFile);
    if (exitCode === 0 && declaredTool.sourceMode === 'snapshot') publishOutputs(declaredTool, invocation.toolArguments[0], executionProjectRoot, project.projectRoot);
    evidence.exitCode = exitCode;
    evidence.proof.counts = proofCountsFromResult({
      tool: invocation.tool, phase: evidence.proof.phase, stdout: result.stdout, stderr: result.stderr, exitCode,
    });
    evidence.classification = classifyResult({
      error: result.error,
      exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      wslRuntimeMetadata: declaredTool.runtime === 'wsl' ? result.wslRuntimeMetadata : undefined,
    });
    const wslFailureCode = declaredTool.runtime === 'wsl' ? wslFailureCodeFromStderr(result.stderr) : null;
    if (result.timedOut) {
      attachRemediation(evidence, 'TOOL_TIMEOUT');
      const artifactPublication = publishTimeoutOutputArtifact(cacheBase, runId, result);
      evidence.timeoutOutputArtifact = artifactPublication.artifact;
      if (artifactPublication.failure) evidence.timeoutOutputArtifactFailure = artifactPublication.failure;
    }
    else if (wslFailureCode) attachRemediation(evidence, wslFailureCode);
    else if (evidence.classification === 'zero_tests_collected') attachRemediation(evidence, 'ZERO_TESTS_COLLECTED');
    else if (evidence.classification === 'harness_startup_failure') attachRemediation(evidence, 'TOOL_STARTUP_FAILED');
    finalizeEvidence(evidenceFile, evidence, project);
    writeRemediation(evidence.remediation);
    return evidence.failureCode === 'PROTECTED_STATE_CHANGED' ? 2 : exitCode;
  } catch (error) {
    attachRemediation(evidence, error.code || 'HARNESS_UNEXPECTED_FAILURE', remediationTool);
    evidence.message = error.message;
    if (error.dependencyCachePublication) evidence.dependencyCachePublication = error.dependencyCachePublication;
    if (error.discovery) evidence.discovery = mergeEvidenceDiscovery(evidence.discovery, error.discovery);
    if (evidence.executionWorkspace) evidence.classification = 'harness_transport_failure';
    closeOpenEvidencePhases(evidence);
    finalizeEvidence(evidenceFile, evidence, project);
    process.stderr.write(`harness preflight: ${evidence.failureCode}: ${error.message}\n`);
    writeRemediation(evidence.remediation);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main());
