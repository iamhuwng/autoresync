import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPrd0062AcceptanceFixture,
  assertScopedPrd0062FixtureCleanup,
} from '../../e2e/prd0062-acceptance-fixtures.mjs';
import { createPrd0062TeacherAuthoringAssignmentFixture } from '../../e2e/prd0062-teacher-authoring-assignment.fixture.mjs';
import { createPrd0062TeacherUpdatesReplacementResultsFixture } from '../../e2e/prd0062-teacher-updates-replacement-results.fixture.mjs';
import { createPrd0062StudentRuntimePersistenceFixture } from '../../e2e/prd0062-student-runtime-persistence.fixture.mjs';
import {
  loadPrd0062AcceptanceMatrix,
  LEGACY_BACKUP_RECOVERY_COMMAND,
  STUDENT_ACCESSIBILITY_DEVICE_COMMAND,
  validatePrd0062AcceptanceMatrix,
} from '../lib/prd0062-acceptance-matrix.mjs';
import { createPrd0062StudentAccessibilityDeviceFixture } from '../../e2e/prd0062-student-accessibility-device.fixture.mjs';

const matrix = () => structuredClone(loadPrd0062AcceptanceMatrix());

test('accepts frozen definition-only PRD0062 matrix', () => {
  assert.deepEqual(validatePrd0062AcceptanceMatrix(matrix()), []);
});

test('rejects missing trace, duplicate case, missing threshold, wrong port and unknown ticket', () => {
  const invalid = matrix();
  invalid.cases[0].requirementTrace = [];
  invalid.cases[1].id = invalid.cases[0].id;
  invalid.cases[2].passThreshold = '';
  invalid.cases[3].url = 'http://localhost:5174';
  invalid.cases[4].ownerTicket = '51Z';
  const errors = validatePrd0062AcceptanceMatrix(invalid).join('\n');
  assert.match(errors, /missing PRD trace/);
  assert.match(errors, /duplicate id/);
  assert.match(errors, /passThreshold: required/);
  assert.match(errors, /wrong teacher role port/);
  assert.match(errors, /unknown owner ticket/);
});

test('rejects unbounded fixture, unsupported browser claim and missing canonical metric record', () => {
  const invalid = matrix();
  invalid.fixtures[0].cleanupPrefix = 'book_source/';
  invalid.cases[0].browserProject = 'webkit-implied';
  delete invalid.canonicalSourceEvidence[0].metricRecord.approvedExceptionRef;
  const errors = validatePrd0062AcceptanceMatrix(invalid).join('\n');
  assert.match(errors, /unbounded cleanup/);
  assert.match(errors, /unsupported browser claim/);
  assert.match(errors, /approvedExceptionRef: required/);
});

test('rejects 51B1 suite drift from teacher localhost quick-login contract', () => {
  const invalid = matrix();
  invalid.cases.find((row) => row.id === 'AC-TA-001').command = 'npx playwright test e2e/other.spec.ts';
  invalid.cases.find((row) => row.id === 'AC-TA-002').artifact = 'artifacts/prd0062-acceptance/shared/result.json';
  const errors = validatePrd0062AcceptanceMatrix(invalid).join('\n');
  assert.match(errors, /AC-TA-001: wrong browser suite command/);
  assert.match(errors, /AC-TA-002: artifact path must be case-scoped/);
});

test('rejects 51B2 suite drift from teacher localhost quick-login contract', () => {
  const invalid = matrix();
  invalid.cases.find((row) => row.id === 'AC-TU-001').command = 'npx playwright test e2e/other.spec.ts';
  invalid.cases.find((row) => row.id === 'AC-TR-001').artifact = 'artifacts/prd0062-acceptance/shared/result.json';
  const errors = validatePrd0062AcceptanceMatrix(invalid).join('\n');
  assert.match(errors, /AC-TU-001: wrong browser suite command/);
  assert.match(errors, /AC-TR-001: artifact path must be case-scoped/);
});

