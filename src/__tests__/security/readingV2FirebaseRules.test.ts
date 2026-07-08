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
import {
  buildReadingV2TeacherSelectedPassageComposition,
  removeReadingV2MasterComposition,
} from '../../services/reading-v2/readingV2TeacherComposition.service';

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
        'listingIndexes',
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

  it('allows teacher reads of safe public Reading Passage metadata for canonical public and legacy library-eligible rows', () => {
    const readingV2Rules = databaseRules.rules.reading_v2 as Record<string, any>;
    const metadataRules = readingV2Rules.material_metadata.$materialId as Record<string, string>;
    const readRule = metadataRules['.read'];

    expect(readRule).toContain("root.child('users').child(auth.uid).child('role').val() === 'teacher'");
    expect(readRule).toContain("data.child('materialKind').val() === 'reading-passage'");
    expect(readRule).toContain("data.child('visibility').val() === 'public'");
    expect(readRule).toContain("data.child('visibility').val() === 'library-eligible'");
    expect(readRule).toContain("root.child('reading_v2').child('reading_passage_materials').child($materialId).child('visibility').val() === 'public'");
    expect(readRule).toContain("root.child('reading_v2').child('reading_passage_materials').child($materialId).child('state').val() === 'published'");
    expect(readRule).not.toContain("root.child('users').child(auth.uid).child('role').val() === 'student'");
  });

  it('indexes and authorizes owned Teacher Lobby relationship queries at the queried parent', () => {
    const readingV2Rules = databaseRules.rules.reading_v2 as Record<string, any>;
    const surfaceRules = readingV2Rules.relationship_indexes.$surface as Record<string, any>;
    const rowRules = surfaceRules.$materialId as Record<string, any>;

    expect(surfaceRules['.indexOn']).toEqual(
      expect.arrayContaining(['snapshotVersionId', 'source', 'ownerId']),
    );
    expect(surfaceRules['.read']).toContain("$surface === 'teacher-lobby'");
    expect(surfaceRules['.read']).toContain("query.orderByChild === 'ownerId'");
    expect(surfaceRules['.read']).toContain('query.equalTo === auth.uid');
    expect(rowRules['.indexOn']).toBeUndefined();
  });

  it('does not allow broad teacher reads of the legacy tests bridge', () => {
    const testsRules = databaseRules.rules.tests as Record<string, any>;
    const parentReadRule = testsRules['.read'];
    const childReadRule = testsRules.$testId['.read'];

    expect(parentReadRule).toContain("role').val() === 'super_admin'");
    expect(parentReadRule).toContain("query.orderByChild === 'isPublic'");
    expect(parentReadRule).toContain('query.equalTo === true');
    expect(parentReadRule).toContain("query.orderByChild === 'ownerId'");
    expect(parentReadRule).toContain("query.orderByChild === 'createdBy'");
    expect(parentReadRule).not.toBe('auth != null');
    expect(childReadRule).toContain("data.child('isPublic').val() === true");
    expect(childReadRule).toContain("data.child('ownerId').val() === auth.uid");
    expect(childReadRule).toContain("data.child('createdBy').val() === auth.uid");
    expect(childReadRule).not.toContain("role').val() === 'teacher'");
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

  it('allows only owner-scoped Teacher Lobby relationship queries', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.database();

      await db.ref('reading_v2/relationship_indexes/teacher-lobby').set({
        'material-1': {
          surface: 'teacher-lobby',
          materialId: 'material-1',
          snapshotVersionId: 'snapshot-1',
          source: 'published-metadata',
          ownerId: 'teacher-1',
          deliveryEngine: 'reading-v2',
        },
        'material-2': {
          surface: 'teacher-lobby',
          materialId: 'material-2',
          snapshotVersionId: 'snapshot-2',
          source: 'published-metadata',
          ownerId: 'teacher-2',
          deliveryEngine: 'reading-v2',
        },
      });
    });

    const {
      otherTeacher,
      teacher,
    } = makeReadingV2RuleContexts();
    const ownedQuery = teacher.database()
      .ref('reading_v2/relationship_indexes/teacher-lobby')
      .orderByChild('ownerId')
      .equalTo('teacher-1');
    const crossOwnerQuery = otherTeacher.database()
      .ref('reading_v2/relationship_indexes/teacher-lobby')
      .orderByChild('ownerId')
      .equalTo('teacher-1');

    const ownedSnapshot = await assertSucceeds(ownedQuery.once('value'));
    expect(Object.keys(ownedSnapshot.val() ?? {})).toEqual(['material-1']);
    await assertFails(crossOwnerQuery.once('value'));
    await assertFails(
      teacher.database().ref('reading_v2/relationship_indexes/teacher-lobby').once('value'),
    );
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

  it('lets teachers clone public Reading Passage canonical sources but keeps students out of author snapshots', async () => {
    const { otherTeacher, student } = makeReadingV2RuleContexts();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.database();

      await db.ref('reading_v2/reading_passage_materials/public-passage').set({
        deliveryEngine: 'reading-v2',
        plane: 'canonical',
        schemaVersion: 1,
        passageMaterialId: 'public-passage',
        ownerId: 'teacher-1',
        visibility: 'public',
        state: 'published',
        currentSnapshotVersionId: 'snapshot-public',
        title: 'Public Passage',
      });
      await db.ref('reading_v2/reading_passage_material_versions/public-passage/snapshot-public').set({
        passageMaterialId: 'public-passage',
        currentSnapshotVersionId: 'snapshot-public',
        ownerId: 'teacher-1',
        document: { containsAnswerKeys: true },
      });
      await db.ref('reading_v2/published_snapshots/public-passage/snapshot-public').set({
        materialId: 'public-passage',
        snapshotVersionId: 'snapshot-public',
        ownerId: 'teacher-1',
        document: { containsAnswerKeys: true },
      });
    });

    await assertSucceeds(
      otherTeacher.database().ref('reading_v2/reading_passage_materials/public-passage').once('value'),
    );
    await assertSucceeds(
      otherTeacher.database().ref('reading_v2/reading_passage_material_versions/public-passage/snapshot-public').once('value'),
    );
    await assertSucceeds(
      otherTeacher.database().ref('reading_v2/published_snapshots/public-passage/snapshot-public').once('value'),
    );
    await assertFails(
      student.database().ref('reading_v2/reading_passage_materials/public-passage').once('value'),
    );
    await assertFails(
      student.database().ref('reading_v2/published_snapshots/public-passage/snapshot-public').once('value'),
    );
  });

  it('allows teacher clone writes when version rows and duplicate indexes match owner contract', async () => {
    const { teacher } = makeReadingV2RuleContexts();
    const updates = {
      'reading_v2/reading_passage_materials/cloned-passage': {
        deliveryEngine: 'reading-v2',
        plane: 'canonical',
        schemaVersion: 1,
        passageMaterialId: 'cloned-passage',
        ownerId: 'teacher-1',
        visibility: 'private',
        state: 'published',
        currentSnapshotVersionId: 'snapshot-cloned',
        title: 'Cloned Passage',
      },
      'reading_v2/reading_passage_material_versions/cloned-passage/snapshot-cloned': {
        passageMaterialId: 'cloned-passage',
        currentSnapshotVersionId: 'snapshot-cloned',
        ownerId: 'teacher-1',
        document: { title: 'Cloned Passage' },
        publishedAt: '2026-06-16T00:00:00.000Z',
        publishedBy: 'teacher-1',
      },
      'reading_v2/published_snapshots/cloned-passage/snapshot-cloned': {
        materialId: 'cloned-passage',
        snapshotVersionId: 'snapshot-cloned',
        ownerId: 'teacher-1',
        document: { title: 'Cloned Passage' },
      },
      'reading_v2/projections/student_safe_tests/cloned-passage:snapshot-cloned': {
        materialId: 'cloned-passage',
        ownerId: 'teacher-1',
        projectionKind: 'student-safe',
      },
      'reading_v2/projections/review/cloned-passage:snapshot-cloned': {
        materialId: 'cloned-passage',
        ownerId: 'teacher-1',
        projectionKind: 'review',
        sourceSnapshotVersionId: 'snapshot-cloned',
      },
      'reading_v2/material_metadata/cloned-passage': {
        materialId: 'cloned-passage',
        ownerId: 'teacher-1',
        deliveryEngine: 'reading-v2',
        title: 'Cloned Passage',
        publishedSnapshotVersionId: 'snapshot-cloned',
        state: 'published',
      },
      'reading_v2/duplicate_indexes/passages_by_owner/teacher-1/cloned-passage': {
        schemaVersion: 1,
        ownerId: 'teacher-1',
        passageMaterialId: 'cloned-passage',
        currentVersionId: 'snapshot-cloned',
        title: 'Cloned Passage',
        state: 'published',
        visibility: 'private',
        source: { sourceOrderDisplay: 'Passage 1' },
        testType: { testTypeIds: ['ielts'] },
        questionCount: 1,
        updatedAt: '2026-06-16T00:00:00.000Z',
        bodyShingleSize: 5,
        questionShingleSize: 3,
        bodyShingleHashes: ['__empty_shingle_set__'],
        questionShingleHashes: ['__empty_shingle_set__'],
      },
    };

    await assertSucceeds(teacher.database().ref().update(updates));
    await assertFails(
      teacher.database().ref('reading_v2/reading_passage_material_versions/invalid-clone/snapshot-invalid').set({
        passageMaterialId: 'invalid-clone',
        currentSnapshotVersionId: 'snapshot-invalid',
        document: { title: 'Invalid Clone' },
      }),
    );
  });

  it('allows owners to republish a private Reading Passage as public', async () => {
    const { teacher } = makeReadingV2RuleContexts();
    const materialId = 'passage-visibility-republish';
    const previousSnapshotVersionId = 'snapshot-private';
    const nextSnapshotVersionId = 'snapshot-public';

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.database();

      await db.ref(`reading_v2/reading_passage_materials/${materialId}`).set({
        deliveryEngine: 'reading-v2',
        plane: 'canonical',
        schemaVersion: 1,
        passageMaterialId: materialId,
        ownerId: 'teacher-1',
        visibility: 'private',
        state: 'published',
        currentSnapshotVersionId: previousSnapshotVersionId,
        title: 'Private Passage',
      });
      await db.ref(`reading_v2/material_metadata/${materialId}`).set({
        materialId,
        ownerId: 'teacher-1',
        deliveryEngine: 'reading-v2',
        productLabel: 'Reading V2',
        title: 'Private Passage',
        materialKind: 'reading-passage',
        visibility: 'private',
        publishedSnapshotVersionId: previousSnapshotVersionId,
        state: 'published',
        updatedAt: '2026-06-15T19:00:00.000Z',
      });
    });

    const updates = {
      [`reading_v2/published_snapshots/${materialId}/${nextSnapshotVersionId}`]: {
        materialId,
        snapshotVersionId: nextSnapshotVersionId,
        ownerId: 'teacher-1',
        document: { title: 'Public Passage' },
      },
      [`reading_v2/projections/student_safe_tests/${materialId}:${nextSnapshotVersionId}`]: {
        materialId,
        ownerId: 'teacher-1',
        projectionKind: 'student-safe',
        sourceSnapshotVersionId: nextSnapshotVersionId,
      },
      [`reading_v2/projections/session_test_payloads/publish-template:${nextSnapshotVersionId}`]: {
        materialId,
        ownerId: 'teacher-1',
        projectionKind: 'session-safe',
        sourceSnapshotVersionId: nextSnapshotVersionId,
      },
      [`reading_v2/projections/review/${materialId}:${nextSnapshotVersionId}`]: {
        materialId,
        ownerId: 'teacher-1',
        projectionKind: 'review',
        sourceSnapshotVersionId: nextSnapshotVersionId,
      },
      [`reading_v2/analytics_outputs/${materialId}:${nextSnapshotVersionId}`]: {
        materialId,
        ownerId: 'teacher-1',
        projectionKind: 'analytics',
        sourceSnapshotVersionId: nextSnapshotVersionId,
      },
      [`reading_v2/material_metadata/${materialId}`]: {
        materialId,
        ownerId: 'teacher-1',
        deliveryEngine: 'reading-v2',
        productLabel: 'Reading V2',
        title: 'Public Passage',
        materialKind: 'reading-passage',
        visibility: 'public',
        publishedSnapshotVersionId: nextSnapshotVersionId,
        state: 'published',
        updatedAt: '2026-06-15T19:12:11.000Z',
      },
      [`reading_v2/relationship_indexes/teacher-lobby/${materialId}`]: {
        surface: 'teacher-lobby',
        materialId,
        snapshotVersionId: nextSnapshotVersionId,
        source: 'published-metadata',
        ownerId: 'teacher-1',
        deliveryEngine: 'reading-v2',
      },
      [`material_catalog/material_indexes/by_visibility/public/${materialId}`]: {
        materialId,
        ownerId: 'teacher-1',
        title: 'Public Passage',
        visibility: 'public',
        materialKind: 'reading-passage',
        updatedAt: '2026-06-15T19:12:11.000Z',
      },
      [`tests/${materialId}`]: {
        id: materialId,
        materialId,
        ownerId: 'teacher-1',
        deliveryEngine: 'reading-v2',
        contentEngine: 'reading-v2',
        runtimeEngine: 'reading-v2',
        title: 'Public Passage',
        skill: 'Reading',
        skillType: 'reading-v2',
        isPublic: true,
        materialKind: 'reading-passage',
        productLabel: 'Reading V2',
        publishedSnapshotVersionId: nextSnapshotVersionId,
        updatedAt: '2026-06-15T19:12:11.000Z',
      },
      [`reading_v2/publish_commits/${materialId}:${nextSnapshotVersionId}`]: {
        commitKey: `${materialId}/${nextSnapshotVersionId}`,
        materialId,
        snapshotVersionId: nextSnapshotVersionId,
        ownerId: 'teacher-1',
        deliveryEngine: 'reading-v2',
        operationKeys: [`${materialId}/${nextSnapshotVersionId}/metadata`],
        writePaths: [`reading_v2/material_metadata/${materialId}`],
        committedAt: '2026-06-15T19:12:11.000Z',
      },
    };

    await assertSucceeds(teacher.database().ref().update(updates));
  });

  it('allows teachers to publish a full-test composition made from selected Reading Passages', async () => {
    const { teacher } = makeReadingV2RuleContexts();
    const materialId = 'composition-selected-public-passages';
    const compositionId = 'teacher-selected-public-passages';
    const snapshotVersionId = 'snapshot-selected-public-passages';
    const updatedAt = '2026-06-16T05:30:00.000Z';
    const materialSummary = {
      materialId,
      ownerId: 'teacher-1',
      title: 'Selected Reading Passages',
      visibility: 'public',
      materialKind: 'full-test',
      testTypeIds: ['ielts'],
      testTypeMembership: { ielts: true },
      updatedAt,
    };
    const relationshipSurfaces = [
      'teacher-lobby',
      'assignment-picker',
      'solo-launch',
      'homework-assignment',
      'course-material',
      'library-listing',
      'live-launch-summary',
      'result-identity',
      'material-profile',
      'analytics',
    ];
    const updates = {
      [`tests/${materialId}`]: {
        id: materialId,
        materialId,
        ownerId: 'teacher-1',
        compositionId,
        deliveryEngine: 'reading-v2',
        contentEngine: 'reading-v2',
        runtimeEngine: 'reading-v2',
        title: 'Selected Reading Passages',
        testType: 'IELTS',
        type: 'IELTS',
        skill: 'Reading',
        skillType: 'reading-v2',
        duration: 60,
        questionCount: 40,
        isPublic: true,
        materialKind: 'full-test',
        productLabel: 'Reading V2',
        publishedSnapshotVersionId: snapshotVersionId,
        primaryTestTypeId: 'ielts',
        testTypeIds: ['ielts'],
        updatedAt,
      },
      [`reading_v2/published_snapshots/${materialId}/${snapshotVersionId}`]: {
        materialId,
        snapshotVersionId,
        ownerId: 'teacher-1',
        document: { title: 'Selected Reading Passages' },
      },
      [`reading_v2/projections/student_safe_tests/${materialId}:${snapshotVersionId}`]: {
        materialId,
        ownerId: 'teacher-1',
        projectionKind: 'student-safe',
        sourceSnapshotVersionId: snapshotVersionId,
      },
      [`reading_v2/projections/session_test_payloads/publish-template:${snapshotVersionId}`]: {
        materialId,
        ownerId: 'teacher-1',
        projectionKind: 'session-safe',
        sourceSnapshotVersionId: snapshotVersionId,
      },
      [`reading_v2/projections/review/${materialId}:${snapshotVersionId}`]: {
        materialId,
        ownerId: 'teacher-1',
        projectionKind: 'review',
        sourceSnapshotVersionId: snapshotVersionId,
      },
      [`reading_v2/analytics_outputs/${materialId}:${snapshotVersionId}`]: {
        materialId,
        ownerId: 'teacher-1',
        projectionKind: 'analytics',
        sourceSnapshotVersionId: snapshotVersionId,
      },
      [`reading_v2/material_metadata/${materialId}`]: {
        materialId,
        ownerId: 'teacher-1',
        compositionId,
        deliveryEngine: 'reading-v2',
        productLabel: 'Reading V2',
        title: 'Selected Reading Passages',
        materialKind: 'full-test',
        visibility: 'public',
        publishedSnapshotVersionId: snapshotVersionId,
        state: 'published',
        updatedAt,
      },
      [`reading_v2/full_test_compositions/${compositionId}`]: {
        compositionId,
        ownerId: 'teacher-1',
        testMaterialId: materialId,
        title: 'Selected Reading Passages',
        passageRefs: [{
          passageMaterialId: 'public-passage-1',
          snapshotVersionId: 'snapshot-public-1',
          order: 1,
        }],
        publishedVersionId: snapshotVersionId,
        state: 'published',
      },
      [`reading_v2/full_test_composition_versions/${compositionId}/${snapshotVersionId}`]: {
        compositionId,
        ownerId: 'teacher-1',
        testMaterialId: materialId,
        title: 'Selected Reading Passages',
        passageRefs: [{
          passageMaterialId: 'public-passage-1',
          snapshotVersionId: 'snapshot-public-1',
          order: 1,
        }],
        publishedVersionId: snapshotVersionId,
        publishedAt: updatedAt,
        publishedBy: 'teacher-1',
      },
      [`material_catalog/material_indexes/by_owner/teacher-1/${materialId}`]: materialSummary,
      [`material_catalog/material_indexes/by_visibility/public/${materialId}`]: materialSummary,
      [`material_catalog/material_indexes/by_material_kind/full-test/${materialId}`]: materialSummary,
      [`material_catalog/material_indexes/by_test_type/ielts/${materialId}`]: materialSummary,
      [`reading_v2/publish_commits/${materialId}:${snapshotVersionId}`]: {
        commitKey: `${materialId}/${snapshotVersionId}`,
        materialId,
        snapshotVersionId,
        ownerId: 'teacher-1',
        deliveryEngine: 'reading-v2',
        operationKeys: [`${materialId}/${snapshotVersionId}/metadata`],
        writePaths: [`reading_v2/material_metadata/${materialId}`],
        committedAt: updatedAt,
      },
      ...Object.fromEntries(relationshipSurfaces.map((surface) => [
        `reading_v2/relationship_indexes/${surface}/${materialId}`,
        {
          surface,
          materialId,
          snapshotVersionId,
          source: 'published-metadata',
          ownerId: 'teacher-1',
          deliveryEngine: 'reading-v2',
          updatedAt,
        },
      ])),
    };

    await assertSucceeds(teacher.database().ref().update(updates));
  });

  it('allows owners to soft-remove Reading V2 masters when material summary cleanup rows are absent', async () => {
    const { teacher } = makeReadingV2RuleContexts();
    const composition = buildReadingV2TeacherSelectedPassageComposition({
      teacherId: 'teacher-1',
      passages: [
        {
          materialId: 'passage-remove-1',
          ownerId: 'teacher-1',
          title: 'Passage 1',
          questionCount: 13,
          durationMinutes: 20,
          publishedSnapshotVersionId: 'snapshot-passage-1',
          currentVersionId: 'snapshot-passage-1',
          testTypeIds: ['ielts'],
          visibility: 'private',
        },
      ],
      now: '2026-06-16T05:30:00.000Z',
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.database();
      const persistedComposition = JSON.parse(JSON.stringify({
        ...composition,
        state: 'published',
      }));

      await db.ref(`reading_v2/full_test_compositions/${composition.compositionId}`).set(persistedComposition);
      await db.ref(`reading_v2/material_metadata/${composition.testMaterialId}`).set({
        materialId: composition.testMaterialId,
        ownerId: 'teacher-1',
        compositionId: composition.compositionId,
        deliveryEngine: 'reading-v2',
        productLabel: 'Reading V2',
        title: composition.title,
        materialKind: 'full-test',
        visibility: 'private',
        publishedSnapshotVersionId: composition.publishedVersionId,
        state: 'published',
        updatedAt: composition.updatedAt,
      });
      await db.ref(`tests/${composition.testMaterialId}`).set({
        id: composition.testMaterialId,
        materialId: composition.testMaterialId,
        ownerId: 'teacher-1',
        compositionId: composition.compositionId,
        deliveryEngine: 'reading-v2',
        contentEngine: 'reading-v2',
        runtimeEngine: 'reading-v2',
        title: composition.title,
        testType: 'IELTS',
        type: 'IELTS',
        skill: 'Reading',
        skillType: 'reading-v2',
        duration: 20,
        questionCount: 13,
        isPublic: false,
        materialKind: 'full-test',
        productLabel: 'Reading V2',
        publishedSnapshotVersionId: composition.publishedVersionId,
        primaryTestTypeId: 'ielts',
        testTypeIds: ['ielts'],
        updatedAt: composition.updatedAt,
      });
    });

    await removeReadingV2MasterComposition({
      actorUserId: 'teacher-1',
      actorRole: 'teacher',
      composition,
      repository: {
        write: async () => {
          throw new Error('Expected root update repository path.');
        },
        remove: async () => {
          throw new Error('Expected root update repository path.');
        },
        update: async (updates) => {
          await assertSucceeds(teacher.database().ref().update(updates));
        },
      },
      now: '2026-06-17T05:30:00.000Z',
      correlationId: 'corr-master-remove-rules',
      sourceFeatureId: 'teacher_materials_reading_master_removed',
      sourceRoute: '/lobby',
    });

    await assertSucceeds(
      teacher.database().ref(`reading_v2/full_test_compositions/${composition.compositionId}`).once('value'),
    );
    await assertSucceeds(
      teacher.database().ref(`reading_v2/material_metadata/${composition.testMaterialId}`).once('value'),
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
