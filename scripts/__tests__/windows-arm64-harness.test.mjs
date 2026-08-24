import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import net from 'node:net';
import { HARNESS_CONTRACT, remediationFor, wranglerDependencyCacheIdentity } from '../harness/contract.mjs';
import {
  assertToolDeclared,
  assertDispatcherProtocol,
  assertInvocationMode,
  classifyResult,
  composeToolEnvironment,
  dependencyCacheIdentity,
  discoverNativeRequirements,
  mergeEvidenceDiscovery,
  playwrightEnvironment,
  projectContext,
  selectedNodeEnvironment,
  selectJavaRuntime,
  sourceIdentity,
  verifyCapabilities,
  proofPhase,
  proofCountsFromResult,
  publishDependencyCache,
  publishTimeoutOutputArtifact,
  protectedProjectState,
  wslFailureCodeFromStderr,
} from '../harness/run-isolated.mjs';
import { acquireWslWranglerInstallLock, cachedWranglerEnvironment, ensureWranglerCache, readWranglerDependencyContext, runCachedWrangler, withWranglerCacheLease, wranglerDependencyAliases, wslCacheRoot, wslWranglerLockOwner } from '../harness/run-wsl-wrangler.mjs';
import { assertActiveGenericSkill, assertRepositorySkillAuthority, repositoryAuthorityReport, skillSourcesFromPromptInput } from '../harness/skill-authority.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = path.join(repositoryRoot, 'scripts', 'harness', '__fixtures__');
process.env.CODEX_HARNESS_AUDIT = '1';

const run = (command, args, cwd, environment = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...environment }, shell: false });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (status) => resolve({ status, stdout, stderr }));
});

const git = (cwd, args) => execFileSync('git', args, {
  cwd,
  encoding: 'utf8',
  env: { ...process.env, GIT_AUTHOR_NAME: 'Harness Test', GIT_AUTHOR_EMAIL: 'harness@example.invalid', GIT_COMMITTER_NAME: 'Harness Test', GIT_COMMITTER_EMAIL: 'harness@example.invalid' },
});

const evidencePathFrom = (result) => {
  const file = result.stderr.match(/^HARNESS_EVIDENCE (.+)$/mu)?.[1];
  assert.ok(file, result.stderr);
  return file;
};

const evidenceFrom = (result) => JSON.parse(fs.readFileSync(evidencePathFrom(result), 'utf8'));