test('rejects 51C2 suite drift from student mobile localhost quick-login contract', () => {
  const invalid = matrix();
  invalid.cases.find((row) => row.id === 'AC-AD-001').command = 'npx playwright test e2e/other.spec.ts';
  invalid.cases.find((row) => row.id === 'AC-AD-001').fixtureId = 'F-VOCAB-60';
  invalid.cases.find((row) => row.id === 'AC-AD-001').artifact = 'artifacts/prd0062-acceptance/shared/result.json';
  const errors = validatePrd0062AcceptanceMatrix(invalid).join('\n');
  assert.match(errors, /AC-AD-001: wrong browser suite command/);
  assert.match(errors, /AC-AD-001: must use F-VOCAB-65/);
  assert.match(errors, /AC-AD-001: artifact path must be case-scoped/);
  assert.equal(STUDENT_ACCESSIBILITY_DEVICE_COMMAND, 'npx playwright test --config playwright.prd0062-acceptance.config.mjs --project=student-chromium-mobile e2e/prd0062-student-accessibility-device.spec.ts');
});

test('rejects 51C1 suite drift from student localhost quick-login contract', () => {
  const invalid = matrix();
  invalid.cases.find((row) => row.id === 'AC-SR-001').command = 'npx playwright test e2e/other.spec.ts';
  invalid.cases.find((row) => row.id === 'AC-SR-001').artifact = 'artifacts/prd0062-acceptance/shared/result.json';
  const errors = validatePrd0062AcceptanceMatrix(invalid).join('\n');
  assert.match(errors, /AC-SR-001: wrong browser suite command/);
  assert.match(errors, /AC-SR-001: artifact path must be case-scoped/);
});

test('rejects 51D2 drift from local legacy and metadata-only recovery suite', () => {
  const invalid = matrix();
  invalid.cases.find((row) => row.id === 'AC-LR-001').command = 'npm run test:r2 -- --prd0062';
  invalid.cases.find((row) => row.id === 'AC-LR-001').url = 'http://localhost:5173';
  invalid.cases.find((row) => row.id === 'AC-LR-001').artifact = 'artifacts/prd0062-acceptance/shared/result.json';
  const errors = validatePrd0062AcceptanceMatrix(invalid).join('\n');
  assert.match(errors, /AC-LR-001: wrong local suite command/);
  assert.match(errors, /AC-LR-001: must remain local service-only proof/);
  assert.match(errors, /AC-LR-001: artifact path must be case-scoped/);
  assert.equal(LEGACY_BACKUP_RECOVERY_COMMAND, 'npm run test:prd0062:legacy-backup-recovery');
});

test('rejects unclassified profile and false structural Listening support', () => {
  const invalid = matrix();
  invalid.taskTypeProfiles = invalid.taskTypeProfiles.filter((row) => row.id !== 'reading-matching-headings');
  const listeningTable = invalid.taskTypeProfiles.find((row) => row.id === 'listening-table-completion');
  listeningTable.status = 'structurally-supported';
  listeningTable.presentation = 'structured';
  const errors = validatePrd0062AcceptanceMatrix(invalid).join('\n');
  assert.match(errors, /reading-matching-headings: unclassified/);
  assert.match(errors, /acceptance matrix and coverage fixture disagree/);
});

test('rejects source-conformance and PersonalTimer boundary drift', () => {
  const invalid = matrix();
  invalid.sourceConformance.acceptedAdapterCommit = '0'.repeat(40);
  invalid.sourceConformance.personalTimer.invariants = ['no-grade-effect'];
  const errors = validatePrd0062AcceptanceMatrix(invalid).join('\n');
  assert.match(errors, /wrong accepted adapter commit/);
  assert.match(errors, /missing UI-only invariant/);
});

