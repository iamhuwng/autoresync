import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const describeEmulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? describe : describe.skip;
const rules = readFileSync('database.rules.json', 'utf8');
const studentId = 'thcs-result-student';
const resultId = 'thcs-result-1';
const submittedAt = 1_800_000_000_000;
const intent = {
  schemaVersion: 1,
  actionId: resultId,
  kind: 'fully-graded',
  occurredAt: submittedAt,
  dueAt: submittedAt + 3_600_000,
  attempts: 0,
  state: 'pending',
};
let testEnv: RulesTestEnvironment;
const resultRecord = (overrides: Record<string, unknown> = {}) => ({
  resultId, studentId, submittedAt, testType: 'THCS-THPT',
  thcsData: { gradingStatus: 'fully-graded', scaledScore: 8.5 },
  notificationIntent: intent,
  ...overrides,
});

describeEmulator('THCS fully graded notification intent RTDB rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'demo-thcs-notification-intents', database: { rules } });
    await testEnv.withSecurityRulesDisabled(async (context) => context.database().ref().set({}));
  });
  afterAll(async () => { await testEnv?.cleanup(); });

  it('allows only a self-owned fully graded THCS result to establish the immutable intent', async () => {
    const student = testEnv.authenticatedContext(studentId).database();
    await assertSucceeds(student.ref(`test_results/${resultId}`).set(resultRecord()));

    const forged = testEnv.authenticatedContext('other-student').database();
    await assertFails(forged.ref('test_results/forged-result').set(resultRecord({
      resultId: 'forged-result', studentId: 'thcs-result-student',
      notificationIntent: { ...intent, actionId: 'forged-result' },
    })));
    await assertFails(student.ref('test_results/not-fully-graded').set(resultRecord({
      resultId: 'not-fully-graded', notificationIntent: { ...intent, actionId: 'not-fully-graded' },
      thcsData: { gradingStatus: 'auto-graded', scaledScore: 8.5 },
    })));
  });

  it('rejects browser mutation, removal, and deletion of a result carrying the intent', async () => {
    const student = testEnv.authenticatedContext(studentId).database();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref(`test_results/${resultId}`).set(resultRecord());
    });
    const resultRef = student.ref(`test_results/${resultId}`);
    await assertSucceeds(resultRef.child('presentationNote').set('metadata remains editable'));
    await assertFails(resultRef.child('notificationIntent/attempts').set(1));
    await assertFails(resultRef.child('notificationIntent').remove());
    await assertFails(resultRef.remove());
    await assertSucceeds(student.ref('test_results/ordinary-result').set({
      resultId: 'ordinary-result', studentId, testType: 'IELTS', submittedAt,
    }));
  });

  it('rejects retrofitting an intent onto an existing result', async () => {
    const student = testEnv.authenticatedContext(studentId).database();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref(`test_results/${resultId}`).set({
        resultId, studentId, submittedAt, testType: 'THCS-THPT',
        thcsData: { gradingStatus: 'fully-graded', scaledScore: 8.5 },
      });
    });
    await assertFails(student.ref(`test_results/${resultId}/notificationIntent`).set(intent));
  });

  it('denies the legacy student-side auto-grade source write for session and practice paths', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('game_sessions/session-grade').set({
        createdByUserId: 'thcs-teacher',
        results: { [studentId]: { questionResults: { 1: { pointsMax: 1, pointsEarned: 0 } } } },
      });
    });
    const student = testEnv.authenticatedContext(studentId).database();
    await assertFails(student.ref(`game_sessions/session-grade/results/${studentId}/questionResults/1`).update({
      pointsEarned: 1,
    }));
    await assertFails(student.ref(`game_sessions/practice_material/results/${studentId}/questionResults/1`).update({
      pointsEarned: 1,
    }));
  });
});
