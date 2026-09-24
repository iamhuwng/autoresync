import { describe, expect, it, vi } from 'vitest';
import {
  retryDueWritingGradeNotifications,
  type WritingGradeNotificationIntent,
  type WritingGradeNotificationStorage,
} from '../src/upload-worker/notifications/writing-grade-authority.ts';
import { createWritingNotificationWorker } from '../src/upload-worker/notifications/writing-grade-notification-worker.ts';
import type { NotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';

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

describe('writing notification Worker', () => {
  it('authenticates the identity-only action and derives the inbox write from saved authority', async () => {
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

  it('rejects a teacher-created live-session grade without canonical session proof', async () => {
    const gradeEventId = `writing-${submissionId}-graded-1`;
    const gradeIntent: WritingGradeNotificationIntent = {
      schemaVersion: 1, eventId: gradeEventId, kind: 'writing-graded',
      authorityRecordId: submissionId, occurrenceId: gradeEventId, actorUid: 'writing-teacher-9',
      auditVersion: 1, occurredAt: now, dueAt: now + 3_600_000, attempts: 1, state: 'retry_due',
    };
    const liveSubmission = {
      ...submission,
      context: { type: 'live-session', sessionCode: 'forged-session', assigningTeacherId: gradeIntent.actorUid },
      auditTrail: [{ version: 1, gradedAt: now, teacherId: gradeIntent.actorUid, action: 'published' }],
    };
    const storage = makeStorage({
      async readIntent() { return gradeIntent; },
      async readSubmission() { return liveSubmission; },
      async readTeacherLink() { return true; },
      async readSessionSubmissionProof() { return false; },
    });
    const create = vi.fn(async () => ({ status: 'created' as const, notificationId: gradeEventId }));
    const worker = createWritingNotificationWorker({
      firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: gradeIntent.actorUid }) } as any,
      repositoryFactory: () => ({ create } as unknown as NotificationCommandRepository),
      storageFactory: () => storage,
    });
    const response = await worker.fetch(new Request('https://worker.test/writing-notifications/actions', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json', 'Idempotency-Key': gradeEventId },
      body: JSON.stringify({ schemaVersion: 1, actionType: 'writing-notification', eventId: gradeEventId, submissionId }),
    }), { NOTIFICATION_RATE_LIMITER: { limit: async () => ({ success: true }) } });

    expect(response.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it('claims only the later retry and records its terminal failure report', async () => {
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
