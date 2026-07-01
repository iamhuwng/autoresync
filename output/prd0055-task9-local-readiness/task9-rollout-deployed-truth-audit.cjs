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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function taskUnchecked(taskList, id) {
  return new RegExp(`^\\s*- \\[ \\] ${id.replace('.', '\\.')}\\b`, 'm').test(taskList);
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
const workerSource = readText('cloudflare/worker.js');
const task8Matrix = readJson('output/prd0055-task8-local-unblock/playwright-task8-expanded-report.json');
const task8Supplement = readJson('output/prd0055-task8-local-unblock/playwright-artifacts/local-matrix-supplement.json');
const deployedStatus = readJson('output/prd0055-task9-live-readback/wrangler-deployments-status.json');
const deployedStatusAfterRecoveryUpload = readJson('output/prd0055-task9-live-readback/wrangler-deployments-status-after-recovery-upload.json');
const deployedActiveVersion = readJson('output/prd0055-task9-live-readback/wrangler-version-34970bd6.json');
const deployedPriorVersion = readJson('output/prd0055-task9-live-readback/wrangler-version-3687d2e0.json');
const deployedHistoricalRecoveryVersion = readJson('output/prd0055-task9-live-readback/wrangler-version-959065cd.json');
const currentAuthoringRecoveryVersion = readJson('output/prd0055-task9-live-readback/wrangler-version-d219c36f.json');
const recoveryUploadLog = readText('output/prd0055-task9-live-readback/wrangler-versions-upload-current-authoring-recovery.txt');
const firebaseAuthoringFlag = readText('output/prd0055-task9-live-readback/firebase-listening-authoring-writes-enabled.txt').replace(/^\uFEFF/, '').trim();

const requiredUnchecked = ['8.0', '8.14', '8.15', '8.16', '8.17', '8.18', '9.0', '9.8', '9.10', '9.12', '9.13', '9.15'];
for (const id of requiredUnchecked) {
  assert(taskUnchecked(taskList, id), `Task ${id} is not still unchecked`);
}

const localMatrixOk = task8Matrix?.stats?.expected === 1
  && task8Matrix?.stats?.unexpected === 0
  && task8Matrix?.errors?.length === 0;
assert(localMatrixOk, 'Task 8 local Playwright matrix is not green');

const supplementCoverage = Array.isArray(task8Supplement.covered) ? task8Supplement.covered : [];
for (const required of [
  'student buffering/loading during teacher pause stays paused and pinned before resume',
  'stale compatibility audioCommand does not override newer masterAudioState',
  'equal-revision competing masterAudioState conflict is ignored by the hydrated student client',
  'teacher End flow accepts auto-submit, indexes the result, returns the session to waiting, and preserves the live student result pointer',
  'post-End submit attempt does not create a duplicate result or corrupt the waiting session',
]) {
  assert(supplementCoverage.includes(required), `Task 8 supplement missing coverage: ${required}`);
}

const docsRequireNoClosure = [
  { id: 'findings-no-production-deploy', text: findings, pattern: /No production deploy, cleanup\/delete, selected-user rollout, percentage rollout, commit, push, or merge occurred/ },
  { id: 'architecture-task8-open', text: architecture, pattern: /private-delivery cutover proof.*parent Task 8 acceptance remain open/ },
  { id: 'implementation-task9-open', text: implementationLog, pattern: /Parent Task 9\.0 remains unchecked/ },
  { id: 'traceability-final-execution', text: traceability, pattern: /EV-FINAL-I/ },
  { id: 'upload-authority-private-open', text: uploadAuthority, pattern: /durable cleanup execution, rollback-grace execution, deployed private delivery, solo\/live private cutover.*remain unimplemented/ },
  { id: 'worker-live-delivery-route-absent', text: workerSource, pattern: /\/listening-delivery\/result-review/ },
];
for (const check of docsRequireNoClosure) {
  assert(check.pattern.test(check.text), `Missing no-closure anchor: ${check.id}`);
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

const allChanged = changedPaths();
const deploySensitiveChanged = allChanged.filter((changedPath) => /^(cloudflare\/|firebase\.json$|database\.rules\.json$|r2-backup-worker\/|functions\/|scripts\/prd0055-selected-teacher-worker-proof\.mjs$)/.test(changedPath));
const rollbackMissingCurrentAuthoringBindings = ['LISTENING_AUTHORING_IDEMPOTENCY_SECRET'].filter((name) => !priorBindingNames.includes(name));
const historicalRecoveryMissingCurrentAuthoringBindings = ['FIREBASE_DB_URL', 'GOOGLE_SA_KEY', 'LISTENING_AUTHORING_IDEMPOTENCY_SECRET', 'LISTENING_UPLOAD_SESSION_GRANT_SECRET'].filter((name) => !historicalRecoveryBindingNames.includes(name));
const currentAuthoringRecoveryMissingBindings = ['FIREBASE_DB_URL', 'GOOGLE_SA_KEY', 'LISTENING_AUTHORING_IDEMPOTENCY_SECRET', 'LISTENING_UPLOAD_SESSION_GRANT_SECRET'].filter((name) => !currentAuthoringRecoveryBindingNames.includes(name));
assert(currentAuthoringRecoveryMissingBindings.length === 0, `Current-authoring recovery candidate missing bindings: ${currentAuthoringRecoveryMissingBindings.join(', ')}`);

const gateStatus = [
  {
    task: '8.15',
    status: 'BLOCKED_NOT_CLOSURE',
    reason: 'Task 8.14 remains unchecked and live private delivery/cutover implementation is absent, so Task-8 local live rollout cannot start or close.',
    currentEvidence: [
      'Task 8 localhost fixture matrix is green only: output/prd0055-task8-local-unblock/playwright-task8-expanded-report.json',
      `Session ${task8Supplement.sessionCode} covered ${supplementCoverage.length} local proof slices.`,
      `Deployed Worker readback has active version ${deployedActiveVersion.id} at 100%, but this is current state, not PRD-0055 final rollout proof.`,
      'Human audible/no-wrong-audio/no-interruption/no-visible-drift proof exists for internal fixture T8P9J2.',
      'cloudflare/worker.js exposes /listening-delivery/result-review only; no /listening-delivery/live private delivery route is wired.',
    ],
    missing: [
      'human-assisted/private-delivery pre-cutover gate',
      'live private delivery route/cutover implementation',
      'selected-user, percentage, and full rollout evidence',
    ],
  },
  {
    task: '8.16',
    status: 'PARTIAL_LOCAL_EVIDENCE_NOT_CLOSURE',
    reason: 'Local screenshots, JSON reports, and canonical fixture state exist, but live private delivery implementation, rollout cohort, recovery rehearsal, and deployed/private evidence are absent.',
    currentEvidence: [
      'output/prd0055-task8-local-unblock/playwright-artifacts/local-matrix-supplement.json',
      'output/prd0055-task8-local-unblock/task8-iab-teacher-monitor-after-wait-state.json',
      'output/prd0055-task9-live-readback/wrangler-deployments-status.json',
      'output/prd0055-task9-live-readback/wrangler-version-d219c36f.json',
      'output/prd0055-task9-live-readback/firebase-listening-authoring-writes-enabled.txt',
    ],
    missing: [
      'live private delivery route/cutover implementation',
      'deployed/private delivery refresh evidence',
      'real rollout cohort evidence',
      'controlled recovery/version-pin rehearsal evidence',
    ],
  },
  {
    task: '9.8',
    status: 'BLOCKED_NOT_CLOSURE',
    reason: 'Final rollout cannot be completed while live private delivery/cutover implementation, Task 8.14 private/deployed proof, selected/percentage/full rollout proof, and controlled recovery rehearsal remain absent.',
    currentEvidence: [
      `Cloudflare readback shows deployment ${deployedStatus.id} serving ${activeDeploymentVersion} at 100%.`,
      `Current-authoring recovery candidate ${currentAuthoringRecoveryVersion.id} exists with required bindings and no traffic movement.`,
    ],
    missing: ['live private delivery route/cutover implementation', 'selected cohort evidence', 'percentage rollout evidence', 'full rollout evidence', 'safe rollback/recovery evidence'],
  },
  {
    task: '9.9',
    status: 'LOCAL_STOP_CONDITIONS_RECORDED_NOT_CLOSURE',
    reason: 'Stop conditions are documented, but no real rollout is active to stop.',
    currentEvidence: ['PRD-0055 decisions 101-103 and tasklist 9.9 record stop conditions.'],
    missing: ['active rollout telemetry and stop/no-stop decision evidence'],
  },
  {
    task: '9.10',
    status: 'PARTIAL_DOC_SYNC_NOT_CLOSURE',
    reason: 'Docs now include deployed/current readback and internal fixture state, but final rollout truth is still blocked.',
    currentEvidence: ['EV-FINAL-A/B/C/D/E/F/G/H/I packets are documented.'],
    missing: ['final selected/percentage/full rollout truth', 'controlled recovery/version-pin rehearsal proof', 'live private delivery implementation and deployed/private live cutover proof'],
  },
  {
    task: '9.12',
    status: 'PARTIAL_ROW_READINESS_NOT_CLOSURE',
    reason: 'Section 27 rows have partial local evidence, but final row execution with live private delivery implementation, deployed/private/live, and rollout evidence is still open.',
    currentEvidence: ['EV-FINAL-C, EV-FINAL-E, and current traceability rows REG-45 through REG-55 plus selected live rows.'],
    missing: ['full Section 27 execution as written', 'live private delivery implementation', 'deployed/private/live row evidence', 'human browser evidence where required'],
  },
  {
    task: '9.15',
    status: 'BLOCKED_NOT_CLOSURE',
    reason: 'Parent acceptance is impossible while 8.14-8.18 and 9.1-9.15 remain unchecked, live private delivery/cutover implementation is absent, and rollout/recovery rehearsal evidence is still missing.',
    currentEvidence: ['Partial local readiness, deployed readback, current-authoring recovery-candidate readback, and blocker packets EV-FINAL-A/B/C/D/E/F/G/H/I.'],
    missing: ['all child task closure', 'traceability final zero-orphan proof', 'live private delivery route/cutover implementation', 'controlled recovery/version-pin rehearsal proof', 'selected/percentage/full rollout proof'],
  },
];

const report = {
  createdAt: new Date().toISOString(),
  verdict: 'ROLLOUT_DEPLOYED_TRUTH_BLOCKERS_CONFIRMED_NOT_CLOSURE',
  scope: 'PRD-0055 remaining Task 8/9 rollout and deployed-truth gate audit',
  branchHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  taskboxes: Object.fromEntries(requiredUnchecked.map((id) => [id, 'unchecked'])),
  localTask8Matrix: {
    path: 'output/prd0055-task8-local-unblock/playwright-task8-expanded-report.json',
    expected: task8Matrix.stats.expected,
    unexpected: task8Matrix.stats.unexpected,
    errors: task8Matrix.errors.length,
    durationMs: task8Matrix.stats.duration,
  },
  localTask8Supplement: {
    path: 'output/prd0055-task8-local-unblock/playwright-artifacts/local-matrix-supplement.json',
    sessionCode: task8Supplement.sessionCode,
    testId: task8Supplement.testId,
    coveredCount: supplementCoverage.length,
    finalMasterAudioRevision: task8Supplement.finalMasterAudioState?.revision ?? null,
    latestResultId: task8Supplement.submitDuringEnd?.latestResultId ?? null,
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
  deploySensitiveChangedPaths: deploySensitiveChanged,
  gateStatus,
  explicitNonActions: [
    'No production deploy was performed by this audit.',
    'A Cloudflare Worker version upload created current-authoring recovery candidate d219c36f-0e0f-489c-a10b-a843ed339bf2 without traffic movement.',
    'No cleanup/delete was performed by this audit.',
    'No selected-user rollout was performed by this audit.',
    'No percentage rollout was performed by this audit.',
    'No commit or push was performed by this audit.',
    'The approved dev RTDB internal fixture write for session T8P9J2 is recorded separately and was not cleanup/delete.',
  ],
};

fs.writeFileSync(
  path.join(root, 'output/prd0055-task9-local-readiness/task9-rollout-deployed-truth-audit-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(JSON.stringify({
  verdict: report.verdict,
  gates: report.gateStatus.length,
  deploySensitiveChangedPaths: report.deploySensitiveChangedPaths.length,
  task8Expected: report.localTask8Matrix.expected,
  task8Unexpected: report.localTask8Matrix.unexpected,
}, null, 2));
