import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const PROJECT_ID = 'demo-prd-0040-security';
const DATABASE_RULES = readFileSync(join(process.cwd(), 'database.rules.json'), 'utf8');
const FIRESTORE_RULES = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');

let testEnv: RulesTestEnvironment;

async function seedSecurityFixtures() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    const fs = context.firestore();

    await db.ref('users/student-1/role').set('student');
    await db.ref('users/student-2/role').set('student');
    await db.ref('users/teacher-1/role').set('teacher');
    await db.ref('users/teacher-2/role').set('teacher');
    await db.ref('users/admin-1/role').set('super_admin');

    await db.ref('test_results/result-1').set({
      resultId: 'result-1',
      studentId: 'student-1',
      teacherId: 'teacher-1',
      submittedAt: Date.now(),
      totalScore: 88,
    });

    await db.ref('guest_results/guest-1/result-1').set({
      resultId: 'guest-result-1',
      guestName: 'guest-1',
      submittedAt: Date.now(),
      totalScore: 72,
    });

    await fs.doc('writing_submissions/submission-1').set({
      id: 'submission-1',
      studentId: 'student-1',
      studentName: 'Student One',
      context: {
        type: 'live-session',
        sessionCode: 'SESSION-1',
        assigningTeacherId: 'teacher-1',
        selectedTeacherId: 'teacher-1',
      },
      testMeta: {
        testId: 'test-1',
        testTitle: 'IELTS Writing Mock',
        format: 'IELTS',
        duration: 60,
      },
      submittedAt: Date.now(),
      markingStatus: 'pending-review',
      tasks: [],
      annotations: [],
      auditTrail: [],
    });
  });
}

async function makeContexts() {
  const student = testEnv.authenticatedContext('student-1');
  const otherStudent = testEnv.authenticatedContext('student-2');
  const teacher = testEnv.authenticatedContext('teacher-2');
  const unauthenticated = testEnv.unauthenticatedContext();
  const unrelatedUser = testEnv.authenticatedContext('intruder-1');

  return {
    student,
    otherStudent,
    teacher,
    unauthenticated,
    unrelatedUser,
  };
}

describe('PRD-0040 security emulator checks', () => {
  beforeEach(async () => {
    if (!testEnv) {
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        database: { rules: DATABASE_RULES },
        firestore: { rules: FIRESTORE_RULES },
      });
    }

    await testEnv.clearDatabase();
    await testEnv.clearFirestore();
    await seedSecurityFixtures();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it('allows the owning student to read test_results/result-1 and denies a different student', async () => {
    const { student, otherStudent } = await makeContexts();

    const ownerRead = student.database().ref('test_results/result-1').once('value');
    const otherStudentRead = otherStudent.database().ref('test_results/result-1').once('value');

    await assertSucceeds(ownerRead);
    await assertFails(otherStudentRead);
  });

  it('allows an unrelated teacher to read test_results/result-1 under current RTDB rules', async () => {
    const { teacher } = await makeContexts();

    await assertSucceeds(teacher.database().ref('test_results/result-1').once('value'));
  });

  it('rejects unauthenticated guest-results reads but allows unauthenticated guest-results writes', async () => {
    const { unauthenticated } = await makeContexts();
    const guestRef = unauthenticated.database().ref('guest_results/guest-1');
    const guestChildRef = unauthenticated.database().ref('guest_results/guest-1/result-2');

    await assertFails(guestRef.once('value'));
    await assertSucceeds(guestChildRef.set({
      resultId: 'guest-result-2',
      guestName: 'guest-1',
      submittedAt: Date.now(),
      totalScore: 77,
    }));
  });

  it('allows an unrelated authenticated user to update writing_submissions/submission-1', async () => {
    const { unrelatedUser } = await makeContexts();
    const submissionRef = unrelatedUser.firestore().doc('writing_submissions/submission-1');

    await assertSucceeds(
      submissionRef.update({
        markingStatus: 'graded',
        totalScore: 9,
      })
    );
  });
});
