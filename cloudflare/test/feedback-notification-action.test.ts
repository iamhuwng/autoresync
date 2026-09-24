import { describe, expect, it, vi } from 'vitest';
import {
  parseFeedbackAction,
  performFeedbackAction,
  type FeedbackActionCommand,
  type FeedbackNotificationIntent,
} from '../src/upload-worker/notifications/feedback-notification-action.ts';
import type { FeedbackActionStorage } from '../src/upload-worker/notifications/feedback-notification-action-store.ts';
import type { NotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';

const eventId = 'fbb01c56-1e03-4eb6-8990-b91eb91f9112';
const command: FeedbackActionCommand = {
  schemaVersion: 1, actionType: 'save-feedback', eventId, resultId: 'result-1',
  feedbackKind: 'question', questionId: 'q1', feedback: 'Good work',
};

describe('feedback notification action', () => {
  it('parses only the exact idempotent action schema', async () => {
    const request = new Request('https://worker.test/feedback-notifications/actions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': eventId }, body: JSON.stringify(command),
    });
    await expect(parseFeedbackAction(request)).resolves.toEqual(command);
    const mismatched = new Request('https://worker.test/feedback-notifications/actions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'other' }, body: JSON.stringify(command),
    });
    await expect(parseFeedbackAction(mismatched)).rejects.toThrow('feedback_action_invalid');
  });

  it('commits feedback and intent before immediate notification delivery', async () => {
    const intent: FeedbackNotificationIntent = {
      schemaVersion: 1, eventId, kind: 'feedback-question', resultId: 'result-1', actorUid: 'teacher-1',
      studentId: 'student-1', questionId: 'q1', occurredAt: 1234, dueAt: 1234 + 3_600_000, attempts: 1, state: 'retry_due',
    };
    const result = { resultId: 'result-1', studentId: 'student-1', teacherId: 'teacher-1', testTitle: 'English', questionResults: [{ questionId: 'q1' }] };
    const storage: FeedbackActionStorage = {
      read: vi.fn(async (path) => path === 'test_results/result-1' ? result
        : path === 'users/teacher-1' ? { role: 'teacher', displayName: 'Ms Lee' } : null),
      commit: vi.fn(), updateIntent: vi.fn(), dueIntents: vi.fn(), claimRetry: vi.fn(),
    };
    const repository: NotificationCommandRepository = {
      create: vi.fn(async () => ({ status: 'created' as const, notificationId: eventId })),
    };
    const response = await performFeedbackAction({
      command, actorUid: 'teacher-1', storage, repository, now: () => 1234,
    });
    expect(response).toMatchObject({ status: 200, body: { status: 'committed', eventId, notificationStatus: 'delivered' } });
    expect(storage.commit).toHaveBeenCalledWith(expect.objectContaining({ intent: expect.objectContaining(intent) }));
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      operationId: eventId, recipientId: 'student-1', now: 1234,
      notification: expect.objectContaining({ type: 'feedback', message: 'Your teacher added feedback to your test result.' }),
    }));
    expect(storage.updateIntent).toHaveBeenCalledWith(expect.objectContaining({ eventId, state: 'done' }));
  });

  it('rejects a teacher who does not own the result before committing', async () => {
    const storage: FeedbackActionStorage = {
      read: vi.fn(async (path) => path === 'test_results/result-1'
        ? { resultId: 'result-1', studentId: 'student-1', teacherId: 'other-teacher', questionResults: [{ questionId: 'q1' }] }
        : path === 'users/teacher-1' ? { role: 'teacher' } : null),
      commit: vi.fn(), updateIntent: vi.fn(), dueIntents: vi.fn(), claimRetry: vi.fn(),
    };
    const repository: NotificationCommandRepository = { create: vi.fn() };
    const response = await performFeedbackAction({ command, actorUid: 'teacher-1', storage, repository });
    expect(response).toEqual({ status: 403, body: { code: 'feedback_action_forbidden' } });
    expect(storage.commit).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });
});
