import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { HARNESS_CONTRACT } from '../harness/contract.mjs';
import {
  assertToolDeclared,
  assertInvocationMode,
  classifyResult,
  dependencyCacheIdentity,
  discoverNativeRequirements,
  projectContext,
  sourceIdentity,
  verifyCapabilities,
} from '../harness/run-isolated.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = path.join(repositoryRoot, 'scripts', 'harness', '__fixtures__');

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

const evidenceFrom = (result) => {
  const file = result.stderr.match(/^HARNESS_EVIDENCE (.+)$/mu)?.[1];
  assert.ok(file, result.stderr);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

const copyHarnessFixture = (destination) => {
  fs.mkdirSync(path.join(destination, 'scripts', 'harness'), { recursive: true });
  for (const name of ['contract.mjs', 'run-isolated.mjs', 'run-wsl-wrangler.mjs']) {
    fs.copyFileSync(path.join(repositoryRoot, 'scripts', 'harness', name), path.join(destination, 'scripts', 'harness', name));
  }
  fs.cpSync(path.join(fixtureRoot, 'synthetic-project'), path.join(destination, 'fixture-project'), { recursive: true });
};

const invokeSynthetic = (worktree, cacheRoot, marker, toolArguments = ['value with spaces', '--equals=a=b', 'quote"roundtrip'], extraEnvironment = {}) => {
  const invocation = Buffer.from(JSON.stringify({
    mode: 'run',
    tool: 'vite-node',
    relativeProjectPath: 'fixture-project',
    toolArguments,
  })).toString('base64');
  return run(process.execPath, [path.join(worktree, 'scripts', 'harness', 'run-isolated.mjs')], worktree, {
    CODEX_HARNESS_INVOCATION_B64: invocation,
    CODEX_HARNESS_ROOT: cacheRoot,
    EXPECTED_MARKER: marker,
    ...extraEnvironment,
  });
};

test('contract is executable, generic, and self-describing', () => {
  const output = execFileSync(process.execPath, [path.join(repositoryRoot, 'scripts/harness/run-tool.mjs'), '--contract'], { cwd: repositoryRoot, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), HARNESS_CONTRACT);
  assert.equal(HARNESS_CONTRACT.grammar.endsWith('<tool> <project> [...args]'), true);
  assert.equal(HARNESS_CONTRACT.tools.wrangler.runtime, 'wsl');
  assert.equal(HARNESS_CONTRACT.tools.playwright.capabilities[0].kind, 'browser');
  assert.equal(HARNESS_CONTRACT.tools.firebase.capabilities[0].minimumMajor, 21);
  assert.deepEqual(HARNESS_CONTRACT.tools.firebase.capabilities[0].commands, ['emulators:exec', 'emulators:start']);
});

test('doctor fails closed for unknown capabilities', async () => {
  const result = await run(process.execPath, [path.join(repositoryRoot, 'scripts/harness/run-tool.mjs'), '--doctor', '.', 'unknown-capability'], repositoryRoot);
  assert.equal(result.status, 2);
  const evidence = evidenceFrom(result);
  assert.equal(evidence.classification, 'harness_preflight_failure');
  assert.equal(evidence.failureCode, 'TOOL_UNSUPPORTED');
  assert.deepEqual(evidence.invocation.command.slice(2, 5), ['--doctor', '.', 'unknown-capability']);
});

test('cache identity invalidates on protocol, repository, project, Node ABI/version, npm, manifest, and lock changes', () => {
  const base = {
    repositoryIdentity: 'repo-a', project: '.', manifestSha256: 'manifest-a', lockSha256: 'lock-a',
    platform: 'win32', architecture: 'x64', nodeVersion: 'v22.1.0', nodeAbi: '127', npmVersion: '10.1.0',
  };
  const original = dependencyCacheIdentity(base);
  for (const [key, value] of Object.entries({ repositoryIdentity: 'repo-b', project: 'nested', manifestSha256: 'manifest-b', lockSha256: 'lock-b', architecture: 'arm64', nodeVersion: 'v24.0.0', nodeAbi: '137', npmVersion: '11.0.0' })) {
    assert.notEqual(dependencyCacheIdentity({ ...base, [key]: value }), original, key);
  }
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
    assert.throws(() => verifyCapabilities({ capabilities: [{ kind: 'browser', name: 'chromium' }] }, temporary), { code: 'BROWSER_RUNTIME_MISSING' });

    const previousPath = process.env.PATH;
    process.env.PATH = '';
    try {
      assert.throws(() => verifyCapabilities({ capabilities: [{ kind: 'java', minimumMajor: 21 }] }, temporary), { code: 'JAVA_PREREQUISITE_MISSING' });
      assert.doesNotThrow(() => verifyCapabilities({ capabilities: [{ kind: 'java', minimumMajor: 21, commands: ['emulators:exec'] }] }, temporary, 'deploy'));
    } finally {
      process.env.PATH = previousPath;
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('classifications separate zero collection, startup transport, product failure, and completion', () => {
  assert.equal(classifyResult({ exitCode: 1, stderr: 'No test files found' }), 'zero_tests_collected');
  assert.equal(classifyResult({ exitCode: 1, stderr: 'Unsupported platform: win32 arm64' }), 'harness_startup_failure');
  assert.equal(classifyResult({ exitCode: 1, stderr: 'AssertionError: expected true' }), 'product_failure');
  assert.equal(classifyResult({ exitCode: 0 }), 'completed');
  assert.equal(classifyResult({ error: new Error('spawn ENOENT'), exitCode: 1 }), 'harness_startup_failure');
  assert.equal(classifyResult({ error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), exitCode: 124 }), 'harness_transport_failure');
});

test('snapshot harness rejects live watchers while WSL Wrangler keeps live worktree source', () => {
  assert.throws(() => assertInvocationMode('vite', HARNESS_CONTRACT.tools.vite, []), { code: 'LIVE_WORKLOAD_REQUIRES_CHECKOUT' });
  assert.throws(() => assertInvocationMode('vite', HARNESS_CONTRACT.tools.vite, ['dev']), { code: 'LIVE_WORKLOAD_REQUIRES_CHECKOUT' });
  assert.throws(() => assertInvocationMode('vitest', HARNESS_CONTRACT.tools.vitest, ['watch']), { code: 'LIVE_WORKLOAD_REQUIRES_CHECKOUT' });
  assert.doesNotThrow(() => assertInvocationMode('vite', HARNESS_CONTRACT.tools.vite, ['build']));
  assert.doesNotThrow(() => assertInvocationMode('vitest', HARNESS_CONTRACT.tools.vitest, ['run']));
  assert.equal(HARNESS_CONTRACT.tools.wrangler.sourceMode, 'live');
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
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
});

test('supported root and Cloudflare package scripts route through the harness', () => {
  for (const packagePath of ['package.json', 'cloudflare/package.json']) {
    const scripts = JSON.parse(fs.readFileSync(path.join(repositoryRoot, packagePath), 'utf8')).scripts;
    for (const [name, command] of Object.entries(scripts)) {
      const intentionallyLive = packagePath === 'package.json' && ['dev', 'preview'].includes(name);
      if (!intentionallyLive && /(^|\s|&&|;)(?:npx\s+)?(?:vite|vitest|vite-node|playwright|wrangler)(?:\s|$)|node_modules[\\/](?:vite|vitest|vite-node|playwright|wrangler)/u.test(command)) {
        assert.match(command, /scripts[\\/]harness[\\/]run-tool\.mjs/u, `${packagePath}#${name}`);
      }
    }
  }
});

const x64Node = path.join(os.homedir(), 'Tools', 'node-x64', 'node.exe');
test('Windows dispatcher preserves arguments through the x64 PowerShell boundary', { skip: process.platform !== 'win32' || !fs.existsSync(x64Node), timeout: 120_000 }, async () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dispatcher-'));
  try {
    const result = await run(process.execPath, [
      path.join(repositoryRoot, 'scripts/harness/run-tool.mjs'),
      'vite-node', 'scripts/harness/__fixtures__/synthetic-project',
      'value with spaces', '--equals=a=b', 'quote"roundtrip',
    ], repositoryRoot, { CODEX_X64_NODE: x64Node, CODEX_HARNESS_ROOT: cache });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { marker: 'base', arguments: ['value with spaces', '--equals=a=b', 'quote"roundtrip'] });
    const evidence = evidenceFrom(result);
    assert.equal(evidence.runtime.architecture, 'x64');
    assert.deepEqual(evidence.invocation.arguments, ['value with spaces', '--equals=a=b', 'quote"roundtrip']);
  } finally {
    fs.rmSync(cache, { recursive: true, force: true });
  }
});
