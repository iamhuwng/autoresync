import { afterAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

const describeEmulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? describe : describe.skip;
const rules = readFileSync('database.rules.json', 'utf8');
const studentId = 'complete-student';
const teacherId = 'complete-teacher';
const resultId = 'ordinary-complete-result';
const submittedAt = 1_800_000_000_000;
const intent = (actorUid: string, actorRole: 'student' | 'teacher', id = resultId) => ({
  schemaVersion: 1, actionId: id, kind: 'test-completed', actorUid, actorRole,
  occurredAt: submittedAt, dueAt: submittedAt, attempts: 0, state: 'pending',
});
let testEnv: RulesTestEnvironment;

describeEmulator('ordinary test completion notification intent RTDB rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'demo-test-complete-intents', database: { rules } });
    await testEnv.withSecurityRulesDisabled(async (context) => context.database().ref().set({
      users: { [studentId]: { role: 'student' }, [teacherId]: { role: 'teacher' }, 'other-teacher': { role: 'teacher' } },
      game_sessions: { 'session-1': { teacherId } },
    }));
  });
  afterAll(async () => { await testEnv?.cleanup(); });

  it('allows the student and owner teacher to create a result with a bound intent', async () => {
    const student = testEnv.authenticatedContext(studentId).database();
    await assertSucceeds(student.ref(`test_results/${resultId}`).set({
      resultId, studentId, submittedAt, testType: 'reading', testTitle: 'Test',
      testCompleteNotificationIntent: intent(studentId, 'student'),
    }));

    const teacherResultId = 'teacher-auto-result';
    const teacher = testEnv.authenticatedContext(teacherId).database();
    await assertSucceeds(teacher.ref(`test_results/${teacherResultId}`).set({
      resultId: teacherResultId, studentId, teacherId, sessionCode: 'session-1', submittedAt,
      testType: 'reading', testTitle: 'Test',
      context: { type: 'class_session', configApplied: { source: 'teacher_override' } },
      testCompleteNotificationIntent: intent(teacherId, 'teacher', teacherResultId),
    }));
  });

  it('rejects wrong actors, THCS retrofits, intent mutation, removal, and deletion', async () => {
    const otherTeacher = testEnv.authenticatedContext('other-teacher').database();
    await assertFails(otherTeacher.ref(`test_results/${resultId}`).set({
      resultId, studentId, teacherId: 'other-teacher', sessionCode: 'session-1', submittedAt,
      context: { type: 'class_session', configApplied: { source: 'teacher_override' } },
      testCompleteNotificationIntent: intent('other-teacher', 'teacher'),
    }));
    const otherStudent = testEnv.authenticatedContext('other-student').database();
    await assertFails(otherStudent.ref('test_results/forged-result').set({
      resultId: 'forged-result', studentId, submittedAt,
      testCompleteNotificationIntent: intent('other-student', 'student', 'forged-result'),
    }));
    const student = testEnv.authenticatedContext(studentId).database();
    await assertFails(student.ref('test_results/thcs-ordinary-intent').set({
      resultId: 'thcs-ordinary-intent', studentId, submittedAt, testType: 'THCS-THPT',
      thcsData: { gradingStatus: 'fully-graded', scaledScore: 8.5 },
      testCompleteNotificationIntent: intent(studentId, 'student', 'thcs-ordinary-intent'),
    }));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('test_results/legacy-result').set({ resultId: 'legacy-result', studentId, submittedAt, testType: 'reading' });
      await context.database().ref('test_results/thcs-result').set({ resultId: 'thcs-result', studentId, submittedAt,
        testType: 'THCS-THPT', thcsData: { gradingStatus: 'fully-graded' } });
    });
    await assertFails(student.ref('test_results/legacy-result/testCompleteNotificationIntent').set(intent(studentId, 'student', 'legacy-result')));
    await assertFails(student.ref('test_results/thcs-result/testCompleteNotificationIntent').set(intent(studentId, 'student', 'thcs-result')));
    const resultRef = student.ref(`test_results/${resultId}`);
    await assertSucceeds(resultRef.set({
      resultId, studentId, submittedAt, testType: 'reading', testTitle: 'Test',
      testCompleteNotificationIntent: intent(studentId, 'student'),
    }));
    await assertFails(resultRef.child('testCompleteNotificationIntent/attempts').set(1));
    await assertFails(resultRef.child('testCompleteNotificationIntent').remove());
    await assertFails(resultRef.remove());
  });
});
