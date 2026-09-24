import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

const describeEmulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? describe : describe.skip;
const rules = readFileSync('database.rules.json', 'utf8');
const eventId = 'fbb01c56-1e03-4eb6-8990-b91eb91f9112';
const resultId = 'feedback-result-1';
const actorUid = 'feedback-teacher-1';
const studentId = 'feedback-student-1';
const occurredAt = 200;
const intent = {
  schemaVersion: 1,
  eventId,
  kind: 'feedback-question',
  resultId,
  actorUid,
  studentId,
  questionId: 'q1',
  occurredAt,
  dueAt: occurredAt + 3_600_000,
  attempts: 1,
  state: 'retry_due',
};

let testEnv: RulesTestEnvironment;
const claims = (overrides: Record<string, unknown> = {}) => ({
  notificationFeedbackAction: true,
  eventId,
  resultId,
  actorUid,
  studentId,
  feedbackKind: 'question',
  questionId: 'q1',
  occurredAt,
  ...overrides,
});
const atomicSave = (intentValue: unknown = intent) => ({
  [`test_results/${resultId}/questionFeedback/q1`]: { questionId: 'q1', feedback: 'Good work', updatedById: actorUid, updatedAt: occurredAt, eventId },
  [`test_results/${resultId}/feedbackHistory/${eventId}`]: { eventId, teacherId: actorUid, type: 'question', questionId: 'q1', timestamp: occurredAt, feedback: 'Good work' },
  [`test_results/${resultId}/feedbackUpdatedAt`]: occurredAt,
  [`test_results/${resultId}/feedbackUpdatedBy`]: actorUid,
  [`test_results/${resultId}/feedbackUpdatedByTeacherId`]: actorUid,
  [`test_results/${resultId}/hasFeedback`]: true,
  [`test_results/${resultId}/questionResults/0/teacherFeedback`]: 'Good work',
  [`feedback_notification_intents/${eventId}`]: intentValue,
});

describeEmulator('feedback notification intent RTDB rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'demo-feedback-notification-intents', database: { rules } });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().set({
        users: { [actorUid]: { role: 'teacher' } },
        test_results: { [resultId]: { resultId, studentId, teacherId: actorUid, questionResults: [{ questionId: 'q1' }] } },
      });
    });
  });

  afterAll(async () => { await testEnv?.cleanup(); });

  it('allows the scoped first write inside the atomic feedback save', async () => {
    const service = testEnv.authenticatedContext(`notification-feedback-action:${eventId}`, claims()).database();
    await assertSucceeds(service.ref().update(atomicSave()));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const saved = await context.database().ref(`feedback_notification_intents/${eventId}`).get();
      expect(saved.val()).toMatchObject(intent);
    });
    await assertFails(service.ref().update(atomicSave()));
  });

  it('rejects browser and mismatched service writes to the intent root', async () => {
    const browser = testEnv.authenticatedContext(actorUid).database();
    await assertFails(browser.ref(`feedback_notification_intents/${eventId}`).set(intent));
    await assertFails(browser.ref().update(atomicSave()));
    await assertFails(browser.ref(`test_results/${resultId}/questionFeedback/q1`).set({ feedback: 'forged' }));
    await assertFails(browser.ref(`test_results/${resultId}/overallFeedback`).set({ feedback: 'forged' }));
    await assertFails(browser.ref(`test_results/${resultId}/feedbackHistory/${eventId}`).set({ feedback: 'forged' }));
    await assertFails(browser.ref(`test_results/${resultId}`).update({
      questionFeedback: { q1: { feedback: 'forged' } },
    }));
    await assertSucceeds(browser.ref(`test_results/${resultId}/unrelatedTeacherNote`).set('ordinary result update'));
    const wrongRecipient = testEnv.authenticatedContext(
      `notification-feedback-action:${eventId}`, claims({ studentId: 'other-student' }),
    ).database();
    await assertFails(wrongRecipient.ref().update(atomicSave()));
  });

  it('locks Worker-owned feedback after the signed commit while retaining unrelated result updates', async () => {
    const service = testEnv.authenticatedContext(`notification-feedback-action:${eventId}`, claims()).database();
    await assertSucceeds(service.ref().update(atomicSave()));
    const browser = testEnv.authenticatedContext(actorUid).database();
    await assertFails(browser.ref(`test_results/${resultId}/questionFeedback/q1/feedback`).set('forged after intent'));
    await assertFails(browser.ref(`test_results/${resultId}/feedbackHistory/${eventId}/feedback`).set('forged after intent'));
    await assertFails(browser.ref(`test_results/${resultId}/questionResults/0/teacherFeedback`).set('forged after intent'));
    await assertFails(browser.ref(`test_results/${resultId}`).update({
      questionFeedback: { q1: { feedback: 'forged after intent' } },
    }));
    await assertFails(browser.ref(`test_results/${resultId}`).remove());
    await assertSucceeds(browser.ref(`test_results/${resultId}/unrelatedTeacherNote`).set('ordinary result update'));
  });
});
