import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { candidateJobs, checkHomeworkInputs, checkIntegration, integrationCheckName } from '../integration-check.mjs';

const revision = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const successfulNeeds = () => Object.fromEntries([
  ...Object.keys(candidateJobs).map(id => [id, { result: 'success', outputs: { revision, tree } }]),
  ['deployed-homework-rebuild', { result: 'success' }],
]);

test('actual Worker inputs must be tracked and covered by the shared release path map', () => {
  const mapPath = path.resolve('tmp/candidate-homework/index.js.map');
  const source = file => path.relative(path.dirname(mapPath), path.resolve(file));
  const selected = ['r2-backup-worker/src/index.ts', 'src/services/reading-v2/readingV2AnswerScoring.ts'];
  assert.deepEqual(checkHomeworkInputs({ sources: [...selected.map(source), '../../node_modules/example/index.js'] }, mapPath), selected);
  assert.deepEqual(checkHomeworkInputs({ sourceRoot: '../tmp/candidate-homework', sources: selected.map(source) }, mapPath), selected);
  assert.throws(() => checkHomeworkInputs({ sourceRoot: '../wrong-output', sources: selected.map(source) }, mapPath), /root differs/u);
  assert.throws(() => checkHomeworkInputs({ sources: [source('scripts/branch-doctor.mjs')] }, mapPath), /missing from the shared release path map/u);
  assert.throws(() => checkHomeworkInputs({ sources: [source('src/missing-shared-input.ts')] }, mapPath), /missing\/untracked/u);
  assert.throws(() => checkHomeworkInputs({ sources: [] }, mapPath), /must identify/u);
});

test('test report CLI uses shared verification for explicit and discovered tracked scopes', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'integration-app-report-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const reportPath = path.join(root, 'report.json');
  const summaryPath = path.join(root, 'summary.md');
  const selectedPath = path.join(root, 'selected.json');
  const selectedFile = 'src/services/reading-v2/readingV2AnswerScoring.test.ts';
  const report = { success: true, numFailedTestSuites: 0, numPendingTestSuites: 0,
    numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    testResults: [{ name: path.resolve(selectedFile), status: 'passed' }] };
  const run = (files = [selectedFile]) => spawnSync(process.execPath, [fileURLToPath(new URL('../integration-check.mjs', import.meta.url)), 'test-report', reportPath, ...files], {
    encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath }, windowsHide: true,
  });
  writeFileSync(reportPath, JSON.stringify(report));
  const passed = run();
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(readFileSync(summaryPath, 'utf8'), /1\/1 passed/u);
  writeFileSync(selectedPath, JSON.stringify([{ file: path.resolve(selectedFile) }]));
  const discovered = run(['--files-file', selectedPath]);
  assert.equal(discovered.status, 0, discovered.stderr);
  writeFileSync(selectedPath, JSON.stringify([{ file: path.resolve('missing.test.ts') }]));
  assert.notEqual(run(['--files-file', selectedPath]).status, 0);
  writeFileSync(reportPath, JSON.stringify({ ...report, numPendingTests: 1 }));
  assert.notEqual(run().status, 0);
});

test('the stable workflow job always requires exactly the jobs checked by the gate', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/release-safety.yml', import.meta.url), 'utf8');
  const gate = workflow.slice(workflow.indexOf('\n  integration:'));
  assert.ok(gate.includes(`name: ${integrationCheckName}`));
  assert.ok(gate.includes('if: ${{ always() }}'));
  const dependencies = gate.match(/needs: \[([^\]]+)\]/u)[1].split(',').map(value => value.trim()).sort();
  assert.deepEqual(dependencies, [...Object.keys(candidateJobs), 'deployed-homework-rebuild'].sort());
});

test('accepts matching candidate jobs and distinguishes retained evidence', () => {
  const result = checkIntegration(successfulNeeds(), revision, tree);
  assert.deepEqual(result.errors, []);
  assert.match(result.summary, /\*\*PASS\*\*/u);
  assert.match(result.summary, /does not cover the candidate/u);
});

test('every required job fails closed for failure, cancellation, skip and absence', () => {
  for (const id of [...Object.keys(candidateJobs), 'deployed-homework-rebuild']) {
    for (const state of ['failure', 'cancelled', 'skipped', undefined]) {
      const needs = successfulNeeds();
      if (state) needs[id].result = state;
      else delete needs[id];
      assert.ok(checkIntegration(needs, revision, tree).errors.some(error => error.startsWith(`${id}:`)), `${id}: ${state}`);
    }
  }
});

test('rejects missing, malformed and mismatching commit/tree evidence for every candidate', () => {
  for (const id of Object.keys(candidateJobs)) {
    for (const field of ['revision', 'tree']) {
      for (const value of [undefined, '', 'invalid', 'c'.repeat(40)]) {
        const needs = successfulNeeds();
        needs[id].outputs[field] = value;
        assert.ok(checkIntegration(needs, revision, tree).errors.includes(`${id}: candidate source mismatch or missing evidence`));
      }
    }
    const needs = successfulNeeds();
    delete needs[id].outputs;
    assert.ok(checkIntegration(needs, revision, tree).errors.length);
  }
  assert.ok(checkIntegration(successfulNeeds(), undefined, tree).errors.length);
  assert.ok(checkIntegration(successfulNeeds(), revision, undefined).errors.length);
});
