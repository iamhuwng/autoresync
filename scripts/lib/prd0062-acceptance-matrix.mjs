import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  loadPrd0062ReadingListeningCoverage,
  validatePrd0062ReadingListeningCoverage,
  ACCEPTED_ADAPTER_COMMIT,
} from './prd0062-reading-listening-coverage.mjs';

export const ACCEPTANCE_MATRIX_PATH = 'documentation/tasks/PRD0062/supporting/prd0062-v1-acceptance-matrix.json';
const SOURCE_CONFORMANCE_EVIDENCE_PATH = 'documentation/tasks/PRD0062/evidence/51A-source-conformance-2026-08-04.json';
const ACCEPTED_TIMER_COMMIT = 'ba8b2d59d9ccaae2b6cc7a74a34b55b32e1b1c70';
const TIMER_INVARIANTS = [
  'no-teacher-enforcement-or-visibility',
  'no-telemetry-effect',
  'no-grade-effect',
  'no-deadline-effect',
  'no-submission-effect',
  'no-attempt-effect',
  'no-autosave-effect',
  'no-integrity-effect',
  'no-completion-effect',
];
export const OWNER_TICKETS = new Set(['51B1', '51B2', '51C1', '51C2', '51D1', '51D2', '51E']);
const TEACHER_AUTHORING_ASSIGNMENT_COMMAND = 'npx playwright test --config playwright.prd0062-acceptance.config.mjs --project=teacher-chromium e2e/prd0062-teacher-authoring-assignment.spec.ts';
const TEACHER_UPDATES_REPLACEMENT_RESULTS_COMMAND = 'npx playwright test --config playwright.prd0062-acceptance.config.mjs --project=teacher-chromium e2e/prd0062-teacher-updates-replacement-results.spec.ts';
export const STUDENT_ACCESSIBILITY_DEVICE_COMMAND = 'npx playwright test --config playwright.prd0062-acceptance.config.mjs --project=student-chromium-mobile e2e/prd0062-student-accessibility-device.spec.ts';
const STUDENT_RUNTIME_PERSISTENCE_COMMAND = 'npx playwright test --config playwright.prd0062-acceptance.config.mjs --project=student-chromium-desktop e2e/prd0062-student-runtime-persistence.spec.ts';
export const LEGACY_BACKUP_RECOVERY_COMMAND = 'npm run test:prd0062:legacy-backup-recovery';
const REQUIRED_METRIC_FIELDS = ['fixtureId', 'command', 'timestamp', 'artifact', 'failureRetry', 'approvedExceptionRef'];
const CANONICAL_SOURCES = [
  'IELTS Grammar for Bands 6.5 and Above',
  'IELTS Vocabulary up to Band 6.0',
  'IELTS Vocabulary for Bands 6.5 and Above',
];
const RESEARCHED_TASK_IDS = [
  'reading-sentence-completion', 'reading-summary-completion-text', 'reading-summary-completion-list',
  'reading-note-completion', 'reading-table-completion', 'reading-flowchart-completion', 'reading-diagram-label-completion',
  'reading-true-false-not-given', 'reading-yes-no-not-given', 'reading-matching-headings',
  'reading-matching-information', 'reading-matching-features', 'reading-matching-sentence-endings',
  'reading-multiple-choice-single', 'reading-list-selection', 'reading-short-answer',
  'listening-multiple-choice-single', 'listening-multiple-choice-multiple', 'listening-matching',
  'listening-map-plan-labelling', 'listening-diagram-labelling', 'listening-form-completion',
  'listening-note-completion', 'listening-table-completion', 'listening-flowchart-completion',
  'listening-summary-completion', 'listening-sentence-completion', 'listening-short-answer',
];
const FAMILIES = new Set(['choice', 'text-entry', 'matching', 'ordering', 'long-response']);
const PRESENTATIONS = new Set(['structured', 'source-assisted']);
const CONTEXTS = new Set(['none', 'optional', 'required']);
const STATUSES = new Set([
  'structurally-supported', 'supported-through-source-assisted',
  'explicitly-unsupported-release-blocking', 'separately-approved-deferral',
]);

