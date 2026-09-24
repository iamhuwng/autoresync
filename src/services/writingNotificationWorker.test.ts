import { describe, expect, it, vi } from 'vitest';
import {
  retryDueWritingGradeNotifications,
  type WritingGradeNotificationIntent,
  type WritingGradeNotificationStorage,
} from '../../cloudflare/src/upload-worker/notifications/writing-grade-authority';
import { createWritingNotificationWorker } from '../../cloudflare/src/upload-worker/notifications/writing-grade-notification-worker';
import type { NotificationCommandRepository } from '../../cloudflare/src/upload-worker/notifications/repository';

const now = 1_800_000_000_000;
const submissionId = 'writing-submission-9';
const eventId = `writing-${submissionId}-submitted-student`;
const intent: WritingGradeNotificationIntent = {
  schemaVersion: 1,
  eventId,
  kind: 'writing-submitted-student',
  authorityRecordId: submissionId,
  occurrenceId: eventId,
  actorUid: 'writing-student-9',
  occurredAt: now - 3_600_001,
  dueAt: now - 1,
  attempts: 1,
  state: 'retry_due',
};
const submission = {
  id: submissionId,
  studentId: intent.actorUid,
  submittedAt: intent.occurredAt,
  context: { type: 'solo-practice' },
};

const makeStorage = (overrides: Partial<WritingGradeNotificationStorage> = {}) => ({
  async readIntent() { return intent; },
  async readSubmission() { return submission; },
  async updateIntent() {},
  async dueIntents() { return []; },
  async claimRetry() { return null; },
  async readTeacherLink() { return false; },
  async readSessionSubmissionProof() { return false; },
  async readInbox() { return null; },
  async reportFailure() {},
  ...overrides,
}) satisfies WritingGradeNotificationStorage;

describe('writing notification Worker entry', () => {
  it('authenticates an identity-only action and derives the inbox write from saved authority', async () => {
    const create = vi.fn(async () => ({ status: 'created' as const, notificationId: eventId }));
    const worker = createWritingNotificationWorker({
      firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: intent.actorUid }) } as any,
      repositoryFactory: () => ({ create } as unknown as NotificationCommandRepository),
      storageFactory: () => makeStorage(),
      now: () => now,
    });
    const response = await worker.fetch(new Request('https://worker.test/writing-notifications/actions', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json', 'Idempotency-Key': eventId },
      body: JSON.stringify({ schemaVersion: 1, actionType: 'writing-notification', eventId, submissionId }),
    }), { NOTIFICATION_RATE_LIMITER: { limit: async () => ({ success: true }) } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'delivered' });
    expect(create).toHaveBeenCalledWith({
      operationId: eventId,
      recipientId: submission.studentId,
      notification: {
        type: 'success', title: 'Writing submitted',
        message: 'Your writing submission has been received for review.',
        link: '/student/academic-record',
      },
      now,
    });
  });

  it('rejects caller-authored recipient and content fields before storage access', async () => {
    const readIntent = vi.fn();
    const worker = createWritingNotificationWorker({
      firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: intent.actorUid }) } as any,
      storageFactory: () => makeStorage({ readIntent }),
    });
    const response = await worker.fetch(new Request('https://worker.test/writing-notifications/actions', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json', 'Idempotency-Key': eventId },
      body: JSON.stringify({ schemaVersion: 1, actionType: 'writing-notification', eventId, submissionId, recipientId: 'forged', message: 'forged' }),
    }), { NOTIFICATION_RATE_LIMITER: { limit: async () => ({ success: true }) } });

    expect(response.status).toBe(400);
    expect(readIntent).not.toHaveBeenCalled();
  });

  it('claims one later retry and then records a terminal failure report', async () => {
    let updated: WritingGradeNotificationIntent | undefined;
    const retrying: WritingGradeNotificationIntent = { ...intent, state: 'retrying', attempts: 2 };
    const storage = makeStorage({
      async dueIntents() { return [intent]; },
      async claimRetry() { return retrying; },
      async updateIntent(value) { updated = value; },
    });
    const create = vi.fn(async () => { throw new Error('inbox_unavailable'); });
    const reportFailure = vi.fn(async () => {});

    await retryDueWritingGradeNotifications({
      storage,
      repository: { create } as unknown as NotificationCommandRepository,
      now,
      readInbox: async () => null,
      reportFailure,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(updated).toMatchObject({ state: 'failed', attempts: 2 });
    expect(reportFailure).toHaveBeenCalledTimes(1);
  });
});
