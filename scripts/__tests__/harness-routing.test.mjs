import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { HARNESS_CONTRACT } from '../harness/contract.mjs';
import { dependencyCacheState, linkDependencies, wslPrerequisiteCode } from '../harness/run-isolated.mjs';
import { prepareLiveDependencyOverlay, reuseInheritedLiveDependencyOverlay } from '../harness/source-adapter.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

test('contract keeps architecture boundaries while making ordinary execution live and audit explicit', () => {
  assert.equal(HARNESS_CONTRACT.version, '4.0.1');
  assert.equal(HARNESS_CONTRACT.protocolVersion, 6);
  assert.equal(HARNESS_CONTRACT.dependencyCacheProtocolVersion, 3);
  assert.equal(HARNESS_CONTRACT.authority.genericSkill.revision, '4.0.0');
  assert.equal(HARNESS_CONTRACT.tools.vitest.runtime, 'windows-x64');
  assert.equal(HARNESS_CONTRACT.tools.vitest.normalSourceMode, 'live-overlay');
  assert.equal(HARNESS_CONTRACT.tools.vitest.auditSourceMode, 'snapshot');
  assert.equal(HARNESS_CONTRACT.tools.wrangler.runtime, 'wsl');
  assert.equal(HARNESS_CONTRACT.tools.wrangler.normalSourceMode, 'live');
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
  assert.equal(contract.version, '4.0.1');
});

test('ordinary live overlay leaves no source copy or retained run directory', async () => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-live-overlay-test-'));
  try {
    const projectRoot = path.join(container, 'project');
    const dependencyRoot = path.join(container, 'dependency-cache');
    const cacheBase = path.join(container, 'codex-harness-v3');
    fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src', 'live.txt'), 'authoritative checkout\n');
    fs.mkdirSync(path.join(dependencyRoot, 'node_modules', 'example-package'), { recursive: true });
    fs.writeFileSync(path.join(dependencyRoot, 'node_modules', 'example-package', 'package.json'), '{}\n');

    const overlay = await prepareLiveDependencyOverlay({ projectRoot, dependencyRoot, cacheBase });
    const modules = path.join(projectRoot, 'node_modules');
    assert.equal(fs.lstatSync(modules).isSymbolicLink(), true);
    assert.equal(fs.existsSync(path.join(modules, 'example-package', 'package.json')), true);
    assert.equal(overlay.cwd, projectRoot);
    assert.equal(fs.existsSync(path.join(cacheBase, 'runs')), false);
    assert.equal(fs.existsSync(path.join(cacheBase, 'overlays', overlay.id, 'repository')), false);

    overlay.cleanup();
    assert.equal(fs.existsSync(modules), false);
    assert.equal(fs.existsSync(path.join(cacheBase, 'overlays', overlay.id)), false);
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
});

test('ordinary live overlay never overwrites an existing dependency installation', async () => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-live-overlay-collision-test-'));
  try {
    const projectRoot = path.join(container, 'project');
    const dependencyRoot = path.join(container, 'dependency-cache');
    const cacheBase = path.join(container, 'codex-harness-v3');
    fs.mkdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'node_modules', 'owned.txt'), 'keep');
    fs.mkdirSync(path.join(dependencyRoot, 'node_modules'), { recursive: true });

    await assert.rejects(
      prepareLiveDependencyOverlay({ projectRoot, dependencyRoot, cacheBase }),
      (error) => error.code === 'LIVE_DEPENDENCY_OVERLAY_COLLISION',
    );
    assert.equal(fs.readFileSync(path.join(projectRoot, 'node_modules', 'owned.txt'), 'utf8'), 'keep');
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
});

test('nested ordinary execution reuses the live overlay without waiting on its own project lock', async () => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-live-overlay-nested-test-'));
  try {
    const projectRoot = path.join(container, 'project');
    const dependencyRoot = path.join(container, 'dependency-cache');
    const cacheBase = path.join(container, 'codex-harness-v3');
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(path.join(dependencyRoot, 'node_modules', 'example-package'), { recursive: true });
    fs.writeFileSync(path.join(dependencyRoot, 'node_modules', 'example-package', 'package.json'), '{}\n');

    const outer = await prepareLiveDependencyOverlay({ projectRoot, dependencyRoot, cacheBase });
    const nested = reuseInheritedLiveDependencyOverlay({
      projectRoot,
      cacheBase,
      environment: {
        CODEX_HARNESS_LIVE_OVERLAY_ROOT: outer.root,
        CODEX_HARNESS_LIVE_PROJECT_ROOT: projectRoot,
      },
    });
    assert.equal(nested.id, outer.id);
    assert.equal(nested.cwd, projectRoot);
    nested.cleanup();
    assert.equal(fs.existsSync(path.join(projectRoot, 'node_modules', 'example-package', 'package.json')), true);
    outer.cleanup();
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
});

test('nested ordinary execution rejects an invalid inherited overlay instead of bypassing dependency isolation', () => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-live-overlay-invalid-test-'));
  try {
    assert.throws(
      () => reuseInheritedLiveDependencyOverlay({
        projectRoot: path.join(container, 'project'),
        cacheBase: path.join(container, 'codex-harness-v3'),
        environment: {
          CODEX_HARNESS_LIVE_OVERLAY_ROOT: path.join(container, 'outside-overlay'),
          CODEX_HARNESS_LIVE_PROJECT_ROOT: path.join(container, 'project'),
        },
      }),
      (error) => error.code === 'LIVE_DEPENDENCY_OVERLAY_INVALID',
    );
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
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
