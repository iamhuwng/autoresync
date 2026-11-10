import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { runReleaseVerification, isReleaseVerification, assertReleaseVerification, parseVitestReport } from '../release-verification.mjs';

const envFingerprint = 'a'.repeat(64);
async function fixture(t, content) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'release-verification-test-'));
  const planPath = path.join(os.tmpdir(), `${path.basename(cwd)}.json`);
  t.after(async () => { await rm(cwd, { recursive: true, force: true }); await rm(planPath, { force: true }); });
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
  git('init', '-q'); git('config', 'user.name', 'Verification Test'); git('config', 'user.email', 'test@example.invalid');
  await writeFile(path.join(cwd, 'sample.test.mjs'), content);
  git('add', '--', 'sample.test.mjs'); git('commit', '-qm', 'Fixture');
  await writeFile(planPath, JSON.stringify({ schemaVersion: 1, suites: [{ runner: 'node', files: ['sample.test.mjs'] }] }));
  return { cwd, base: git('rev-parse', 'HEAD'), planPath, envFingerprint };
}

test('direct Node execution produces frozen in-process candidate evidence', async t => {
  const options = await fixture(t, "import test from 'node:test'; test('actual pass', () => {});");
  const value = await runReleaseVerification(options);
  assert.equal(isReleaseVerification(value), true);
  assert.deepEqual(value.suites[0].counts, { total: 1, passed: 1, failed: 0, skipped: 0 });
  assert.equal(Object.isFrozen(value.source), true);
  assert.equal(Object.isFrozen(value.suites[0].files), true);
  const binding = { source: value.source, envFingerprint, planSha256: value.planSha256 };
  assert.equal(assertReleaseVerification(value, binding), value);
  assert.throws(() => assertReleaseVerification(JSON.parse(JSON.stringify(value)), binding), /untrusted/u);
  assert.throws(() => assertReleaseVerification(value, { ...binding, envFingerprint: 'b'.repeat(64) }), /stale/u);
  assert.throws(() => assertReleaseVerification(value, { ...binding, planSha256: 'b'.repeat(64) }), /stale/u);
  assert.throws(() => assertReleaseVerification(value, { ...binding, source: { ...value.source, revision: 'b'.repeat(40) } }), /stale/u);
});

for (const [label, content] of [
  ['failure', "import test from 'node:test'; test('bad', () => { throw new Error('no'); });"],
  ['zero', 'export const noTests = true;'],
  ['skip', "import test from 'node:test'; test.skip('skipped', () => {});"],
  ['mutation', "import test from 'node:test'; import {writeFileSync} from 'node:fs'; test('mutates', () => writeFileSync('sample.test.mjs','changed'));"]
]) test(`rejects actual ${label} execution`, async t => {
  await assert.rejects(runReleaseVerification(await fixture(t, content)), /runner failed|nonzero tests|candidate changed/u);
});

test('validates the complete plan before executing tests', async t => {
  const options = await fixture(t, "throw new Error('must not execute');");
  for (const suite of [
    { runner: 'shell', files: ['sample.test.mjs'] },
    { runner: 'node', files: ['--help'] },
    { runner: 'node', files: ['../sample.test.mjs'] },
    { runner: 'node', files: ['*.test.mjs'] },
    { runner: 'node', files: ['sample.test.mjs'], config: 'config.js' },
    { runner: 'node', files: ['untracked.test.mjs'] },
  ]) {
    await writeFile(options.planPath, JSON.stringify({ schemaVersion: 1, suites: [suite] }));
    await assert.rejects(runReleaseVerification(options));
  }
});

test('Vitest summary rejects wrong files, zero tests, skipped tests and runner failures', () => {
  const cwd = process.cwd();
  const report = { success: true, numFailedTestSuites: 0, numPendingTestSuites: 0, numTotalTests: 2, numPassedTests: 2,
    numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    testResults: [{ name: path.join(cwd, 'sample.test.ts'), status: 'passed' }] };
  assert.equal(parseVitestReport(report, ['sample.test.ts'], cwd).passed, 2);
  for (const override of [{ success: false }, { numFailedTestSuites: 1 }, { numTotalTests: 0, numPassedTests: 0 },
    { numPendingTests: 1 }, { testResults: [{ name: path.join(cwd, 'other.test.ts'), status: 'passed' }] }]) {
    assert.throws(() => parseVitestReport({ ...report, ...override }, ['sample.test.ts'], cwd));
  }
});