const finalEvidenceLifecycle = () => ({
  lifecycle: { status: 'final', startedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:02.000Z', finalizedAt: '2026-01-01T00:00:02.000Z' },
  phaseTimings: Object.fromEntries([
    ['dependencyPreparation', 'not_started'],
    ['sourceMirror', 'not_started'],
    ['capabilityPreparation', 'completed'],
    ['toolExecution', 'not_started'],
    ['finalization', 'completed'],
  ].map(([name, status]) => [name, status === 'not_started'
    ? { status, startedAt: null, endedAt: null, durationMs: null }
    : name === 'finalization'
      ? { status, startedAt: '2026-01-01T00:00:01.000Z', endedAt: '2026-01-01T00:00:02.000Z', durationMs: 1000 }
      : { status, startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:00:01.000Z', durationMs: 1000 }])),
});

const copyHarnessFixture = (destination) => {
  fs.mkdirSync(path.join(destination, 'scripts', 'harness'), { recursive: true });
  for (const name of ['contract.mjs', 'run-isolated.mjs', 'run-wsl-wrangler.mjs']) {
    fs.copyFileSync(path.join(repositoryRoot, 'scripts', 'harness', name), path.join(destination, 'scripts', 'harness', name));
  }
  fs.cpSync(path.join(fixtureRoot, 'synthetic-project'), path.join(destination, 'fixture-project'), { recursive: true });
};

const invokeSyntheticAt = (worktree, cacheRoot, marker, relativeProjectPath, toolArguments = ['value with spaces', '--equals=a=b', 'quote"roundtrip'], extraEnvironment = {}) => {
  const invocation = Buffer.from(JSON.stringify({
    harness: { name: HARNESS_CONTRACT.name, version: HARNESS_CONTRACT.version, protocolVersion: HARNESS_CONTRACT.protocolVersion },
    mode: 'run',
    tool: 'vite-node',
    relativeProjectPath,
    toolArguments,
  })).toString('base64');
  return run(process.execPath, [path.join(worktree, 'scripts', 'harness', 'run-isolated.mjs')], worktree, {
    CODEX_HARNESS_INVOCATION_B64: invocation,
    CODEX_HARNESS_ROOT: cacheRoot,
    EXPECTED_MARKER: marker,
    ...extraEnvironment,
  });
};

const invokeSynthetic = (worktree, cacheRoot, marker, toolArguments = ['value with spaces', '--equals=a=b', 'quote"roundtrip'], extraEnvironment = {}) => invokeSyntheticAt(worktree, cacheRoot, marker, 'fixture-project', toolArguments, extraEnvironment);

test('contract is executable, generic, and self-describing', () => {
  const output = execFileSync(process.execPath, [path.join(repositoryRoot, 'scripts/harness/run-tool.mjs'), '--contract'], { cwd: repositoryRoot, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), HARNESS_CONTRACT);
  assert.equal(HARNESS_CONTRACT.grammar.endsWith('<tool> <project> [...args]'), true);
  assert.equal(HARNESS_CONTRACT.tools.wrangler.runtime, 'wsl');
  assert.equal(HARNESS_CONTRACT.tools.playwright.capabilities[0].kind, 'browser');
  assert.equal(HARNESS_CONTRACT.tools.firebase.capabilities[0].minimumMajor, 21);
  assert.deepEqual(HARNESS_CONTRACT.tools.firebase.capabilities[0].commands, ['emulators:exec', 'emulators:start']);
  assert.deepEqual(HARNESS_CONTRACT.tools.playwright.capabilities[0].commands, ['test', 'show-report']);
  assert.deepEqual(HARNESS_CONTRACT.resolutionOrder, ['discover', 'reuse', 'adapt', 'install', 'verify']);
  assert.equal(HARNESS_CONTRACT.version, '4.0.1');
  assert.equal(HARNESS_CONTRACT.protocolVersion, 6);
  assert.equal(HARNESS_CONTRACT.dependencyCacheProtocolVersion, 3);
  assert.equal(HARNESS_CONTRACT.authority.genericSkill.name, 'run-windows-arm64-tools');
  assert.equal(HARNESS_CONTRACT.authority.genericSkill.revision, '4.0.0');
  assert.equal(HARNESS_CONTRACT.authority.repositoryGuidance.name, 'luyentap-windows-arm64-harness-contract');
  assert.equal(HARNESS_CONTRACT.authority.wsl.sourcePolicy, 'selected-windows-checkout');
  const repositoryGuidance = fs.readFileSync(path.join(repositoryRoot, HARNESS_CONTRACT.authority.repositoryGuidance.path), 'utf8');
  assert.match(repositoryGuidance, /^name: luyentap-windows-arm64-harness-contract$/mu);
  assert.match(remediationFor('BROWSER_RUNTIME_MISSING', 'web', 'playwright').stages.verify[0], /--doctor web playwright/u);
  assert.equal(wranglerDependencyCacheIdentity({ version: '4.0.0', nodeVersion: 'v22.17.1', nodeAbi: '127', architecture: 'x64', npmVersion: '10.9.2', manifestSha256: 'b'.repeat(64), lockSha256: 'a'.repeat(64) }), '4.0.0-nodev22.17.1-abi127-x64-npm10.9.2-manifestbbbbbbbbbbbb-lockaaaaaaaaaaaa-protocol3');
  for (const code of ['WSL_WRANGLER_CACHE_INVALID', 'WSL_WRANGLER_CACHE_INCOMPLETE', 'WSL_WRANGLER_INSTALL_FAILED', 'WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING', 'WSL_WRANGLER_PROTOCOL_INVALID']) {
    for (const stage of HARNESS_CONTRACT.resolutionOrder) assert.ok(remediationFor(code, 'cloudflare', 'wrangler').stages[stage].length, `${code} ${stage}`);
  }
});

test('repository skill authority rejects generic collisions and stale adapters', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-skill-authority-'));
  const adapter = path.join(temporary, HARNESS_CONTRACT.authority.repositoryGuidance.path);
  const writeSkill = (file, name) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `---\nname: ${name}\ndescription: focused test skill\n---\n`);
  };
  try {
    writeSkill(adapter, HARNESS_CONTRACT.authority.repositoryGuidance.name);
    assert.equal(assertRepositorySkillAuthority(temporary).repositoryGuidance.source, fs.realpathSync.native(adapter));
    const collision = path.join(temporary, '.agents', 'skills', 'collision', 'SKILL.md');
    writeSkill(collision, HARNESS_CONTRACT.authority.genericSkill.name);
    assert.throws(() => assertRepositorySkillAuthority(temporary), { code: 'HARNESS_CONTRACT_MISMATCH' });
    fs.rmSync(path.dirname(collision), { recursive: true, force: true });
    writeSkill(adapter, 'stale-repository-adapter');
    assert.throws(() => assertRepositorySkillAuthority(temporary), { code: 'HARNESS_CONTRACT_MISMATCH' });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('authority report and Codex prompt parsing expose one generic source and selected boundary', () => {
  const report = repositoryAuthorityReport(repositoryRoot, 'wrangler');
  assert.equal(report.authoritativeCheckoutRoot, repositoryRoot);
  assert.equal(report.selectedExecutionBoundary.runtime, 'wsl');
  assert.equal(report.selectedExecutionBoundary.sourceMode, 'live');
  assert.equal(report.selectedExecutionBoundary.auditSourceMode, 'live');
  assert.equal(report.selectedExecutionBoundary.wslRole, 'execution-substrate-only');
  const genericSource = path.join(os.tmpdir(), 'user-skills', 'run-windows-arm64-tools', 'SKILL.md');
  const promptInput = [{ content: [{ type: 'input_text', text: `<skills_instructions>\n- run-windows-arm64-tools: generic (file: ${genericSource})\n- luyentap-windows-arm64-harness-contract: repository (file: ${report.repositoryGuidance.source})\n</skills_instructions>` }] }];
  assert.deepEqual(skillSourcesFromPromptInput(promptInput, 'run-windows-arm64-tools'), [path.resolve(genericSource)]);
  assert.deepEqual(skillSourcesFromPromptInput(promptInput, 'luyentap-windows-arm64-harness-contract'), [report.repositoryGuidance.source]);
});

test('active generic skill selection fails closed on stale revision', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-generic-skill-revision-'));
  const source = path.join(temporary, 'run-windows-arm64-tools', 'SKILL.md');
  const writeRevision = (revision) => {
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, `---\nname: run-windows-arm64-tools\ndescription: generic test skill\nmetadata:\n  revision: "${revision}"\n---\n`);
  };
  try {
    writeRevision('4.0.0');
    assert.equal(assertActiveGenericSkill([source], repositoryRoot).revision, '4.0.0');
    writeRevision('1.0.0');
    assert.throws(() => assertActiveGenericSkill([source], repositoryRoot), { code: 'HARNESS_CONTRACT_MISMATCH' });
    assert.throws(() => assertActiveGenericSkill([source, source], repositoryRoot), { code: 'HARNESS_CONTRACT_MISMATCH' });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('dispatcher and isolated runner fail closed on generation mismatch', async () => {
  const valid = { harness: { name: HARNESS_CONTRACT.name, version: HARNESS_CONTRACT.version, protocolVersion: HARNESS_CONTRACT.protocolVersion } };
  assert.doesNotThrow(() => assertDispatcherProtocol(valid));
  for (const [name, value] of Object.entries({ name: 'borrowed-harness', version: '3.6.0', protocolVersion: 4 })) {
    assert.throws(() => assertDispatcherProtocol({ harness: { ...valid.harness, [name]: value } }), { code: 'DISPATCH_PROTOCOL_MISMATCH' });
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dispatch-mismatch-'));
  try {
    copyHarnessFixture(temporary);
    const invocation = Buffer.from(JSON.stringify({ mode: 'run', tool: 'vite-node', relativeProjectPath: 'fixture-project', toolArguments: [] })).toString('base64');
    const result = await run(process.execPath, [path.join(temporary, 'scripts', 'harness', 'run-isolated.mjs')], temporary, {
      CODEX_HARNESS_INVOCATION_B64: invocation,
      CODEX_HARNESS_ROOT: path.join(temporary, 'cache'),
    });
    assert.equal(result.status, 2);
    assert.equal(evidenceFrom(result).failureCode, 'DISPATCH_PROTOCOL_MISMATCH');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('doctor fails closed for unknown capabilities', async () => {
  const result = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/run-tool.mjs'), '--doctor', '.', 'unknown-capability'], repositoryRoot);
  assert.equal(result.status, 2);
  const evidence = evidenceFrom(result);
  assert.equal(evidence.classification, 'harness_preflight_failure');
  assert.equal(evidence.failureCode, 'TOOL_UNSUPPORTED');
  assert.equal(evidence.remediation.code, 'TOOL_UNSUPPORTED');
  assert.match(result.stderr, /harness remediation:/u);
  assert.match(result.stderr, /harness verify:/u);
  assert.deepEqual(evidence.invocation.command.slice(2, 5), ['--doctor', '.', 'unknown-capability']);
});

test('doctor remediation names the requested capability, not the dispatcher', async () => {
  const result = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/run-tool.mjs'), '--doctor', '.', 'wrangler'], repositoryRoot);
  assert.equal(result.status, 2);
  const evidence = evidenceFrom(result);
  assert.equal(evidence.failureCode, 'PROJECT_DEPENDENCY_MISSING');
  assert.match(evidence.remediation.stages.verify[0], /--doctor \. wrangler$/u);
});

test('invalid project context still has an attributable early evidence sidecar', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-early-sidecar-'));
  const cache = path.join(temporary, 'cache');
  try {
    copyHarnessFixture(temporary);
    const invocation = Buffer.from(JSON.stringify({ harness: { name: HARNESS_CONTRACT.name, version: HARNESS_CONTRACT.version, protocolVersion: HARNESS_CONTRACT.protocolVersion }, mode: 'run', tool: 'vite-node', relativeProjectPath: 'missing-project', toolArguments: [] })).toString('base64');
    const result = await run(process.execPath, [path.join(temporary, 'scripts', 'harness', 'run-isolated.mjs')], temporary, {
      CODEX_HARNESS_INVOCATION_B64: invocation,
      CODEX_HARNESS_ROOT: cache,
    });
    assert.equal(result.status, 2);
    const evidence = evidenceFrom(result);
    assert.equal(evidence.failureCode, 'PROJECT_CONTEXT_INVALID');
    assert.equal(evidence.lifecycle.status, 'final');
    assert.equal(evidence.source, null);
    assert.equal(evidence.protectedState.before, null);
    assert.equal(evidence.runtime.executable, process.execPath);
    assert.equal(evidence.invocation.project, 'missing-project');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('Java discovery reuses a compatible existing runtime after rejecting older candidates', () => {
  const probes = new Map([
    ['C:/jdk-17/bin/java.exe', { status: 0, stdout: '', stderr: 'openjdk version "17.0.12"' }],
    ['C:/jdk-21/bin/java.exe', { status: 0, stdout: '', stderr: 'openjdk version "21.0.4"' }],
  ]);
  const result = selectJavaRuntime([...probes.keys()], 21, (executable) => probes.get(executable));
  assert.equal(result.selected.executable, 'C:/jdk-21/bin/java.exe');
  assert.equal(result.selected.major, 21);
  assert.deepEqual(result.discoveries.map(({ major }) => major), [17, 21]);
  const environment = composeToolEnvironment({ environment: { JAVA_HOME: 'C:/jdk-21' }, pathPrepend: ['C:/jdk-21/bin'] }, { PATH: 'C:/node-x64;C:/Windows' });
  assert.equal(environment.JAVA_HOME, 'C:/jdk-21');
  assert.equal(environment.PATH, `C:/jdk-21/bin${path.delimiter}C:/node-x64;C:/Windows`);
});

test('x64 tool environment drops cross-architecture npm overrides', () => {
  const environment = selectedNodeEnvironment({ PATH: 'C:/host', npm_config_arch: 'arm64', NPM_CONFIG_PLATFORM: 'linux', npm_config_registry: 'https://registry.example' });
  assert.equal(environment.npm_config_arch, undefined);
  assert.equal(environment.NPM_CONFIG_PLATFORM, undefined);
  assert.equal(environment.npm_config_registry, 'https://registry.example');
});

test('Playwright cache adaptation cannot target repository dependencies', () => {
  const dependencyRoot = path.join(repositoryRoot, '.synthetic-dependencies');
  const cacheBase = path.join(os.tmpdir(), 'harness-browser-cache');
  assert.equal(playwrightEnvironment(cacheBase, dependencyRoot, '0').environment.PLAYWRIGHT_BROWSERS_PATH, path.join(cacheBase, 'browsers'));
  assert.equal(playwrightEnvironment(cacheBase, dependencyRoot, path.join(dependencyRoot, 'node_modules')).environment.PLAYWRIGHT_BROWSERS_PATH, path.join(cacheBase, 'browsers'));
  assert.equal(playwrightEnvironment(cacheBase, dependencyRoot, 'relative-cache').environment.PLAYWRIGHT_BROWSERS_PATH, path.join(cacheBase, 'browsers'));
});

test('cache identity invalidates on protocol, repository, project, Node ABI/version, npm, manifest, and lock changes', () => {
  const base = {
    dependencyCacheProtocolVersion: 1,
    repositoryIdentity: 'repo-a', project: '.', manifestSha256: 'manifest-a', lockSha256: 'lock-a',
    platform: 'win32', architecture: 'x64', nodeVersion: 'v22.1.0', nodeAbi: '127', npmVersion: '10.1.0',
  };
  const original = dependencyCacheIdentity(base);
  for (const [key, value] of Object.entries({ dependencyCacheProtocolVersion: 2, repositoryIdentity: 'repo-b', project: 'nested', manifestSha256: 'manifest-b', lockSha256: 'lock-b', architecture: 'arm64', nodeVersion: 'v24.0.0', nodeAbi: '137', npmVersion: '11.0.0' })) {
    assert.notEqual(dependencyCacheIdentity({ ...base, [key]: value }), original, key);
  }
  assert.equal(dependencyCacheIdentity({ ...base, harnessVersion: 'unrelated-skill-wording-change' }), original);
});

test('dirty fingerprint changes with tracked and untracked content, not only path names', () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-fingerprint-'));
  try {
    git(repository, ['init']);
    fs.writeFileSync(path.join(repository, 'tracked.txt'), 'base\n');
    git(repository, ['add', '.']);
    git(repository, ['commit', '-m', 'base']);
    fs.writeFileSync(path.join(repository, 'tracked.txt'), 'first\n');
    fs.writeFileSync(path.join(repository, 'untracked.txt'), 'alpha\n');
    const first = sourceIdentity(repository);
    fs.writeFileSync(path.join(repository, 'tracked.txt'), 'second\n');
    fs.writeFileSync(path.join(repository, 'untracked.txt'), 'beta\n');
    const second = sourceIdentity(repository);
    assert.equal(first.dirty, true);
    assert.equal(second.dirty, true);
    assert.notEqual(first.dirtyFingerprint, second.dirtyFingerprint);
  } finally {
    fs.rmSync(repository, { recursive: true, force: true });
  }
});

test('source provenance fails closed when Git cannot establish the checkout identity', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-no-git-'));
  try {
    assert.throws(() => sourceIdentity(temporary), { code: 'SOURCE_PROVENANCE_UNAVAILABLE' });
    assert.ok(HARNESS_CONTRACT.remediations.SOURCE_PROVENANCE_UNAVAILABLE);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('selected project owns dependency and lockfile resolution', () => {
  assert.throws(() => assertToolDeclared(projectContext('.'), 'wrangler'), { code: 'PROJECT_DEPENDENCY_MISSING' });
  const cloudflare = projectContext('cloudflare');
  assert.equal(assertToolDeclared(cloudflare, 'wrangler').package, 'wrangler');
  assert.equal(assertToolDeclared(cloudflare, 'vitest').package, 'vitest');
  assert.ok(cloudflare.lock.packages['node_modules/@cloudflare/vitest-pool-workers']);
});

test('capability checks fail before startup for missing native binary, browser, and Java', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-capabilities-'));
  try {
    fs.mkdirSync(path.join(temporary, 'node_modules', 'workerd'), { recursive: true });
    fs.writeFileSync(path.join(temporary, 'node_modules', 'workerd', 'package.json'), '{}');
    assert.throws(() => discoverNativeRequirements(temporary), { code: 'NATIVE_WORKERD_MISSING' });

    fs.mkdirSync(path.join(temporary, 'node_modules', '@playwright', 'test'), { recursive: true });
    fs.writeFileSync(path.join(temporary, 'package.json'), '{}');
    fs.writeFileSync(path.join(temporary, 'node_modules', '@playwright', 'test', 'package.json'), JSON.stringify({ name: '@playwright/test', version: '1.0.0', main: 'index.cjs' }));
    fs.writeFileSync(path.join(temporary, 'node_modules', '@playwright', 'test', 'index.cjs'), "module.exports={chromium:{executablePath(){return 'Z:/definitely/missing/chromium.exe'}}};\n");
    let browserError;
    assert.throws(() => {
      try { verifyCapabilities({ capabilities: [{ kind: 'browser', name: 'chromium' }] }, temporary); }
      catch (error) { browserError = error; throw error; }
    }, { code: 'BROWSER_RUNTIME_MISSING' });
    assert.equal(browserError.discovery.kind, 'browser');
    assert.doesNotThrow(() => verifyCapabilities({ capabilities: [{ kind: 'browser', name: 'chromium', commands: ['test'] }] }, temporary, 'install'));

    let javaError;
    assert.throws(() => {
      try { verifyCapabilities({ capabilities: [{ kind: 'java', minimumMajor: 999 }] }, temporary); }
      catch (error) { javaError = error; throw error; }
    }, { code: 'JAVA_PREREQUISITE_MISSING' });
    assert.equal(javaError.discovery.kind, 'java');
    assert.ok(Array.isArray(javaError.discovery.candidates));
    assert.doesNotThrow(() => verifyCapabilities({ capabilities: [{ kind: 'java', minimumMajor: 21, commands: ['emulators:exec'] }] }, temporary, 'deploy'));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('classifications separate zero collection, startup transport, product failure, and completion', () => {
  assert.equal(classifyResult({ exitCode: 1, stderr: 'No test files found' }), 'zero_tests_collected');
  assert.equal(classifyResult({ exitCode: 1, stderr: 'Unsupported platform: win32 arm64' }), 'harness_startup_failure');
  assert.equal(classifyResult({ exitCode: 2, stderr: 'HARNESS_WSL_FAILURE WSL_WRANGLER_INSTALL_FAILED' }), 'harness_startup_failure');
  assert.equal(classifyResult({ exitCode: 1, wslRuntimeMetadata: false }), 'harness_startup_failure');
  assert.equal(classifyResult({ exitCode: 1, stderr: 'AssertionError: expected true' }), 'product_failure');
  assert.equal(classifyResult({ exitCode: 0 }), 'completed');
  assert.equal(classifyResult({ error: new Error('spawn ENOENT'), exitCode: 1 }), 'harness_startup_failure');
  assert.equal(classifyResult({ error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), exitCode: 124 }), 'harness_transport_failure');
});

test('immutable dependency cache publication has a stable rename failure with raw structured system details', () => {
  let publication;
  assert.throws(() => {
    try {
      publishDependencyCache('C:/cache/staging', 'C:/cache/immutable', () => {
        throw Object.assign(new Error('access denied by test filesystem'), { code: 'EACCES', errno: -4092, syscall: 'rename', path: 'C:/cache/staging', dest: 'C:/cache/immutable' });
      });
    } catch (error) {
      publication = error;
      throw error;
    }
  }, { code: 'DEPENDENCY_CACHE_PUBLISH_FAILED' });
  assert.deepEqual(publication.dependencyCachePublication, {
    operation: 'staging_to_immutable_rename',
    staging: 'C:/cache/staging',
    immutableRoot: 'C:/cache/immutable',
    systemError: { name: 'Error', code: 'EACCES', message: 'access denied by test filesystem', errno: -4092, syscall: 'rename', path: 'C:/cache/staging', dest: 'C:/cache/immutable' },
  });
  const remediation = remediationFor('DEPENDENCY_CACHE_PUBLISH_FAILED', 'fixture-project', 'vite-node');
  for (const stage of HARNESS_CONTRACT.resolutionOrder) assert.ok(remediation.stages[stage].length, stage);
  assert.match(remediation.stages.adapt[0], /CODEX_HARNESS_ROOT/u);
});

test('timeout artifact publication failure remains secondary to TOOL_TIMEOUT', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-artifact-failure-'));
  try {
    const publication = publishTimeoutOutputArtifact(temporary, 'synthetic', {
      timeoutStdoutTail: Buffer.from('safe output'), timeoutStderrTail: Buffer.from('safe diagnostics'),
    }, {
      write: () => { throw Object.assign(new Error('simulated artifact publication failure'), { code: 'EACCES', syscall: 'rename' }); },
    });
    assert.equal(publication.artifact, null);
    assert.deepEqual(publication.failure, {
      code: 'TIMEOUT_OUTPUT_ARTIFACT_PUBLISH_FAILED',
      systemError: { name: 'Error', code: 'EACCES', message: 'simulated artifact publication failure', syscall: 'rename' },
    });
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('proof phases separate doctor, collection, and execution without inventing product counts', () => {
  assert.equal(proofPhase({ mode: 'doctor', tool: 'doctor', toolArguments: [] }), 'doctor');
  assert.equal(proofPhase({ mode: 'run', tool: 'playwright', toolArguments: ['test', '--list'] }), 'collection');
  assert.equal(proofPhase({ mode: 'run', tool: 'vitest', toolArguments: ['run', '--list'] }), 'execution');
  assert.equal(proofPhase({ mode: 'run', tool: 'vitest', toolArguments: ['run'] }), 'execution');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-protected-state-'));
  try {
    fs.writeFileSync(path.join(temporary, 'package.json'), '{}');
    fs.writeFileSync(path.join(temporary, 'package-lock.json'), '{}');
    const state = protectedProjectState({ manifestPath: path.join(temporary, 'package.json'), lockPath: path.join(temporary, 'package-lock.json'), projectRoot: temporary });
    assert.equal(state.packageJson.kind, 'file');
    assert.equal(state.packageLock.kind, 'file');
    assert.equal(state.nodeModules.kind, 'absent');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('proof counts parse only supported Playwright and Vitest summaries', () => {
  assert.deepEqual(
    proofCountsFromResult({ tool: 'playwright', phase: 'collection', stdout: 'Total: 7 tests in 3 files\n', stderr: '', exitCode: 0 }),
    { collected: 7, executed: 0, passed: 0, failed: 0, skipped: 0 },
  );
  assert.deepEqual(
    proofCountsFromResult({ tool: 'vitest', phase: 'execution', stdout: ' Tests  3 passed | 1 failed | 2 skipped\n', stderr: '', exitCode: 1 }),
    { collected: 6, executed: 6, passed: 3, failed: 1, skipped: 2 },
  );
  assert.deepEqual(
    proofCountsFromResult({ tool: 'playwright', phase: 'execution', stdout: '  4 passed (1.2s)\n  1 failed\n  2 skipped\n', stderr: '', exitCode: 1 }),
    { collected: 7, executed: 7, passed: 4, failed: 1, skipped: 2 },
  );
  assert.deepEqual(
    proofCountsFromResult({ tool: 'vitest', phase: 'execution', stdout: 'assertion: 4 passed\n', stderr: '', exitCode: 0 }),
    { collected: null, executed: null, passed: null, failed: null, skipped: null },
  );
});

test('evidence validator fails closed for commit, dirty-source, and collection/execution mismatches', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-validator-'));
  const sidecar = path.join(temporary, 'sidecar.json');
  const commit = 'a'.repeat(40);
  const protectedState = { packageJson: { kind: 'file', sha256: 'b'.repeat(64) }, packageLock: { kind: 'file', sha256: 'c'.repeat(64) }, nodeModules: { kind: 'absent' } };
  const evidence = { harness: { name: HARNESS_CONTRACT.name, version: HARNESS_CONTRACT.version, protocolVersion: HARNESS_CONTRACT.protocolVersion }, invocation: { cwd: temporary, project: '.', tool: 'playwright', command: ['node', 'scripts/harness/run-tool.mjs', 'playwright', '.', 'test', '--list'], arguments: ['test', '--list'] }, source: { commit, dirty: false, dirtyFingerprint: 'd'.repeat(64) }, proof: { phase: 'collection', counts: { collected: 1, executed: 0, passed: 0, failed: 0, skipped: 0 } }, protectedState: { before: protectedState, after: protectedState }, classification: 'completed', failureCode: null, exitCode: 0, ...finalEvidenceLifecycle() };
  try {
    fs.writeFileSync(sidecar, JSON.stringify(evidence));
    let result = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', 'e'.repeat(40), sidecar], repositoryRoot);
    assert.equal(result.status, 1); assert.match(result.stderr, /commit/u);
    evidence.source.commit = commit; evidence.source.dirty = true; fs.writeFileSync(sidecar, JSON.stringify(evidence));
    result = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', commit, '--expect-clean', sidecar], repositoryRoot);
    assert.equal(result.status, 1); assert.match(result.stderr, /dirty/u);
    evidence.source.dirty = false; evidence.lifecycle.status = 'in_progress'; evidence.lifecycle.finalizedAt = null; fs.writeFileSync(sidecar, JSON.stringify(evidence));
    result = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', commit, sidecar], repositoryRoot);
    assert.equal(result.status, 1); assert.match(result.stderr, /unfinished/u);
    Object.assign(evidence, finalEvidenceLifecycle());
    evidence.proof.phase = 'execution'; fs.writeFileSync(sidecar, JSON.stringify(evidence));
    result = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', commit, sidecar], repositoryRoot);
    assert.equal(result.status, 1); assert.match(result.stderr, /list-only/u);
    evidence.proof.phase = 'collection'; evidence.failureCode = 'TOOL_TIMEOUT'; fs.writeFileSync(sidecar, JSON.stringify(evidence));
    result = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', commit, sidecar], repositoryRoot);
    assert.equal(result.status, 1); assert.match(result.stderr, /completed evidence/u);
    evidence.classification = 'product_failure'; evidence.exitCode = 1; fs.writeFileSync(sidecar, JSON.stringify(evidence));
    result = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', commit, sidecar], repositoryRoot);
    assert.equal(result.status, 1); assert.match(result.stderr, /product_failure evidence/u);
    evidence.classification = 'completed'; evidence.exitCode = 0; evidence.failureCode = null;
    evidence.invocation = { cwd: temporary, project: '.', tool: 'vitest', command: ['node', 'scripts/harness/run-tool.mjs', 'vitest', '.', 'run'], arguments: ['run'] };
    evidence.proof = { phase: 'execution', counts: { collected: 2, executed: 2, passed: 1, failed: 0, skipped: 0 } }; fs.writeFileSync(sidecar, JSON.stringify(evidence));
    result = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', commit, sidecar], repositoryRoot);
    assert.equal(result.status, 1); assert.match(result.stderr, /internally inconsistent/u);
    evidence.proof.counts = { collected: null, executed: null, passed: null, failed: null, skipped: null };
    evidence.classification = 'harness_transport_failure'; evidence.failureCode = 'DEPENDENCY_CACHE_PUBLISH_FAILED'; evidence.exitCode = 2;
    evidence.dependencyCachePublication = { operation: 'staging_to_immutable_rename', staging: 'staging', immutableRoot: 'immutable', systemError: { code: '', message: '', syscall: '' } };
    fs.writeFileSync(sidecar, JSON.stringify(evidence));
    result = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', commit, sidecar], repositoryRoot);
    assert.equal(result.status, 1); assert.match(result.stderr, /cache publication facts/u);
    evidence.classification = 'harness_preflight_failure';
    evidence.dependencyCachePublication.systemError = { code: 'EACCES', message: 'access denied', syscall: 'rename' };
    fs.writeFileSync(sidecar, JSON.stringify(evidence));
    result = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', commit, sidecar], repositoryRoot);
    assert.equal(result.status, 0, result.stderr);
    evidence.classification = 'completed'; evidence.failureCode = null; evidence.exitCode = 0;
    fs.writeFileSync(sidecar, JSON.stringify(evidence));
    result = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', commit, sidecar], repositoryRoot);
    assert.equal(result.status, 1); assert.match(result.stderr, /publication facts are only valid/u);
    delete evidence.dependencyCachePublication;
    evidence.lifecycle.updatedAt = '2025-12-31T23:59:59.000Z';
    evidence.phaseTimings.capabilityPreparation.startedAt = '2025-12-31T23:59:59.000Z';
    evidence.phaseTimings.capabilityPreparation.endedAt = '2026-01-01T00:00:01.000Z';
    evidence.phaseTimings.capabilityPreparation.durationMs = 2000;
    fs.writeFileSync(sidecar, JSON.stringify(evidence));
    result = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', commit, sidecar], repositoryRoot);
    assert.equal(result.status, 1); assert.match(result.stderr, /terminal timestamps|outside lifecycle bounds/u);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('live Vite doctor distinguishes local context, missing dependencies, external links, and TCP from HTTP readiness', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-live-vite-'));
  const harness = path.join(temporary, 'scripts', 'harness');
  const project = path.join(temporary, 'project');
  const doctor = path.join(harness, 'live-vite-doctor.mjs');
  const runDoctor = (args, projectName = 'project') => run(process.execPath, [doctor, projectName, ...args], temporary);
  try {
    fs.mkdirSync(path.join(harness), { recursive: true });
    fs.copyFileSync(path.join(repositoryRoot, 'scripts/harness/live-vite-doctor.mjs'), doctor);
    fs.mkdirSync(path.join(project, 'node_modules', 'vite', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' }, devDependencies: { vite: '1.0.0' } }));
    fs.writeFileSync(path.join(project, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': { devDependencies: { vite: '1.0.0' } }, 'node_modules/vite': { version: '1.0.0' } } }));
    fs.writeFileSync(path.join(project, 'node_modules', 'vite', 'bin', 'vite.js'), "process.stdout.write('vite/1.0.0 win32-x64 node-v22\\n');");
    let result = await runDoctor([]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).vite.probe.version, '1.0.0');
    assert.equal(JSON.parse(result.stdout).dependency.insideProject, true);
    fs.writeFileSync(path.join(project, 'node_modules', 'vite', 'bin', 'vite.js'), "process.stdout.write('vite/1.0.1 win32-x64 node-v22\\n');");
    result = await runDoctor([]);
    assert.equal(result.status, 2); assert.match(result.stderr, /VITE_VERSION_MISMATCH/u);
    fs.writeFileSync(path.join(project, 'node_modules', 'vite', 'bin', 'vite.js'), "process.stdout.write('not a Vite version\\n');");
    result = await runDoctor([]);
    assert.equal(result.status, 2); assert.match(result.stderr, /VITE_VERSION_MISMATCH/u);
    fs.writeFileSync(path.join(project, 'node_modules', 'vite', 'bin', 'vite.js'), "process.stdout.write('vite/1.0.0 win32-x64 node-v22\\n');");
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ scripts: { dev: 'vite && echo unexpected' }, devDependencies: { vite: '1.0.0' } }));
    result = await runDoctor([]);
    assert.equal(result.status, 2); assert.match(result.stderr, /VITE_SCRIPT_ROUTE_INVALID/u);
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' }, devDependencies: { vite: '1.0.0' } }));
    fs.rmSync(path.join(project, 'node_modules'), { recursive: true, force: true });
    result = await runDoctor([]);
    assert.equal(result.status, 2); assert.match(result.stderr, /NODE_MODULES_MISSING/u);
    fs.mkdirSync(path.join(temporary, 'external', 'vite', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(temporary, 'external', 'vite', 'bin', 'vite.js'), "process.stdout.write('vite/1.0.0 win32-x64 node-v22\\n');");
    fs.symlinkSync(path.join(temporary, 'external'), path.join(project, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    result = await runDoctor([]);
    assert.equal(result.status, 2); assert.match(result.stderr, /DEPENDENCY_CONTEXT_EXTERNAL_LINK/u);
    fs.symlinkSync(path.join(temporary, 'external'), path.join(temporary, 'escaped-project'), process.platform === 'win32' ? 'junction' : 'dir');
    result = await runDoctor([], 'escaped-project');
    assert.equal(result.status, 2); assert.match(result.stderr, /PROJECT_CONTEXT_INVALID/u);
    fs.rmSync(path.join(project, 'node_modules'), { recursive: true, force: true });
    fs.mkdirSync(path.join(project, 'node_modules'));
    fs.symlinkSync(path.join(temporary, 'external', 'vite'), path.join(project, 'node_modules', 'vite'), process.platform === 'win32' ? 'junction' : 'dir');
    result = await runDoctor([]);
    assert.equal(result.status, 2); assert.match(result.stderr, /DEPENDENCY_CONTEXT_EXTERNAL_LINK/u);
    fs.rmSync(path.join(project, 'node_modules'), { recursive: true, force: true });
    fs.mkdirSync(path.join(project, 'node_modules', 'vite', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(project, 'node_modules', 'vite', 'bin', 'vite.js'), "process.stdout.write('vite/1.0.0 win32-x64 node-v22\\n');");
    result = await runDoctor(['--url', 'https://localhost:1/ready']);
    assert.equal(result.status, 2); assert.match(result.stderr, /URL_INVALID/u);
    assert.equal(JSON.parse(result.stdout).readiness.tcp.attempted, false);
    const server = http.createServer((_request, response) => { response.statusCode = 204; response.end(); });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    result = await runDoctor(['--url', `http://localhost:${port}/ready`]);
    const ready = JSON.parse(result.stdout).readiness;
    assert.equal(ready.tcp.ready, true); assert.equal(ready.http.ready, true);
    await new Promise((resolve) => server.close(resolve));
    result = await runDoctor(['--url', `http://localhost:${port}/ready`]);
    const unavailable = JSON.parse(result.stdout).readiness;
    assert.equal(result.status, 2);
    assert.equal(unavailable.tcp.ready, false); assert.equal(unavailable.http.attempted, false);
    assert.ok(JSON.parse(result.stdout).failureCodes.includes('LIVE_TCP_NOT_READY'));
    const resetServer = net.createServer((socket) => socket.destroy());
    await new Promise((resolve) => resetServer.listen(0, '127.0.0.1', resolve));
    const resetPort = resetServer.address().port;
    result = await runDoctor(['--url', `http://localhost:${resetPort}/ready`]);
    assert.equal(result.status, 2);
    const resetReadiness = JSON.parse(result.stdout);
    assert.equal(resetReadiness.readiness.tcp.ready, true);
    assert.equal(resetReadiness.readiness.http.attempted, true);
    assert.equal(resetReadiness.readiness.http.ready, false);
    assert.ok(resetReadiness.failureCodes.includes('LIVE_HTTP_NOT_READY'));
    await new Promise((resolve) => resetServer.close(resolve));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('WSL Wrangler locks serialize active owners, reclaim proven stale owners, and reject unprovable owners', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-wsl-lock-'));
  const activeLock = path.join(temporary, 'active.lock');
  const staleLock = path.join(temporary, 'stale.lock');
  const raceLock = path.join(temporary, 'race.lock');
  const legacyLock = path.join(temporary, 'legacy.lock');
  const owner = wslWranglerLockOwner(process.pid, '1');
  const processStartProbe = (processId) => processId === process.pid ? owner.startTime : null;
  try {
    fs.mkdirSync(activeLock);
    fs.writeFileSync(path.join(activeLock, '.harness-wrangler-lock.json'), `${JSON.stringify({ lockProtocolVersion: 1, owner })}\n`);
    await assert.rejects(acquireWslWranglerInstallLock(activeLock, { owner, timeoutMs: 0, processStartProbe }), { code: 'WSL_WRANGLER_LOCK_TIMEOUT' });
    assert.ok(fs.existsSync(activeLock), 'active lock remains owned by the live installer');

    fs.mkdirSync(staleLock);
    fs.writeFileSync(path.join(staleLock, '.harness-wrangler-lock.json'), `${JSON.stringify({ lockProtocolVersion: 1, owner: { processId: 99999999, startTime: '1' } })}\n`);
    const release = await acquireWslWranglerInstallLock(staleLock, { owner, processStartProbe });
    assert.ok(fs.existsSync(path.join(staleLock, '.harness-wrangler-lock.json')), 'proven stale lock was replaced by this owner');
    await release();
    assert.equal(fs.existsSync(staleLock), false);

    fs.mkdirSync(raceLock);
    fs.writeFileSync(path.join(raceLock, '.harness-wrangler-lock.json'), `${JSON.stringify({ lockProtocolVersion: 1, owner: { processId: 99999998, startTime: '1' } })}\n`);
    const firstOwner = { processId: process.pid, startTime: '2' };
    const secondOwner = { processId: process.pid + 1, startTime: '3' };
    const thirdOwner = { processId: process.pid + 2, startTime: '4' };
    const raceProbe = (processId) => processId === firstOwner.processId ? firstOwner.startTime : null;
    let guardedContender;
    const firstRelease = await acquireWslWranglerInstallLock(raceLock, {
      owner: firstOwner,
      processStartProbe: raceProbe,
      afterStaleReclaim: async () => {
        guardedContender = acquireWslWranglerInstallLock(raceLock, { owner: secondOwner, timeoutMs: 0, processStartProbe: raceProbe });
        await assert.rejects(guardedContender, { code: 'WSL_WRANGLER_LOCK_TIMEOUT' });
        assert.equal(fs.existsSync(raceLock), false, 'the guard hides main-lock creation until its marker is written');
      },
    });
    assert.ok(fs.existsSync(path.join(raceLock, '.harness-wrangler-lock.json')), 'main lock is published with its marker before another contender can inspect it');
    await assert.rejects(acquireWslWranglerInstallLock(raceLock, { owner: thirdOwner, timeoutMs: 0, processStartProbe: raceProbe }), { code: 'WSL_WRANGLER_LOCK_TIMEOUT' });
    const raceMarker = JSON.parse(fs.readFileSync(path.join(raceLock, '.harness-wrangler-lock.json'), 'utf8'));
    assert.deepEqual(raceMarker.owner, firstOwner, 'neither stale-reclaim contender deleted the newly acquired live lock');
    await firstRelease();

    fs.mkdirSync(legacyLock);
    await assert.rejects(acquireWslWranglerInstallLock(legacyLock, { owner, timeoutMs: 0, processStartProbe }), { code: 'WSL_WRANGLER_LOCK_UNPROVABLE' });
    assert.ok(fs.existsSync(legacyLock), 'legacy lock is not deleted');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('WSL cache-root adaptation is absolute Linux-only and capability discovery preserves x64 provenance', () => {
  assert.equal(wslCacheRoot('/tmp/codex-harness-wrangler'), '/tmp/codex-harness-wrangler');
  assert.throws(() => wslCacheRoot('relative-cache'), { code: 'WSL_WRANGLER_PROTOCOL_INVALID' });
  assert.throws(() => wslCacheRoot('C:\\cache'), { code: 'WSL_WRANGLER_PROTOCOL_INVALID' });
  assert.throws(() => wslCacheRoot('/'), { code: 'WSL_WRANGLER_PROTOCOL_INVALID' });
  assert.deepEqual(
    mergeEvidenceDiscovery({ x64Node: { selected: 'C:/node-x64/node.exe' } }, { kind: 'java', candidates: [] }),
    { x64Node: { selected: 'C:/node-x64/node.exe' }, kind: 'java', candidates: [] },
  );
});

test('WSL Wrangler execution leases protect a cache only for the live command', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-wsl-lease-'));
  try {
    let leaseDuringExecution = null;
    const result = withWranglerCacheLease(temporary, () => {
      leaseDuringExecution = fs.readdirSync(temporary).filter((name) => name.startsWith('.harness-wrangler-active-'));
      return 'completed';
    });
    assert.equal(result, 'completed');
    assert.equal(leaseDuringExecution.length, 1);
    assert.deepEqual(fs.readdirSync(temporary), []);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('WSL nested-package cache installs the selected lock and exposes it to a live Wrangler project', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-wsl-nested-context-'));
  const worktreeRoot = path.join(temporary, 'worktree');
  const projectRoot = path.join(worktreeRoot, 'cloudflare');
  const cacheRoot = `/tmp/harness-wsl-nested-context-${process.pid}-${Date.now()}`;
  const localCacheRoot = path.join(temporary, 'cache');
  const hashFile = (file) => crypto.createHash('sha256').update(fs.readFileSync(file).toString('utf8').replace(/\r\n/gu, '\n')).digest('hex');
  try {
    fs.mkdirSync(projectRoot, { recursive: true });
    const manifest = {
      name: 'synthetic-nested-wrangler-project',
      private: true,
      version: '1.0.0',
      type: 'module',
      devDependencies: {
        wrangler: '1.0.0',
        esbuild: '1.0.0',
        'synthetic-neutral-dependency': '1.0.0',
        '@synthetic/scoped-dependency': '1.0.0',
      },
      optionalDependencies: {
        'synthetic-optional-dependency': '1.0.0',
      },
    };
    const lock = {
      name: manifest.name,
      version: manifest.version,
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': { name: manifest.name, version: manifest.version, devDependencies: manifest.devDependencies },
        'node_modules/wrangler': { version: '1.0.0' },
        'node_modules/esbuild': { version: '1.0.0' },
        'node_modules/synthetic-neutral-dependency': { version: '1.0.0' },
        'node_modules/@synthetic/scoped-dependency': { version: '1.0.0' },
        'node_modules/synthetic-optional-dependency': { version: '1.0.0', optional: true },
      },
    };
    fs.writeFileSync(path.join(projectRoot, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(path.join(projectRoot, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
    const before = protectedProjectState({ manifestPath: path.join(projectRoot, 'package.json'), lockPath: path.join(projectRoot, 'package-lock.json'), projectRoot });
    assert.equal(before.nodeModules.kind, 'absent');
    assert.equal(fs.existsSync(path.join(worktreeRoot, 'node_modules')), false);
    const manifestSha256 = hashFile(path.join(projectRoot, 'package.json'));
    const lockSha256 = hashFile(path.join(projectRoot, 'package-lock.json'));
    const payload = { mode: 'run', arguments: [], version: '1.0.0', manifestSha256, lockSha256, sourceLockSha256: lockSha256, dependencyCacheProtocolVersion: HARNESS_CONTRACT.dependencyCacheProtocolVersion, wslCacheRoot: cacheRoot };
    let stagedContext;
    const dependencyCache = await ensureWranglerCache(payload, {
      nodeVersion: process.version,
      nodeAbi: process.versions.modules,
      architecture: process.arch,
      npmVersion: '10.0.0',
    }, {
      projectRoot,
      cacheRoot: localCacheRoot,
      acquireInstallLock: async () => async () => {},
      install: async (staging, _payload, context) => {
        stagedContext = context;
        assert.deepEqual(fs.readFileSync(path.join(staging, 'package.json')), fs.readFileSync(context.manifestPath));
        assert.deepEqual(fs.readFileSync(path.join(staging, 'package-lock.json')), fs.readFileSync(context.lockPath));
        const installPackage = (name, version, files) => {
          const packageRoot = path.join(staging, 'node_modules', ...name.split('/'));
          fs.mkdirSync(packageRoot, { recursive: true });
          fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name, version, main: 'index.cjs', ...(name === 'wrangler' ? { type: 'module', bin: { wrangler: 'bin/wrangler.js' } } : {}) }));
          for (const [relative, contents] of Object.entries(files ?? {})) {
            fs.mkdirSync(path.dirname(path.join(packageRoot, relative)), { recursive: true });
            fs.writeFileSync(path.join(packageRoot, relative), contents);
          }
        };
        installPackage('synthetic-neutral-dependency', '1.0.0', { 'index.cjs': 'module.exports = { source: __filename };\n' });
        installPackage('esbuild', '1.0.0', { 'index.cjs': 'module.exports = { source: __filename };\n' });
        installPackage('@synthetic/scoped-dependency', '1.0.0', { 'index.cjs': 'module.exports = { source: __filename };\n', 'subpath.cjs': 'module.exports = { source: __filename };\n' });
        fs.writeFileSync(path.join(staging, 'node_modules', '@synthetic', 'scoped-dependency', 'package.json'), JSON.stringify({ name: '@synthetic/scoped-dependency', version: '1.0.0', exports: { '.': './index.cjs', './subpath': './subpath.cjs' } }));
        installPackage('wrangler', '1.0.0', { 'bin/wrangler.js': [
          "import { createRequire } from 'node:module';",
          "const requireFromLiveProject = createRequire(`${process.cwd()}/package.json`);",
          "const neutral = requireFromLiveProject('synthetic-neutral-dependency');",
          "const esbuild = requireFromLiveProject('esbuild');",
          "process.stdout.write(JSON.stringify({ cwd: process.cwd(), neutral: neutral.source, esbuild: esbuild.source, arguments: process.argv.slice(2) }));",
          '',
        ].join('\n'), 'wrangler-dist/cli.js': [
          "import { readFileSync } from 'node:fs';",
          "export function experimental_readRawConfig({ config }) { return { rawConfig: JSON.parse(readFileSync(config, 'utf8')) }; }",
          '',
        ].join('\n') });
      },
    });
    assert.equal(stagedContext.manifestSha256, manifestSha256);
    assert.equal(stagedContext.lockSha256, lockSha256);
    assert.ok(fs.existsSync(path.join(dependencyCache.root, 'node_modules', 'synthetic-neutral-dependency', 'package.json')));
    assert.equal(fs.existsSync(path.join(dependencyCache.root, 'node_modules', 'synthetic-optional-dependency')), false, 'platform-optional dependency should not be required for cache completeness');
    assert.equal(cachedWranglerEnvironment(dependencyCache.root, { PATH: 'base-path' }).NODE_PATH, path.join(dependencyCache.root, 'node_modules'));
    assert.equal(cachedWranglerEnvironment(dependencyCache.root, { PATH: 'base-path' }).PATH, `${path.join(dependencyCache.root, 'node_modules', '.bin')}${path.delimiter}base-path`);
    const dependencyNames = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    fs.writeFileSync(path.join(projectRoot, 'wrangler.jsonc'), JSON.stringify({ alias: { unrelated: './replacement.js' } }));
    assert.deepEqual(
      wranglerDependencyAliases(dependencyCache.root, dependencyNames, ['deploy', '--alias', 'user-alias:/user-target'], projectRoot),
      ['--alias', `wrangler:${path.join(dependencyCache.root, 'node_modules', 'wrangler')}`, '--alias', `esbuild:${path.join(dependencyCache.root, 'node_modules', 'esbuild')}`, '--alias', `synthetic-neutral-dependency:${path.join(dependencyCache.root, 'node_modules', 'synthetic-neutral-dependency')}`, '--alias', `@synthetic/scoped-dependency:${path.join(dependencyCache.root, 'node_modules', '@synthetic', 'scoped-dependency')}`],
    );
    assert.deepEqual(
      wranglerDependencyAliases(dependencyCache.root, dependencyNames, ['versions', 'upload', '--config', 'wrangler.jsonc'], projectRoot),
      ['--alias', `wrangler:${path.join(dependencyCache.root, 'node_modules', 'wrangler')}`, '--alias', `esbuild:${path.join(dependencyCache.root, 'node_modules', 'esbuild')}`, '--alias', `synthetic-neutral-dependency:${path.join(dependencyCache.root, 'node_modules', 'synthetic-neutral-dependency')}`, '--alias', `@synthetic/scoped-dependency:${path.join(dependencyCache.root, 'node_modules', '@synthetic', 'scoped-dependency')}`],
    );
    assert.equal(wranglerDependencyAliases(dependencyCache.root, dependencyNames, ['deploy', '--alias', 'synthetic-neutral-dependency:/user-target'], projectRoot).includes('synthetic-neutral-dependency'), false, 'an explicit user alias key is not replaced');
    fs.writeFileSync(path.join(projectRoot, 'wrangler.jsonc'), JSON.stringify({ alias: { 'synthetic-neutral-dependency': './replacement.js' } }));
    assert.throws(() => wranglerDependencyAliases(dependencyCache.root, dependencyNames, ['deploy'], projectRoot), { code: 'WSL_WRANGLER_DEPENDENCY_CONTEXT_MISSING' });
    fs.rmSync(path.join(projectRoot, 'wrangler.jsonc'));
    const result = runCachedWrangler(dependencyCache.root, ['deploy', '--alias', 'user-alias:/user-target'], { cwd: projectRoot, stdio: 'pipe', baseEnvironment: { PATH: process.env.PATH }, dependencyNames });
    assert.equal(result.status, 0, result.stderr);
    const resolved = JSON.parse(result.stdout);
    assert.equal(resolved.cwd, projectRoot);
    assert.match(resolved.neutral, new RegExp(`${dependencyCache.root.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`));
    assert.match(resolved.esbuild, new RegExp(`${dependencyCache.root.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`));
    assert.deepEqual(resolved.arguments.slice(0, 3), ['deploy', '--alias', 'user-alias:/user-target']);
    const aliasPairs = resolved.arguments.reduce((pairs, argument, index) => {
      if (argument === '--alias') pairs.push(resolved.arguments[index + 1]);
      return pairs;
    }, []);
    assert.ok(aliasPairs.some((pair) => pair.startsWith(`synthetic-neutral-dependency:${dependencyCache.root}`)));
    assert.ok(aliasPairs.some((pair) => pair.startsWith(`@synthetic/scoped-dependency:${dependencyCache.root}`)));
    assert.equal(aliasPairs.some((pair) => pair.startsWith('@synthetic/scoped-dependency/subpath:')), false, 'subpath aliases are not synthesized without a proven Wrangler resolver contract');
    assert.equal(aliasPairs.some((pair) => pair.startsWith('user-alias:')), true, 'explicit user alias is preserved');
    const after = protectedProjectState({ manifestPath: path.join(projectRoot, 'package.json'), lockPath: path.join(projectRoot, 'package-lock.json'), projectRoot });
    assert.deepEqual(after, before);
    assert.equal(fs.existsSync(path.join(worktreeRoot, 'node_modules')), false);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    fs.rmSync(localCacheRoot, { recursive: true, force: true });
  }
});

test('WSL protocol-2 Wrangler-only caches cannot satisfy the new dependency context and are not deleted', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-wsl-old-protocol-'));
  const projectRoot = path.join(temporary, 'nested');
  const oldCacheRoot = `/tmp/harness-wsl-old-protocol-${process.pid}-${Date.now()}`;
  const staleCacheRoot = `/tmp/harness-wsl-stale-protocol-${process.pid}-${Date.now()}`;
  const oldCachePath = path.join(temporary, 'old-cache');
  const staleCachePath = path.join(temporary, 'stale-cache');
  const cleanupRoots = [oldCachePath, staleCachePath];
  try {
    fs.mkdirSync(projectRoot, { recursive: true });
    const manifest = { name: 'harness-wsl-old-protocol-project', private: true, version: '1.0.0', devDependencies: { wrangler: '4.0.0', 'synthetic-neutral-dependency': '1.0.0' } };
    const lock = { name: manifest.name, version: manifest.version, lockfileVersion: 3, packages: { '': { name: manifest.name, version: manifest.version, devDependencies: manifest.devDependencies }, 'node_modules/wrangler': { version: '4.0.0' }, 'node_modules/synthetic-neutral-dependency': { version: '1.0.0' } } };
    fs.writeFileSync(path.join(projectRoot, 'package.json'), `${JSON.stringify(manifest)}\n`);
    fs.writeFileSync(path.join(projectRoot, 'package-lock.json'), `${JSON.stringify(lock)}\n`);
    const context = readWranglerDependencyContext(projectRoot);
    const runtime = { nodeVersion: process.version, nodeAbi: process.versions.modules, architecture: process.arch, npmVersion: '10.0.0' };
    const payload = { mode: 'run', arguments: [], version: '4.0.0', manifestSha256: context.manifestSha256, lockSha256: context.lockSha256, sourceLockSha256: context.lockSha256, dependencyCacheProtocolVersion: HARNESS_CONTRACT.dependencyCacheProtocolVersion };
    const oldIdentity = wranglerDependencyCacheIdentity({ version: payload.version, nodeVersion: runtime.nodeVersion, nodeAbi: runtime.nodeAbi, architecture: runtime.architecture, npmVersion: runtime.npmVersion, manifestSha256: context.manifestSha256, lockSha256: context.lockSha256, dependencyCacheProtocolVersion: 2 });
    const oldRoot = path.join(oldCachePath, oldIdentity);
    fs.mkdirSync(path.join(oldRoot, 'node_modules', 'wrangler', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(oldRoot, 'node_modules', 'wrangler', 'package.json'), JSON.stringify({ name: 'wrangler', version: '4.0.0' }));
    fs.writeFileSync(path.join(oldRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), '');
    const oldMarker = { identity: oldIdentity, version: payload.version, nodeVersion: runtime.nodeVersion, nodeAbi: runtime.nodeAbi, architecture: runtime.architecture, npmVersion: runtime.npmVersion, manifestSha256: context.manifestSha256, lockSha256: context.lockSha256, sourceLockSha256: context.lockSha256, dependencyCacheProtocolVersion: 2 };
    fs.writeFileSync(path.join(oldRoot, '.harness-wrangler.json'), `${JSON.stringify(oldMarker)}\n`);
    let installCalls = 0;
    const install = async (staging) => {
      installCalls += 1;
      for (const [name, version] of [['wrangler', '4.0.0'], ['synthetic-neutral-dependency', '1.0.0']]) {
        const packageRoot = path.join(staging, 'node_modules', name);
        fs.mkdirSync(packageRoot, { recursive: true });
        fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name, version }));
      }
      fs.mkdirSync(path.join(staging, 'node_modules', 'wrangler', 'bin'), { recursive: true });
      fs.writeFileSync(path.join(staging, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), '');
    };
    await ensureWranglerCache({ ...payload, wslCacheRoot: oldCacheRoot }, runtime, { projectRoot, cacheRoot: oldCachePath, acquireInstallLock: async () => async () => {}, install });
    assert.equal(installCalls, 1, 'protocol-2 cache was not reused');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(oldRoot, '.harness-wrangler.json'), 'utf8')), oldMarker, 'old protocol cache was not modified or deleted');

    const newIdentity = wranglerDependencyCacheIdentity({ version: payload.version, nodeVersion: runtime.nodeVersion, nodeAbi: runtime.nodeAbi, architecture: runtime.architecture, npmVersion: runtime.npmVersion, manifestSha256: context.manifestSha256, lockSha256: context.lockSha256, dependencyCacheProtocolVersion: HARNESS_CONTRACT.dependencyCacheProtocolVersion });
    const staleRoot = path.join(staleCachePath, newIdentity);
    fs.mkdirSync(path.join(staleRoot, 'node_modules', 'wrangler', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(staleRoot, 'node_modules', 'wrangler', 'package.json'), JSON.stringify({ name: 'wrangler', version: '4.0.0' }));
    fs.writeFileSync(path.join(staleRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), '');
    const staleMarker = { ...oldMarker, identity: newIdentity };
    fs.writeFileSync(path.join(staleRoot, '.harness-wrangler.json'), `${JSON.stringify(staleMarker)}\n`);
    await assert.rejects(ensureWranglerCache({ ...payload, wslCacheRoot: staleCacheRoot }, runtime, { projectRoot, cacheRoot: staleCachePath, acquireInstallLock: async () => async () => {}, install }), { code: 'WSL_WRANGLER_CACHE_INVALID' });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(staleRoot, '.harness-wrangler.json'), 'utf8')), staleMarker, 'invalid protocol cache was deleted');
    await assert.rejects(ensureWranglerCache({ ...payload, dependencyCacheProtocolVersion: 2, wslCacheRoot: oldCacheRoot }, runtime, { projectRoot, cacheRoot: oldCachePath, acquireInstallLock: async () => async () => {}, install }), { code: 'WSL_WRANGLER_PROTOCOL_INVALID' });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(oldRoot, '.harness-wrangler.json'), 'utf8')), oldMarker, 'old dispatcher protocol changed the old cache');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    for (const root of cleanupRoots) fs.rmSync(root, { recursive: true, force: true });
  }
});

test('WSL cache ensure waits for its asynchronous lock release', async () => {
  const cacheRoot = `/tmp/harness-wsl-ensure-${process.pid}-${Date.now()}`;
  const localCacheRoot = path.join(os.tmpdir(), `harness-wsl-ensure-cache-${process.pid}-${Date.now()}`);
  const projectRoot = path.join(os.tmpdir(), `harness-wsl-ensure-project-${process.pid}-${Date.now()}`);
  const manifestPath = path.join(projectRoot, 'package.json');
  const lockPath = path.join(projectRoot, 'package-lock.json');
  const manifest = { name: 'harness-wsl-ensure-project', private: true, version: '1.0.0', devDependencies: { wrangler: '4.0.0' } };
  const lock = { name: manifest.name, version: manifest.version, lockfileVersion: 3, packages: { '': { name: manifest.name, version: manifest.version, devDependencies: manifest.devDependencies }, 'node_modules/wrangler': { version: '4.0.0' } } };
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  fs.writeFileSync(lockPath, `${JSON.stringify(lock)}\n`);
  const hashFile = (file) => crypto.createHash('sha256').update(fs.readFileSync(file).toString('utf8').replace(/\r\n/gu, '\n')).digest('hex');
  let releaseStarted;
  const releaseStartedPromise = new Promise((resolve) => { releaseStarted = resolve; });
  let allowRelease;
  const allowReleasePromise = new Promise((resolve) => { allowRelease = resolve; });
  let releaseFinished = false;
  try {
    const ensured = ensureWranglerCache({
      version: '4.0.0', manifestSha256: hashFile(manifestPath), lockSha256: hashFile(lockPath), sourceLockSha256: hashFile(lockPath), dependencyCacheProtocolVersion: HARNESS_CONTRACT.dependencyCacheProtocolVersion, wslCacheRoot: cacheRoot,
    }, { nodeVersion: process.version, nodeAbi: process.versions.modules, architecture: process.arch, npmVersion: '10.0.0' }, {
      projectRoot,
      cacheRoot: localCacheRoot,
      acquireInstallLock: async () => async () => {
        releaseStarted();
        await allowReleasePromise;
        releaseFinished = true;
      },
      install: async (staging) => {
        fs.mkdirSync(path.join(staging, 'node_modules', 'wrangler', 'bin'), { recursive: true });
        fs.writeFileSync(path.join(staging, 'node_modules', 'wrangler', 'package.json'), JSON.stringify({ name: 'wrangler', version: '4.0.0' }));
        fs.writeFileSync(path.join(staging, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), '');
      },
    });
    await releaseStartedPromise;
    let settled = false;
    void ensured.then(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, false, 'ensure remains pending until release resolves');
    allowRelease();
    await ensured;
    assert.equal(releaseFinished, true);
  } finally {
    fs.rmSync(localCacheRoot, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('WSL helper failures retain their specific remediation code', () => {
  const code = wslFailureCodeFromStderr('HARNESS_WSL_FAILURE WSL_WRANGLER_LOCK_UNPROVABLE: legacy lock');
  assert.equal(code, 'WSL_WRANGLER_LOCK_UNPROVABLE');
  assert.equal(classifyResult({ exitCode: 2, stderr: 'HARNESS_WSL_FAILURE WSL_WRANGLER_LOCK_UNPROVABLE: legacy lock', wslRuntimeMetadata: false }), 'harness_startup_failure');
  assert.equal(remediationFor(code, 'cloudflare', 'wrangler').code, code);
});

test('snapshot harness rejects live watchers while WSL Wrangler keeps live worktree source', () => {
  assert.throws(() => assertInvocationMode('vite', HARNESS_CONTRACT.tools.vite, []), { code: 'LIVE_WORKLOAD_REQUIRES_CHECKOUT' });
  assert.throws(() => assertInvocationMode('vite', HARNESS_CONTRACT.tools.vite, ['dev']), { code: 'LIVE_WORKLOAD_REQUIRES_CHECKOUT' });
  assert.throws(() => assertInvocationMode('vitest', HARNESS_CONTRACT.tools.vitest, ['watch']), { code: 'LIVE_WORKLOAD_REQUIRES_CHECKOUT' });
  assert.doesNotThrow(() => assertInvocationMode('vite', HARNESS_CONTRACT.tools.vite, ['build']));
  assert.doesNotThrow(() => assertInvocationMode('vitest', HARNESS_CONTRACT.tools.vitest, ['run']));
  assert.equal(HARNESS_CONTRACT.tools.wrangler.normalSourceMode, 'live');
  assert.equal(HARNESS_CONTRACT.tools.wrangler.auditSourceMode, 'live');
});

test('ordinary harness execution preserves selected-project dependency metadata', { timeout: 30_000 }, async () => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-protected-node-modules-'));
  const project = path.join(container, 'project');
  const cache = path.join(container, 'cache');
  try {
    fs.mkdirSync(project);
    copyHarnessFixture(project);
    fs.cpSync(path.join(fixtureRoot, 'synthetic-project'), project, { recursive: true });
    fs.writeFileSync(path.join(project, '.gitignore'), 'node_modules\n');
    git(project, ['init']);
    git(project, ['add', '.']);
    git(project, ['commit', '-m', 'base']);
    fs.mkdirSync(path.join(project, 'node_modules'));
    const unchanged = await invokeSyntheticAt(project, cache, 'base', '.');
    assert.equal(unchanged.status, 0, unchanged.stderr);
    const evidence = evidenceFrom(unchanged);
    assert.deepEqual(evidence.protectedState.before, evidence.protectedState.after);
    assert.equal(evidence.protectedState.before.nodeModules.kind, 'directory');
  } finally { fs.rmSync(container, { recursive: true, force: true }); }
});

test('parallel worktrees share immutable dependencies but use attributable isolated execution workspaces', { timeout: 120_000 }, async () => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'harness integration with spaces-'));
  const primary = path.join(container, 'primary checkout');
  const secondary = path.join(container, 'secondary checkout');
  const cache = path.join(container, 'shared cache');
  try {
    fs.mkdirSync(primary);
    copyHarnessFixture(primary);
    git(primary, ['init']);
    git(primary, ['add', '.']);
    git(primary, ['commit', '-m', 'base']);
    fs.writeFileSync(path.join(primary, 'fixture-project', 'source-marker.txt'), 'alpha\n');
    git(primary, ['add', '.']);
    git(primary, ['commit', '-m', 'alpha']);
    git(primary, ['branch', 'beta', 'HEAD~1']);
    git(primary, ['worktree', 'add', secondary, 'beta']);
    fs.writeFileSync(path.join(secondary, 'fixture-project', 'source-marker.txt'), 'beta\n');
    git(secondary, ['add', '.']);
    git(secondary, ['commit', '-m', 'beta']);

    const [alpha, beta] = await Promise.all([
      invokeSynthetic(primary, cache, 'alpha'),
      invokeSynthetic(secondary, cache, 'beta'),
    ]);
    assert.equal(alpha.status, 0, alpha.stderr);
    assert.equal(beta.status, 0, beta.stderr);
    assert.deepEqual(JSON.parse(alpha.stdout), { marker: 'alpha', arguments: ['value with spaces', '--equals=a=b', 'quote"roundtrip'] });
    assert.deepEqual(JSON.parse(beta.stdout), { marker: 'beta', arguments: ['value with spaces', '--equals=a=b', 'quote"roundtrip'] });
    assert.equal(alpha.stdout.split('\n').filter(Boolean).length, 1, 'stdout contains only tool output');
    assert.equal(beta.stdout.split('\n').filter(Boolean).length, 1, 'stdout contains only tool output');

    const alphaEvidence = evidenceFrom(alpha);
    const betaEvidence = evidenceFrom(beta);
    assert.equal(alphaEvidence.dependencyCache.identity, betaEvidence.dependencyCache.identity, JSON.stringify({ alpha: alphaEvidence.source, beta: betaEvidence.source }, null, 2));
    assert.notEqual(alphaEvidence.executionWorkspace.identity, betaEvidence.executionWorkspace.identity);
    assert.notEqual(alphaEvidence.executionWorkspace.repository, betaEvidence.executionWorkspace.repository);
    assert.notEqual(alphaEvidence.source.commit, betaEvidence.source.commit);
    assert.equal(alphaEvidence.classification, 'completed');
    assert.equal(betaEvidence.classification, 'completed');
    assert.equal(alphaEvidence.harness.version, HARNESS_CONTRACT.version);
    assert.equal(alphaEvidence.invocation.project, 'fixture-project');
    assert.equal(alphaEvidence.runtime.nodeAbi, process.versions.modules);
    assert.equal(typeof alphaEvidence.source.dirtyFingerprint, 'string');
    assert.equal(alphaEvidence.exitCode, 0);
    assert.equal(alphaEvidence.lifecycle.status, 'final');
    for (const name of ['dependencyPreparation', 'capabilityPreparation', 'sourceMirror', 'toolExecution', 'finalization']) {
      assert.equal(alphaEvidence.phaseTimings[name].status, 'completed', name);
      assert.ok(Number.isInteger(alphaEvidence.phaseTimings[name].durationMs), name);
    }
    const accepted = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', alphaEvidence.source.commit, evidencePathFrom(alpha)], repositoryRoot);
    assert.equal(accepted.status, 0, accepted.stderr);

    const zero = await invokeSynthetic(primary, cache, 'alpha', ['--simulate-zero']);
    const startup = await invokeSynthetic(primary, cache, 'alpha', ['--simulate-startup']);
    const product = await invokeSynthetic(primary, cache, 'alpha', ['--simulate-product']);
    const timeout = await invokeSynthetic(primary, cache, 'alpha', ['--simulate-timeout'], { CODEX_HARNESS_TIMEOUT_MS: '300' });
    assert.equal(evidenceFrom(zero).classification, 'zero_tests_collected');
    assert.equal(evidenceFrom(startup).classification, 'harness_startup_failure');
    assert.equal(evidenceFrom(product).classification, 'product_failure');
    assert.equal(timeout.status, 124);
    assert.equal(evidenceFrom(timeout).classification, 'harness_transport_failure');
    assert.equal(evidenceFrom(timeout).failureCode, 'TOOL_TIMEOUT');
    assert.equal(evidenceFrom(zero).remediation.code, 'ZERO_TESTS_COLLECTED');
    assert.equal(evidenceFrom(startup).remediation.code, 'TOOL_STARTUP_FAILED');
    assert.equal(evidenceFrom(timeout).remediation.code, 'TOOL_TIMEOUT');
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
});

test('timeout evidence publishes a bounded hashed output artifact while preserving tool stdout', { timeout: 30_000 }, async () => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-timeout-artifact-'));
  const worktree = path.join(container, 'worktree');
  const cache = path.join(container, 'cache');
  try {
    fs.mkdirSync(worktree);
    copyHarnessFixture(worktree);
    fs.writeFileSync(path.join(worktree, 'fixture-project', 'fake-vite-node', 'vite-node.mjs'), `import fs from 'node:fs';
import path from 'node:path';
if (process.argv.includes('--simulate-timeout')) {
  process.stdout.write('OUT' + '€'.repeat(100000));
  process.stderr.write('ERR' + '€'.repeat(100000));
  setInterval(() => {}, 1000);
} else {
  process.stdout.write(JSON.stringify({ marker: fs.readFileSync(path.join(process.cwd(), 'source-marker.txt'), 'utf8').trim(), arguments: process.argv.slice(2) }) + '\\n');
}
`);
    git(worktree, ['init']);
    git(worktree, ['add', '.']);
    git(worktree, ['commit', '-m', 'timeout fixture']);
    const result = await invokeSynthetic(worktree, cache, 'base', ['--simulate-timeout'], { CODEX_HARNESS_TIMEOUT_MS: '300' });
    assert.equal(result.status, 124, result.stderr);
    assert.match(result.stdout, /^OUT/u);
    assert.doesNotMatch(result.stdout, /HARNESS_EVIDENCE|harness remediation|harness preflight/u);
    const evidence = evidenceFrom(result);
    assert.equal(evidence.lifecycle.status, 'final');
    assert.equal(evidence.failureCode, 'TOOL_TIMEOUT');
    assert.ok(evidence.timeoutOutputArtifact);
    const artifact = evidence.timeoutOutputArtifact;
    const artifactContent = fs.readFileSync(artifact.path);
    assert.equal(crypto.createHash('sha256').update(artifactContent).digest('hex'), artifact.sha256);
    assert.equal(artifact.bytes, artifactContent.length);
    assert.ok(artifact.retainedTailBytes.stdout <= 256 * 1024);
    assert.ok(artifact.retainedTailBytes.stderr <= 256 * 1024);
    assert.ok(artifact.bytes <= (2 * 256 * 1024) + 64);
    assert.equal(JSON.stringify(evidence).includes('OUTOUTOUT'), false, 'the sidecar references output without embedding it');
    assert.equal(artifactContent.toString('utf8').includes('\uFFFD'), false, 'bounded raw byte tails preserve complete UTF-8 characters');
    const validation = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', evidence.source.commit, evidencePathFrom(result)], repositoryRoot);
    assert.equal(validation.status, 0, validation.stderr);
    const receipt = JSON.parse(validation.stdout).sidecars[0].authoritative;
    assert.deepEqual(receipt.timeoutOutputArtifact, artifact);
    assert.deepEqual(receipt.lifecycle, evidence.lifecycle);
    assert.deepEqual(receipt.phaseTimings, evidence.phaseTimings);
    assert.deepEqual(receipt.storage, evidence.storage);
    const sidecarPath = evidencePathFrom(result);
    const originalSidecar = fs.readFileSync(sidecarPath, 'utf8');
    const originalArtifactPath = evidence.timeoutOutputArtifact.path;
    evidence.timeoutOutputArtifact.path = path.join(evidence.storage.artifactRoot, 'wrong-run-id.tool-timeout.log');
    fs.writeFileSync(sidecarPath, JSON.stringify(evidence));
    const wrongRun = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', evidence.source.commit, sidecarPath], repositoryRoot);
    assert.equal(wrongRun.status, 1); assert.match(wrongRun.stderr, /filename.*execution workspace/u);
    fs.writeFileSync(sidecarPath, originalSidecar);
    evidence.timeoutOutputArtifact.path = originalArtifactPath;
    const escaped = path.join(container, 'escaped-timeout.log');
    fs.copyFileSync(artifact.path, escaped);
    fs.rmSync(artifact.path);
    fs.symlinkSync(escaped, artifact.path, 'file');
    const linked = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', evidence.source.commit, sidecarPath], repositoryRoot);
    assert.equal(linked.status, 1); assert.match(linked.stderr, /symbolic-link\/reparse/u);
    fs.rmSync(artifact.path);
    fs.copyFileSync(escaped, artifact.path);
    fs.appendFileSync(artifact.path, 'tamper');
    const tampered = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/validate-evidence.mjs'), '--expect-commit', evidence.source.commit, evidencePathFrom(result)], repositoryRoot);
    assert.equal(tampered.status, 1); assert.match(tampered.stderr, /byte length|SHA-256/u);
  } finally { fs.rmSync(container, { recursive: true, force: true }); }
});

test('supported root and Cloudflare package scripts route through the harness', () => {
  for (const packagePath of ['package.json', 'cloudflare/package.json']) {
    const scripts = JSON.parse(fs.readFileSync(path.join(repositoryRoot, packagePath), 'utf8')).scripts;
    for (const [name, command] of Object.entries(scripts)) {
      const intentionallyLive = packagePath === 'package.json' && ['dev', 'preview'].includes(name);
      if (!intentionallyLive && /(^|\s|&&|;)(?:npx\s+)?(?:firebase(?:-tools)?|vite|vitest|vite-node|playwright|wrangler)(?:\s|$)|node_modules[\\/](?:firebase-tools|vite|vitest|vite-node|playwright|wrangler)/u.test(command)) {
        assert.match(command, /scripts[\\/]harness[\\/]run-tool\.mjs/u, `${packagePath}#${name}`);
      }
    }
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')).scripts['deploy:hosting'], 'npm run build && node scripts/harness/run-tool.mjs --audit firebase . deploy --only hosting:kahut1');
});

const x64Node = path.join(os.homedir(), 'Tools', 'node-x64', 'node.exe');
test('Windows x64 bootstrap failure names a contract remediation code', { skip: process.platform !== 'win32', timeout: 30_000 }, async () => {
  const result = await run(process.execPath, [
    path.join(repositoryRoot, 'scripts/harness/run-tool.mjs'), '--doctor', '.', 'vitest',
  ], repositoryRoot, {
    CODEX_X64_NODE: path.join(os.tmpdir(), 'missing-x64-node.exe'),
    USERPROFILE: os.tmpdir(), LOCALAPPDATA: os.tmpdir(), ProgramFiles: os.tmpdir(), 'ProgramFiles(x86)': os.tmpdir(), PATH: os.tmpdir(),
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /HARNESS_FAILURE X64_NODE_PREREQUISITE_MISSING/u);
  assert.ok(HARNESS_CONTRACT.remediations.X64_NODE_PREREQUISITE_MISSING);
});

test('ordinary Windows dispatcher preserves arguments without audit artifacts or retained source', { skip: process.platform !== 'win32' || !fs.existsSync(x64Node), timeout: 120_000 }, async () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dispatcher-'));
  try {
    const result = await run(process.execPath, [
      path.join(repositoryRoot, 'scripts/harness/run-tool.mjs'),
      'vite-node', 'scripts/harness/__fixtures__/synthetic-project',
      'value with spaces', '--equals=a=b', 'quote"roundtrip',
    ], repositoryRoot, { CODEX_HARNESS_ROOT: cache });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { marker: 'base', arguments: ['value with spaces', '--equals=a=b', 'quote"roundtrip'] });
    assert.doesNotMatch(result.stderr, /HARNESS_EVIDENCE/u);
    assert.equal(fs.existsSync(path.join(cache, 'runs')), false);
    assert.equal(fs.existsSync(path.join(cache, 'evidence')), false);
    assert.equal(fs.existsSync(path.join(repositoryRoot, 'scripts/harness/__fixtures__/synthetic-project/node_modules')), false);
    assert.deepEqual(fs.existsSync(path.join(cache, 'overlays')) ? fs.readdirSync(path.join(cache, 'overlays')) : [], []);
  } finally {
    fs.rmSync(cache, { recursive: true, force: true });
  }
});
