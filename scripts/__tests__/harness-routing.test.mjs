import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { HARNESS_CONTRACT } from '../harness/contract.mjs';
import { dependencyCacheState, linkDependencies, wslPrerequisiteCode } from '../harness/run-isolated.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

test('audit contract keeps explicit architecture and source boundaries', () => {
  assert.equal(HARNESS_CONTRACT.version, '5.0.0');
  assert.equal(HARNESS_CONTRACT.protocolVersion, 7);
  assert.equal(HARNESS_CONTRACT.dependencyCacheProtocolVersion, 3);
  assert.equal(HARNESS_CONTRACT.tools.vitest.runtime, 'windows-x64');
  assert.equal(HARNESS_CONTRACT.tools.vitest.auditSourceMode, 'snapshot');
  assert.equal(HARNESS_CONTRACT.tools.wrangler.runtime, 'windows-x64');
  assert.equal(HARNESS_CONTRACT.tools.wrangler.auditSourceMode, 'live');
});

test('WSL permission failures are reported as blocked probes instead of missing WSL', () => {
  assert.equal(wslPrerequisiteCode({ status: 1, error: { code: 'EPERM' } }), 'WSL_PREREQUISITE_BLOCKED');
  assert.equal(wslPrerequisiteCode({ status: 1, stderr: 'The Windows Subsystem for Linux is not installed.' }), 'WSL_PREREQUISITE_MISSING');
});

test('contract introspection is available without the active Codex skill probe', () => {
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts/harness/run-tool.mjs'), '--contract'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
  const contract = JSON.parse(result.stdout);
  assert.equal(contract.name, HARNESS_CONTRACT.name);
  assert.equal(contract.version, '5.0.0');
});

test('ordinary dispatcher refuses execution before creating harness state', () => {
  const cache = path.join(os.tmpdir(), 'harness-rejected-' + process.pid + '-' + Date.now());
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts/harness/run-tool.mjs'), 'vite-node', '.'], {
    cwd: repositoryRoot, encoding: 'utf8', env: { ...process.env, CODEX_HARNESS_ROOT: cache, CODEX_HARNESS_AUDIT: '1' },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /tooling-where\.mjs --exec/u);
  assert.equal(fs.existsSync(cache), false);
});

test('per-run dependency links keep consumer write state outside the immutable cache', () => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-routing-test-'));
  try {
    const dependencyRoot = path.join(container, 'dependency-cache');
    const dependencyModules = path.join(dependencyRoot, 'node_modules');
    const projectRoot = path.join(container, 'execution-project');
    fs.mkdirSync(path.join(dependencyModules, 'plain-package'), { recursive: true });
    fs.writeFileSync(path.join(dependencyModules, 'plain-package', 'package.json'), '{}\n');
    fs.mkdirSync(path.join(dependencyModules, '@scope', 'scoped-package'), { recursive: true });
    fs.writeFileSync(path.join(dependencyModules, '@scope', 'scoped-package', 'package.json'), '{}\n');
    fs.mkdirSync(projectRoot, { recursive: true });

    linkDependencies(projectRoot, dependencyRoot);

    const executionModules = path.join(projectRoot, 'node_modules');
    assert.equal(fs.lstatSync(executionModules).isSymbolicLink(), false);
    assert.equal(fs.existsSync(path.join(executionModules, 'plain-package', 'package.json')), true);
    assert.equal(fs.existsSync(path.join(executionModules, '@scope', 'scoped-package', 'package.json')), true);
    const transient = path.join(executionModules, '.vite-temp');
    fs.writeFileSync(path.join(transient, 'config.js'), 'temporary');
    assert.equal(fs.existsSync(path.join(dependencyModules, '.vite-temp', 'config.js')), false);
    const before = dependencyCacheState(dependencyRoot);
    fs.writeFileSync(path.join(dependencyModules, 'plain-package', 'package.json'), '{"changed":true}\n');
    assert.notDeepEqual(dependencyCacheState(dependencyRoot), before, 'package-level cache writes are detectable before reuse');
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
});
