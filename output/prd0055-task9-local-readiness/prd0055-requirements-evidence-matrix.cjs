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

function statusOf(condition, passStatus, failStatus) {
  return condition ? passStatus : failStatus;
}

const taskList = readText('tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md');
const traceability = readText('tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md');
const findings = readText('tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md');
const implementationLog = readText('documentation/ielts-reading-v2-listening-unification-implementation-log.md');
const architecture = readText('documentation/architecture/ielts-reading-v2-listening-unification.md');
const uploadAuthority = readText('documentation/architecture/upload-storage-authority.md');
const prd0060 = readText('tasks/0060-prd-listening-live-session-authority-runtime-load-test-plan.md');
const workerSource = readText('cloudflare/worker.js');

const task8Matrix = readJson('output/prd0055-task8-local-unblock/playwright-task8-expanded-report.json');
const task8Supplement = readJson('output/prd0055-task8-local-unblock/playwright-artifacts/local-matrix-supplement.json');
const compatibility = readJson('output/prd0055-task9-local-readiness/task9-compatibility-readiness-report.json');
const boundary = readJson('output/prd0055-task9-local-readiness/boundary-static-readiness-report.json');
const observability = readJson('output/prd0055-task9-local-readiness/task9-observability-live-regression-report.json');
const rtdbRules = readJson('output/prd0055-task9-local-readiness/task9-rtdb-rules-emulator-report.json');
const workerAuth = readJson('output/prd0055-task9-local-readiness/task9-worker-auth-negative-report.json');
const deferredResidue = readJson('output/prd0055-task9-local-readiness/task9-deferred-residue-review-report.json');
const rolloutAudit = readJson('output/prd0055-task9-local-readiness/task9-rollout-deployed-truth-audit-report.json');
const closureAudit = readJson('output/prd0055-task9-local-readiness/prd0055-final-closure-blocker-audit-report.json');
const independentGateAudit = readJson('output/prd0055-task9-local-readiness/prd0055-final-independent-gate-audit-summary.json');
const humanAudibleProof = readJson('output/prd0055-task8-local-unblock/browser-plugin-current-teacher-t8p9j2-human-audible-confirmed.json');
const deployedStatus = readJson('output/prd0055-task9-live-readback/wrangler-deployments-status.json');
const deployedStatusAfterRecoveryUpload = readJson('output/prd0055-task9-live-readback/wrangler-deployments-status-after-recovery-upload.json');
const deployedActiveVersion = readJson('output/prd0055-task9-live-readback/wrangler-version-34970bd6.json');
const deployedPriorVersion = readJson('output/prd0055-task9-live-readback/wrangler-version-3687d2e0.json');
const deployedHistoricalRecoveryVersion = readJson('output/prd0055-task9-live-readback/wrangler-version-959065cd.json');
const currentAuthoringRecoveryVersion = readJson('output/prd0055-task9-live-readback/wrangler-version-d219c36f.json');
const firebaseAuthoringFlag = readText('output/prd0055-task9-live-readback/firebase-listening-authoring-writes-enabled.txt').replace(/^\uFEFF/, '').trim();

const remainingTaskIds = [
  '8.14', '8.15', '8.16', '8.17', '8.18',
  '9.0', '9.1', '9.2', '9.3', '9.4', '9.5', '9.6', '9.7', '9.8',
  '9.9', '9.10', '9.11', '9.12', '9.13', '9.14', '9.15',
];
const taskboxes = Object.fromEntries(remainingTaskIds.map((id) => [id, taskState(taskList, id)]));

const task8Green = task8Matrix?.stats?.expected === 1
  && task8Matrix?.stats?.unexpected === 0
  && Array.isArray(task8Matrix.errors)
  && task8Matrix.errors.length === 0;
