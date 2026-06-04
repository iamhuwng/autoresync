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
});
