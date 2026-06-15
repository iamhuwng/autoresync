import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { READING_V2_OPERATIONAL_MATRIX } from '../../services/reading-v2/readingV2OperationalMatrix';

const PROJECT_ID = 'demo-prd-0048-reading-v2-rules';
const DATABASE_RULES = readFileSync('database.rules.json', 'utf8');
const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const describeEmulator = hasDatabaseEmulator ? describe : describe.skip;

let testEnv: RulesTestEnvironment;

const seedReadingV2Users = async (): Promise<void> => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();

    await db.ref('users/student-1/role').set('student');
    await db.ref('users/student-2/role').set('student');
    await db.ref('users/teacher-1/role').set('teacher');
    await db.ref('users/teacher-2/role').set('teacher');
    await db.ref('users/admin-1/role').set('super_admin');

    await db.ref('reading_v2/drafts/draft-1').set({
      draftId: 'draft-1',
      ownerId: 'teacher-1',
      document: { deliveryEngine: 'reading-v2' },
      revisionToken: 'draft-1-rev-1',
      state: 'draft',
      updatedAt: '2026-04-25T00:00:00.000Z',
    });

    await db.ref('reading_v2/published_snapshots/material-1/snapshot-1').set({
      materialId: 'material-1',
      snapshotVersionId: 'snapshot-1',
      ownerId: 'teacher-1',
      document: { containsAnswerKeys: true },
    });

    await db.ref('reading_v2/projections/student_safe_tests/test-1').set({
      testId: 'test-1',
      ownerId: 'teacher-1',
      deliveryEngine: 'reading-v2',
      projectionKind: 'student-safe',
    });

    await db.ref('reading_v2/results/result-1').set({
      resultId: 'result-1',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      materialId: 'material-1',
      submittedAt: '2026-04-25T00:00:00.000Z',
    });
  });
};

const makeReadingV2RuleContexts = () => ({
  student: testEnv.authenticatedContext('student-1'),
  otherStudent: testEnv.authenticatedContext('student-2'),
  teacher: testEnv.authenticatedContext('teacher-1'),
  otherTeacher: testEnv.authenticatedContext('teacher-2'),
  admin: testEnv.authenticatedContext('admin-1'),
  unauthenticated: testEnv.unauthenticatedContext(),
});

