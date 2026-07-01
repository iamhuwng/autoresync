const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');

function readJson(relativePath) {
  const buffer = fs.readFileSync(path.join(root, relativePath));
  const text = (
    buffer[0] === 0xff && buffer[1] === 0xfe
      ? buffer.toString('utf16le')
      : buffer.includes(0)
        ? buffer.toString('utf16le')
        : buffer.toString('utf8')
  ).replace(/^\uFEFF/, '');
  return JSON.parse(text);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function taskState(taskList, id) {
  const escaped = id.replace('.', '\\.');
  const match = taskList.match(new RegExp(`^\\s*- \\[([ xX])\\] ${escaped}(?:\\s|\\b)`, 'm'));
  return match ? (match[1].toLowerCase() === 'x' ? 'checked' : 'unchecked') : 'missing';
}

const taskList = readText('tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md');
const equivalent = readJson('output/prd0055-task9-live-readback/wrangler-equivalent-candidate-summary.json');
const percentage = readJson('output/prd0055-task9-live-readback/wrangler-percentage-split-rehearsal-summary.json');
const pin = readJson('output/prd0055-task9-live-readback/wrangler-active-pin-apply-status.txt');
const postPinSmoke = readJson('output/prd0055-task9-live-readback/prd0055-selected-class-live-1782841132794.json');
const splitSmoke = readJson('output/prd0055-task9-live-readback/prd0055-selected-class-live-1782841830774.json');
const restoreSmoke = readJson('output/prd0055-task9-live-readback/prd0055-selected-class-live-1782841911531.json');
const selectedBrowser = readJson('output/prd0055-task9-live-readback/prd0055-selected-class-live-1782839559853-browser/selected-class-browser-proof.json');
const restoreBrowserReport = readJson('output/prd0055-task9-live-readback/selected-class-deployed-browser-report-1782841911531-after-percentage.json');
const restoreBrowserProof = readJson('output/prd0055-task9-live-readback/prd0055-selected-class-live-1782841911531-browser/selected-class-browser-proof.json');
const alternateRollback = readJson('output/prd0055-task9-live-readback/wrangler-alternate-rollback-rehearsal-summary.json');
const finalProductionBrowserReport = readJson('output/prd0055-task9-live-readback/final-production-browser-report-1782847310086.json');
const finalProductionBrowserProof = readJson('output/prd0055-task9-live-readback/prd0055-final-live-private-1782847310086-final-browser/final-production-browser-proof.json');
const helmholtzAudit = readJson('output/prd0055-task9-live-readback/prd0055-helmholtz-independent-verifier-summary.json');
const menciusAudit = readJson('output/prd0055-task9-local-readiness/prd0055-mencius-local-independent-verifier-summary.json');
const pauliAudit = readJson('output/prd0055-task9-local-readiness/prd0055-pauli-task817-local-independent-pass-summary.json');
const section27LocalhostAudit = readJson('output/prd0055-task9-local-readiness/prd0055-section27-localhost-audit-report.json');
const localReconciliationAttempt = readJson('output/prd0055-task9-local-readiness/prd0055-post-task817-local-reconciliation-attempt.json');

const remainingIds = [
  '8.0', '8.14', '8.15', '8.16', '8.17', '8.18',
  '9.0', '9.1', '9.2', '9.3', '9.4', '9.5', '9.6', '9.7',
  '9.8', '9.9', '9.10', '9.11', '9.12', '9.13', '9.14', '9.15',
];
const taskboxes = Object.fromEntries(remainingIds.map((id) => [id, taskState(taskList, id)]));

const splitStatus = percentage.operations.find((operation) => operation.name === 'split-99-1-status')?.json;
const restoreStatus = percentage.operations.find((operation) => operation.name === 'restore-active-100-status')?.json;

const currentLocalBlockers = localReconciliationAttempt.currentBlockers;

const report = {
  createdAt: new Date().toISOString(),
  verdict: 'LOCALHOST_ONLY_TARGET_PACKET_PASS',
  scope: 'PRD-0055 Task 8.14-8.18 and Task 9.0-9.15 localhost-only current status; live-domain/deployed proof is historical and deferred',
  branchHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  taskboxes,
  currentOperationalBoundary: {
    recordedAt: '2026-07-01',
    status: 'localhost-only implementation and proof boundary',
    reason: 'User clarified there is no current live-server deploy for this implementation slice, so live-domain testing cannot be a current gate.',
    allowedCurrentTargets: ['http://localhost:5173', 'http://localhost:5174'],
    forbiddenCurrentActions: [
      'no live-domain browser proof',
      'no production deploy',
      'no selected-user rollout',
      'no percentage rollout',
      'no full rollout',
      'no cleanup/delete',
      'no commit/push/merge',
    ],
    futureOwner: 'PRD-0062 Listening Deployed Truth And Production Rollout Closure, or a separately approved future deploy/rollout PRD',
    historicalLiveArtifactsOnly: true,
  },
  futureDeferredNonGates: [
    {
      item: 'live-domain/deployed proof',
      futureOwner: 'PRD-0062 or separately approved future deploy/rollout PRD',
      currentGate: false,
    },
    {
      item: 'selected-user rollout',
      futureOwner: 'PRD-0062 or separately approved future deploy/rollout PRD',
      currentGate: false,
    },
    {
      item: 'percentage rollout',
      futureOwner: 'PRD-0062 or separately approved future deploy/rollout PRD',
      currentGate: false,
    },
    {
      item: 'full rollout',
      futureOwner: 'PRD-0062 or separately approved future deploy/rollout PRD',
      currentGate: false,
    },
    {
      item: 'human production acceptance',
      futureOwner: 'PRD-0062 or separately approved future deploy/rollout PRD',
      currentGate: false,
    },
    {
      item: 'Section 27 rows REG-17 through REG-23 and REG-26',
      futureOwner: 'approved future deferrals already recorded in traceability',
      currentGate: false,
    },
  ],
  currentLocalEvidenceResolved: [
    'Task 8.14 localhost teacher/student browser matrix and human audible/no-wrong-audio proof are present; Task 8.14 is checked for the localhost-only packet.',
    'Task 8.15 closes as a no-live-rollout/current-deferral record; selected-user, percentage, and full rollout remain future-deferred non-gates.',
    'Task 8.16 localhost evidence capture is recorded through local browser/human proof, Playwright JSON, matrix supplement, local authorization/security reports, Section 27 audit, status artifacts, and scoped UTF-8 acceptance.',
    'Section 27 localhost row execution has 0 local recheck rows and REG-79 is accepted.',
    'Scoped stale-doc scan found no current REG-79/76-row/1-local-blocker wording in target closure artifacts.',
    'Task 8.17 fresh independent localhost-only verification PASS is recorded by Pauli.',
    'Task 8.18 local-only parent acceptance is reconciled for the target packet; selected live traffic survival is future-deferred and not a current gate.',
    'Task 9.0 through Task 9.15 are reconciled for the localhost-only target packet. Rollout/deploy/live-server criteria are future-deferred non-gates by owner decision.',
    'Owner accepted scoped UTF-8 over touched PRD-0055 docs/status/output artifacts; repo-wide pre-existing non-UTF-8 files remain out of scope and were not cleaned or converted.',
    'Post-Task-8.17 final local proof passed build, focused audio/runtime Vitest, focused security Vitest, boundary/static scan, compatibility readiness, deferred-residue review, Section 27 localhost audit, scoped touched-file UTF-8, and git diff check.',
  ],
  historicalRemoteArtifactsRetained: {
    classification: 'retained_only_not_current_localhost_unlock_proof',
    reason: 'These artifacts predate the current localhost-only boundary correction and must not drive current PRD-0055 closure.',
    sourceDir: 'output/prd0055-task9-live-readback',
    forbiddenAsCurrentGate: true,
    deferredTo: 'PRD-0062 or a separately approved future deploy/rollout PRD',
  },
  activeVersionPin: {
    classification: 'historical_remote_artifact_not_current_localhost_proof',
    deploymentId: pin.id,
    strategy: pin.strategy,
    versions: pin.versions,
  },
  equivalentCandidate: {
    classification: 'historical_remote_artifact_not_current_localhost_proof',
    versionId: equivalent.candidateVersionId,
    activeVersionId: equivalent.activeVersionId,
    equivalent: equivalent.equivalent,
    safeForTrafficSplit: equivalent.safeForTrafficSplit,
    summaryPath: 'output/prd0055-task9-live-readback/wrangler-equivalent-candidate-summary.json',
  },
  percentageRehearsal: {
    classification: 'historical_remote_artifact_not_current_localhost_proof',
    passed: percentage.passed,
    splitDeploymentId: splitStatus?.id,
    splitVersions: splitStatus?.versions,
    restoreDeploymentId: restoreStatus?.id,
    restoreVersions: restoreStatus?.versions,
    restoredActive100: percentage.restoredActive100,
    summaryPath: 'output/prd0055-task9-live-readback/wrangler-percentage-split-rehearsal-summary.json',
  },
  alternateRollbackRehearsal: {
    classification: 'historical_remote_artifact_not_current_localhost_proof',
    passed: alternateRollback.passed,
    candidateVersionId: alternateRollback.candidateVersionId,
    activeVersionId: alternateRollback.activeVersionId,
    candidate100DeploymentId: alternateRollback.operations.find((operation) => operation.name === 'candidate-100-status')?.json?.id,
    candidate100Versions: alternateRollback.operations.find((operation) => operation.name === 'candidate-100-status')?.json?.versions,
    candidateSmokeSession: alternateRollback.operations.find((operation) => operation.name === 'candidate-100-smoke')?.sessionCode,
    restoreDeploymentId: alternateRollback.operations.find((operation) => operation.name === 'restore-active-100-status')?.json?.id,
    restoreVersions: alternateRollback.operations.find((operation) => operation.name === 'restore-active-100-status')?.json?.versions,
    restoreSmokeSession: alternateRollback.operations.find((operation) => operation.name === 'restore-active-100-smoke')?.sessionCode,
    restoredActive100: alternateRollback.restoredActive100,
    summaryPath: 'output/prd0055-task9-live-readback/wrangler-alternate-rollback-rehearsal-summary.json',
  },
  currentActiveDeployment: {
    classification: 'historical_remote_artifact_not_current_localhost_proof',
    deploymentId: restoreStatus?.id,
    strategy: restoreStatus?.strategy,
    versions: restoreStatus?.versions,
    source: 'historical restore-active-100-status from output/prd0055-task9-live-readback/wrangler-percentage-split-rehearsal-summary.json',
  },
  liveSmokeProofs: [
    {
      label: 'post-active-pin',
      path: 'output/prd0055-task9-live-readback/prd0055-selected-class-live-1782841132794.json',
      sessionCode: postPinSmoke.fixture?.sessionCode,
      passed: postPinSmoke.passed,
    },
    {
      label: 'during-99-1-split',
      path: 'output/prd0055-task9-live-readback/prd0055-selected-class-live-1782841830774.json',
      sessionCode: splitSmoke.fixture?.sessionCode,
      passed: splitSmoke.passed,
    },
    {
      label: 'after-restore-active-100',
      path: 'output/prd0055-task9-live-readback/prd0055-selected-class-live-1782841911531.json',
      sessionCode: restoreSmoke.fixture?.sessionCode,
      passed: restoreSmoke.passed,
    },
  ],
  selectedClassBrowserProof: {
    path: 'output/prd0055-task9-live-readback/prd0055-selected-class-live-1782839559853-browser/selected-class-browser-proof.json',
    blockingDeliveryFailures: selectedBrowser.blockingDeliveryFailures,
    benignMediaAborts: selectedBrowser.benignMediaAborts,
  },
  postRestoreBrowserProof: {
    reportPath: 'output/prd0055-task9-live-readback/selected-class-deployed-browser-report-1782841911531-after-percentage.json',
    proofPath: 'output/prd0055-task9-live-readback/prd0055-selected-class-live-1782841911531-browser/selected-class-browser-proof.json',
    expected: restoreBrowserReport.stats?.expected,
    unexpected: restoreBrowserReport.stats?.unexpected,
    skipped: restoreBrowserReport.stats?.skipped,
    flaky: restoreBrowserReport.stats?.flaky,
    sessionCode: restoreBrowserProof.fixture?.sessionCode,
    teacherReadyState: restoreBrowserProof.teacherDesktop?.readyState,
    studentDesktopReadyState: restoreBrowserProof.studentDesktop?.readyState,
    studentMobileReadyState: restoreBrowserProof.studentMobile375?.readyState,
    blockingDeliveryFailures: restoreBrowserProof.blockingDeliveryFailures,
    benignMediaAborts: restoreBrowserProof.benignMediaAborts,
  },
  finalProductionBrowserProof: {
    reportPath: 'output/prd0055-task9-live-readback/final-production-browser-report-1782847310086.json',
    proofPath: 'output/prd0055-task9-live-readback/prd0055-final-live-private-1782847310086-final-browser/final-production-browser-proof.json',
    expected: finalProductionBrowserReport.stats?.expected,
    unexpected: finalProductionBrowserReport.stats?.unexpected,
    skipped: finalProductionBrowserReport.stats?.skipped,
    flaky: finalProductionBrowserReport.stats?.flaky,
    sessionCode: finalProductionBrowserProof.fixture?.sessionCode,
    urls: finalProductionBrowserProof.urls,
    teacherDesktopSnapshotError: finalProductionBrowserProof.teacherDesktop?.error,
    studentDesktopSnapshotError: finalProductionBrowserProof.studentDesktop?.error,
    studentPausedAudio: finalProductionBrowserProof.studentPausedAudio,
    authorityConflict: finalProductionBrowserProof.authorityConflict,
    submitDuringEnd: finalProductionBrowserProof.submitDuringEnd,
    finalAudioCommand: finalProductionBrowserProof.finalSession?.audioCommand,
    finalMasterAudioState: finalProductionBrowserProof.finalSession?.masterAudioState,
    deliveryEvents: finalProductionBrowserProof.deliveryEvents?.length,
    blockingDeliveryFailures: finalProductionBrowserProof.blockingDeliveryFailures,
    benignMediaAborts: finalProductionBrowserProof.benignMediaAborts,
    humanAudibleProductionAcceptance: false,
  },
  finalIndependentBlockerAudit: {
    path: 'output/prd0055-task9-live-readback/prd0055-helmholtz-independent-verifier-summary.json',
    agentId: helmholtzAudit.agentId,
    agentAlias: helmholtzAudit.agentAlias,
    status: helmholtzAudit.status,
    usableAs: 'historical_pre_false_gate_removal_blocker_audit_not_current_gate_authority',
    currentGateAuthority: false,
    supersededForCurrentLocalhostScope: [
      'selected-user rollout',
      'percentage rollout',
      'full rollout',
      'human production acceptance',
      'deployed/current production proof',
    ],
    invalidCheckboxClosuresFound: helmholtzAudit.overclaimReview?.invalidCheckboxClosuresFound,
    passClaimsFoundForTargetTasks: helmholtzAudit.overclaimReview?.passClaimsFoundForTargetTasks,
    blockingGatesAtAuditTimeCount: Array.isArray(helmholtzAudit.blockingGates) ? helmholtzAudit.blockingGates.length : null,
  },
  latestLocalIndependentVerifier: {
    path: 'output/prd0055-task9-local-readiness/prd0055-mencius-local-independent-verifier-summary.json',
    agentId: menciusAudit.agentId,
    agentAlias: menciusAudit.agentAlias,
    status: menciusAudit.status,
    usableAs: 'historical_pre_false_gate_removal_local_stale_doc_audit_not_current_gate_authority',
    currentGateAuthority: false,
    acceptedCurrentLocalFindings: [
      'Target taskboxes remained unchecked.',
      'Section 27 local audit was clean locally: 85 rows, 77 current-local rows, 8 approved future deferrals, 0 local blockers, REG-79 accepted.',
      'Scoped stale-doc search found no current 76-row, 1-local-blocker, or REG-79-blocked wording in target closure artifacts.',
    ],
    supersededForCurrentLocalhostScope: [
      'future-deferred live/deploy/rollout items',
      '8 approved future Section 27 deferrals as closure blockers',
    ],
  },
  task817IndependentPass: {
    path: 'output/prd0055-task9-local-readiness/prd0055-pauli-task817-local-independent-pass-summary.json',
    agentId: pauliAudit.agentId,
    agentAlias: pauliAudit.agentAlias,
    status: pauliAudit.status,
    passScope: pauliAudit.passScope,
    notPassScope: pauliAudit.notPassScope,
    taskboxRecommendation: pauliAudit.taskboxRecommendation,
    currentGateAuthority: true,
  },
  localReconciliationAttempt: {
    path: 'output/prd0055-task9-local-readiness/prd0055-post-task817-local-reconciliation-attempt.json',
    verdict: localReconciliationAttempt.verdict,
    taskboxesChecked: localReconciliationAttempt.taskboxesChecked,
    commands: localReconciliationAttempt.commands,
    repoWideUtf8Failures: localReconciliationAttempt.repoWideUtf8Failures,
    ownerScopedUtf8Approval: localReconciliationAttempt.ownerScopedUtf8Approval,
    currentBlockers: localReconciliationAttempt.currentBlockers,
  },
  section27LocalhostAudit: {
    path: 'output/prd0055-task9-local-readiness/prd0055-section27-localhost-audit-report.json',
    verdict: section27LocalhostAudit.verdict,
    rows: section27LocalhostAudit.totals.actualRows,
    statusCounts: section27LocalhostAudit.totals.statusCounts,
    localBlockingCount: section27LocalhostAudit.totals.localBlockingCount,
    deferredFutureCount: section27LocalhostAudit.totals.deferredFutureCount,
    currentLocalEvidenceCount: section27LocalhostAudit.totals.currentLocalEvidenceCount,
    localBlockingRows: section27LocalhostAudit.localBlockingRows.map((row) => row.id),
    deferredFutureRows: section27LocalhostAudit.deferredFutureRows.map((row) => row.id),
  },
  staleLocalReadinessBoundary: {
    staleReports: [
      'output/prd0055-task9-local-readiness/prd0055-final-closure-blocker-audit-report.json',
      'output/prd0055-task9-local-readiness/task9-rollout-deployed-truth-audit-report.json',
      'output/prd0055-task9-local-readiness/prd0055-requirements-evidence-matrix-report.json',
    ],
    supersededOnlyFor: [
      'active deployment/version truth',
      'live/private route availability truth',
      'percentage rehearsal and restore truth',
      'alternate-version rollback and active-version restoration truth',
      'automated final production browser proof truth',
    ],
    supersedingEvidence: [
      'EV-FINAL-M',
      'EV-FINAL-N',
      'EV-FINAL-O',
      'EV-FINAL-P',
      'EV-FINAL-S',
      'output/prd0055-task9-local-readiness/prd0055-pauli-task817-local-independent-pass-summary.json',
      'output/prd0055-task9-local-readiness/prd0055-mencius-local-independent-verifier-summary.json',
      'output/prd0055-task9-live-readback/prd0055-rollout-current-status.json',
      'output/prd0055-task9-live-readback/prd0055-helmholtz-independent-verifier-summary.json',
      'output/prd0055-task9-live-readback/wrangler-alternate-rollback-rehearsal-summary.json',
      'output/prd0055-task9-live-readback/final-production-browser-report-1782847310086.json',
      'output/prd0055-task9-live-readback/prd0055-final-live-private-1782847310086-final-browser/final-production-browser-proof.json',
    ],
    closureVerdictStillBlocked: true,
  },
  remainingClosureBlockers: currentLocalBlockers,
  explicitNonActions: [
    'No cleanup/delete.',
    'No commit/push/merge.',
    'No live-domain browser testing is authorized for the current localhost-only packet.',
    'No selected-user rollout acceptance was claimed.',
    'No full rollout was claimed.',
    'Scoped UTF-8 acceptance was owner-approved for touched PRD-0055 docs/status/output artifacts; pre-existing non-UTF-8 files remain out of scope and were not cleaned or converted.',
    'Task 8.14 through Task 8.18 were checked for the local-only target packet; parent Task 8.0 remains outside the exact target packet unless separately authorized.',
    'Task 9.0 through Task 9.15 were checked for the local-only target packet.',
  ],
};

fs.writeFileSync(
  path.join(root, 'output/prd0055-task9-live-readback/prd0055-rollout-current-status.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(JSON.stringify({
  verdict: report.verdict,
  currentOperationalBoundary: report.currentOperationalBoundary.status,
  historicalRemoteArtifactsRetained: {
    classification: report.historicalRemoteArtifactsRetained.classification,
    forbiddenAsCurrentGate: report.historicalRemoteArtifactsRetained.forbiddenAsCurrentGate,
    historicalActiveDeploymentArtifact: report.currentActiveDeployment.deploymentId,
    historicalEquivalentCandidate: report.equivalentCandidate.equivalent,
    historicalPercentageRehearsalPassed: report.percentageRehearsal.passed,
    historicalAlternateRollbackPassed: report.alternateRollbackRehearsal.passed,
  },
  smokeSessions: report.liveSmokeProofs.map((proof) => proof.sessionCode),
  postRestoreBrowser: {
    sessionCode: report.postRestoreBrowserProof.sessionCode,
    expected: report.postRestoreBrowserProof.expected,
    unexpected: report.postRestoreBrowserProof.unexpected,
    blockingDeliveryFailures: report.postRestoreBrowserProof.blockingDeliveryFailures.length,
  },
  finalProductionBrowser: {
    sessionCode: report.finalProductionBrowserProof.sessionCode,
    expected: report.finalProductionBrowserProof.expected,
    unexpected: report.finalProductionBrowserProof.unexpected,
    blockingDeliveryFailures: report.finalProductionBrowserProof.blockingDeliveryFailures.length,
    humanAudibleProductionAcceptance: report.finalProductionBrowserProof.humanAudibleProductionAcceptance,
  },
  section27LocalhostAudit: report.section27LocalhostAudit,
  independentAudit: {
    agentAlias: report.finalIndependentBlockerAudit.agentAlias,
    status: report.finalIndependentBlockerAudit.status,
    invalidCheckboxClosuresFound: report.finalIndependentBlockerAudit.invalidCheckboxClosuresFound,
    passClaimsFoundForTargetTasks: report.finalIndependentBlockerAudit.passClaimsFoundForTargetTasks,
  },
  task817IndependentPass: {
    agentAlias: report.task817IndependentPass.agentAlias,
    status: report.task817IndependentPass.status,
    passScope: report.task817IndependentPass.passScope,
  },
  localReconciliationAttempt: {
    verdict: report.localReconciliationAttempt.verdict,
    repoWideUtf8Failures: report.localReconciliationAttempt.repoWideUtf8Failures.length,
  },
  taskboxesChecked: Object.entries(report.taskboxes).filter(([, state]) => state === 'checked').map(([id]) => id),
  remainingBlockers: report.remainingClosureBlockers.length,
}, null, 2));
