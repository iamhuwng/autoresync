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

const makeBookHomeworkAuthorityServiceContext = (
  authorityId = 'book-assignment-1--student-1--authority',
  assignmentId = 'book-assignment-1',
  ownerId = 'teacher-1',
  uid = ownerId,
) => testEnv.authenticatedContext(uid, {
  book_homework_authority_service: true,
  book_homework_authority_authorityId: authorityId,
  book_homework_authority_assignmentId: assignmentId,
  book_homework_authority_ownerId: ownerId,
});

const makeBookHomeworkCompatibilityServiceContext = (
  assignmentId = 'book-assignment-compatibility-1',
  ownerId = 'teacher-1',
  uid = ownerId,
) => testEnv.authenticatedContext(uid, {
  book_homework_compatibility_service: true,
  book_homework_compatibility_assignmentId: assignmentId,
  book_homework_compatibility_ownerId: ownerId,
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

const validBookHomeworkCompatibility = (
  assignmentId = 'book-assignment-compatibility-1',
  ownerId = 'teacher-1',
) => ({
  schemaVersion: 1,
  assignmentKind: 'book_homework_compatibility',
  id: assignmentId,
  createdBy: ownerId,
  createdAt: 1780000000000,
  updatedAt: 1780000000000,
  materialId: 'book-1',
  materialTitle: 'Book One',
  materialType: 'book',
  materialSkill: 'mixed',
  title: 'Book Homework',
  target: { type: 'students', studentIds: ['student-1'] },
  scheduling: { dueDate: 1780000000000 },
  config: {
    timerMinutes: null,
    maxAttempts: null,
    feedbackTiming: 'never',
    lateSubmissionAllowed: false,
  },
  visibility: {
    showTimer: false,
    showAttempts: false,
    showDueDate: true,
    showQuestionCount: false,
    showDuration: false,
  },
  archived: false,
  tags: [],
  bookHomeworkCompatibility: {
    schemaVersion: 1,
    assignmentId,
    sourceSagaRevision: 1,
    sourceFingerprint: 'fingerprint-1',
  },
});

const committedProductionCompatibility = () => ({
  schemaVersion: 1,
  assignmentKind: 'book_homework_compatibility',
  id: 'assignment-vocab-u1-ac994b46-0f53-47f5-a697-659c54b54fb4',
  createdBy: 'glMHCrzMnyS6AqFcb9I0nlOqQ6X2',
  createdAt: 1786709204227,
  updatedAt: 1786709204227,
  materialId: 'book-vocab-u1-d43935c735245dc8',
  materialTitle: 'Vocabulary U1',
  materialType: 'book',
  materialSkill: 'mixed',
  title: 'Vocabulary U1',
  target: {
    type: 'students',
    studentIds: ['x3hDfjYVN7cJtSbwq0ChIjl1Bk62'],
  },
  scheduling: { dueDate: 1787270400000 },
  config: {
    timerMinutes: null,
    maxAttempts: null,
    feedbackTiming: 'never',
    lateSubmissionAllowed: false,
  },
  visibility: {
    showTimer: false,
    showAttempts: false,
    showDueDate: true,
    showQuestionCount: false,
    showDuration: false,
  },
  archived: false,
  tags: [],
  bookHomeworkCompatibility: {
    schemaVersion: 1,
    assignmentId: 'assignment-vocab-u1-ac994b46-0f53-47f5-a697-659c54b54fb4',
    sourceSagaRevision: 7,
    sourceFingerprint: 'fnv1a64:cc3d88a5107df2b5',
  },
});

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
    expect(firestoreRules).not.toContain('book_homework_service');
  });

  it('defines a separate exact-scope authority collection contract', () => {
    expect(firestoreRules).toContain('match /book_homework_authorities/{authorityId}');
    expect(firestoreRules).toContain('allow get: if isExactBookHomeworkAuthorityGet');
    expect(firestoreRules).toContain('allow list: if false');
    expect(firestoreRules).toContain('allow delete: if false');
    expect(firestoreRules).toContain('book_homework_authority_authorityId');
    expect(firestoreRules).toContain('request.resource.data.revision == resource.data.revision + 1');
    expect(firestoreRules).toContain('request.resource.data.bookManifest.context == resource.data.bookManifest.context');
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

  it('denies legacy Book Homework service access under homework_assignments', async () => {
    const assignmentId = 'book-assignment-1';
    const authority = validBookHomeworkAuthority(assignmentId, 'teacher-1');
    const service = testEnv.authenticatedContext(assignmentId, {
      book_homework_service: true,
      book_homework_assignmentId: assignmentId,
    });
    const authorityRef = service.firestore().doc(`homework_assignments/${assignmentId}`);

    await assertFails(
      authorityRef.get(),
    );
    await assertFails(authorityRef.set(authority));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`homework_assignments/${assignmentId}`).set(authority);
    });
    await assertFails(authorityRef.get());
    await assertFails(authorityRef.update({
      revision: 2,
      updatedAt: '2026-07-28T00:01:00.000Z',
    }));
    await assertFails(authorityRef.delete());

    const { student, teacher, unauthenticated } = makeHomeworkRuleContexts();
    await assertFails(teacher.firestore().doc(`homework_assignments/${assignmentId}`).get());
    await assertFails(student.firestore().doc(`homework_assignments/${assignmentId}`).get());
    await assertFails(unauthenticated.firestore().doc(`homework_assignments/${assignmentId}`).get());
    await assertFails(
      teacher.firestore().doc('homework_assignments/book-browser-create').set(authority),
    );
  });

  it('enforces exact authority UID/authority/root/owner scope and lifecycle CAS', async () => {
    const authorityId = 'assignment_1:@root--student_1:@recipient--authority';
    const assignmentId = 'assignment_1:@root';
    const wrongRootAssignmentId = 'assignment_2:@root';
    const ownerId = 'teacher-1';
    const authority = validBookHomeworkAuthority(authorityId, ownerId);
    authority.bookManifest.context.contextId = assignmentId;
    authority.bookManifest.context.recipientId = 'student_1:@recipient';
    authority.saga.sagaId = assignmentId;
    const service = makeBookHomeworkAuthorityServiceContext(authorityId, assignmentId, ownerId);
    const authorityRef = service.firestore().doc(`book_homework_authorities/${authorityId}`);
    const { teacher } = makeHomeworkRuleContexts();

    await assertSucceeds(authorityRef.get());
    await assertFails(
      makeBookHomeworkAuthorityServiceContext(authorityId, wrongRootAssignmentId, ownerId)
        .firestore().doc(`book_homework_authorities/${authorityId}`).get(),
    );
    await assertFails(
      service.firestore().doc(`book_homework_authorities/${authorityId}`).set({
        ...authority,
        bookManifest: {
          ...authority.bookManifest,
          context: { ...authority.bookManifest.context, recipientId: 'student_2:@recipient' },
        },
      }),
    );
    await assertSucceeds(authorityRef.set(authority));
    await assertSucceeds(authorityRef.get());
    await assertSucceeds(authorityRef.update({
      revision: 2,
      updatedAt: '2026-07-28T00:01:00.000Z',
    }));
    await assertSucceeds(authorityRef.update({
      revision: 3,
      updatedAt: '2026-07-28T00:02:00.000Z',
      saga: { ...authority.saga, sagaId: assignmentId, state: 'committed', lastCommandId: 'command-commit' },
      visibility: { ...authority.visibility, status: 'committed', revision: 3 },
    }));
    await assertSucceeds(authorityRef.update({
      revision: 4,
      updatedAt: '2026-07-28T00:03:00.000Z',
      saga: { ...authority.saga, sagaId: assignmentId, state: 'compensating', lastCommandId: 'command-compensate' },
      visibility: { ...authority.visibility, status: 'compensating', revision: 4 },
    }));
    await assertSucceeds(authorityRef.get());

    await assertFails(
      makeBookHomeworkAuthorityServiceContext(authorityId, assignmentId, ownerId, 'teacher-2')
        .firestore().doc(`book_homework_authorities/${authorityId}`).get(),
    );
    await assertFails(
      makeBookHomeworkAuthorityServiceContext('other-authority', assignmentId, ownerId)
        .firestore().doc(`book_homework_authorities/${authorityId}`).get(),
    );
    await assertFails(
      makeBookHomeworkAuthorityServiceContext(authorityId, wrongRootAssignmentId, ownerId)
        .firestore().doc(`book_homework_authorities/${authorityId}`).get(),
    );
    await assertFails(
      makeBookHomeworkAuthorityServiceContext(authorityId, assignmentId, 'teacher-2', 'teacher-2')
        .firestore().doc(`book_homework_authorities/${authorityId}`).get(),
    );
    await assertFails(teacher.firestore().doc(`book_homework_authorities/${authorityId}`).get());
    await assertFails(service.firestore().collection('book_homework_authorities').get());
    await assertFails(authorityRef.delete());
    await assertFails(authorityRef.update({ ownerId: 'teacher-2' }));
    await assertFails(authorityRef.update({ revision: 6 }));
  });

  it('limits compatibility projection reads to owner or exact student membership', async () => {
    const assignmentId = 'book-assignment-compatibility-1';
    const projection = validBookHomeworkCompatibility(assignmentId);
    const service = makeBookHomeworkCompatibilityServiceContext(assignmentId, 'teacher-1');
    const projectionRef = service.firestore().doc(`homework_assignments/${assignmentId}`);

    await assertSucceeds(projectionRef.get());
    await assertFails(
      makeBookHomeworkCompatibilityServiceContext(assignmentId, 'teacher-1', 'teacher-2')
        .firestore().doc(`homework_assignments/${assignmentId}`).get(),
    );
    await assertFails(
      makeBookHomeworkCompatibilityServiceContext(assignmentId, 'teacher-2', 'teacher-1')
        .firestore().doc(`homework_assignments/${assignmentId}`).get(),
    );
    await assertFails(
      makeBookHomeworkCompatibilityServiceContext('other-assignment', 'teacher-1')
        .firestore().doc(`homework_assignments/${assignmentId}`).get(),
    );
    await assertSucceeds(projectionRef.set(projection));
    await assertSucceeds(projectionRef.get());
    await assertSucceeds(testEnv.authenticatedContext('teacher-1').firestore().doc(`homework_assignments/${assignmentId}`).get());
    await assertSucceeds(testEnv.authenticatedContext('student-1').firestore().doc(`homework_assignments/${assignmentId}`).get());
    await assertFails(testEnv.authenticatedContext('student-2').firestore().doc(`homework_assignments/${assignmentId}`).get());
    await assertSucceeds(projectionRef.update({
      bookHomeworkCompatibility: {
        ...projection.bookHomeworkCompatibility,
        sourceSagaRevision: 2,
        sourceFingerprint: 'fingerprint-2',
      },
      updatedAt: 1780000000001,
    }));
    await assertFails(projectionRef.update({
      bookHomeworkCompatibility: {
        ...projection.bookHomeworkCompatibility,
        sourceSagaRevision: 2,
        sourceFingerprint: 'fingerprint-2',
      },
      updatedAt: 1780000000001,
    }));
    await assertFails(projectionRef.update({
      bookHomeworkCompatibility: {
        ...projection.bookHomeworkCompatibility,
        sourceSagaRevision: 2,
        sourceFingerprint: 'fingerprint-3',
      },
      updatedAt: 1780000000002,
    }));
    await assertFails(projectionRef.update({
      bookHomeworkCompatibility: {
        ...projection.bookHomeworkCompatibility,
        sourceSagaRevision: 1,
        sourceFingerprint: 'fingerprint-old',
      },
      updatedAt: 1780000000003,
    }));
    await assertFails(testEnv.authenticatedContext('teacher-1').firestore().doc(`homework_assignments/${assignmentId}`).update({ title: 'browser-write' }));
    await assertFails(testEnv.authenticatedContext('teacher-1').firestore().doc(`homework_assignments/${assignmentId}`).delete());
    await assertFails(service.firestore().collection('homework_assignments').get());
    await assertFails(testEnv.authenticatedContext('teacher-2').firestore().doc(`homework_assignments/${assignmentId}`).get());
  });

  it('creates and reads back the exact committed production compatibility projection', async () => {
    const projection = committedProductionCompatibility();
    const service = makeBookHomeworkCompatibilityServiceContext(
      projection.id,
      projection.createdBy,
    );
    const projectionRef = service.firestore().doc(`homework_assignments/${projection.id}`);

    await assertSucceeds(projectionRef.get());
    await assertSucceeds(projectionRef.set(projection));
    await expect(projectionRef.get()).resolves.toMatchObject({
      exists: true,
    });
    await assertSucceeds(
      testEnv.authenticatedContext(projection.createdBy)
        .firestore().doc(`homework_assignments/${projection.id}`).get(),
    );
    await assertSucceeds(
      testEnv.authenticatedContext(projection.target.studentIds[0])
        .firestore().doc(`homework_assignments/${projection.id}`).get(),
    );
  });

  it('allows retry-1 compatibility-service lookup before the assignment document exists', async () => {
    const authorityId = 'book-assignment-retry-1-absent-authority';
    const retryOneService = makeBookHomeworkCompatibilityServiceContext(
      authorityId,
      'teacher-1',
    );

    await assertSucceeds(
      retryOneService.firestore().doc(`homework_assignments/${authorityId}`).get(),
    );
  });
});