describe('Reading V2 Firebase rule contract', () => {
  const databaseRules = JSON.parse(readFileSync('database.rules.json', 'utf8')) as {
    rules: Record<string, unknown>;
  };

  it('defines the namespaced RTDB rule block required by Phase 3 storage paths', () => {
    const readingV2Rules = databaseRules.rules.reading_v2 as Record<string, unknown> | undefined;

    expect(readingV2Rules).toBeDefined();
    expect(readingV2Rules?.drafts).toBeDefined();
    expect(readingV2Rules?.passage_assets).toBeDefined();
    expect(readingV2Rules?.task_group_materials).toBeDefined();
    expect(readingV2Rules?.full_tests).toBeDefined();
    expect(readingV2Rules?.reading_passage_materials).toBeDefined();
    expect(readingV2Rules?.reading_passage_material_versions).toBeDefined();
    expect(readingV2Rules?.full_test_compositions).toBeDefined();
    expect(readingV2Rules?.full_test_composition_versions).toBeDefined();
    expect(readingV2Rules?.material_metadata).toBeDefined();
    expect(readingV2Rules?.listing_indexes).toBeDefined();
    expect(readingV2Rules?.relationship_indexes).toBeDefined();
    expect(readingV2Rules?.published_snapshots).toBeDefined();
    expect(readingV2Rules?.projections).toBeDefined();
    expect(readingV2Rules?.attempts).toBeDefined();
    expect(readingV2Rules?.results).toBeDefined();
    expect(readingV2Rules?.review_indexes).toBeDefined();
    expect(readingV2Rules?.analytics_outputs).toBeDefined();
    expect(readingV2Rules?.provenance).toBeDefined();
    expect(readingV2Rules?.where_used).toBeDefined();
    expect(readingV2Rules?.publish_commits).toBeDefined();
    expect(readingV2Rules?.audit_events).toBeDefined();
    expect(readingV2Rules?.duplicate_indexes).toBeDefined();
  });

  it('requires canonical drafts and published snapshots to exclude student read roles', () => {
    const teacherOnlyClasses = ['drafts', 'publishedSnapshots', 'reviewIndexes', 'provenance', 'whereUsedGraph'];

    teacherOnlyClasses.forEach((pathClass) => {
      const entry = READING_V2_OPERATIONAL_MATRIX.find((candidate) => candidate.pathClass === pathClass);

      expect(entry).toBeDefined();
      expect(entry?.allowedRoles).not.toContain('student');
    });
  });

  it('allows students only on projection, attempt, and release-policy-governed result classes', () => {
    const studentReadable = READING_V2_OPERATIONAL_MATRIX.filter((entry) =>
      entry.allowedRoles.includes('student'),
    ).map((entry) => entry.pathClass);

    expect(studentReadable.sort()).toEqual(
      [
        'relationshipIndexes',
        'studentSafeTests',
        'sessionSafePayloads',
        'assignmentPayloads',
        'attempts',
        'results',
      ].sort(),
    );
  });

  it('requires student-readable paths to forbid answer keys, import evidence, diagnostics, and hidden provenance', () => {
    READING_V2_OPERATIONAL_MATRIX.filter((entry) => entry.allowedRoles.includes('student')).forEach(
      (entry) => {
        expect(entry.forbiddenFields).toEqual(expect.arrayContaining(['authorDiagnostics']));
        expect(entry.forbiddenFields).toEqual(expect.arrayContaining(['scoringRule']));
        expect(entry.forbiddenFields).toEqual(expect.arrayContaining(['importEvidence']));
        expect(entry.forbiddenFields).toEqual(expect.arrayContaining(['hiddenProvenance']));
      },
    );
  });

  it('requires owner-gated persisted paths to validate ownership fields', () => {
    const readingV2Start = DATABASE_RULES.indexOf('"reading_v2"');
    const rulesText = DATABASE_RULES.slice(readingV2Start);
    const ownerRequiredPaths = [
      '"passage_assets"',
      '"task_group_materials"',
      '"full_tests"',
      '"reading_passage_materials"',
      '"reading_passage_material_versions"',
      '"full_test_compositions"',
      '"full_test_composition_versions"',
      '"material_metadata"',
      '"listing_indexes"',
      '"relationship_indexes"',
      '"published_snapshots"',
      '"student_safe_tests"',
      '"session_test_payloads"',
      '"assignment_payloads"',
      '"results"',
      '"review_indexes"',
      '"analytics_outputs"',
      '"provenance"',
      '"where_used"',
      '"publish_commits"',
      '"duplicate_indexes"',
    ];

    expect(readingV2Start).toBeGreaterThan(-1);

    ownerRequiredPaths.forEach((pathName) => {
      const pathStart = rulesText.indexOf(pathName);
      const pathRuleSlice = rulesText.slice(pathStart, pathStart + 900);

      expect(pathStart).toBeGreaterThan(-1);
      expect(pathRuleSlice).toContain('ownerId');
    });
  });

  it('requires Reading Passage canonical records to validate owner, passage id, state, and current snapshot fields', () => {
    const readingV2Rules = databaseRules.rules.reading_v2 as Record<string, any>;
    const passageRules = readingV2Rules.reading_passage_materials.$materialId as Record<string, string>;
    const validation = passageRules['.validate'];

    expect(validation).toContain('ownerId');
    expect(validation).toContain('passageMaterialId');
    expect(validation).toContain('state');
    expect(validation).toContain('currentSnapshotVersionId');
    expect(validation).toContain("newData.child('passageMaterialId').val() === $materialId");
  });

  it('requires Reading Passage version records to validate owner, passage id, and current snapshot id', () => {
    const readingV2Rules = databaseRules.rules.reading_v2 as Record<string, any>;
    const versionRules = readingV2Rules.reading_passage_material_versions.$materialId.$versionId as Record<string, string>;
    const validation = versionRules['.validate'];

    expect(validation).toContain('ownerId');
    expect(validation).toContain('passageMaterialId');
    expect(validation).toContain('currentSnapshotVersionId');
    expect(validation).toContain("newData.child('passageMaterialId').val() === $materialId");
    expect(validation).toContain("newData.child('currentSnapshotVersionId').val() === $versionId");
  });

  it('requires full-test composition version records to validate owner, composition id, and published version id', () => {
    const readingV2Rules = databaseRules.rules.reading_v2 as Record<string, any>;
    const versionRules = readingV2Rules.full_test_composition_versions.$compositionId.$versionId as Record<string, string>;
    const validation = versionRules['.validate'];

    expect(validation).toContain('ownerId');
    expect(validation).toContain('compositionId');
    expect(validation).toContain('publishedVersionId');
    expect(validation).toContain("newData.child('compositionId').val() === $compositionId");
    expect(validation).toContain("newData.child('publishedVersionId').val() === $versionId");
  });

  it('rejects embedded master payload fields on ref-only composition records', () => {
    const readingV2Rules = databaseRules.rules.reading_v2 as Record<string, any>;
    const compositionValidation = readingV2Rules.full_test_compositions.$compositionId['.validate'];
    const versionValidation = readingV2Rules.full_test_composition_versions.$compositionId.$versionId['.validate'];
    const prohibitedFields = [
      'document',
      'sections',
      'stimuli',
      'taskGroups',
      'interactions',
      'optionSets',
      'answerKey',
      'correctAnswers',
    ];

    prohibitedFields.forEach((field) => {
      expect(compositionValidation).toContain(`!newData.child('${field}').exists()`);
      expect(versionValidation).toContain(`!newData.child('${field}').exists()`);
    });
  });

  it('blocks scoringRule from student-safe Reading V2 projections', () => {
    const readingV2Start = DATABASE_RULES.indexOf('"reading_v2"');
    const rulesText = DATABASE_RULES.slice(readingV2Start);

    expect(rulesText).toContain("!newData.child('scoringRule').exists()");
  });

  it('defines assignment payload projection rules as sanitized frozen runtime payloads', () => {
    const readingV2Rules = databaseRules.rules.reading_v2 as Record<string, any>;
    const assignmentPayloadRules =
      readingV2Rules.projections.assignment_payloads.$assignmentPayloadId as Record<string, string>;
    const validation = assignmentPayloadRules['.validate'];

    expect(assignmentPayloadRules['.read']).toContain('auth != null');
    expect(validation).toContain('assignmentManifest');
    expect(validation).toContain("newData.child('projectionKind').val() === 'student-safe'");
    [
      'answerKey',
      'answerKeys',
      'correctAnswers',
      'reviewPayload',
      'document',
      'liveMutableRefs',
    ].forEach((field) => {
      expect(validation).toContain(`!newData.child('${field}').exists()`);
    });
  });

  it('requires Reading V2 audit events to be append-only, super-admin readable, and unsafe-field denied', () => {
    const readingV2Rules = databaseRules.rules.reading_v2 as Record<string, any>;
    const auditRules = readingV2Rules.audit_events.$eventId as Record<string, string>;
    const validation = auditRules['.validate'];

    expect(auditRules['.read']).toContain("role').val() === 'super_admin'");
    expect(auditRules['.write']).toContain('!data.exists()');
    expect(auditRules['.write']).toContain('newData.exists()');
    expect(validation).toContain("newData.child('eventId').val() === $eventId");
    [
      'reading_passage_archived',
      'reading_passage_restored',
      'reading_master_removed',
      'reading_master_broken_ref_repaired',
      'reading_book_broken_ref_repaired',
      'reading_duplicate_warning_existing_used',
      'reading_duplicate_warning_restore_used',
      'reading_duplicate_warning_bypassed',
      'reading_super_admin_passage_archived',
    ].forEach((action) => {
      expect(validation).toContain(`newData.child('action').val() === '${action}'`);
    });
    [
      'teacher',
      'super_admin',
      'system',
    ].forEach((actorRole) => {
      expect(validation).toContain(`newData.child('actorRole').val() === '${actorRole}'`);
    });
    [
      'reading-passage',
      'reading-master',
      'reading-book',
      'duplicate-warning',
    ].forEach((entityType) => {
      expect(validation).toContain(`newData.child('entityType').val() === '${entityType}'`);
    });
    [
      'passageBody',
      'bodyText',
      'document',
      'answerKey',
      'studentAnswers',
      'scoringRule',
      'aiReviewEvidence',
      'hiddenProvenance',
      'importEvidence',
    ].forEach((field) => {
      expect(validation).toContain(`!newData.child('${field}').exists()`);
    });
  });

  it('requires Reading V2 duplicate index rows to stay owner scoped and unsafe-field denied', () => {
    const readingV2Rules = databaseRules.rules.reading_v2 as Record<string, any>;
    const rowRules =
      readingV2Rules.duplicate_indexes.passages_by_owner.$ownerId.$passageMaterialId as Record<string, string>;
    const validation = rowRules['.validate'];

    expect(rowRules['.read']).toContain('$ownerId === auth.uid');
    expect(rowRules['.write']).toContain('$ownerId === auth.uid');
    expect(validation).toContain("newData.child('ownerId').val() === $ownerId");
    expect(validation).toContain("newData.child('passageMaterialId').val() === $passageMaterialId");
    [
      'passageBody',
      'bodyText',
      'questionText',
      'document',
      'answerKey',
      'scoringRule',
      'aiReviewEvidence',
      'hiddenProvenance',
      'importEvidence',
    ].forEach((field) => {
      expect(validation).toContain(`!newData.child('${field}').exists()`);
    });
  });

  it('requires archive/restore/remove to use soft state writes and keeps immutable snapshots protected', () => {
    const readingV2Rules = databaseRules.rules.reading_v2 as Record<string, any>;
    const passageRules = readingV2Rules.reading_passage_materials.$materialId as Record<string, string>;
    const metadataRules = readingV2Rules.material_metadata.$materialId as Record<string, string>;
    const compositionRules = readingV2Rules.full_test_compositions.$compositionId as Record<string, string>;
    const versionRules = readingV2Rules.reading_passage_material_versions.$materialId.$versionId as Record<string, string>;
    const snapshotRules = readingV2Rules.published_snapshots.$materialId.$snapshotVersionId as Record<string, string>;

    expect(passageRules['.write']).toContain('newData.exists()');
    expect(metadataRules['.write']).toContain('newData.exists()');
    expect(compositionRules['.write']).toContain('newData.exists()');
    expect(passageRules['.validate']).toContain('state');
    expect(metadataRules['.validate']).toContain('state');
    expect(compositionRules['.validate']).toContain('state');
    expect(versionRules['.write']).toContain('!data.exists()');
    expect(snapshotRules['.write']).toContain('!data.exists()');
    expect(versionRules['.write']).not.toContain('data.child');
    expect(snapshotRules['.write']).not.toContain('data.child');
  });
});

