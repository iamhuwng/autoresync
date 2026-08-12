import { readFileSync } from 'node:fs';

import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const firestoreRules = readFileSync('firestore.rules', 'utf8');
const PROJECT_ID = 'demo-prd-0052-homework-rules';
const hasFirestoreEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeEmulator = hasFirestoreEmulator ? describe : describe.skip;

let testEnv: RulesTestEnvironment;

const makeHomeworkRuleContexts = () => ({
  student: testEnv.authenticatedContext('student-1'),
  teacher: testEnv.authenticatedContext('teacher-1'),
  otherTeacher: testEnv.authenticatedContext('teacher-2'),
  unauthenticated: testEnv.unauthenticatedContext(),
});

const makeBookHomeworkServiceContext = (
  assignmentId = 'book-assignment-1',
  ownerId = 'teacher-1',
  uid = ownerId,
  claims: Record<string, unknown> = {},
) => testEnv.authenticatedContext(uid, {
  book_homework_service: true,
  book_homework_assignmentId: assignmentId,
  book_homework_ownerId: ownerId,
  ...claims,
});

const baseHomeworkAssignment = (overrides: Record<string, unknown> = {}) => ({
  title: 'Reading Passage Homework',
  materialType: 'reading-passage',
  createdBy: 'teacher-1',
  classId: 'class-1',
  dueDate: 1780000000000,
  readingPassageSnapshot: {
    passageMaterialId: 'passage-1',
    snapshotVersionId: 'snapshot-1',
    titleSnapshot: 'Passage One',
    questionCount: 13,
  },
  stats: {
    totalAssigned: 1,
    started: 0,
    submitted: 0,
    lateSubmissions: 0,
    completionRate: 0,
  },
  updatedAt: 1780000000000,
  ...overrides,
});

const readingPassageSetAssignment = (overrides: Record<string, unknown> = {}) => ({
  title: 'Reading Passage Set Homework',
  materialType: 'reading-passage-set',
  createdBy: 'teacher-1',
  classId: 'class-1',
  dueDate: 1780000000000,
  readingPassageSet: {
    items: [
      {
        passageMaterialId: 'passage-1',
        snapshotVersionId: 'snapshot-1',
        titleSnapshot: 'Passage One',
        questionCount: 13,
      },
    ],
  },
  stats: {
    totalAssigned: 1,
    started: 0,
    submitted: 0,
    lateSubmissions: 0,
    completionRate: 0,
  },
  updatedAt: 1780000000000,
  ...overrides,
});

const bookHomeworkAuthority = (
  status: 'prepared' | 'committed' | 'compensating',
  overrides: Record<string, unknown> = {},
) => ({
  assignmentId: 'book-assignment-1',
  assignmentKind: 'book_activity_bundle',
  schemaVersion: 1,
  ownerId: 'teacher-1',
  bookManifest: {
    assignmentKind: 'book_activity_bundle',
    schemaVersion: 1,
    manifestVersionId: 'manifest-1',
    ownerId: 'teacher-1',
    createdByCommandId: 'command-create',
    createdAt: '2026-07-28T00:00:00.000Z',
    bindingRevision: 1,
    book: {
      bookId: 'book-1',
      bookMode: 'pdf',
      bookRevision: 1,
      publicationId: 'publication-1',
      publicationRevision: 1,
      publicationStatus: 'published',
    },
    context: {
      contextId: 'assignment-1',
      recipientId: 'student-1',
      kind: 'homework',
      entitlementBasis: 'assignment',
    },
    selectedTarget: { kind: 'book', bookId: 'book-1' },
    outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
    scheduleRules: [{ nodeKey: 'unit-1', dueAt: '2026-08-20T00:00:00.000Z' }],
    bindings: [],
    completion: {
      aggregation: 'required-activities-submitted-over-required-activities',
      requiredBindingCount: 0,
      excludedBindingCount: 0,
      legacyScoreFields: 'untouched',
    },
  },
  schedule: {
    schemaVersion: 1,
    resolverVersion: 1,
    finalDueAt: '2026-08-30T00:00:00.000Z',
    scheduleRules: [{ nodeKey: 'unit-1', dueAt: '2026-08-20T00:00:00.000Z' }],
  },
  studentExtensions: {},
  saga: {
    sagaId: 'saga-1',
    state: status,
    lastCommandId: 'command-create',
  },
  visibility: {
    status,
    pointerId: 'manifest-1',
    manifestVersionId: 'manifest-1',
    revision: 1,
  },
  revision: 1,
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
  ...overrides,
});

