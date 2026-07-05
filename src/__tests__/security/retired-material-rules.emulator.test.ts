import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const describeEmulator = hasDatabaseEmulator ? describe : describe.skip;
const DATABASE_RULES = readFileSync('database.rules.json', 'utf8');
let testEnv: RulesTestEnvironment;

const activeTestSession = {
  sessionCode: 'TEST123',
  status: 'waiting',
  mode: 'test',
  testId: 'test-1',
  createdAt: 1_700_000_000_000,
  expiresAt: 1_700_086_400_000,
  createdByUserId: 'teacher-1',
  settings: {
    restrictToClassMembers: false,
    allowLateJoin: true,
  },
  players: {},
  students: {},
};

const privateTest = {
  id: 'test-1',
  title: 'Supported test',
  ownerId: 'teacher-1',
  createdBy: 'teacher-1',
  isPublic: false,
  authoringVersioning: {
    frozen: false,
  },
};

const readingV2Material = {
  materialId: 'reading-v2-1',
  ownerId: 'teacher-1',
  deliveryEngine: 'reading-v2',
  title: 'Reading V2 material',
  publishedSnapshotVersionId: 'snapshot-1',
  state: 'published',
};

const retainedResult = {
  resultId: 'result-1',
  studentId: 'student-1',
  sessionCode: 'TEST123',
  testId: 'test-1',
  testTitle: 'Retained result',
  questionResults: {
    1: {
      question: 'Saved question',
      studentAnswer: 'A',
      correctAnswer: 'A',
      isCorrect: true,
    },
  },
  visibility: {
    ownershipResolved: true,
    visibilityOwnerTeacherId: 'teacher-1',
    contextType: 'session',
  },
  submittedAt: 1_700_000_010_000,
};

