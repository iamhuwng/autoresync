import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { parseVitestReport } from '../release-verification.mjs';

const cwd = process.cwd();
const file = 'sample.test.ts';
const report = overrides => ({
  success: true,
  numFailedTestSuites: 0,
  numPendingTestSuites: 0,
  numTotalTests: 2,
  numPassedTests: 2,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  testResults: [{ name: path.join(cwd, file), status: 'passed' }],
  ...overrides,
});

test('parses a passing report for every expected file', () => {
  assert.deepEqual(parseVitestReport(report(), [file], cwd), { total: 2, passed: 2, failed: 0, skipped: 0 });
});

test('rejects a failed test file', () => {
  assert.throws(() => parseVitestReport(report({ testResults: [{ name: path.join(cwd, file), status: 'failed' }] }), [file], cwd), /Vitest failed/u);
});

test('rejects missing and extra test files', () => {
  assert.throws(() => parseVitestReport(report({ testResults: [{ name: path.join(cwd, 'other.test.ts'), status: 'passed' }] }), [file], cwd));
  assert.throws(() => parseVitestReport(report({ testResults: [{ name: path.join(cwd, file), status: 'passed' }, { name: path.join(cwd, 'other.test.ts'), status: 'passed' }] }), [file], cwd));
});

test('rejects zero, skipped, todo, failed-suite, and non-success reports', () => {
  for (const overrides of [
    { numTotalTests: 0, numPassedTests: 0 },
    { numPendingTests: 1 },
    { numTodoTests: 1 },
    { numFailedTestSuites: 1 },
    { success: false },
  ]) assert.throws(() => parseVitestReport(report(overrides), [file], cwd));
});