const validBookHomeworkAuthority = (
  assignmentId = 'book-assignment-1',
  ownerId = 'teacher-1',
) => {
  const authority = bookHomeworkAuthority('prepared');
  return {
    ...authority,
    assignmentId,
    ownerId,
    bookManifest: {
      ...authority.bookManifest,
      ownerId,
      context: {
        ...authority.bookManifest.context,
        contextId: assignmentId,
      },
    },
    saga: {
      ...authority.saga,
      sagaId: assignmentId,
    },
  };
};

const seedHomeworkAssignments = async (): Promise<void> => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc('homework_assignments/assignment-1').set(baseHomeworkAssignment());
  });
};

describe('Homework Firestore rule contract', () => {
  it('keeps homework assignments teacher-owned while allowing Reading Passage typed fields', () => {
    expect(firestoreRules).toContain('match /homework_assignments/{assignmentId}');
    expect(firestoreRules).toContain('request.resource.data.createdBy == request.auth.uid');
    expect(firestoreRules).toContain('resource.data.createdBy == request.auth.uid');
    expect(firestoreRules).toContain('request.resource.data.createdBy == resource.data.createdBy');
    expect(firestoreRules).toContain('isValidReadingPassageHomeworkPayload(request.resource.data)');
  });

  it('allows only narrow student progress-stat updates on homework assignments', () => {
    expect(firestoreRules).toContain('function isStudentStatsOnlyHomeworkUpdate()');
    expect(firestoreRules).toContain("affectedKeys().hasOnly(['stats', 'updatedAt'])");
    expect(firestoreRules).toContain('request.resource.data.stats.totalAssigned == resource.data.stats.totalAssigned');
    expect(firestoreRules).toContain('request.resource.data.stats.started <= resource.data.stats.started + 1');
    expect(firestoreRules).toContain('request.resource.data.stats.submitted <= resource.data.stats.submitted + 1');
    expect(firestoreRules).toContain('request.resource.data.stats.lateSubmissions <= resource.data.stats.lateSubmissions + 1');
  });

  it('recognizes single Reading Passage and Reading Passage set homework shapes', () => {
    expect(firestoreRules).toContain("data.materialType == 'reading-passage'");
    expect(firestoreRules).toContain("data.materialType == 'reading-passage-set'");
    expect(firestoreRules).toContain("data.keys().hasAll(['readingPassageSnapshot'])");
    expect(firestoreRules).toContain("data.keys().hasAll(['readingPassageSet'])");
    expect(firestoreRules).toContain('data.readingPassageSet.items is list');
  });

  it('keeps Book Homework service-only and browser-denied', () => {
    expect(firestoreRules).toContain("data.assignmentKind == 'book_activity_bundle'");
    expect(firestoreRules).toContain('Raw Book authority documents are never browser-readable');
    expect(firestoreRules).toContain('!isBookHomework(resource.data)');
    expect(firestoreRules).toContain('!isBookHomework(request.resource.data)');
  });
});

