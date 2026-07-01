const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath).replace(/^\uFEFF/, ''));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function taskState(taskList, id) {
  const escaped = id.replace('.', '\\.');
  const match = taskList.match(new RegExp(`^\\s*- \\[([ xX])\\] ${escaped}(?:\\s|\\b)`, 'm'));
  if (!match) {
    return 'missing';
  }
  return match[1].toLowerCase() === 'x' ? 'checked' : 'unchecked';
}

function changedPaths() {
  const tracked = execFileSync('git', ['diff', '--name-only'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

const taskList = readText('tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md');
const findings = readText('tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md');
const traceability = readText('tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md');
const implementationLog = readText('documentation/ielts-reading-v2-listening-unification-implementation-log.md');
const architecture = readText('documentation/architecture/ielts-reading-v2-listening-unification.md');
const uploadAuthority = readText('documentation/architecture/upload-storage-authority.md');
const prd0060 = readText('tasks/0060-prd-listening-live-session-authority-runtime-load-test-plan.md');
const workerSource = readText('cloudflare/worker.js');

const task8Matrix = readJson('output/prd0055-task8-local-unblock/playwright-task8-expanded-report.json');
const task8Supplement = readJson('output/prd0055-task8-local-unblock/playwright-artifacts/local-matrix-supplement.json');
const rolloutAudit = readJson('output/prd0055-task9-local-readiness/task9-rollout-deployed-truth-audit-report.json');
const deployedStatus = readJson('output/prd0055-task9-live-readback/wrangler-deployments-status.json');
const deployedStatusAfterRecoveryUpload = readJson('output/prd0055-task9-live-readback/wrangler-deployments-status-after-recovery-upload.json');
const deployedActiveVersion = readJson('output/prd0055-task9-live-readback/wrangler-version-34970bd6.json');
const deployedPriorVersion = readJson('output/prd0055-task9-live-readback/wrangler-version-3687d2e0.json');
const deployedHistoricalRecoveryVersion = readJson('output/prd0055-task9-live-readback/wrangler-version-959065cd.json');
const currentAuthoringRecoveryVersion = readJson('output/prd0055-task9-live-readback/wrangler-version-d219c36f.json');
const recoveryUploadLog = readText('output/prd0055-task9-live-readback/wrangler-versions-upload-current-authoring-recovery.txt');
const firebaseAuthoringFlag = readText('output/prd0055-task9-live-readback/firebase-listening-authoring-writes-enabled.txt').replace(/^\uFEFF/, '').trim();

const remainingTasks = [
  '8.0', '8.14', '8.15', '8.16', '8.17', '8.18',
  '9.0', '9.1', '9.2', '9.3', '9.4', '9.5', '9.6', '9.7', '9.8',
  '9.9', '9.10', '9.11', '9.12', '9.13', '9.14', '9.15',
];

const taskboxes = Object.fromEntries(remainingTasks.map((id) => [id, taskState(taskList, id)]));
for (const [id, state] of Object.entries(taskboxes)) {
  assert(state === 'unchecked', `Task ${id} should remain unchecked, found ${state}`);
}

assert(task8Matrix?.stats?.expected === 1, 'Task 8 local matrix expected count changed');
assert(task8Matrix?.stats?.unexpected === 0, 'Task 8 local matrix has unexpected failures');
assert(Array.isArray(task8Matrix.errors) && task8Matrix.errors.length === 0, 'Task 8 local matrix has errors');
assert(rolloutAudit.verdict === 'ROLLOUT_DEPLOYED_TRUTH_BLOCKERS_CONFIRMED_NOT_CLOSURE', 'Rollout/deployed-truth audit verdict changed');
assert(rolloutAudit.gateStatus.length === 7, 'Rollout/deployed-truth audit should have 7 gate statuses');

const requiredArtifacts = [
  'output/prd0055-task8-local-unblock/browser-plugin-teacher-audio-restart-proof.json',
  'output/prd0055-task8-local-unblock/browser-audible-fixture.json',
  'output/prd0055-task8-local-unblock/browser-plugin-current-teacher-t8p9j2-pending-human-audible-proof.json',
  'output/prd0055-task8-local-unblock/browser-plugin-current-teacher-t8p9j2-pending-human-audible-proof.png',
  'output/prd0055-task8-local-unblock/browser-plugin-current-teacher-t8p9j2-human-audible-confirmed.json',
  'output/prd0055-task8-local-unblock/browser-plugin-current-teacher-t8p9j2-human-audible-confirmed.png',
  'output/prd0055-task8-local-unblock/browser-plugin-current-teacher-t8p9j2-human-audible-latest-confirmation.json',
  'output/prd0055-task8-local-unblock/audio-progress-panel-duration-fix-report.json',
  'output/prd0055-task8-local-unblock/playwright-task8-after-browser-audio-fix-180s-report.json',
  'output/prd0055-task8-local-unblock/browser-plugin-teacher-progress-after-fix.png',
  'output/prd0055-task8-local-unblock/playwright-task8-expanded-report.json',
  'output/prd0055-task8-local-unblock/playwright-artifacts/local-matrix-supplement.json',
  'output/prd0055-task9-local-readiness/boundary-static-readiness-report.json',
  'output/prd0055-task9-local-readiness/task9-observability-live-regression-report.json',
  'output/prd0055-task9-local-readiness/task9-rtdb-rules-emulator-report.json',
  'output/prd0055-task9-local-readiness/task9-worker-auth-negative-report.json',
  'output/prd0055-task9-local-readiness/task9-compatibility-readiness-report.json',
  'output/prd0055-task9-local-readiness/task9-deferred-residue-review-report.json',
  'output/prd0055-task9-local-readiness/task9-rollout-deployed-truth-audit-report.json',
  'output/prd0055-task9-local-readiness/prd0055-final-independent-gate-audit-summary.json',
  'output/prd0055-task9-live-readback/wrangler-deployments-status.json',
  'output/prd0055-task9-live-readback/wrangler-version-34970bd6.json',
  'output/prd0055-task9-live-readback/wrangler-version-3687d2e0.json',
  'output/prd0055-task9-live-readback/wrangler-version-959065cd.json',
  'output/prd0055-task9-live-readback/wrangler-versions-upload-current-authoring-recovery.txt',
  'output/prd0055-task9-live-readback/wrangler-versions-list-after-recovery-upload.json',
  'output/prd0055-task9-live-readback/wrangler-deployments-status-after-recovery-upload.json',
  'output/prd0055-task9-live-readback/wrangler-version-d219c36f.json',
  'output/prd0055-task9-live-readback/firebase-listening-authoring-writes-enabled.txt',
  'public/__prd0055-task8-local/section-1.wav',
  'public/__prd0055-task8-local/section-2.wav',
];
const artifactStatus = requiredArtifacts.map((artifactPath) => ({
  path: artifactPath,
  exists: exists(artifactPath),
}));
for (const artifact of artifactStatus) {
  assert(artifact.exists, `Missing required local artifact: ${artifact.path}`);
}

const noClosureAnchors = [
  { id: 'traceability-ev-final-f', text: traceability, pattern: /EV-FINAL-F/ },
  { id: 'traceability-ev-final-e', text: traceability, pattern: /EV-FINAL-E/ },
  { id: 'traceability-final-current-execution', text: traceability, pattern: /EV-FINAL-I/ },
  { id: 'tasklist-814-open', text: taskList, pattern: /Full 8\.14 remains open/ },
  { id: 'tasklist-913-open', text: taskList, pattern: /9\.13 Human-assisted final browser proof/ },
  { id: 'findings-final-e-open', text: findings, pattern: /ROLLOUT_DEPLOYED_TRUTH_BLOCKERS_CONFIRMED_NOT_CLOSURE/ },
  { id: 'log-final-i-open', text: implementationLog, pattern: /FINAL_CLOSURE_EXECUTION_BLOCKED_AFTER_READBACK/ },
  { id: 'architecture-final-e-open', text: architecture, pattern: /rollout\/deployed-truth blockers confirmed only/ },
  { id: 'prd0060-browser-planned', text: prd0060, pattern: /browser|human-assisted|rollout|deployed/i },
  { id: 'upload-authority-private-open', text: uploadAuthority, pattern: /durable cleanup execution, rollback-grace execution, deployed private delivery, solo\/live private cutover.*remain unimplemented/ },
  { id: 'worker-live-delivery-route-absent', text: workerSource, pattern: /\/listening-delivery\/result-review/ },
];
for (const anchor of noClosureAnchors) {
  assert(anchor.pattern.test(anchor.text), `Missing no-closure anchor: ${anchor.id}`);
}
assert(!/\/listening-delivery\/live\b/.test(workerSource), 'Worker unexpectedly exposes live private delivery route');
assert(!/\/listening-delivery\/solo\b/.test(workerSource), 'Worker unexpectedly exposes solo private delivery route');

const bindingNames = (version) => (version?.resources?.bindings ?? []).map((binding) => binding.name).filter(Boolean).sort();
const activeBindingNames = bindingNames(deployedActiveVersion);
const priorBindingNames = bindingNames(deployedPriorVersion);
const historicalRecoveryBindingNames = bindingNames(deployedHistoricalRecoveryVersion);
const currentAuthoringRecoveryBindingNames = bindingNames(currentAuthoringRecoveryVersion);
const activeDeploymentVersion = deployedStatus.versions?.find((version) => version.percentage === 100)?.version_id ?? null;
const activeDeploymentVersionAfterRecoveryUpload = deployedStatusAfterRecoveryUpload.versions?.find((version) => version.percentage === 100)?.version_id ?? null;
assert(deployedStatus.strategy === 'percentage', 'Cloudflare deployment strategy readback is not percentage');
assert(activeDeploymentVersion === deployedActiveVersion.id, 'Cloudflare active version readback does not match deployed active version file');
assert(deployedStatusAfterRecoveryUpload.strategy === 'percentage', 'Cloudflare post-upload deployment strategy readback is not percentage');
assert(activeDeploymentVersionAfterRecoveryUpload === deployedActiveVersion.id, 'Cloudflare recovery-version upload moved production traffic');
assert(/Worker Version ID:\s+d219c36f-0e0f-489c-a10b-a843ed339bf2/.test(recoveryUploadLog), 'Recovery upload log missing d219c36f Worker Version ID');
assert(activeBindingNames.includes('LISTENING_AUTHORING_IDEMPOTENCY_SECRET'), 'Active Worker version is missing authoring idempotency binding');
assert(firebaseAuthoringFlag === 'false', 'Firebase authoring writes flag is not false during closure readback');
const rollbackMissingCurrentAuthoringBindings = ['LISTENING_AUTHORING_IDEMPOTENCY_SECRET'].filter((name) => !priorBindingNames.includes(name));
const historicalRecoveryMissingCurrentAuthoringBindings = ['FIREBASE_DB_URL', 'GOOGLE_SA_KEY', 'LISTENING_AUTHORING_IDEMPOTENCY_SECRET', 'LISTENING_UPLOAD_SESSION_GRANT_SECRET'].filter((name) => !historicalRecoveryBindingNames.includes(name));
const currentAuthoringRecoveryMissingBindings = ['FIREBASE_DB_URL', 'GOOGLE_SA_KEY', 'LISTENING_AUTHORING_IDEMPOTENCY_SECRET', 'LISTENING_UPLOAD_SESSION_GRANT_SECRET'].filter((name) => !currentAuthoringRecoveryBindingNames.includes(name));
assert(currentAuthoringRecoveryMissingBindings.length === 0, `Current-authoring recovery candidate missing bindings: ${currentAuthoringRecoveryMissingBindings.join(', ')}`);

const gateStatus = [
  {
    task: '8.14',
    status: 'PARTIAL_LOCAL_HUMAN_AUDIBLE_PROVEN_NOT_CLOSURE',
    evidence: [
      'output/prd0055-task8-local-unblock/playwright-task8-expanded-report.json',
      'output/prd0055-task8-local-unblock/playwright-artifacts/local-matrix-supplement.json',
      'output/prd0055-task8-local-unblock/browser-plugin-current-teacher-t8p9j2-pending-human-audible-proof.json',
      'output/prd0055-task8-local-unblock/browser-plugin-current-teacher-t8p9j2-human-audible-confirmed.json',
    ],
    missing: [
      'live private delivery route/cutover implementation',
      'private-delivery cutover proof',
      'deployed human browser/speaker proof',
      'rollout and rollback evidence',
      'evidence-capture closure',
      'independent verification parent gate',
    ],
  },
  {
    task: '8.15',
    status: 'BLOCKED_NOT_CLOSURE',
    evidence: ['EV-FINAL-E blocker audit', 'Current-authoring recovery candidate d219c36f-0e0f-489c-a10b-a843ed339bf2 readback'],
    missing: ['Task 8.14 closure', 'live private delivery route/cutover implementation', 'selected/percentage rollout evidence', 'controlled recovery/version-pin rehearsal proof'],
  },
  {
    task: '8.16',
    status: 'PARTIAL_LOCAL_ONLY_NOT_CLOSURE',
    evidence: ['local screenshots, JSON reports, canonical fixture state, Cloudflare/Firebase current readback, human audible/no-wrong-audio/no-interruption confirmation, current-authoring recovery candidate readback, and static proof that live private delivery route is absent'],
    missing: ['live private delivery route/cutover implementation', 'deployed/private delivery refresh', 'rollout cohort evidence', 'controlled recovery/version-pin rehearsal evidence'],
  },
  {
    task: '8.17',
    status: 'BLOCKED_NOT_CLOSURE',
    evidence: ['bounded read-only audits exist for prior slices'],
    missing: ['fresh-context independent verification for full Task 8.14-8.18 closure after final evidence exists'],
  },
  {
    task: '8.18',
    status: 'BLOCKED_NOT_CLOSURE',
    evidence: ['Task 8 local foundation evidence only'],
    missing: ['8.14-8.17 closure', 'live private delivery route/cutover implementation', 'selected live traffic reload/conflict/private-delivery refresh proof', 'parent Task 8 acceptance proof'],
  },
  {
    task: '9.0',
    status: 'BLOCKED_NOT_CLOSURE',
    evidence: ['EV-FINAL-A through EV-FINAL-E local readiness/blocker packets'],
    missing: ['9.1-9.15 closure', 'deployed/live truth', 'final rollout', 'parent acceptance'],
  },
  {
    task: '9.13',
    status: 'PARTIAL_LOCAL_HUMAN_BROWSER_PROVEN_NOT_CLOSURE',
    evidence: ['Task 8 localhost browser/plugin proof plus user-confirmed heard-tone/no-wrong-audio/no-interruption/no-visible-drift for T8P9J2'],
    missing: ['final selected/student-role browser packet with viewports, network evidence, durable DB evidence, live private delivery implementation, deployed/private proof, and rollout/recovery artifacts'],
  },
  {
    task: '9.15',
    status: 'BLOCKED_NOT_CLOSURE',
    evidence: ['EV-FINAL-A through EV-FINAL-I local readiness, deployed readback, current-authoring recovery candidate readback, and blocker packets'],
    missing: ['all child task closure', 'zero-orphan final traceability proof', 'live private delivery route/cutover implementation', 'controlled recovery/version-pin rehearsal proof', 'selected/percentage/full rollout proof'],
  },
];

const allChanged = changedPaths();
const deploySensitiveChangedPaths = allChanged.filter((changedPath) => /^(cloudflare\/|firebase\.json$|database\.rules\.json$|r2-backup-worker\/|functions\/|scripts\/prd0055-selected-teacher-worker-proof\.mjs$)/.test(changedPath));

const report = {
  createdAt: new Date().toISOString(),
  verdict: 'CLOSURE_BLOCKED_REQUIRED_ROLLOUT_RECOVERY_AND_FINAL_GATES_MISSING',
  traceabilityEvidenceId: 'EV-FINAL-F',
  scope: 'PRD-0055 remaining Task 8.14-8.18 and Task 9.0-9.15 final closure blocker audit',
  branchHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  taskboxes,
  localEvidenceSummary: {
    task8Matrix: {
      path: 'output/prd0055-task8-local-unblock/playwright-task8-expanded-report.json',
      expected: task8Matrix.stats.expected,
      unexpected: task8Matrix.stats.unexpected,
      errors: task8Matrix.errors.length,
      durationMs: task8Matrix.stats.duration,
    },
    task8Supplement: {
      path: 'output/prd0055-task8-local-unblock/playwright-artifacts/local-matrix-supplement.json',
      sessionCode: task8Supplement.sessionCode,
      testId: task8Supplement.testId,
      coveredCount: Array.isArray(task8Supplement.covered) ? task8Supplement.covered.length : null,
      finalMasterAudioRevision: task8Supplement.finalMasterAudioState?.revision ?? null,
      latestResultId: task8Supplement.submitDuringEnd?.latestResultId ?? null,
    },
    rolloutAudit: {
      path: 'output/prd0055-task9-local-readiness/task9-rollout-deployed-truth-audit-report.json',
      verdict: rolloutAudit.verdict,
      gateStatuses: rolloutAudit.gateStatus.length,
      deploySensitiveChangedPaths: rolloutAudit.deploySensitiveChangedPaths.length,
    },
    deployedReadback: {
      deploymentStatusPath: 'output/prd0055-task9-live-readback/wrangler-deployments-status.json',
      deploymentStatusAfterRecoveryUploadPath: 'output/prd0055-task9-live-readback/wrangler-deployments-status-after-recovery-upload.json',
      deploymentId: deployedStatus.id,
      strategy: deployedStatus.strategy,
      activeVersionId: activeDeploymentVersion,
      activePercentage: deployedStatus.versions?.find((version) => version.version_id === activeDeploymentVersion)?.percentage ?? null,
      activeVersionIdAfterRecoveryUpload: activeDeploymentVersionAfterRecoveryUpload,
      activeBindingNames,
      priorVersionId: deployedPriorVersion.id,
      rollbackMissingCurrentAuthoringBindings,
      historicalRecoveryVersionId: deployedHistoricalRecoveryVersion.id,
      historicalRecoveryMissingCurrentAuthoringBindings,
      currentAuthoringRecoveryVersionId: currentAuthoringRecoveryVersion.id,
      currentAuthoringRecoveryVersionNumber: currentAuthoringRecoveryVersion.number,
      currentAuthoringRecoveryBindingNames,
      currentAuthoringRecoveryMissingBindings,
      currentAuthoringRecoveryUploadLogPath: 'output/prd0055-task9-live-readback/wrangler-versions-upload-current-authoring-recovery.txt',
      firebaseAuthoringWritesEnabled: firebaseAuthoringFlag,
    },
    livePrivateDeliveryImplementation: {
      workerSourcePath: 'cloudflare/worker.js',
      resultReviewRoutePresent: /\/listening-delivery\/result-review/.test(workerSource),
      liveDeliveryRoutePresent: /\/listening-delivery\/live\b/.test(workerSource),
      soloDeliveryRoutePresent: /\/listening-delivery\/solo\b/.test(workerSource),
      uploadAuthorityStatesSoloLivePrivateCutoverUnimplemented: /solo\/live private cutover.*remain unimplemented/.test(uploadAuthority),
    },
    humanAudibleProof: {
      path: 'output/prd0055-task8-local-unblock/browser-plugin-current-teacher-t8p9j2-human-audible-confirmed.json',
      verdict: 'HUMAN_AUDIBLE_AND_NO_WRONG_AUDIO_CONFIRMED_BY_USER',
      teacherUrl: 'http://localhost:5173/teacher-test/T8P9J2',
      fixtureSessionCode: 'T8P9J2',
      userConfirmed: [
        'heard Browser tone',
        'progress advanced',
        'no wrong audio',
        'no interruption',
        'no visible drift',
      ],
    },
  },
  artifactStatus,
  gateStatus,
  deploySensitiveChangedPaths,
  explicitNonActions: [
    'No production deploy was performed by this audit.',
    'A Cloudflare Worker version upload created current-authoring recovery candidate d219c36f-0e0f-489c-a10b-a843ed339bf2 without traffic movement.',
    'No cleanup/delete was performed by this audit.',
    'No selected-user rollout was performed by this audit.',
    'No percentage rollout was performed by this audit.',
    'No commit or push was performed by this audit.',
    'No taskbox was changed to checked by this audit.',
    'The approved dev RTDB internal fixture write for session T8P9J2 is recorded separately and was not cleanup/delete.',
  ],
};

fs.writeFileSync(
  path.join(root, 'output/prd0055-task9-local-readiness/prd0055-final-closure-blocker-audit-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(JSON.stringify({
  verdict: report.verdict,
  gates: report.gateStatus.length,
  remainingUnchecked: Object.keys(report.taskboxes).length,
  deploySensitiveChangedPaths: report.deploySensitiveChangedPaths.length,
  task8Expected: report.localEvidenceSummary.task8Matrix.expected,
  task8Unexpected: report.localEvidenceSummary.task8Matrix.unexpected,
}, null, 2));