describe('retired material RTDB rules', () => {
  it('locally freezes retired Quiz rules while preserving protected result and Reading V2 rules', () => {
    const rules = JSON.parse(DATABASE_RULES) as { rules: Record<string, any> };

    expect(rules.rules['.write']).toContain(
      "newData.child('quizzes').val() === data.child('quizzes').val()",
    );
    expect(rules.rules.quizzes?.['.read']).toBe(false);
    expect(rules.rules.quizzes?.['.write']).toBe(false);
    expect(rules.rules.game_sessions?.$sessionCode?.['.validate']).toContain(
      "newData.child('mode').val() !== 'quiz'",
    );
    expect(rules.rules.game_sessions?.$sessionCode?.quizId?.['.validate']).toBe(false);
    expect(rules.rules.game_sessions?.$sessionCode?.activeQuizzes?.['.validate']).toBe(false);
    expect(
      rules.rules.game_sessions?.$sessionCode?.students?.$studentId?.assignedQuizId?.[
        '.validate'
      ],
    ).toBe(false);
    expect(rules.rules.tests?.$testId?.['.read']).toContain("data.child('ownerId').val() === auth.uid");
    expect(rules.rules.reading_v2?.material_metadata?.$materialId?.['.validate']).toContain(
      "newData.child('deliveryEngine').val() === 'reading-v2'",
    );
    expect(rules.rules.test_results?.$resultId?.['.read']).toContain(
      "data.child('studentId').val() === auth.uid",
    );
  });

  describeEmulator('emulator enforcement', () => {
    beforeEach(async () => {
      testEnv = await initializeTestEnvironment({
        projectId: 'demo-retired-material-rules',
        database: { rules: DATABASE_RULES },
      });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.database();
        await db.ref('users/teacher-1/role').set('teacher');
        await db.ref('users/teacher-2/role').set('teacher');
        await db.ref('users/student-1/role').set('student');
        await db.ref('users/admin-1/role').set('super_admin');
        await db.ref('tests/test-1').set(privateTest);
        await db.ref('reading_v2/material_metadata/reading-v2-1').set(readingV2Material);
        await db.ref('test_results/result-1').set(retainedResult);
        await db.ref('test_results_by_student/student-1/result-1').set({
          resultId: 'result-1',
          submittedAt: retainedResult.submittedAt,
        });
        await db.ref('game_sessions/TEST123').set(activeTestSession);
      });
    });

    it('denies retired /quizzes client reads and writes', async () => {
      const teacher = testEnv.authenticatedContext('teacher-1').database();
      const student = testEnv.authenticatedContext('student-1').database();

      await assertFails(teacher.ref('quizzes/quiz-1').once('value'));
      await assertFails(student.ref('quizzes/quiz-1').once('value'));
      await assertFails(teacher.ref('quizzes/quiz-1').set({
        id: 'quiz-1',
        title: 'Retired quiz',
      }));
      await assertFails(student.ref('quizzes/quiz-1').set({
        id: 'quiz-1',
        title: 'Retired quiz',
      }));
    });

    it('keeps supported /tests ownership rules intact', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const admin = testEnv.authenticatedContext('admin-1').database();

      await assertSucceeds(owner.ref('tests/test-1').once('value'));
      await assertSucceeds(admin.ref('tests/test-1').once('value'));
      await assertFails(otherTeacher.ref('tests/test-1').once('value'));
      await assertSucceeds(owner.ref('tests/test-new').set({
        ...privateTest,
        id: 'test-new',
      }));
      await assertFails(otherTeacher.ref('tests/test-1').update({
        title: 'Cross-owner edit',
      }));
    });

    it('keeps Reading V2 paths protected and writable by the owner/admin only', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const admin = testEnv.authenticatedContext('admin-1').database();

      await assertSucceeds(owner.ref('reading_v2/material_metadata/reading-v2-1').once('value'));
      await assertSucceeds(admin.ref('reading_v2/material_metadata/reading-v2-1').once('value'));
      await assertFails(otherTeacher.ref('reading_v2/material_metadata/reading-v2-1').once('value'));
      await assertSucceeds(owner.ref('reading_v2/material_metadata/reading-v2-new').set({
        ...readingV2Material,
        materialId: 'reading-v2-new',
      }));
      await assertFails(owner.ref('reading_v2/material_metadata/reading-v2-bad').set({
        ...readingV2Material,
        materialId: 'reading-v2-bad',
        deliveryEngine: 'reading-v1',
      }));
    });

    it('keeps retained academic result reads available through saved result and index records', async () => {
      const student = testEnv.authenticatedContext('student-1').database();
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const admin = testEnv.authenticatedContext('admin-1').database();

      await assertSucceeds(student.ref('test_results/result-1').once('value'));
      await assertSucceeds(owner.ref('test_results/result-1').once('value'));
      await assertSucceeds(admin.ref('test_results/result-1').once('value'));
      await assertFails(otherTeacher.ref('test_results/result-1').once('value'));
      await assertSucceeds(student.ref('test_results_by_student/student-1/result-1').once('value'));
      await assertFails(otherTeacher.ref('test_results_by_student/student-1/result-1').once('value'));
    });

    it('allows test-mode session creation while rejecting retired Quiz session fields', async () => {
      const teacher = testEnv.authenticatedContext('teacher-1').database();

      await assertSucceeds(teacher.ref('game_sessions/TESTNEW').set({
        ...activeTestSession,
        sessionCode: 'TESTNEW',
        testId: 'test-new',
      }));
      await assertFails(teacher.ref('game_sessions/QUIZMODE').set({
        ...activeTestSession,
        sessionCode: 'QUIZMODE',
        mode: 'quiz',
      }));
      await assertFails(teacher.ref('game_sessions/QUIZID').set({
        ...activeTestSession,
        sessionCode: 'QUIZID',
        quizId: 'quiz-1',
      }));
      await assertFails(teacher.ref('game_sessions/ACTIVEQUIZZES').set({
        ...activeTestSession,
        sessionCode: 'ACTIVEQUIZZES',
        activeQuizzes: {
          assignment: true,
        },
      }));
      await assertFails(teacher.ref('game_sessions/ASSIGNEDQUIZ').set({
        ...activeTestSession,
        sessionCode: 'ASSIGNEDQUIZ',
        students: {
          'student-1': {
            assignedQuizId: 'quiz-1',
          },
        },
      }));
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});