const task8Covered = Array.isArray(task8Supplement.covered) ? task8Supplement.covered : [];
const matrixHas = (needle) => task8Covered.some((item) => item.includes(needle));
const allTaskboxesUnchecked = Object.values(taskboxes).every((state) => state === 'unchecked');
const deploySensitiveChangedPaths = changedPaths().filter((changedPath) => /^(cloudflare\/|firebase\.json$|database\.rules\.json$|r2-backup-worker\/|functions\/|scripts\/prd0055-selected-teacher-worker-proof\.mjs$)/.test(changedPath));
const bindingNames = (version) => (version?.resources?.bindings ?? []).map((binding) => binding.name).filter(Boolean).sort();
const activeBindingNames = bindingNames(deployedActiveVersion);
const priorBindingNames = bindingNames(deployedPriorVersion);
const historicalRecoveryBindingNames = bindingNames(deployedHistoricalRecoveryVersion);
const currentAuthoringRecoveryBindingNames = bindingNames(currentAuthoringRecoveryVersion);
const activeDeploymentVersion = deployedStatus.versions?.find((version) => version.percentage === 100)?.version_id ?? null;
const activeDeploymentVersionAfterRecoveryUpload = deployedStatusAfterRecoveryUpload.versions?.find((version) => version.percentage === 100)?.version_id ?? null;
const rollbackMissingCurrentAuthoringBindings = ['LISTENING_AUTHORING_IDEMPOTENCY_SECRET'].filter((name) => !priorBindingNames.includes(name));
const historicalRecoveryMissingCurrentAuthoringBindings = ['FIREBASE_DB_URL', 'GOOGLE_SA_KEY', 'LISTENING_AUTHORING_IDEMPOTENCY_SECRET', 'LISTENING_UPLOAD_SESSION_GRANT_SECRET'].filter((name) => !historicalRecoveryBindingNames.includes(name));
const currentAuthoringRecoveryMissingBindings = ['FIREBASE_DB_URL', 'GOOGLE_SA_KEY', 'LISTENING_AUTHORING_IDEMPOTENCY_SECRET', 'LISTENING_UPLOAD_SESSION_GRANT_SECRET'].filter((name) => !currentAuthoringRecoveryBindingNames.includes(name));
const livePrivateDeliveryRoutePresent = /\/listening-delivery\/live\b/.test(workerSource);
const soloPrivateDeliveryRoutePresent = /\/listening-delivery\/solo\b/.test(workerSource);
const uploadAuthorityStatesSoloLivePrivateCutoverUnimplemented = /solo\/live private cutover.*remain unimplemented/.test(uploadAuthority);

