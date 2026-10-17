#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const matrixResultPath = path.join(root, 'tmp', 'prd0062-118-assembled-rules-matrix-v4-results.json');
const assembledRuleTests = [
  'src/__tests__/security/materialCatalogFirebaseRules.test.ts',
  'src/__tests__/security/readingV2FirebaseRules.test.ts',
  'src/__tests__/security/prd0055-live-session-rules.emulator.test.ts',
  'src/__tests__/security/prd0056a-upload-session-rules.emulator.test.ts',
  'src/__tests__/security/prd0057-listening-authoring-rules.emulator.test.ts',
  'src/__tests__/security/prd0058-media-asset-rules.emulator.test.ts',
  'src/__tests__/security/retired-material-rules.emulator.test.ts',
  'src/__tests__/security/prd0062-118-production-normal-rules.emulator.test.ts',
];

export const PRD0062_118_ASSEMBLED_RULES_SUITE = Object.freeze({
  version: 'prd0062-118-assembled-rules-matrix-v4',
  rulesPath: 'database.rules.json',
  testFiles: Object.freeze([...assembledRuleTests]),
  emulator: 'database',
  resultPath: 'tmp/prd0062-118-assembled-rules-matrix-v4-results.json',
});

const quote = (value) => (/^[A-Za-z0-9_./:-]+$/u.test(value) ? value : `"${value.replaceAll('"', '\\"')}"`);
const normalizeTestPath = (value) => path.resolve(root, value).replaceAll('\\', '/').toLowerCase();
const localFirebaseWebConfig = Object.freeze({
  VITE_FIREBASE_API_KEY: 'firebase-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
  VITE_FIREBASE_DATABASE_URL: 'https://demo.firebaseio.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-project',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  VITE_FIREBASE_APP_ID: '1:1234567890:web:abc123',
});
const missing = PRD0062_118_ASSEMBLED_RULES_SUITE.testFiles
  .filter((testPath) => !existsSync(path.join(root, testPath)));
if (missing.length > 0) {
  console.error(`Missing matrix test files: ${missing.join(', ')}`);
  process.exit(2);
}

const vitestCli = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const firebaseCli = path.join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
if (!existsSync(vitestCli) || !existsSync(firebaseCli)) {
  console.error('Required repository test dependencies are missing.');
  process.exit(2);
}

if (existsSync(matrixResultPath)) unlinkSync(matrixResultPath);

const vitestCommand = [
  quote(process.execPath),
  quote(vitestCli),
  'run',
  '--config',
  'vitest.config.ts',
  '--reporter=json',
  '--outputFile',
  quote(matrixResultPath),
  '--passWithNoTests=false',
  ...PRD0062_118_ASSEMBLED_RULES_SUITE.testFiles,
].join(' ');

console.log(JSON.stringify({
  suite: PRD0062_118_ASSEMBLED_RULES_SUITE.version,
  rulesPath: PRD0062_118_ASSEMBLED_RULES_SUITE.rulesPath,
  testFiles: PRD0062_118_ASSEMBLED_RULES_SUITE.testFiles.length,
  resultPath: PRD0062_118_ASSEMBLED_RULES_SUITE.resultPath,
  command: `firebase emulators:exec --only database ${vitestCommand}`,
}, null, 2));

const result = spawnSync(
  process.execPath,
  [firebaseCli, 'emulators:exec', '--only', 'database', vitestCommand],
  {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    env: {
      ...process.env,
      ...localFirebaseWebConfig,
      VITEST_FILE_PARALLELISM: 'false',
      VITEST_MAX_WORKERS: '1',
    },
  },
);

const emitFailure = (status, message, details = {}) => {
  const summary = {
    suite: PRD0062_118_ASSEMBLED_RULES_SUITE.version,
    rulesPath: PRD0062_118_ASSEMBLED_RULES_SUITE.rulesPath,
    resultPath: PRD0062_118_ASSEMBLED_RULES_SUITE.resultPath,
    exitCode: result.status ?? 1,
    status,
    ...details,
    failure: message,
  };
  console.error(JSON.stringify(summary, null, 2));
  process.exit(result.status && result.status > 0 ? result.status : 1);
};

if (!existsSync(matrixResultPath)) {
  emitFailure('missing-json-result', 'Vitest JSON result file was not produced.');
}

let report;
try {
  report = JSON.parse(readFileSync(matrixResultPath, 'utf8'));
} catch (error) {
  emitFailure('unparseable-json-result', 'Vitest JSON result file could not be parsed.', {
    parseError: error instanceof Error ? error.message : String(error),
  });
}

const isNumber = (value) => Number.isInteger(value) && value >= 0;
if (!report || typeof report !== 'object' || !Array.isArray(report.testResults)
  || !isNumber(report.numTotalTestSuites) || !isNumber(report.numTotalTests)
  || !isNumber(report.numPassedTestSuites) || !isNumber(report.numFailedTestSuites)
  || !isNumber(report.numPendingTestSuites) || !isNumber(report.numPassedTests)
  || !isNumber(report.numFailedTests) || !isNumber(report.numPendingTests)
  || !isNumber(report.numTodoTests)) {
  emitFailure('invalid-json-result', 'Vitest JSON result has an invalid aggregate shape.');
}

