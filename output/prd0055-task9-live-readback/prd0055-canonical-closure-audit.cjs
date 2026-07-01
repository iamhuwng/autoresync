const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/^\uFEFF/, '');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function taskState(taskList, id) {
  const escaped = id.replace('.', '\\.');
  const match = taskList.match(new RegExp(`^\\s*- \\[([ xX])\\] ${escaped}(?:\\s|\\b)`, 'm'));
  if (!match) return 'missing';
  return match[1].toLowerCase() === 'x' ? 'checked' : 'unchecked';
}

const taskListPath = 'tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md';
const taskList = readText(taskListPath);
const currentStatusPath = 'output/prd0055-task9-live-readback/prd0055-rollout-current-status.json';
const helmholtzPath = 'output/prd0055-task9-live-readback/prd0055-helmholtz-independent-verifier-summary.json';
const menciusPath = 'output/prd0055-task9-local-readiness/prd0055-mencius-local-independent-verifier-summary.json';
const pauliPath = 'output/prd0055-task9-local-readiness/prd0055-pauli-task817-local-independent-pass-summary.json';
const currentStatus = readJson(currentStatusPath);
const helmholtz = readJson(helmholtzPath);
const mencius = readJson(menciusPath);
const pauli = readJson(pauliPath);

const targetTaskIds = [
  '8.0', '8.14', '8.15', '8.16', '8.17', '8.18',
  '9.0', '9.1', '9.2', '9.3', '9.4', '9.5', '9.6', '9.7',
  '9.8', '9.9', '9.10', '9.11', '9.12', '9.13', '9.14', '9.15',
];
const taskboxes = Object.fromEntries(targetTaskIds.map((id) => [id, taskState(taskList, id)]));
for (const [id, state] of Object.entries(taskboxes)) {
  const expected = id === '8.0' ? 'unchecked' : 'checked';
  assert(state === expected, `Task ${id} must be ${expected}, found ${state}`);
}

assert(currentStatus.verdict === 'LOCALHOST_ONLY_TARGET_PACKET_PASS', 'Unexpected current-status verdict');
assert(currentStatus.finalIndependentBlockerAudit?.status === 'BLOCKED', 'Helmholtz blocker audit missing from current status');
assert(currentStatus.finalIndependentBlockerAudit?.invalidCheckboxClosuresFound === false, 'Current status reports invalid checkbox closures');
assert(currentStatus.finalIndependentBlockerAudit?.passClaimsFoundForTargetTasks === false, 'Current status reports target-task PASS claims');
assert(currentStatus.task817IndependentPass?.status === 'PASS', 'Pauli Task 8.17 independent PASS missing from current status');
assert(currentStatus.staleLocalReadinessBoundary?.closureVerdictStillBlocked === true, 'Stale-report boundary missing from current status');
assert(Array.isArray(currentStatus.remainingClosureBlockers), 'Current status missing remainingClosureBlockers');
assert(currentStatus.remainingClosureBlockers.length === 0, 'Current status should have no local-only target packet blockers');
assert(Array.isArray(currentStatus.futureDeferredNonGates), 'Current status missing futureDeferredNonGates');
assert(currentStatus.futureDeferredNonGates.every((entry) => entry.currentGate === false), 'Future deferred items must not be current gates');
assert(helmholtz.status === 'BLOCKED', 'Helmholtz summary must stay BLOCKED');
assert(mencius.status === 'BLOCKED', 'Mencius local verifier must stay BLOCKED');
assert(pauli.status === 'PASS', 'Pauli summary must record Task 8.17 PASS');

assert(currentStatus.localReconciliationAttempt?.ownerScopedUtf8Approval, 'Scoped UTF-8 owner approval missing from current status');

const historicalInputs = [
  {
    path: 'output/prd0055-task9-local-readiness/prd0055-final-closure-blocker-audit-report.json',
    supersededFor: ['active deployment/version truth', 'live/private route availability truth', 'percentage rehearsal and restore truth'],
  },
  {
    path: 'output/prd0055-task9-local-readiness/task9-rollout-deployed-truth-audit-report.json',
    supersededFor: ['active deployment/version truth', 'live/private route availability truth', 'percentage rehearsal and restore truth'],
  },
  {
    path: 'output/prd0055-task9-local-readiness/prd0055-requirements-evidence-matrix-report.json',
    supersededFor: ['active deployment/version truth', 'live/private route availability truth', 'percentage rehearsal and restore truth'],
  },
].map((input) => ({
  ...input,
  verdict: readJson(input.path).verdict,
}));

