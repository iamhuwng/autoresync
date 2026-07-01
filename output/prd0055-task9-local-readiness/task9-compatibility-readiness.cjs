const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getChangedPaths() {
  const tracked = execFileSync('git', ['diff', '--name-only'], {
    cwd: root,
    encoding: 'utf8',
  }).split(/\r?\n/).filter(Boolean);
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  }).split(/\r?\n/).filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

function findTestResult(report, filePart) {
  return (report.testResults || []).find((result) => result.name.includes(filePart));
}

function collectTitles(testResult) {
  return (testResult?.assertionResults || []).map((assertion) => assertion.title);
}

const taskList = readText('tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md');
const findings = readText('tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md');
const traceability = readText('tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md');
const architecture = readText('documentation/architecture/ielts-reading-v2-listening-unification.md');
const crossSystem = readJson('output/prd0055-task8-local-unblock/cross-system-compat-report.json');
const gateScan = readJson('output/prd0055-task8-local-unblock/local-gate-scan-report.json');

for (const id of ['9.1', '9.2', '9.3', '9.4']) {
  assert(new RegExp(`^\\s*- \\[[xX]\\] ${id.replace('.', '\\.')}\\b`, 'm').test(taskList), `Task ${id} is not checked`);
}
assert(/^\s*- \[ \] 8\.0\b/m.test(taskList), 'Task 8.0 unexpectedly checked');

assert(crossSystem.success === true, 'cross-system report did not pass');
assert(crossSystem.numTotalTestSuites === 26, 'unexpected cross-system suite count');
assert(crossSystem.numTotalTests === 144, 'unexpected cross-system test count');
assert(crossSystem.numFailedTests === 0, 'cross-system report has failed tests');

const coverage = [
  {
    task: '9.2',
    label: 'Reading V2 Studio unchanged',
    filePart: 'ReadingV2StudioPage.test.tsx',
    requiredTitle: 'returns teachers to the lobby after a successful publish',
  },
  {
    task: '9.2',
    label: 'Reading V2 launch/listing/runtime compatibility',
    filePart: 'readingV2LaunchIntegration.service.test.ts',
    requiredTitle: 'keeps legacy materials on the existing launch path',
  },
  {
    task: '9.2',
    label: 'Reading V2 trusted submit compatibility',
    filePart: 'readingV2RuntimeSubmission.service.test.ts',
    requiredTitle: 'fails closed when the endpoint or auth token is missing',
  },
  {
    task: '9.3',
    label: 'legacy Listening public result playback',
    filePart: 'SharedSavedResultCore.test.tsx',
    requiredTitle: 'renders legacy Listening result-review audio through the public resolver without delivery issuance',
  },
  {
    task: '9.3',
    label: 'new Listening result delivery path',
    filePart: 'SharedSavedResultCore.test.tsx',
    requiredTitle: 'resolves new Listening asset-ID result-review audio through authorized delivery',
  },
  {
    task: '9.3',
    label: 'Listening storage baseline compatibility',
    filePart: 'listeningTestStorage.test.ts',
    requiredTitle: 'commits canonical registry-backed audio before saving and preserves assetId plus public reader URLs',
  },
  {
    task: '9.3',
    label: 'R2 upload contract authority',
    filePart: 'r2Storage.test.ts',
    requiredTitle: 'resolves Listening upload session authority from Worker env only',
  },
  {
    task: '9.3',
    label: 'legacy solo audio stays read-only',
    filePart: 'listeningSoloDeliveryAdapter.test.ts',
    requiredTitle: 'keeps legacy public audio read-only and does not call the delivery issuer',
  },
];

const coverageResults = coverage.map((item) => {
  const testResult = findTestResult(crossSystem, item.filePart);
  const titles = collectTitles(testResult);
  const found = titles.includes(item.requiredTitle);
  assert(testResult, `missing test file in cross-system report: ${item.filePart}`);
  assert(found, `missing required test title: ${item.requiredTitle}`);
  return {
    ...item,
    testFile: testResult.name.replace(root + path.sep, ''),
    passedAssertions: testResult.assertionResults.length,
    found,
  };
});

assert(Array.isArray(gateScan.changedGoogleDriveFiles), 'gate scan missing changedGoogleDriveFiles');
assert(gateScan.changedGoogleDriveFiles.length === 0, 'gate scan found Google Drive changed files');
const changedPaths = getChangedPaths();
const googleDriveNamedChangedPaths = changedPaths.filter((changedPath) => /(^|[\\/])(gdrive|google[-_ ]?drive|drive)([\\/.-]|$)/i.test(changedPath));
assert(googleDriveNamedChangedPaths.length === 0, 'changed path names include Google Drive behavior candidates');

const evidenceAnchors = [
  { id: 'traceability-final-a', found: /EV-FINAL-A/.test(traceability) },
  { id: 'traceability-final-b', found: /EV-FINAL-B/.test(traceability) },
  { id: 'traceability-final-c', found: /EV-FINAL-C/.test(traceability) },
  { id: 'architecture-task9-local-readiness', found: /PRD-0055 Task 9\.5\/9\.11 have partial local boundary\/static readiness/.test(architecture) },
  { id: 'findings-task9-local-pass', found: /TASK_8_15_TO_8_18_LOCALHOST_ONLY_PASS/.test(findings) },
];
for (const anchor of evidenceAnchors) {
  assert(anchor.found, `missing evidence anchor: ${anchor.id}`);
}

const report = {
  createdAt: new Date().toISOString(),
  verdict: 'LOCAL_COMPATIBILITY_READINESS_PASS',
  scope: 'PRD-0055 Task 9.1-9.4 local compatibility closure under localhost-only scope',
  taskboxes: {
    task9_1: 'checked',
    task9_2: 'checked',
    task9_3: 'checked',
    task9_4: 'checked',
    parentTask8: 'unchecked',
    parentTask9: 'checked',
  },
  crossSystemReport: {
    path: 'output/prd0055-task8-local-unblock/cross-system-compat-report.json',
    suites: crossSystem.numTotalTestSuites,
    tests: crossSystem.numTotalTests,
    passed: crossSystem.numPassedTests,
    failed: crossSystem.numFailedTests,
    success: crossSystem.success,
  },
  coverage: coverageResults,
  googleDrive: {
    localGateScanPath: 'output/prd0055-task8-local-unblock/local-gate-scan-report.json',
    changedGoogleDriveFiles: gateScan.changedGoogleDriveFiles,
    googleDriveNamedChangedPaths,
  },
  evidenceAnchors,
  blockersToClosure: [],
  scopedNonActions: [
    'Task 8.0 remains outside the exact target packet unless separately authorized.',
    'Live-domain/deployed proof, selected-user rollout, percentage rollout, and full rollout are future-deferred non-gates.',
    'Google Drive cleanup/deletion remains separately deferred.',
    'No production deploy, remote mutation, cleanup/delete, selected-user rollout, percentage rollout, commit, or push is claimed.',
  ],
};

fs.writeFileSync(
  path.join(root, 'output/prd0055-task9-local-readiness/task9-compatibility-readiness-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(JSON.stringify({
  verdict: report.verdict,
  suites: report.crossSystemReport.suites,
  tests: report.crossSystemReport.tests,
  coverageItems: report.coverage.length,
  googleDriveNamedChangedPaths: report.googleDrive.googleDriveNamedChangedPaths.length,
}, null, 2));