const matrix = [
  {
    id: 'SCOPE-REMAINING-TASKS',
    requirement: 'Remaining scope is Task 8.14-8.18 and Task 9.0-9.15 only.',
    status: statusOf(allTaskboxesUnchecked, 'OPEN_AND_TRACKED', 'CONTRADICTED'),
    evidence: ['tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md', 'EV-FINAL-F'],
    missing: ['Actual closure for each unchecked task.'],
  },
  {
    id: 'NONACTIONS',
    requirement: 'No Task 10/unrelated work, no cleanup/delete, commit, push, branch merge, production deploy, selected-user rollout, or percentage rollout. Approved dev RTDB internal fixture writes are recorded separately.',
    status: 'PROVEN_FOR_THIS_AUDIT_SLICE',
    evidence: [
      'output/prd0055-task9-local-readiness/task9-rollout-deployed-truth-audit-report.json',
      'output/prd0055-task9-local-readiness/prd0055-final-closure-blocker-audit-report.json',
      'output/prd0055-task8-local-unblock/browser-audible-fixture.json',
    ],
    missing: ['N/A for this local audit slice.'],
  },
  {
    id: 'HARD-8.14-HUMAN-BROWSER',
    requirement: 'Human-assisted browser proof is required for Task 8.14.',
    status: 'PARTIAL_LOCAL_HUMAN_AUDIBLE_PROVEN',
    evidence: [`${humanAudibleProof.verdict}: user manually clicked teacher Audio Control Panel at ${humanAudibleProof.teacherUrl} and heard Browser tone; progress advanced; no wrong audio, interruption, or visible drift observed.`],
    missing: ['Live private delivery route/cutover implementation, full private-delivery proof, deployed human speaker proof, rollout and recovery evidence.'],
  },
  {
    id: 'HARD-9.13-HUMAN-BROWSER',
    requirement: 'Human-assisted final browser proof is required for Task 9.13.',
    status: 'PARTIAL_LOCAL_HUMAN_BROWSER_PROVEN',
    evidence: ['Teacher audible/no-wrong-audio/no-interruption proof exists for T8P9J2 with exact URL, fixture ID, screenshot, JSON artifact, and Browser state.'],
    missing: ['Student desktop/mobile human or equivalent final browser packet, network evidence, durable DB evidence, live private delivery implementation, deployed/private proof, rollout/recovery artifacts.'],
  },
  {
    id: 'HARD-ROLLOUT-DEPLOYED-TRUTH',
    requirement: 'Real rollout/deployed-truth evidence is required for 8.15, 8.16, 9.8, 9.10, 9.12, and 9.15.',
    status: 'PARTIAL_DEPLOYED_READBACK_BLOCKED',
    evidence: [`Cloudflare readback shows ${deployedStatus.id} serving ${activeDeploymentVersion} at 100%, post-upload readback still serves ${activeDeploymentVersionAfterRecoveryUpload} at 100%, Firebase authoring writes flag ${firebaseAuthoringFlag}, recovery candidate ${currentAuthoringRecoveryVersion.id} has current-authoring bindings, worker live private route present=${livePrivateDeliveryRoutePresent}, and EV-FINAL-E records 7 gate blockers.`],
    missing: ['Live private delivery route/cutover implementation, selected/percentage/full rollout evidence, deployed/current live private-delivery truth, controlled rollback/recovery rehearsal proof.'],
  },
  {
    id: 'HARD-8.17-INDEPENDENT-VERIFICATION',
    requirement: 'Final independent verification is required for 8.17.',
    status: 'MISSING_BLOCKED',
    evidence: ['output/prd0055-task9-local-readiness/prd0055-final-independent-gate-audit-summary.json records BLOCKED.'],
    missing: ['Fresh-context independent verification after complete 8.14-8.16 evidence exists.'],
  },
  {
    id: 'HARD-PARENTS',
    requirement: 'Parent Task 8.0 and Task 9.0 may be checked only after all children truly pass.',
    status: 'BLOCKED_NOT_CLOSURE',
    evidence: ['Taskbox scan and EV-FINAL-F keep all target taskboxes unchecked.'],
    missing: ['8.14-8.18 and 9.1-9.15 closure.'],
  },
  {
    id: 'BROWSER-MATRIX-LOCAL',
    requirement: 'Automated integration/a11y/browser local proof for teacher desktop, student desktop, and student mobile.',
    status: statusOf(task8Green && task8Covered.length >= 9, 'PARTIAL_LOCAL_PROVEN', 'MISSING_OR_FAILING'),
    evidence: [
      'output/prd0055-task8-local-unblock/playwright-task8-expanded-report.json',
      'output/prd0055-task8-local-unblock/playwright-artifacts/local-matrix-supplement.json',
    ],
    missing: ['Deployed/private delivery proof and final Task 9.13 full browser packet.'],
  },
  {
    id: 'BROWSER-SCENARIOS',
    requirement: 'Prove normal/late join, teacher/student reload, pause/resume/skip/seek/speed, buffering, stale command, authority conflict, headphone states, accepted/rejected submit during session end.',
    status: statusOf(
      matrixHas('teacher desktop')
      && matrixHas('student desktop')
      && matrixHas('student mobile')
      && matrixHas('stale compatibility audioCommand')
      && matrixHas('equal-revision competing masterAudioState')
      && matrixHas('post-End submit'),
      'PARTIAL_LOCAL_PROVEN',
      'PARTIAL_OR_MISSING',
    ),
    evidence: ['output/prd0055-task8-local-unblock/playwright-artifacts/local-matrix-supplement.json'],
    missing: ['Deployed/private/live and final full browser packet.'],
  },
  {
    id: 'ROLLBACK-RECOVERY-EVIDENCE',
    requirement: 'Record rollout cohort, recovery evidence, and rollback paths.',
    status: statusOf(currentAuthoringRecoveryMissingBindings.length === 0 && activeDeploymentVersionAfterRecoveryUpload === deployedActiveVersion.id, 'PARTIAL_RECOVERY_VERSION_PROVEN_BLOCKED', 'MISSING_BLOCKED'),
    evidence: [
      `Prior version ${deployedPriorVersion.id} misses ${rollbackMissingCurrentAuthoringBindings.join(', ') || 'no current authoring binding'}.`,
      `Historical recovery version ${deployedHistoricalRecoveryVersion.id} misses ${historicalRecoveryMissingCurrentAuthoringBindings.join(', ') || 'no current authoring binding'}.`,
      `Current-authoring recovery candidate ${currentAuthoringRecoveryVersion.id} misses ${currentAuthoringRecoveryMissingBindings.join(', ') || 'no required binding'} and traffic stayed on ${activeDeploymentVersionAfterRecoveryUpload}.`,
    ],
    missing: ['Real cohort/recovery/rollback rehearsal under approved rollout, including controlled version-pin/rollback proof and stop-condition decision evidence.'],
  },
  {
    id: 'READING-V2-UNCHANGED',
    requirement: 'Verify Reading V2 flows unchanged.',
    status: statusOf(compatibility.verdict === 'LOCAL_COMPATIBILITY_READINESS_PASS_NOT_CLOSURE', 'PARTIAL_LOCAL_PROVEN', 'MISSING_OR_FAILING'),
    evidence: ['output/prd0055-task9-local-readiness/task9-compatibility-readiness-report.json'],
    missing: ['Final dirty-tree/deployed/live compatibility review.'],
  },
  {
    id: 'LEGACY-R2-LISTENING',
    requirement: 'Verify legacy R2-backed Listening results remain readable.',
    status: statusOf(compatibility.verdict === 'LOCAL_COMPATIBILITY_READINESS_PASS_NOT_CLOSURE', 'PARTIAL_LOCAL_PROVEN', 'MISSING_OR_FAILING'),
    evidence: ['output/prd0055-task9-local-readiness/task9-compatibility-readiness-report.json'],
    missing: ['Deployed/private/live compatibility proof.'],
  },
  {
    id: 'NO-GOOGLE-DRIVE-CHANGE',
    requirement: 'Verify no Google Drive behavior changed.',
    status: statusOf(
      compatibility.googleDrive?.changedGoogleDriveFiles?.length === 0
      && compatibility.googleDrive?.googleDriveNamedChangedPaths?.length === 0,
      'PARTIAL_LOCAL_PROVEN',
      'CONTRADICTED',
    ),
    evidence: ['output/prd0055-task9-local-readiness/task9-compatibility-readiness-report.json'],
    missing: ['Final dirty-tree review at closure.'],
  },
  {
    id: 'SHARED-BOUNDARY',
    requirement: 'Verify shared-layer import/API boundaries.',
    status: statusOf(boundary.verdict === 'LOCAL_STATIC_PASS_NOT_CLOSURE', 'PARTIAL_LOCAL_PROVEN', 'MISSING_OR_FAILING'),
    evidence: ['output/prd0055-task9-local-readiness/boundary-static-readiness-report.json'],
    missing: ['Final post-last-edit full boundary scan.'],
  },
  {
    id: 'AUTHORIZATION-NEGATIVE',
    requirement: 'Verify every new Firebase/worker read/write path has authorization and negative tests.',
    status: statusOf(rtdbRules.success && workerAuth.success, 'PARTIAL_LOCAL_PROVEN', 'MISSING_OR_FAILING'),
    evidence: [
      'output/prd0055-task9-local-readiness/task9-rtdb-rules-emulator-report.json',
      'output/prd0055-task9-local-readiness/task9-worker-auth-negative-report.json',
    ],
    missing: ['Deployed/current rule truth and final all-path review.'],
  },
  {
    id: 'OBSERVABILITY-ANNOUNCEMENTS',
    requirement: 'Verify observability/feature-registry/shared announcements for visible user actions.',
    status: statusOf(observability.success, 'PARTIAL_LOCAL_PROVEN', 'MISSING_OR_FAILING'),
    evidence: ['output/prd0055-task9-local-readiness/task9-observability-live-regression-report.json'],
    missing: ['Every final action surface review, including authoring Save/Publish/discard/retry/conflict/archive-delete paths and final browser proof.'],
  },
  {
    id: 'SECTION-27',
    requirement: 'Execute every section 27 regression-checklist item and attach traceability evidence.',
    status: 'PARTIAL_LOCAL_ONLY_BLOCKED',
    evidence: ['EV-FINAL-E and EV-FINAL-F identify partial row readiness only.'],
    missing: ['Full Section 27 execution as written, live private delivery implementation, deployed/private/live row evidence, and full final browser packet where required.'],
  },
  {
    id: 'DEFERRED-RESIDUE',
    requirement: 'Review all deferred residue and classify as resolved, approved deferral, or blocker.',
    status: statusOf(deferredResidue.verdict === 'LOCAL_DEFERRED_RESIDUE_REVIEW_PASS_NOT_CLOSURE', 'PARTIAL_LOCAL_PROVEN', 'MISSING_OR_FAILING'),
    evidence: ['output/prd0055-task9-local-readiness/task9-deferred-residue-review-report.json'],
    missing: ['Final dirty-tree and production-truth review.'],
  },
  {
    id: 'PROOF-CATEGORIES',
    requirement: 'Focused/cross-system/live authority/AudioPlayer/solo/homework/Reading V2/Firebase-worker/security/a11y/browser proof must exist where applicable.',
    status: 'PARTIAL_LOCAL_PROVEN',
    evidence: [
      'output/prd0055-task8-local-unblock/focused-unit-report.json',
      'output/prd0055-task8-local-unblock/cross-system-compat-report.json',
      'output/prd0055-task9-local-readiness/task9-worker-auth-negative-report.json',
      'output/prd0055-task9-local-readiness/task9-rtdb-rules-emulator-report.json',
      'output/prd0055-task8-local-unblock/playwright-task8-after-browser-audio-fix-180s-report.json',
      'output/prd0055-task8-local-unblock/audio-progress-panel-duration-fix-report.json',
    ],
    missing: ['Final focused/cross-system rerun after docs/audit edits and final independent verification.'],
  },
  {
    id: 'DOCS-RECONCILIATION',
    requirement: 'Findings, traceability, implementation log, architecture/current-state docs all reconciled to live truth.',
    status: statusOf(
      /EV-FINAL-I/.test(traceability)
      && /REQUIREMENTS_MATRIX_PARTIAL_LOCAL_EVIDENCE_CLOSURE_BLOCKED/.test(findings)
      && /REQUIREMENTS_MATRIX_PARTIAL_LOCAL_EVIDENCE_CLOSURE_BLOCKED/.test(implementationLog)
      && /FINAL_CLOSURE_EXECUTION_BLOCKED_AFTER_READBACK/.test(implementationLog)
      && /requirements matrix remains blocked/.test(architecture),
      'PARTIAL_LOCAL_RECONCILED',
      'MISSING_OR_STALE',
    ),
    evidence: [
      'tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md',
      'tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md',
      'documentation/ielts-reading-v2-listening-unification-implementation-log.md',
      'documentation/architecture/ielts-reading-v2-listening-unification.md',
      'documentation/architecture/upload-storage-authority.md',
      'cloudflare/worker.js',
    ],
    missing: ['Docs matching deployed/live/production truth after final rollout.'],
  },
  {
    id: 'PRD-0060-FUTURE-GATES',
    requirement: 'PRD-0060 browser proof, rollout, rollback, and future implementation gates must be respected.',
    status: statusOf(/Future implementation is done only when/.test(prd0060), 'BLOCKER_DOCUMENTED', 'MISSING_OR_STALE'),
    evidence: ['tasks/0060-prd-listening-live-session-authority-runtime-load-test-plan.md'],
    missing: ['Product-owner and architecture/security approval, deployed/live human gates, internal/selected/percentage rollout, controlled rollback/recovery proof.'],
  },
];