describeEmulator('Reading V2 Firebase rule emulator behavior', () => {
  beforeEach(async () => {
    if (!testEnv) {
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        database: { rules: DATABASE_RULES },
      });
    }

    await testEnv.clearDatabase();
    await seedReadingV2Users();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it('allows teacher-owned canonical drafts but denies students and other teachers', async () => {
    const {
      admin,
      otherTeacher,
      student,
      teacher,
      unauthenticated,
    } = makeReadingV2RuleContexts();
    const draftPath = 'reading_v2/drafts/draft-1';

    await assertSucceeds(teacher.database().ref(draftPath).once('value'));
    await assertSucceeds(admin.database().ref(draftPath).once('value'));
    await assertFails(student.database().ref(draftPath).once('value'));
    await assertFails(otherTeacher.database().ref(draftPath).once('value'));
    await assertFails(unauthenticated.database().ref(draftPath).once('value'));
  });

  it('requires persisted ownerId fields for teacher-owned V2 material paths', async () => {
    const { otherTeacher, teacher } = makeReadingV2RuleContexts();

    await assertSucceeds(
      teacher.database().ref('reading_v2/passage_assets/asset-1').set({
        passageAssetId: 'asset-1',
        ownerId: 'teacher-1',
        state: 'draft',
        currentVersionId: 'v1',
      }),
    );

    await assertFails(
      teacher.database().ref('reading_v2/task_group_materials/material-1').set({
        materialId: 'material-1',
        state: 'draft',
      }),
    );

    await assertFails(
      otherTeacher.database().ref('reading_v2/full_tests/full-test-1').set({
        fullTestId: 'full-test-1',
        ownerId: 'teacher-1',
        state: 'draft',
      }),
    );

    await assertSucceeds(
      teacher.database().ref('reading_v2/where_used/asset-1').set({
        ownerId: 'teacher-1',
        passageAssetId: 'asset-1',
        consumerId: 'material-1',
        consumerKind: 'task-group-material',
      }),
    );
  });

  it('lets students read sanitized projections but not canonical snapshots', async () => {
    const { student, teacher } = makeReadingV2RuleContexts();

    await assertSucceeds(
      student.database().ref('reading_v2/projections/student_safe_tests/test-1').once('value'),
    );
    await assertFails(
      student.database().ref('reading_v2/published_snapshots/material-1/snapshot-1').once('value'),
    );
    await assertFails(
      teacher.database().ref('reading_v2/projections/student_safe_tests/test-unsafe').set({
        testId: 'test-unsafe',
        ownerId: 'teacher-1',
        answerKeys: { interaction1: 'A' },
      }),
    );
    await assertFails(
      teacher.database().ref('reading_v2/projections/session_test_payloads/session-unsafe').set({
        sessionCode: 'session-unsafe',
        ownerId: 'teacher-1',
        hiddenProvenance: { source: 'draft-1' },
      }),
    );
  });

  it('allows students to create/read their own attempts and denies cross-student attempts', async () => {
    const { otherStudent, student } = makeReadingV2RuleContexts();
    const attemptPath = 'reading_v2/attempts/attempt-1';

    await assertSucceeds(
      student.database().ref(attemptPath).set({
        attemptId: 'attempt-1',
        studentId: 'student-1',
        materialId: 'material-1',
        answers: {},
      }),
    );
    await assertSucceeds(student.database().ref(attemptPath).once('value'));
    await assertFails(otherStudent.database().ref(attemptPath).once('value'));
    await assertFails(
      otherStudent.database().ref('reading_v2/attempts/attempt-2').set({
        attemptId: 'attempt-2',
        studentId: 'student-1',
        materialId: 'material-1',
        answers: {},
      }),
    );
  });

  it('protects result visibility and rejects author-only fields in result records', async () => {
    const {
      admin,
      otherTeacher,
      student,
      teacher,
    } = makeReadingV2RuleContexts();
    const resultPath = 'reading_v2/results/result-1';

    await assertSucceeds(student.database().ref(resultPath).once('value'));
    await assertSucceeds(teacher.database().ref(resultPath).once('value'));
    await assertSucceeds(admin.database().ref(resultPath).once('value'));
    await assertFails(otherTeacher.database().ref(resultPath).once('value'));
    await assertFails(
      teacher.database().ref('reading_v2/results/result-unsafe').set({
        resultId: 'result-unsafe',
        studentId: 'student-1',
        ownerId: 'teacher-1',
        hiddenProvenance: { source: 'draft-1' },
      }),
    );
  });

  it('allows valid Reading V2 audit create but rejects read, update, delete, and unsafe fields', async () => {
    const {
      admin,
      student,
      teacher,
    } = makeReadingV2RuleContexts();
    const auditPath = 'reading_v2/audit_events/audit-1';
    const auditEvent = {
      schemaVersion: 1,
      eventId: 'audit-1',
      createdAt: '2026-06-09T12:00:00.000Z',
      actorUserId: 'teacher-1',
      actorRole: 'teacher',
      action: 'reading_passage_archived',
      entityType: 'reading-passage',
      entityId: 'passage-1',
      ownerId: 'teacher-1',
      materialId: 'passage-1',
      versionId: 'snapshot-1',
      correlationId: 'corr-1',
      sourceFeatureId: 'teacher-materials-reading-passage',
      sourceRoute: '/lobby',
    };

    await assertSucceeds(teacher.database().ref(auditPath).set(auditEvent));
    await assertSucceeds(admin.database().ref(auditPath).once('value'));
    await assertFails(student.database().ref(auditPath).once('value'));
    await assertFails(teacher.database().ref(auditPath).update({ titleSnapshot: 'changed' }));
    await assertFails(teacher.database().ref(auditPath).remove());
    await assertFails(
      teacher.database().ref('reading_v2/audit_events/audit-unsafe').set({
        ...auditEvent,
        eventId: 'audit-unsafe',
        answerKey: { q1: 'A' },
      }),
    );
    await assertFails(
      teacher.database().ref('reading_v2/audit_events/audit-view-only').set({
        ...auditEvent,
        eventId: 'audit-view-only',
        action: 'reading_passage_duplicate_warning_shown',
      }),
    );
  });

  it('allows safe owner duplicate index writes and rejects unsafe or cross-owner rows', async () => {
    const {
      otherTeacher,
      teacher,
    } = makeReadingV2RuleContexts();
    const row = {
      schemaVersion: 1,
      ownerId: 'teacher-1',
      passageMaterialId: 'passage-1',
      currentVersionId: 'snapshot-1',
      title: 'Safe duplicate index row',
      state: 'published',
      visibility: 'private',
      source: { sourceFullTestId: 'full-test-1' },
      testType: { primaryTestTypeId: 'ielts', testTypeIds: ['ielts'] },
      questionCount: 2,
      updatedAt: '2026-06-09T12:00:00.000Z',
      bodyShingleSize: 5,
      questionShingleSize: 3,
      bodyShingleHashes: ['a'.repeat(64)],
      questionShingleHashes: ['b'.repeat(64)],
    };

    await assertSucceeds(
      teacher.database().ref('reading_v2/duplicate_indexes/passages_by_owner/teacher-1/passage-1').set(row),
    );
    await assertFails(
      otherTeacher.database().ref('reading_v2/duplicate_indexes/passages_by_owner/teacher-1/passage-2').set({
        ...row,
        passageMaterialId: 'passage-2',
      }),
    );
    await assertFails(
      teacher.database().ref('reading_v2/duplicate_indexes/passages_by_owner/teacher-1/passage-unsafe').set({
        ...row,
        passageMaterialId: 'passage-unsafe',
        document: { canonical: true },
      }),
    );
  });
});