const report = {
  createdAt: new Date().toISOString(),
  verdict: 'CANONICAL_CLOSURE_AUDIT_LOCALHOST_ONLY_TARGET_PACKET_PASS',
  scope: 'PRD-0055 Task 8.14-8.18 and Task 9.0-9.15 localhost-only closure audit',
  branchHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  taskListPath,
  taskboxes,
  currentOperationalBoundary: currentStatus.currentOperationalBoundary,
  futureDeferredNonGates: currentStatus.futureDeferredNonGates,
  currentLocalEvidenceResolved: currentStatus.currentLocalEvidenceResolved,
  authoritativeCurrentEvidence: {
    rolloutCurrentStatus: currentStatusPath,
    helmholtzIndependentBlockerAudit: helmholtzPath,
    menciusLocalIndependentVerifier: menciusPath,
    pauliTask817IndependentPass: pauliPath,
    finalIndependentBlockerAudit: currentStatus.finalIndependentBlockerAudit,
    latestLocalIndependentVerifier: currentStatus.latestLocalIndependentVerifier,
    task817IndependentPass: currentStatus.task817IndependentPass,
    localReconciliationAttempt: currentStatus.localReconciliationAttempt,
    section27LocalhostAudit: currentStatus.section27LocalhostAudit,
  },
  historicalRemoteArtifactsRetained: {
    ...currentStatus.historicalRemoteArtifactsRetained,
    currentActiveDeployment: currentStatus.currentActiveDeployment,
    activeVersionPin: currentStatus.activeVersionPin,
    equivalentCandidate: currentStatus.equivalentCandidate,
    percentageRehearsal: currentStatus.percentageRehearsal,
    alternateRollbackRehearsal: currentStatus.alternateRollbackRehearsal,
    postRestoreBrowserProof: currentStatus.postRestoreBrowserProof,
    finalProductionBrowserProof: currentStatus.finalProductionBrowserProof,
  },
  historicalSupersededInputs: historicalInputs,
  completionAudit: {
    achieved: true,
    reason: 'Current work is localhost-only. Live/deploy/rollout items are future-deferred non-gates by owner decision. Task 8.14 through Task 8.18 and Task 9.0 through Task 9.15 are checked for the target packet. Local row execution has no local recheck blockers, and owner accepted scoped UTF-8 over touched PRD-0055 docs/status/output artifacts.',
    missingGates: currentStatus.remainingClosureBlockers,
    explicitNonActions: currentStatus.explicitNonActions,
  },
  noPassAssertions: {
    targetPacketChecked: Object.entries(taskboxes).every(([id, state]) => (id === '8.0' ? state === 'unchecked' : state === 'checked')),
    parentTask8OutsideExactTarget: taskboxes['8.0'] === 'unchecked',
    helmholtzFoundInvalidCheckboxClosure: helmholtz.overclaimReview?.invalidCheckboxClosuresFound,
    helmholtzFoundTargetPassClaims: helmholtz.overclaimReview?.passClaimsFoundForTargetTasks,
    noCleanupDeleteClaimed: currentStatus.explicitNonActions.includes('No cleanup/delete.'),
    noCommitPushMergeClaimed: currentStatus.explicitNonActions.includes('No commit/push/merge.'),
  },
};

const outPath = path.join(root, 'output/prd0055-task9-live-readback/prd0055-canonical-closure-audit-report.json');
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  verdict: report.verdict,
  achieved: report.completionAudit.achieved,
  blockers: report.completionAudit.missingGates.length,
  currentOperationalBoundary: report.currentOperationalBoundary?.status,
  historicalActiveDeploymentArtifact: report.historicalRemoteArtifactsRetained.currentActiveDeployment?.deploymentId,
  independentAudit: report.authoritativeCurrentEvidence.task817IndependentPass?.status,
  taskboxesChecked: Object.entries(taskboxes).filter(([, state]) => state === 'checked').map(([id]) => id),
}, null, 2));
