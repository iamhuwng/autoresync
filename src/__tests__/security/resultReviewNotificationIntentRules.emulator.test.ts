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
const eventId = 'review-event-1';
const resultId = 'review-result-1';
const teacherId = 'review-teacher-1';
const studentId = 'review-student-1';
const occurredAt = 200;
const intent = {
  schemaVersion: 1,
  eventId,
  kind: 'result-reviewed',
  resultId,
  actorUid: teacherId,
  studentId,
  occurredAt,
  dueAt: occurredAt + 3_600_000,
  attempts: 1,
  state: 'retry_due',
};

let testEnv: RulesTestEnvironment;
const claims = (overrides: Record<string, unknown> = {}) => ({
  notificationResultReview: true,
  actionKind: 'result-reviewed',
  eventId,
  resultId,
  actorUid: teacherId,
  studentId,
  occurredAt,
  ...overrides,
});
const reviewPatch = (overrides: Record<string, unknown> = {}) => ({
  [`test_results/${resultId}/markingStatus`]: 'reviewed',
  [`test_results/${resultId}/reviewedAt`]: occurredAt,
  [`test_results/${resultId}/reviewedBy`]: teacherId,
  [`test_results/${resultId}/updatedAt`]: occurredAt,
  [`result_review_notification_intents/${eventId}`]: intent,
  ...overrides,
});

describeEmulator('result-review notification intent RTDB rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-result-review-intents',
      database: { rules },
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().set({
        users: { [teacherId]: { role: 'teacher' } },
        test_results: { [resultId]: { resultId, studentId, markingStatus: 'pending-review' } },
      });
    });
  });

  afterAll(async () => { await testEnv?.cleanup(); });

  it('commits reviewed state and one scoped intent together', async () => {
    const service = testEnv.authenticatedContext(
      `notification-result-review:${eventId}`, claims(),
    ).database();
    await assertSucceeds(service.ref().update(reviewPatch()));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const snapshot = await context.database().ref(`result_review_notification_intents/${eventId}`).get();
      expect(snapshot.val()).toMatchObject(intent);
    });
    await assertFails(service.ref().update(reviewPatch()));
  });

  it('rejects browser writes and forged service scope at the root boundary', async () => {
    const browser = testEnv.authenticatedContext(teacherId).database();
    await assertFails(browser.ref(`test_results/${resultId}/markingStatus`).set('reviewed'));
    await assertFails(browser.ref(`test_results/${resultId}`).update({
      markingStatus: 'reviewed', reviewedAt: occurredAt, reviewedBy: teacherId,
    }));
    await assertFails(browser.ref(`result_review_notification_intents/${eventId}`).set(intent));
    await assertFails(browser.ref().update(reviewPatch()));
    await assertFails(browser.ref('result_review_notification_intents').set({ [eventId]: intent }));

    const wrongActor = testEnv.authenticatedContext(
      `notification-result-review:${eventId}`, claims({ actorUid: 'other-teacher' }),
    ).database();
    await assertFails(wrongActor.ref().update(reviewPatch()));
    const wrongRecipient = testEnv.authenticatedContext(
      `notification-result-review:${eventId}`, claims({ studentId: 'other-student' }),
    ).database();
    await assertFails(wrongRecipient.ref().update(reviewPatch()));
  });
});
