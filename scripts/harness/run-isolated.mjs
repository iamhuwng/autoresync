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
const selectedNodeEnvironment = () => ({
  ...process.env,
  PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}`,
});

export function dependencyCacheIdentity(input) {
  return hash(JSON.stringify({
    harness: HARNESS_CONTRACT.version,
    protocol: HARNESS_CONTRACT.protocolVersion,
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

export function classifyResult({ error, exitCode, stderr = '', stdout = '' }) {
  if (error?.code === 'ETIMEDOUT') return 'harness_transport_failure';
  if (error) return 'harness_startup_failure';
  const combined = `${stdout}\n${stderr}`;
  if (/\bNo test files found\b|\bNo tests found\b/iu.test(combined)) return 'zero_tests_collected';
  if (/Unsupported platform:|Failed to start.+workerd|workerd.+failed to start/isu.test(combined)) return 'harness_startup_failure';
  return exitCode === 0 ? 'completed' : 'product_failure';
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

function gitValue(args, fallback = '', cwd = repositoryRoot) {
  const result = commandResult('git', args, { cwd });
  return result.status === 0 ? result.stdout.trim() : fallback;
}

export function sourceIdentity(root = repositoryRoot) {
  const commit = gitValue(['rev-parse', 'HEAD'], 'unavailable', root);
  const commonDirectory = path.resolve(root, gitValue(['rev-parse', '--git-common-dir'], '.git', root));
  const canonicalCommonDirectory = fs.existsSync(commonDirectory) ? fs.realpathSync.native(commonDirectory) : commonDirectory;
  const status = commandResult('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root });
  const fingerprint = crypto.createHash('sha256');
  const trackedDiff = commandResult('git', ['diff', '--binary', '--no-ext-diff', 'HEAD', '--'], { cwd: root, encoding: null });
  if (trackedDiff.status === 0 && trackedDiff.stdout) fingerprint.update(trackedDiff.stdout);
  const untracked = gitValue(['ls-files', '--others', '--exclude-standard', '-z'], '', root).split('\0').filter(Boolean).sort();
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
        fs.renameSync(staging, root);
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
        fs.writeFileSync(markerPath, `${JSON.stringify({ identity, contractVersion: HARNESS_CONTRACT.version }, null, 2)}\n`);
      }
    } finally {
      release();
    }
  }
  const marker = readJson(markerPath);
  if (marker.identity !== identity || marker.contractVersion !== HARNESS_CONTRACT.version) throw failure('DEPENDENCY_CACHE_IDENTITY_MISMATCH', `dependency marker mismatch: ${root}`);
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

export function verifyCapabilities(tool, dependencyRoot, command = null) {
  for (const capability of tool.capabilities ?? []) {
    if (command && capability.commands && !capability.commands.includes(command)) continue;
    if (capability.kind === 'java') {
      const java = commandResult('java', ['-version']);
      const versionText = `${java.stdout || ''}\n${java.stderr || ''}`;
      const major = Number(versionText.match(/version "(?:1\.)?(\d+)/u)?.[1]);
      if (java.status !== 0 || !Number.isFinite(major) || major < capability.minimumMajor) throw failure('JAVA_PREREQUISITE_MISSING', `Java ${capability.minimumMajor}+ is required; observed ${versionText.trim() || 'unavailable'}`);
    }
    if (capability.kind === 'browser') {
      const probe = `const{createRequire}=require('node:module');const r=createRequire(${JSON.stringify(path.join(dependencyRoot, 'package.json'))});const p=r('@playwright/test')[${JSON.stringify(capability.name)}].executablePath();process.stdout.write(p)`;
      const browser = commandResult(process.execPath, ['-e', probe]);
      if (browser.status !== 0 || !fs.existsSync(browser.stdout.trim())) throw failure('BROWSER_RUNTIME_MISSING', `${capability.name} browser binary is not installed for the selected Playwright dependency`);
    }
  }
}

function preflightTool(project, dependency, toolName, command = null) {
  const tool = assertToolDeclared(project, toolName);
  const entry = path.join(dependency.root, 'node_modules', ...tool.entry.split('/'));
  requireFile(entry, 'TOOL_ENTRYPOINT_MISSING', `${toolName} entrypoint`);
  discoverNativeRequirements(dependency.root);
  verifyCapabilities(tool, dependency.root, command);
  return { tool, entry };
}

function mirrorRepository(destination) {
  fs.mkdirSync(destination, { recursive: true });
  if (process.platform === 'win32') {
    const copy = spawnSync('robocopy', [repositoryRoot, destination, '/MIR', '/XJ', '/R:2', '/W:1', '/XD', path.join(repositoryRoot, '.git'), path.join(repositoryRoot, 'node_modules')], { stdio: 'ignore', shell: false });
    if ((copy.status ?? 16) > 7) throw failure('SOURCE_MIRROR_FAILED', `robocopy exited ${copy.status}`);
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
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

function writeEvidence(file, evidence) {
  fs.writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  process.stderr.write(`HARNESS_EVIDENCE ${file}\n`);
}

function attachRemediation(evidence, code, tool = evidence.invocation.tool) {
  if (!code) return;
  evidence.failureCode = code;
  evidence.remediation = remediationFor(code, evidence.invocation.project, tool);
}

function writeRemediation(remediation) {
  if (!remediation) return;
  process.stderr.write(`harness remediation: ${remediation.summary}\n`);
  for (const action of remediation.actions) process.stderr.write(`  - ${action}\n`);
  process.stderr.write(`harness verify: ${remediation.verify}\n`);
}

function forwardedResult(command, args, options) {
  return new Promise((resolve) => {
    const { timeout, inheritStdin = false, suppressStderrLine, ...spawnOptions } = options;
    const child = spawn(command, args, { ...spawnOptions, shell: false, stdio: [inheritStdin ? 'inherit' : 'ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let pendingStderr = '';
    const suppressedStderrLines = [];
    let settled = false;
    let timedOut = false;
    let timeoutHandle = null;
    const append = (current, chunk) => `${current}${chunk}`.slice(-4 * 1024 * 1024);
    child.stdout.on('data', (chunk) => { process.stdout.write(chunk); stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr = append(stderr, text);
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
      resolve({ status: null, error, stdout, stderr, timedOut: false });
    });
    child.on('close', (status, signal) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (pendingStderr) {
        if (suppressStderrLine?.test(pendingStderr.trimEnd())) suppressedStderrLines.push(pendingStderr.trimEnd());
        else process.stderr.write(pendingStderr);
      }
      resolve({ status, signal, error: timedOut ? Object.assign(new Error('tool timed out'), { code: 'ETIMEDOUT' }) : null, stdout, stderr, timedOut, suppressedStderrLines });
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

async function runWslWrangler(executionProjectRoot, executionRepositoryRoot, toolArguments, version) {
  const helper = path.relative(executionProjectRoot, path.join(executionRepositoryRoot, 'scripts', 'harness', 'run-wsl-wrangler.mjs')).split(path.sep).join('/');
  const payload = Buffer.from(JSON.stringify({ arguments: toolArguments, version, contractVersion: HARNESS_CONTRACT.version }), 'utf8').toString('base64');
  const runtimeLine = /^HARNESS_WSL_RUNTIME [A-Za-z0-9+/=]+$/u;
  const result = await forwardedResult('wsl.exe', ['--cd', executionProjectRoot, '--', 'node', helper, payload], {
    cwd: repositoryRoot,
    env: process.env,
    timeout: 0,
    inheritStdin: true,
    suppressStderrLine: runtimeLine,
  });
  const metadataMatch = result.suppressedStderrLines?.join('\n').match(/^HARNESS_WSL_RUNTIME ([A-Za-z0-9+/=]+)$/mu);
  if (metadataMatch) result.harnessRuntime = JSON.parse(Buffer.from(metadataMatch[1], 'base64').toString('utf8'));
  return result;
}

async function main() {
  const invocationRaw = process.env.CODEX_HARNESS_INVOCATION_B64;
  if (!invocationRaw) throw failure('DISPATCH_PROTOCOL_MISSING', 'missing CODEX_HARNESS_INVOCATION_B64');
  const invocation = JSON.parse(Buffer.from(invocationRaw, 'base64').toString('utf8'));
  const cacheBase = path.resolve(process.env.CODEX_HARNESS_ROOT || path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'codex-harness-v3'));
  const runId = crypto.randomUUID();
  const source = sourceIdentity();
  const project = projectContext(invocation.relativeProjectPath);
  const evidenceFile = evidencePath(cacheBase, runId);
  const evidence = {
    harness: { name: HARNESS_CONTRACT.name, version: HARNESS_CONTRACT.version, protocolVersion: HARNESS_CONTRACT.protocolVersion },
    invocation: {
      command: invocation.mode === 'doctor'
        ? ['node', 'scripts/harness/run-tool.mjs', '--doctor', invocation.relativeProjectPath, ...invocation.toolArguments]
        : ['node', 'scripts/harness/run-tool.mjs', invocation.tool, invocation.relativeProjectPath, ...invocation.toolArguments],
      cwd: process.cwd(), project: invocation.relativeProjectPath, tool: invocation.tool, arguments: invocation.toolArguments,
    },
    source,
    runtime: { platform: process.platform, architecture: process.arch, nodeVersion: process.version, nodeAbi: process.versions.modules },
    dependencyCache: null,
    executionWorkspace: null,
    exitCode: 2,
    classification: 'harness_preflight_failure',
    failureCode: null,
  };
  let remediationTool = invocation.tool;
  try {
    if (invocation.mode === 'doctor') {
      const requested = invocation.toolArguments.length ? invocation.toolArguments : toolNames.filter((name) => packageDependencies(project.manifest)[HARNESS_CONTRACT.tools[name].package]);
      remediationTool = requested[0] || 'doctor';
      for (const name of requested) if (!toolNames.includes(name)) throw failure('TOOL_UNSUPPORTED', `unsupported doctor capability: ${name}`);
      const windowsTools = requested.filter((name) => HARNESS_CONTRACT.tools[name]?.runtime === 'windows-x64');
      const dependency = windowsTools.length ? await ensureDependencies(project, cacheBase, source) : null;
      if (dependency) for (const name of windowsTools) preflightTool(project, dependency, name);
      const wslTools = requested.filter((name) => HARNESS_CONTRACT.tools[name]?.runtime === 'wsl');
      for (const name of wslTools) {
        assertToolDeclared(project, name);
        const status = commandResult('wsl.exe', ['--status']);
        if (status.status !== 0) throw failure('WSL_PREREQUISITE_MISSING', `WSL is required for ${name}`);
      }
      evidence.dependencyCache = dependency ? { identity: dependency.identity, root: dependency.root, npmVersion: dependency.npmVersion } : null;
      evidence.exitCode = 0;
      evidence.classification = 'completed';
      writeEvidence(evidenceFile, evidence);
      process.stdout.write(`${JSON.stringify({ ok: true, project: invocation.relativeProjectPath, tools: requested, evidence: evidenceFile })}\n`);
      return 0;
    }

    const declaredTool = assertToolDeclared(project, invocation.tool);
    assertInvocationMode(invocation.tool, declaredTool, invocation.toolArguments);
    const dependency = declaredTool.runtime === 'windows-x64' ? await ensureDependencies(project, cacheBase, source) : null;
    let prepared = null;
    if (dependency) prepared = preflightTool(project, dependency, invocation.tool, invocation.toolArguments[0]);
    if (declaredTool.runtime === 'wsl') {
      const status = commandResult('wsl.exe', ['--status']);
      if (status.status !== 0) throw failure('WSL_PREREQUISITE_MISSING', 'WSL is required for Wrangler');
    }
    const executionRoot = path.join(cacheBase, 'runs', runId);
    let executionRepositoryRoot = repositoryRoot;
    let executionProjectRoot = project.projectRoot;
    if (declaredTool.sourceMode === 'snapshot') {
      executionRepositoryRoot = path.join(executionRoot, 'repository');
      mirrorRepository(executionRepositoryRoot);
      executionProjectRoot = invocation.relativeProjectPath === '.' ? executionRepositoryRoot : path.join(executionRepositoryRoot, invocation.relativeProjectPath);
      if (dependency) linkDependencies(executionProjectRoot, dependency.root);
    } else {
      fs.mkdirSync(executionRoot, { recursive: true });
    }
    evidence.dependencyCache = dependency ? { identity: dependency.identity, root: dependency.root, npmVersion: dependency.npmVersion } : null;
    evidence.executionWorkspace = { identity: runId, mode: declaredTool.sourceMode, root: executionRoot, repository: executionRepositoryRoot, project: executionProjectRoot };
    process.stderr.write(`harness ${HARNESS_CONTRACT.version}: ${invocation.tool} project=${invocation.relativeProjectPath} run=${runId}\n`);
    let result;
    if (declaredTool.runtime === 'wsl') {
      const version = project.lock.packages[`node_modules/${declaredTool.package}`].version;
      result = await runWslWrangler(executionProjectRoot, executionRepositoryRoot, invocation.toolArguments, version);
    } else {
      const toolEnvironment = selectedNodeEnvironment();
      for (const [name, value] of Object.entries(declaredTool.environmentDefaultsByCommand?.[invocation.toolArguments[0]] ?? {})) {
        if (!toolEnvironment[name]) toolEnvironment[name] = value;
      }
      const configuredTimeout = Number(process.env.CODEX_HARNESS_TIMEOUT_MS);
      const timeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : HARNESS_CONTRACT.defaultSnapshotTimeoutMs;
      result = await forwardedResult(process.execPath, [prepared.entry, ...invocation.toolArguments], { cwd: executionProjectRoot, env: toolEnvironment, timeout });
    }
    const exitCode = result.timedOut ? 124 : (result.status ?? 1);
    if (result.harnessRuntime) evidence.toolRuntime = result.harnessRuntime;
    if (exitCode === 0 && declaredTool.sourceMode === 'snapshot') publishOutputs(declaredTool, invocation.toolArguments[0], executionProjectRoot, project.projectRoot);
    evidence.exitCode = exitCode;
    evidence.classification = classifyResult({ error: result.error, exitCode, stdout: result.stdout, stderr: result.stderr });
    if (result.timedOut) attachRemediation(evidence, 'TOOL_TIMEOUT');
    else if (evidence.classification === 'zero_tests_collected') attachRemediation(evidence, 'ZERO_TESTS_COLLECTED');
    else if (evidence.classification === 'harness_startup_failure') attachRemediation(evidence, 'TOOL_STARTUP_FAILED');
    writeEvidence(evidenceFile, evidence);
    writeRemediation(evidence.remediation);
    return exitCode;
  } catch (error) {
    attachRemediation(evidence, error.code || 'HARNESS_UNEXPECTED_FAILURE', remediationTool);
    evidence.message = error.message;
    if (evidence.executionWorkspace) evidence.classification = 'harness_transport_failure';
    writeEvidence(evidenceFile, evidence);
    process.stderr.write(`harness preflight: ${evidence.failureCode}: ${error.message}\n`);
    writeRemediation(evidence.remediation);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main());
