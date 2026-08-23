import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  cleanupHarnessStorage,
  collectCleanupCandidates,
  parseCleanupArguments,
  validateCleanupRoot,
} from '../harness/cleanup.mjs';

const staleTime = Date.now() - (72 * 60 * 60 * 1000);

function fixture() {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cleanup-test-'));
  const root = path.join(container, 'codex-harness-v3');
  fs.mkdirSync(root, { recursive: true });
  return { container, root };
}

function age(target) {
  fs.utimesSync(target, new Date(staleTime), new Date(staleTime));
}

function finalEvidence(runId, dependencyRoot = null) {
  return {
    lifecycle: { status: 'final' },
    ...(dependencyRoot ? { dependencyCache: { root: dependencyRoot } } : {}),
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
}

test('cleanup is dry-run by default and preserves evidence', () => {
  const { container, root } = fixture();
  try {
    const runId = '11111111-1111-4111-8111-111111111111';
    const run = path.join(root, 'runs', runId);
    fs.mkdirSync(run, { recursive: true });
    fs.writeFileSync(path.join(run, 'output.txt'), 'output');
    age(run);
    writeJson(path.join(root, 'evidence', `${runId}.json`), finalEvidence(runId));

    const report = cleanupHarnessStorage({ roots: [root], minAgeHours: 24 });
    assert.equal(report.mode, 'dry-run');
    assert.equal(report.candidates.length, 1);
    assert.equal(fs.existsSync(run), true);
    assert.equal(fs.existsSync(path.join(root, 'evidence', `${runId}.json`)), true);
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
});

test('apply removes only old complete caches and finalized runs', () => {
  const { container, root } = fixture();
  try {
    const runId = '22222222-2222-4222-8222-222222222222';
    const run = path.join(root, 'runs', runId);
    const identity = 'a'.repeat(64);
    const dependency = path.join(root, 'dependencies', identity);
    fs.mkdirSync(run, { recursive: true });
    fs.writeFileSync(path.join(run, 'output.txt'), 'output');
    age(run);
    writeJson(path.join(root, 'evidence', `${runId}.json`), finalEvidence(runId, dependency));
    const artifact = path.join(root, 'artifacts', `${runId}.tool-timeout.log`);
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, 'timeout output');
    fs.mkdirSync(path.join(dependency, 'node_modules'), { recursive: true });
    writeJson(path.join(dependency, '.harness-dependencies.json'), { identity, dependencyCacheProtocolVersion: 3 });
    age(dependency);
    age(artifact);

    const report = cleanupHarnessStorage({ roots: [root], apply: true, minAgeHours: 24 });
    assert.equal(report.removed.length, 3);
    assert.equal(fs.existsSync(run), false);
    assert.equal(fs.existsSync(dependency), false);
    assert.equal(fs.existsSync(artifact), false);
    assert.equal(fs.existsSync(path.join(root, 'evidence', `${runId}.json`)), true);
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
});

test('normal-mode run receipts let cleanup reclaim runs without retaining full audit evidence', () => {
  const { container, root } = fixture();
  try {
    const runId = '44444444-4444-4444-8444-444444444444';
    const run = path.join(root, 'runs', runId);
    fs.mkdirSync(run, { recursive: true });
    writeJson(path.join(run, 'run-receipt.json'), { runId, status: 'final', dependencyRoot: null });
    age(run);

    const report = cleanupHarnessStorage({ roots: [root], apply: true, minAgeHours: 24 });
    assert.equal(report.removed.length, 1);
    assert.equal(fs.existsSync(run), false);
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
});

test('active, incomplete, locked, recent, and unrelated entries are preserved', () => {
  const { container, root } = fixture();
  try {
    const activeRunId = '33333333-3333-4333-8333-333333333333';
    const activeRun = path.join(root, 'runs', activeRunId);
    fs.mkdirSync(activeRun, { recursive: true });
    age(activeRun);
    writeJson(path.join(root, 'evidence', `${activeRunId}.json`), finalEvidence(activeRunId));
    writeJson(path.join(activeRun, 'run-receipt.json'), { runId: activeRunId, status: 'in_progress', dependencyRoot: null });

    const incomplete = path.join(root, 'dependencies', 'b'.repeat(64));
    fs.mkdirSync(incomplete, { recursive: true });
    age(incomplete);

    const locked = path.join(root, 'dependencies', 'c'.repeat(64));
    fs.mkdirSync(locked, { recursive: true });
    writeJson(path.join(locked, '.harness-dependencies.json'), { identity: 'c'.repeat(64), dependencyCacheProtocolVersion: 3 });
    fs.mkdirSync(`${locked}.lock`);
    age(locked);

    const recent = path.join(root, 'runs', 'not-a-run');
    fs.mkdirSync(recent, { recursive: true });
    writeJson(path.join(root, 'evidence', 'not-a-run.json'), finalEvidence('not-a-run'));

    const candidates = collectCleanupCandidates({ roots: [root], minAgeHours: 24 });
    assert.deepEqual(candidates, []);
    assert.equal(fs.existsSync(activeRun), true);
    assert.equal(fs.existsSync(incomplete), true);
    assert.equal(fs.existsSync(locked), true);
    assert.equal(fs.existsSync(recent), true);
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
});

test('cleanup validates roots and arguments before any deletion', () => {
  assert.throws(() => validateCleanupRoot(path.parse(process.cwd()).root), /unsafe harness cleanup root/);
  assert.throws(() => validateCleanupRoot(path.join('relative', 'codex-harness-v3')), /unsafe harness cleanup root/);
  const fileContainer = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cleanup-root-test-'));
  const fileRoot = path.join(fileContainer, 'codex-harness-v3');
  fs.writeFileSync(fileRoot, 'not a directory');
  try {
    assert.throws(() => validateCleanupRoot(fileRoot), /non-directory/u);
  } finally {
    fs.rmSync(fileContainer, { recursive: true, force: true });
  }
  const customContainer = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-custom-root-test-'));
  try {
    assert.equal(validateCleanupRoot(path.join(customContainer, 'cache'), { allowCustom: true }), path.join(customContainer, 'cache'));
  } finally {
    fs.rmSync(customContainer, { recursive: true, force: true });
  }
  assert.deepEqual(parseCleanupArguments(['--apply', '--json', '--min-age-hours', '72']), {
    apply: true,
    json: true,
    minAgeHours: 72,
  });
  assert.equal(parseCleanupArguments(['--wsl']).includeWsl, true);
  assert.throws(() => parseCleanupArguments(['--min-age-hours', '0']), /number >= 1/);
  assert.throws(() => parseCleanupArguments(['--unknown']), /unknown cleanup argument/);
});