const counts = matrix.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {});

const report = {
  createdAt: new Date().toISOString(),
  verdict: 'REQUIREMENTS_MATRIX_PARTIAL_LOCAL_EVIDENCE_CLOSURE_BLOCKED',
  scope: 'PRD-0055 remaining Task 8.14-8.18 and Task 9.0-9.15 objective requirements',
  branchHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  taskboxes,
  counts,
  deploySensitiveChangedPaths,
  matrix,
  sourceArtifacts: [
    'output/prd0055-task8-local-unblock/playwright-task8-expanded-report.json',
    'output/prd0055-task8-local-unblock/playwright-artifacts/local-matrix-supplement.json',
    'output/prd0055-task9-local-readiness/prd0055-final-closure-blocker-audit-report.json',
    'output/prd0055-task9-local-readiness/prd0055-final-independent-gate-audit-summary.json',
    'output/prd0055-task9-live-readback/wrangler-deployments-status.json',
    'output/prd0055-task9-live-readback/wrangler-deployments-status-after-recovery-upload.json',
    'output/prd0055-task9-live-readback/wrangler-version-d219c36f.json',
    'output/prd0055-task9-live-readback/wrangler-versions-upload-current-authoring-recovery.txt',
    'output/prd0055-task8-local-unblock/browser-plugin-current-teacher-t8p9j2-pending-human-audible-proof.json',
    'output/prd0055-task8-local-unblock/browser-plugin-current-teacher-t8p9j2-human-audible-confirmed.json',
    'cloudflare/worker.js',
    'documentation/architecture/upload-storage-authority.md',
  ],
  livePrivateDeliveryImplementation: {
    workerSourcePath: 'cloudflare/worker.js',
    resultReviewRoutePresent: /\/listening-delivery\/result-review/.test(workerSource),
    liveDeliveryRoutePresent: livePrivateDeliveryRoutePresent,
    soloDeliveryRoutePresent: soloPrivateDeliveryRoutePresent,
    uploadAuthorityStatesSoloLivePrivateCutoverUnimplemented,
  },
  explicitNonActions: [
    'No production deploy was performed by this matrix audit.',
    'A Cloudflare Worker version upload created current-authoring recovery candidate d219c36f-0e0f-489c-a10b-a843ed339bf2 without traffic movement.',
    'No cleanup/delete was performed by this matrix audit.',
    'No selected-user rollout was performed by this matrix audit.',
    'No percentage rollout was performed by this matrix audit.',
    'No commit or push was performed by this matrix audit.',
    'No taskbox was changed to checked by this matrix audit.',
    'The approved dev RTDB internal fixture write for session T8P9J2 is recorded separately and was not cleanup/delete.',
  ],
};

for (const artifact of report.sourceArtifacts) {
  if (!exists(artifact)) {
    throw new Error(`Missing source artifact: ${artifact}`);
  }
}

fs.writeFileSync(
  path.join(root, 'output/prd0055-task9-local-readiness/prd0055-requirements-evidence-matrix-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(JSON.stringify({
  verdict: report.verdict,
  requirements: matrix.length,
  counts,
  task8Expected: task8Matrix.stats.expected,
  task8Unexpected: task8Matrix.stats.unexpected,
  remainingUnchecked: Object.keys(taskboxes).filter((id) => taskboxes[id] === 'unchecked').length,
  deploySensitiveChangedPaths: deploySensitiveChangedPaths.length,
}, null, 2));