describeEmulator('Homework Firestore rule emulator behavior', () => {
  beforeEach(async () => {
    if (!testEnv) {
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules: firestoreRules },
      });
    }

    await testEnv.clearFirestore();
    await seedHomeworkAssignments();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it('allows teacher-created Reading Passage homework and rejects malformed cross-type payloads', async () => {
    const {
      teacher,
    } = makeHomeworkRuleContexts();

    await assertSucceeds(
      teacher.firestore().doc('homework_assignments/assignment-2').set(
        baseHomeworkAssignment({
          title: 'Single Reading Passage',
        }),
      ),
    );
    await assertSucceeds(
      teacher.firestore().doc('homework_assignments/assignment-3').set(
        readingPassageSetAssignment({
          title: 'Reading Passage Set',
        }),
      ),
    );
    await assertFails(
      teacher.firestore().doc('homework_assignments/assignment-4').set(
        baseHomeworkAssignment({
          materialType: 'reading-passage',
          readingPassageSet: {
            items: [],
          },
        }),
      ),
    );
    await assertFails(
      teacher.firestore().doc('homework_assignments/assignment-5').set(
        readingPassageSetAssignment({
          readingPassageSnapshot: {
            passageMaterialId: 'passage-1',
            snapshotVersionId: 'snapshot-1',
            titleSnapshot: 'Passage One',
            questionCount: 13,
          },
        }),
      ),
    );
  });

  it('allows authenticated homework projection reads but rejects unauthenticated reads', async () => {
    const {
      student,
      unauthenticated,
    } = makeHomeworkRuleContexts();

    await assertSucceeds(student.firestore().doc('homework_assignments/assignment-1').get());
    await assertFails(unauthenticated.firestore().doc('homework_assignments/assignment-1').get());
  });

  it('allows narrow student progress-stat updates and rejects assignment-shape mutation', async () => {
    const {
      student,
    } = makeHomeworkRuleContexts();
    const assignmentRef = student.firestore().doc('homework_assignments/assignment-1');

    await assertSucceeds(
      assignmentRef.update({
        stats: {
          totalAssigned: 1,
          started: 1,
          submitted: 0,
          lateSubmissions: 0,
          completionRate: 0,
        },
        updatedAt: 1780000000001,
      }),
    );
    await assertFails(
      assignmentRef.update({
        createdBy: 'student-1',
        stats: {
          totalAssigned: 1,
          started: 1,
          submitted: 0,
          lateSubmissions: 0,
          completionRate: 0,
        },
        updatedAt: 1780000000002,
      }),
    );
  });

  it('keeps homework deletes scoped to the creating teacher', async () => {
    const {
      otherTeacher,
      teacher,
    } = makeHomeworkRuleContexts();

    await assertFails(otherTeacher.firestore().doc('homework_assignments/assignment-1').delete());
    await assertSucceeds(teacher.firestore().doc('homework_assignments/assignment-1').delete());
  });

  it('denies raw Book authority reads/writes, including malformed nested records', async () => {
    const {
      otherTeacher,
      student,
      teacher,
    } = makeHomeworkRuleContexts();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('homework_assignments/book-prepared').set(bookHomeworkAuthority('prepared'));
      await context.firestore().doc('homework_assignments/book-committed').set(bookHomeworkAuthority('committed'));
      await context.firestore().doc('homework_assignments/book-malformed').set(bookHomeworkAuthority('committed', {
        saga: { sagaId: 'saga-1', state: 'prepared' },
      }));
      const malformedShape = bookHomeworkAuthority('committed');
      await context.firestore().doc('homework_assignments/book-malformed-shape').set({
        ...malformedShape,
        bookManifest: { ...malformedShape.bookManifest, unexpected: true },
      });
      await context.firestore().doc('homework_assignments/book-malformed-outline').set({
        ...malformedShape,
        bookManifest: { ...malformedShape.bookManifest, outline: ['malformed-node'] },
      });
      await context.firestore().doc('homework_assignments/book-malformed-schedule').set({
        ...malformedShape,
        bookManifest: { ...malformedShape.bookManifest, scheduleRules: [{ nodeKey: 'unit-1', dueAt: 1 }] },
      });
      await context.firestore().doc('homework_assignments/book-malformed-bindings').set({
        ...malformedShape,
        bookManifest: { ...malformedShape.bookManifest, bindings: [null] },
      });
      await context.firestore().doc('homework_assignments/book-malformed-extensions').set({
        ...malformedShape,
        studentExtensions: { 'student-1': { 'unit-1': { dueAt: 'not-iso' } } },
      });
      await context.firestore().doc('homework_assignments/book-malformed-operations').set({
        ...malformedShape,
        operations: { 'operation-1': { fingerprint: 1 } },
      });
    });

    await assertFails(student.firestore().doc('homework_assignments/book-prepared').get());
    await assertFails(student.firestore().doc('homework_assignments/book-committed').get());
    await assertFails(student.firestore().doc('homework_assignments/book-malformed').get());
    await assertFails(student.firestore().doc('homework_assignments/book-malformed-shape').get());
    await assertFails(student.firestore().doc('homework_assignments/book-malformed-outline').get());
    await assertFails(student.firestore().doc('homework_assignments/book-malformed-schedule').get());
    await assertFails(student.firestore().doc('homework_assignments/book-malformed-bindings').get());
    await assertFails(student.firestore().doc('homework_assignments/book-malformed-extensions').get());
    await assertFails(student.firestore().doc('homework_assignments/book-malformed-operations').get());
    await assertFails(teacher.firestore().doc('homework_assignments/book-committed').get());
    await assertFails(otherTeacher.firestore().doc('homework_assignments/book-committed').get());

    await assertFails(
      teacher.firestore().doc('homework_assignments/book-browser-create').set(bookHomeworkAuthority('prepared')),
    );
    await assertFails(
      teacher.firestore().doc('homework_assignments/book-committed').update({
        visibility: { status: 'prepared', pointerId: 'manifest-1', manifestVersionId: 'manifest-1' },
      }),
    );
    await assertFails(
      student.firestore().doc('homework_assignments/book-committed').update({
        stats: { totalAssigned: 1, started: 1, submitted: 0, lateSubmissions: 0 },
        updatedAt: 1780000000001,
      }),
    );
    await assertFails(teacher.firestore().doc('homework_assignments/book-committed').delete());

    await assertSucceeds(
      teacher.firestore().doc('homework_assignments/assignment-ancestor').set(baseHomeworkAssignment({ title: 'Ancestor seed' })),
    );
    await assertFails(
      teacher.firestore().doc('homework_assignments/assignment-ancestor').update({
        assignmentKind: 'book_activity_bundle',
        bookManifest: { manifestVersionId: 'manifest-2', context: { recipientId: 'student-1' } },
        visibility: { status: 'committed', pointerId: 'manifest-2', manifestVersionId: 'manifest-2' },
      }),
    );
  });

  it('enforces exact Book Homework service assignment reads and owner-bound writes', async () => {
    const assignmentId = 'book-assignment-1';
    const authority = validBookHomeworkAuthority(assignmentId, 'teacher-1');
    const service = makeBookHomeworkServiceContext(assignmentId, 'teacher-1');
    const authorityRef = service.firestore().doc(`homework_assignments/${assignmentId}`);

    await assertSucceeds(authorityRef.set(authority));
    await assertSucceeds(authorityRef.get());
    await assertSucceeds(authorityRef.update({
      revision: 2,
      updatedAt: '2026-07-28T00:01:00.000Z',
    }));

    await assertFails(
      makeBookHomeworkServiceContext('book-assignment-2', 'teacher-1')
        .firestore().doc(`homework_assignments/${assignmentId}`).get(),
    );
    // Reads are assignment-scoped because the repository does not know the
    // persisted owner until after decoding. Writes additionally bind owner/uid.
    await assertSucceeds(
      makeBookHomeworkServiceContext(assignmentId, 'teacher-2', 'teacher-2')
        .firestore().doc(`homework_assignments/${assignmentId}`).get(),
    );
    await assertFails(
      makeBookHomeworkServiceContext(assignmentId, 'teacher-2', 'teacher-2')
        .firestore().doc(`homework_assignments/${assignmentId}`).update({
          revision: 3,
          updatedAt: '2026-07-28T00:02:00.000Z',
        }),
    );
    await assertFails(
      makeBookHomeworkServiceContext(assignmentId, 'teacher-1', 'teacher-1', {
        book_homework_assignmentId: 'book-assignment-1/other',
      }).firestore().doc(`homework_assignments/${assignmentId}`).get(),
    );
    await assertFails(
      makeBookHomeworkServiceContext(assignmentId, 'teacher-1', 'teacher-1', {
        book_homework_service: 'true',
      }).firestore().doc(`homework_assignments/${assignmentId}`).get(),
    );

    const malformedAuthority = validBookHomeworkAuthority(assignmentId, 'teacher-1');
    malformedAuthority.bookManifest.context.kind = 'not-homework';
    await assertFails(
      service.firestore().doc('homework_assignments/book-malformed-service').set(malformedAuthority),
    );

    await assertFails(authorityRef.update({ ownerId: 'teacher-2' }));
    await assertFails(authorityRef.update({ assignmentId: 'book-assignment-2' }));
    await assertFails(authorityRef.update({ 'bookManifest.context.contextId': 'other-assignment' }));
    await assertFails(authorityRef.delete());

    const { student, teacher, unauthenticated } = makeHomeworkRuleContexts();
    await assertFails(teacher.firestore().doc(`homework_assignments/${assignmentId}`).get());
    await assertFails(student.firestore().doc(`homework_assignments/${assignmentId}`).get());
    await assertFails(unauthenticated.firestore().doc(`homework_assignments/${assignmentId}`).get());
    await assertFails(
      teacher.firestore().doc('homework_assignments/book-browser-create').set(authority),
    );
  });
});
