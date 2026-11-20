import path from 'node:path';

const fail = message => { throw new Error(`Release verification: ${message}`); };

const validCounts = counts => {
  if (Object.values(counts).some(value => !Number.isSafeInteger(value) || value < 0)
    || counts.total < 1 || counts.failed || counts.skipped || counts.passed !== counts.total) {
    fail('suite must execute nonzero tests without failures or skips');
  }
  return counts;
};

// integration-check.mjs imports this parser directly. Keep its checks strict so
// an incomplete, skipped, or mismatched Vitest report cannot qualify a release.
export function parseVitestReport(report, expectedFiles, cwd) {
  if (!Array.isArray(expectedFiles) || expectedFiles.length < 1) fail('expected test files are required');
  const results = report?.testResults;
  const failedFiles = expectedFiles.filter(file => results?.some(result =>
    path.resolve(result.name) === path.resolve(cwd, file) && result.status !== 'passed'));
  if (failedFiles.length) fail(`Vitest failed in ${failedFiles.join(', ')}`);
  if (!report || report.success !== true || report.numFailedTestSuites !== 0 || report.numPendingTestSuites !== 0
    || !Array.isArray(results) || results.length !== expectedFiles.length
    || results.some(result => result.status !== 'passed')
    || expectedFiles.some(file => !results.some(result => path.resolve(result.name) === path.resolve(cwd, file)))) {
    fail('Vitest did not verify the explicit suite');
  }
  return validCounts({
    total: report.numTotalTests,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    skipped: report.numPendingTests + report.numTodoTests,
  });
}