export const loadPrd0062AcceptanceMatrix = (repoRoot = process.cwd()) => JSON.parse(
  readFileSync(path.join(repoRoot, ACCEPTANCE_MATRIX_PATH), 'utf8'),
);

const required = (errors, value, label) => {
  if (typeof value !== 'string' || value.trim() === '') errors.push(`${label}: required.`);
};

export const validatePrd0062AcceptanceMatrix = (matrix, { repoRoot = process.cwd() } = {}) => {
  const errors = [];
  if (matrix?.schemaVersion !== 1) errors.push('schemaVersion: expected 1.');
  if (!/^\d{4}-\d{2}-\d{2}\.\d+$/u.test(matrix?.matrixVersion ?? '')) errors.push('matrixVersion: invalid.');
  if (matrix?.executionState !== 'DEFINED_NOT_EXECUTED') errors.push('executionState: must not claim execution.');
  if (!matrix?.harness?.cleanupRoot?.startsWith('prd0062_acceptance/')) errors.push('harness.cleanupRoot: must be scoped.');
  if (/manual spot check|\b\d+\s*(?:tests|pass)\b/iu.test(JSON.stringify(matrix))) errors.push('matrix: forbidden manual spot check or copied evidence count.');
  const conformance = matrix?.sourceConformance;
  if (conformance?.acceptedAdapterCommit !== ACCEPTED_ADAPTER_COMMIT) errors.push('sourceConformance: wrong accepted adapter commit.');
  if (conformance?.acceptedTimerCommit !== ACCEPTED_TIMER_COMMIT) errors.push('sourceConformance: wrong accepted timer commit.');
  if (conformance?.supersedes !== '51a-acceptance.matrix.json') errors.push('sourceConformance: must record absent closure-referenced filename supersession.');
  if (conformance?.status !== 'PASS') errors.push('sourceConformance: must be PASS for accepted-source definition conformance.');
  if (conformance?.executionState !== 'DEFINED_NOT_EXECUTED') errors.push('sourceConformance: must remain definition-only.');
  if (conformance?.personalTimer?.status !== 'accepted-ui-only') errors.push('personal timer trace: must remain accepted-ui-only.');
  const timerInvariants = conformance?.personalTimer?.invariants;
  if (!Array.isArray(timerInvariants) || TIMER_INVARIANTS.some((invariant) => !timerInvariants.includes(invariant))) errors.push('personal timer trace: missing UI-only invariant.');
  const coverage = loadPrd0062ReadingListeningCoverage(repoRoot);
  for (const coverageError of validatePrd0062ReadingListeningCoverage(coverage, { repoRoot })) errors.push(`coverage: ${coverageError}`);

  const fixtureIds = new Set();
  for (const fixture of matrix?.fixtures ?? []) {
    required(errors, fixture.id, 'fixture.id');
    if (fixtureIds.has(fixture.id)) errors.push(`fixture ${fixture.id}: duplicate id.`);
    fixtureIds.add(fixture.id);
    if (!fixture.cleanupPrefix?.startsWith(matrix?.harness?.cleanupRoot ?? '')) errors.push(`fixture ${fixture.id}: unbounded cleanup.`);
    if (!Array.isArray(fixture.sourceQualifiedPages) || fixture.sourceQualifiedPages.length === 0) errors.push(`fixture ${fixture.id}: source-qualified local pages required.`);
  }
  const evidenceIds = new Set();
  for (const evidence of matrix?.canonicalSourceEvidence ?? []) {
    if (!CANONICAL_SOURCES.includes(evidence.sourceTitle)) errors.push(`canonical source ${evidence.sourceTitle}: unknown.`);
    evidenceIds.add(evidence.sourceTitle);
    if (!fixtureIds.has(evidence.fixtureId)) errors.push(`canonical source ${evidence.sourceTitle}: unknown fixture.`);
    required(errors, evidence.interactionNote, `canonical source ${evidence.sourceTitle} interactionNote`);
    for (const field of REQUIRED_METRIC_FIELDS) required(errors, evidence.metricRecord?.[field], `canonical source ${evidence.sourceTitle} metricRecord.${field}`);
  }
  for (const source of CANONICAL_SOURCES) if (!evidenceIds.has(source)) errors.push(`canonical source ${source}: missing.`);
  const evidenceText = JSON.stringify(matrix?.canonicalSourceEvidence ?? []);
  for (const note of ['Listening note-completion', 'Reading matching plus Yes/No/Not Given']) {
    if (!evidenceText.includes(note)) errors.push(`canonical source interaction note missing: ${note}.`);
  }

  const profileIds = new Set();
  for (const profile of matrix?.taskTypeProfiles ?? []) {
    required(errors, profile.id, 'task type id');
    if (profileIds.has(profile.id)) errors.push(`task type ${profile.id}: duplicate id.`);
    profileIds.add(profile.id);
    required(errors, profile.profile, `task type ${profile.id} profile`);
    if (!FAMILIES.has(profile.family)) errors.push(`task type ${profile.id}: unsupported family.`);
    required(errors, profile.variant, `task type ${profile.id} variant`);
    required(errors, profile.stimulus, `task type ${profile.id} stimulus`);
    if (!CONTEXTS.has(profile.context)) errors.push(`task type ${profile.id}: invalid context.`);
    if (!PRESENTATIONS.has(profile.presentation)) errors.push(`task type ${profile.id}: invalid presentation.`);
    required(errors, profile.scoring, `task type ${profile.id} scoring`);
    required(errors, profile.accessibility, `task type ${profile.id} accessibility`);
    if (!STATUSES.has(profile.status)) errors.push(`task type ${profile.id}: invalid support status.`);
    if (profile.presentation === 'source-assisted'
      && (profile.context !== 'required' || !/correspondence/iu.test(profile.accessibility ?? ''))) {
      errors.push(`task type ${profile.id}: source-assisted metadata/context invalid.`);
    }
    if (profile.status === 'explicitly-unsupported-release-blocking') required(errors, profile.releaseBlocker, `task type ${profile.id} releaseBlocker`);
    if (profile.status === 'separately-approved-deferral') required(errors, profile.approvalId, `task type ${profile.id} approvalId`);
    if (profile.status === 'structurally-supported' && profile.profile !== 'ielts:reading-v1') {
      errors.push(`task type ${profile.id}: unsupported schema profile cannot claim structural support.`);
    }
  }
  for (const id of RESEARCHED_TASK_IDS) if (!profileIds.has(id)) errors.push(`task type ${id}: unclassified.`);
  for (const id of profileIds) if (!RESEARCHED_TASK_IDS.includes(id)) errors.push(`task type ${id}: unknown researched type.`);
  for (const profile of matrix?.taskTypeProfiles ?? []) {
    const coverageProfile = coverage.taskTypes?.find((row) => row.id === profile.id);
    if (!coverageProfile) continue;
    if (profile.family !== coverageProfile.interaction?.family || profile.presentation !== coverageProfile.presentationMode || profile.status !== coverageProfile.support?.status) {
      errors.push(`task type ${profile.id}: acceptance matrix and coverage fixture disagree.`);
    }
  }

  const caseIds = new Set();
  for (const row of matrix?.cases ?? []) {
    required(errors, row.id, 'case.id');
    if (caseIds.has(row.id)) errors.push(`case ${row.id}: duplicate id.`);
    caseIds.add(row.id);
    if (!Array.isArray(row.requirementTrace) || row.requirementTrace.length === 0) errors.push(`case ${row.id}: missing PRD trace.`);
    if (!fixtureIds.has(row.fixtureId)) errors.push(`case ${row.id}: unknown fixture.`);
    if (!OWNER_TICKETS.has(row.ownerTicket)) errors.push(`case ${row.id}: unknown owner ticket.`);
    for (const field of ['command', 'artifact', 'passThreshold', 'environment', 'expectedOutcome', 'failureRetry']) required(errors, row[field], `case ${row.id} ${field}`);
    if (row.role === 'teacher' && row.url !== 'http://localhost:5173') errors.push(`case ${row.id}: wrong teacher role port.`);
    if (row.role === 'student' && row.url !== 'http://localhost:5174') errors.push(`case ${row.id}: wrong student role port.`);
    if (!['teacher', 'student', 'service'].includes(row.role)) errors.push(`case ${row.id}: unknown role.`);
    if (['teacher', 'student'].includes(row.role) && !matrix.supportedBrowsers?.includes(row.browserProject)) errors.push(`case ${row.id}: unsupported browser claim.`);
  }
  const teacherAuthoringCases = (matrix?.cases ?? []).filter((row) => row.ownerTicket === '51B1');
  if (teacherAuthoringCases.length !== 2) errors.push('51B1: expected exactly two teacher authoring/assignment cases.');
  for (const caseId of ['AC-TA-001', 'AC-TA-002']) {
    const row = teacherAuthoringCases.find((candidate) => candidate.id === caseId);
    if (!row) {
      errors.push(`51B1: missing ${caseId}.`);
      continue;
    }
    if (row.command !== TEACHER_AUTHORING_ASSIGNMENT_COMMAND) errors.push(`51B1 ${caseId}: wrong browser suite command.`);
    if (row.browserProject !== 'teacher-chromium' || row.url !== 'http://localhost:5173') errors.push(`51B1 ${caseId}: must use teacher localhost quick-login browser.`);
    if (!row.artifact?.startsWith(`artifacts/prd0062-acceptance/${caseId}/`)) errors.push(`51B1 ${caseId}: artifact path must be case-scoped.`);
  }
  const teacherUpdatesCases = (matrix?.cases ?? []).filter((row) => row.ownerTicket === '51B2');
  if (teacherUpdatesCases.length !== 2) errors.push('51B2: expected exactly two teacher updates/replacement/results cases.');
  for (const caseId of ['AC-TU-001', 'AC-TR-001']) {
    const row = teacherUpdatesCases.find((candidate) => candidate.id === caseId);
    if (!row) {
      errors.push(`51B2: missing ${caseId}.`);
      continue;
    }
    if (row.command !== TEACHER_UPDATES_REPLACEMENT_RESULTS_COMMAND) errors.push(`51B2 ${caseId}: wrong browser suite command.`);
    if (row.browserProject !== 'teacher-chromium' || row.url !== 'http://localhost:5173') errors.push(`51B2 ${caseId}: must use teacher localhost quick-login browser.`);
    if (!row.artifact?.startsWith(`artifacts/prd0062-acceptance/${caseId}/`)) errors.push(`51B2 ${caseId}: artifact path must be case-scoped.`);
  }
  const studentAccessibilityCases = (matrix?.cases ?? []).filter((row) => row.ownerTicket === '51C2');
  if (studentAccessibilityCases.length !== 1) errors.push('51C2: expected exactly one student accessibility/device case.');
  const studentAccessibilityCase = studentAccessibilityCases.find((candidate) => candidate.id === 'AC-AD-001');
  if (!studentAccessibilityCase) {
    errors.push('51C2: missing AC-AD-001.');
  } else {
    if (studentAccessibilityCase.command !== STUDENT_ACCESSIBILITY_DEVICE_COMMAND) errors.push('51C2 AC-AD-001: wrong browser suite command.');
    if (studentAccessibilityCase.browserProject !== 'student-chromium-mobile' || studentAccessibilityCase.url !== 'http://localhost:5174') errors.push('51C2 AC-AD-001: must use student mobile localhost quick-login browser.');
    if (studentAccessibilityCase.fixtureId !== 'F-VOCAB-65') errors.push('51C2 AC-AD-001: must use F-VOCAB-65.');
    if (!studentAccessibilityCase.artifact?.startsWith('artifacts/prd0062-acceptance/AC-AD-001/')) errors.push('51C2 AC-AD-001: artifact path must be case-scoped.');
  }
  const studentRuntimeCases = (matrix?.cases ?? []).filter((row) => row.ownerTicket === '51C1');
  if (studentRuntimeCases.length !== 1) errors.push('51C1: expected exactly one student runtime/persistence case.');
  const studentRuntimeCase = studentRuntimeCases.find((candidate) => candidate.id === 'AC-SR-001');
  if (!studentRuntimeCase) {
    errors.push('51C1: missing AC-SR-001.');
  } else {
    if (studentRuntimeCase.command !== STUDENT_RUNTIME_PERSISTENCE_COMMAND) errors.push('51C1 AC-SR-001: wrong browser suite command.');
    if (studentRuntimeCase.browserProject !== 'student-chromium-desktop' || studentRuntimeCase.url !== 'http://localhost:5174') errors.push('51C1 AC-SR-001: must use student localhost quick-login browser.');
    if (!studentRuntimeCase.artifact?.startsWith('artifacts/prd0062-acceptance/AC-SR-001/')) errors.push('51C1 AC-SR-001: artifact path must be case-scoped.');
  }
  const legacyRecoveryCases = (matrix?.cases ?? []).filter((row) => row.ownerTicket === '51D2');
  if (legacyRecoveryCases.length !== 1) errors.push('51D2: expected exactly one legacy/backup/recovery case.');
  const legacyRecoveryCase = legacyRecoveryCases.find((candidate) => candidate.id === 'AC-LR-001');
  if (!legacyRecoveryCase) {
    errors.push('51D2: missing AC-LR-001.');
  } else {
    if (legacyRecoveryCase.command !== LEGACY_BACKUP_RECOVERY_COMMAND) errors.push('51D2 AC-LR-001: wrong local suite command.');
    if (legacyRecoveryCase.role !== 'service' || legacyRecoveryCase.url !== 'N/A') errors.push('51D2 AC-LR-001: must remain local service-only proof.');
    if (!legacyRecoveryCase.artifact?.startsWith('artifacts/prd0062-acceptance/AC-LR-001/')) errors.push('51D2 AC-LR-001: artifact path must be case-scoped.');
  }
  for (const owner of OWNER_TICKETS) if (!(matrix?.cases ?? []).some((row) => row.ownerTicket === owner)) errors.push(`owner ticket ${owner}: no case.`);

  const manifest = matrix?.canaryManifest;
  required(errors, manifest?.command, 'canaryManifest.command');
  if (!Array.isArray(manifest?.requiredEnvironmentNames) || manifest.requiredEnvironmentNames.length === 0) errors.push('canaryManifest.requiredEnvironmentNames: required.');
  if (!Array.isArray(manifest?.requiredSecretNames) || manifest.requiredSecretNames.length === 0) errors.push('canaryManifest.requiredSecretNames: required.');
  if (manifest?.mutationPolicy !== 'validate-names-and-scope-only') errors.push('canaryManifest: destructive policy forbidden.');
  if (!manifest?.identityScope?.startsWith(matrix?.harness?.cleanupRoot ?? '')) errors.push('canaryManifest.identityScope: unbounded.');
  try {
    const evidence = JSON.parse(readFileSync(path.join(repoRoot, SOURCE_CONFORMANCE_EVIDENCE_PATH), 'utf8'));
    if (evidence?.status !== 'PASS' || evidence?.executionState !== 'DEFINED_NOT_EXECUTED') errors.push('source conformance evidence: must be PASS and definition-only.');
    if (evidence?.acceptedAdapterCommit !== ACCEPTED_ADAPTER_COMMIT || evidence?.acceptedTimerCommit !== ACCEPTED_TIMER_COMMIT) errors.push('source conformance evidence: accepted commit mismatch.');
  } catch {
    errors.push('source conformance evidence: unreadable.');
  }
  return errors.sort();
};