test('deterministic fixture IDs/checksum and scoped cleanup fail closed', () => {
  const input = { caseId: 'AC-TA-001', source: { id: 'grammar-65', title: 'IELTS Grammar for Bands 6.5 and Above' } };
  assert.deepEqual(createPrd0062AcceptanceFixture(input), createPrd0062AcceptanceFixture(input));
  const fixture = createPrd0062AcceptanceFixture(input);
  const target = `${fixture.ids.cleanupRoot}/records/candidate`;
  assert.equal(assertScopedPrd0062FixtureCleanup({ cleanupRoot: fixture.ids.cleanupRoot, target }), target);
  assert.throws(
    () => assertScopedPrd0062FixtureCleanup({ cleanupRoot: fixture.ids.cleanupRoot, target: 'book_source/live' }),
    /prd0062_fixture_cleanup_scope_denied/,
  );
});

test('51B1 fixture pins target, activity version, and source version deterministically', () => {
  const fixture = createPrd0062TeacherAuthoringAssignmentFixture('AC-TA-002');
  assert.deepEqual(fixture, createPrd0062TeacherAuthoringAssignmentFixture('AC-TA-002'));
  assert.equal(fixture.assignment.target.kind, 'unit');
  assert.deepEqual(fixture.assignment.bindings, [{
    placementId: fixture.placementId,
    activityId: fixture.activityId,
    activityVersionId: fixture.activityVersionId,
    sourceVersionIds: [fixture.sourceVersionId],
    required: true,
  }]);
  assert.throws(() => createPrd0062TeacherAuthoringAssignmentFixture('AC-TA-999'), /prd0062_51b1_case_id_invalid/);
});

test('51B2 fixture pins update, immutable replacement, and teacher-owned result deterministically', () => {
  const fixture = createPrd0062TeacherUpdatesReplacementResultsFixture('AC-TU-001');
  assert.deepEqual(fixture, createPrd0062TeacherUpdatesReplacementResultsFixture('AC-TU-001'));
  assert.equal(fixture.update.affectedStudents.filter((student) => student.requiresCheckpoint).length, 2);
  assert.equal(fixture.update.affectedStudents.filter((student) => student.requiresReplacementDeadline).length, 1);
  assert.notEqual(fixture.sourceVersionId, fixture.replacementSourceVersionId);
  assert.equal(fixture.teacherResult.surface, 'homework');
  assert.throws(() => createPrd0062TeacherUpdatesReplacementResultsFixture('AC-TU-999'), /prd0062_51b2_case_id_invalid/);
});

test('51C2 fixture pins student-only Book-runtime device probes deterministically', () => {
  const fixture = createPrd0062StudentAccessibilityDeviceFixture();
  assert.deepEqual(fixture, createPrd0062StudentAccessibilityDeviceFixture());
  assert.equal(fixture.caseId, 'AC-AD-001');
  assert.equal(fixture.source.id, 'vocabulary-65');
  assert.match(fixture.launch.url, /^\/student\/practice\//);
  assert.equal(fixture.expected.minimumTouchTargetPx, 44);
  assert.equal(fixture.expected.textScalePercent, 200);
  assert.throws(() => createPrd0062StudentAccessibilityDeviceFixture('AC-AD-999'), /prd0062_51c2_case_id_invalid/);
});

test('51C1 fixture pins scoped delivery, response, submission, and schedule deterministically', () => {
  const fixture = createPrd0062StudentRuntimePersistenceFixture('AC-SR-001');
  assert.deepEqual(fixture, createPrd0062StudentRuntimePersistenceFixture('AC-SR-001'));
  assert.match(fixture.launch.url, new RegExp(`entitlement=${fixture.entitlementId}`));
  assert.equal(fixture.schedule.placementId, fixture.placementId);
  assert.equal(fixture.activityVersionId, `${fixture.activityId}_v1`);
  assert.throws(() => createPrd0062StudentRuntimePersistenceFixture('AC-SR-999'), /prd0062_51c1_case_id_invalid/);
});