const assertions = report.testResults.flatMap((file) => (
  Array.isArray(file.assertionResults)
    ? file.assertionResults.map((assertion) => ({ ...assertion, file: file.name }))
    : []
));
const resultFilesByPath = new Map();
const duplicateResultFiles = [];
for (const file of report.testResults) {
  const normalizedPath = normalizeTestPath(file.name ?? '');
  if (resultFilesByPath.has(normalizedPath)) duplicateResultFiles.push(normalizedPath);
  resultFilesByPath.set(normalizedPath, file);
}
const configuredFileResults = PRD0062_118_ASSEMBLED_RULES_SUITE.testFiles.map((configuredPath) => {
  const normalizedPath = normalizeTestPath(configuredPath);
  const file = resultFilesByPath.get(normalizedPath);
  const assertionCount = Array.isArray(file?.assertionResults) ? file.assertionResults.length : 0;
  const diagnostic = [
    file?.message,
    ...(Array.isArray(file?.failureMessages) ? file.failureMessages : []),
  ].filter(Boolean).join('\n');
  return {
    configuredPath,
    normalizedPath,
    found: file !== undefined,
    status: file?.status ?? 'missing',
    assertionCount,
    totalTests: Number.isInteger(file?.numTotalTests) ? file.numTotalTests : assertionCount,
    passedTests: Number.isInteger(file?.numPassingTests) ? file.numPassingTests : undefined,
    failedTests: Number.isInteger(file?.numFailingTests) ? file.numFailingTests : undefined,
    message: diagnostic,
  };
});
const configuredPathSet = new Set(PRD0062_118_ASSEMBLED_RULES_SUITE.testFiles.map(normalizeTestPath));
const unexpectedResultFiles = [...resultFilesByPath.keys()].filter((normalizedPath) => !configuredPathSet.has(normalizedPath));
const fileFailures = configuredFileResults.filter((file) => (
  !file.found || file.status !== 'passed' || file.assertionCount < 1
));
const classifyFileFailure = (file) => (/missing web config|vite_firebase_/iu.test(file.message) ? 'harness' : 'product');
const fileFailureClasses = [...new Set(fileFailures.map(classifyFileFailure))];
const fileFailureClass = fileFailureClasses.length > 1
  ? 'mixed-product-and-harness'
  : fileFailureClasses[0] ?? undefined;
const counts = {
  resultFiles: report.testResults.length,
  totalSuites: report.numTotalTestSuites,
  passedSuites: report.numPassedTestSuites,
  failedSuites: report.numFailedTestSuites,
  pendingSuites: report.numPendingTestSuites,
  totalTests: report.numTotalTests,
  passedTests: assertions.filter((test) => test.status === 'passed').length,
  failedTests: assertions.filter((test) => test.status === 'failed').length,
  skippedTests: assertions.filter((test) => test.status === 'skipped').length,
  pendingTests: assertions.filter((test) => test.status === 'pending').length,
  todoTests: assertions.filter((test) => test.status === 'todo').length,
};
const failures = assertions
  .filter((test) => test.status === 'failed')
  .map((test) => ({
    file: test.file,
    title: test.fullName ?? test.title ?? '',
    message: Array.isArray(test.failureMessages) ? test.failureMessages.join('\n') : '',
  }));
const resultSummary = {
  suite: PRD0062_118_ASSEMBLED_RULES_SUITE.version,
  rulesPath: PRD0062_118_ASSEMBLED_RULES_SUITE.rulesPath,
  resultPath: PRD0062_118_ASSEMBLED_RULES_SUITE.resultPath,
  exitCode: result.status ?? 1,
  status: 'completed',
  counts,
  failures,
  fileResults: configuredFileResults,
  fileFailures,
  unexpectedResultFiles,
  failureClass: fileFailureClass,
};
console.log(JSON.stringify(resultSummary, null, 2));

if (report.testResults.length !== PRD0062_118_ASSEMBLED_RULES_SUITE.testFiles.length
  || assertions.length !== report.numTotalTests
  || duplicateResultFiles.length > 0
  || unexpectedResultFiles.length > 0) {
  emitFailure('invalid-json-result', 'Vitest JSON aggregate counts do not match per-file/per-test results.', {
    counts,
    duplicateResultFiles,
    unexpectedResultFiles,
    reportTotals: {
      configuredFiles: PRD0062_118_ASSEMBLED_RULES_SUITE.testFiles.length,
      resultFiles: report.testResults.length,
      totalSuites: report.numTotalTestSuites,
      totalTests: report.numTotalTests,
    },
  });
}
if (counts.totalSuites === 0 || counts.totalTests === 0) {
  emitFailure('zero-tests', 'Zero test files or tests executed.', { counts, failures });
}
if (counts.skippedTests > 0 || counts.pendingTests > 0 || counts.todoTests > 0) {
  emitFailure('skipped-or-pending-tests', 'The assembled matrix contains skipped, pending, or todo tests.', {
    counts,
    failures,
  });
}
if (fileFailures.length > 0) {
  emitFailure('file-level-failures', 'One or more configured matrix files did not pass with executed assertions.', {
    counts,
    fileResults: configuredFileResults,
    fileFailures,
    failureClass: fileFailureClass,
  });
}
if (result.status !== 0 || counts.failedTests > 0 || counts.failedSuites > 0) {
  emitFailure('test-failures', 'The assembled RTDB consumer matrix failed.', { counts, failures });
}
