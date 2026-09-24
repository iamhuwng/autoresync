import { describe, expect, it, vi } from 'vitest';
import {
  performResultReviewAction,
  type ResultReviewCommand,
  type ResultReviewIntent,
} from '../src/upload-worker/notifications/result-review-action.ts';
import type { ResultReviewActionStorage } from '../src/upload-worker/notifications/result-review-action-store.ts';
import { retryDueResultReviewNotifications } from '../src/upload-worker/notifications/result-review-retry.ts';
import { InMemoryNotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';

const teacherId = 'teacher-1';
const studentId = 'student-1';
const resultId = 'result-1';
const eventId = '00000000-0000-4000-8000-000000000121';
const occurredAt = 1_800_000_000_000;
const command: ResultReviewCommand = {
  schemaVersion: 1,
  actionType: 'result-reviewed',
  eventId,
  resultId,
};
const result = {
  resultId,
  studentId,
  testTitle: 'Reading Check',
  testSkill: 'reading',
  markingStatus: 'pending-review',
  teacherId,
};
const teacher = { role: 'teacher', displayName: 'Teacher One' };

const actionFixture = () => {
  const rows = new Map<string, unknown>([
    [`test_results/${resultId}`, result],
    [`users/${teacherId}`, teacher],
  ]);
  const commit = vi.fn(async ({ intent }: { command: ResultReviewCommand; actorUid: string; intent: ResultReviewIntent }) => {
    rows.set(`test_results/${resultId}`, {
      ...result,
      markingStatus: 'reviewed',
      reviewedAt: intent.occurredAt,
      reviewedBy: teacherId,
    });
    rows.set(`result_review_notification_intents/${eventId}`, intent);
  });
  const updateIntent = vi.fn(async (intent: ResultReviewIntent) => {
    rows.set(`result_review_notification_intents/${eventId}`, intent);
  });
  const storage: ResultReviewActionStorage = {
    async read(path) { return rows.get(path) ?? null; },
    commit,
    updateIntent,
    async dueIntents() { return []; },
    async claimRetry() { return null; },
  };
  return { rows, storage, commit, updateIntent };
};

describe('trusted result review action', () => {
  it('atomically records the review intent and builds the notice from saved records', async () => {
    const { rows, storage, commit, updateIntent } = actionFixture();
    const repository = new InMemoryNotificationCommandRepository();
    await expect(performResultReviewAction({
      command,
      actorUid: teacherId,
      storage,
      repository,
      now: () => occurredAt,
    })).resolves.toMatchObject({
      status: 200,
      body: { status: 'committed', eventId, notificationStatus: 'delivered' },
    });
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({
      command,
      actorUid: teacherId,
      intent: {
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
      },
    }));
    expect(rows.get(`test_results/${resultId}`)).toMatchObject({
      markingStatus: 'reviewed', reviewedAt: occurredAt, reviewedBy: teacherId,
    });
    expect(updateIntent).toHaveBeenCalledWith(expect.objectContaining({ state: 'done' }));
    expect(repository.snapshot()).toEqual({
      [`notifications/${studentId}/${eventId}`]: {
        id: eventId,
        type: 'success',
        title: 'Result Reviewed',
        message: 'Your test result has been reviewed. View your score.',
        link: `/result/${resultId}`,
        read: false,
        createdAt: occurredAt,
      },
    });
  });

  it('rejects a teacher who does not own the result before writing', async () => {
    const { storage, commit } = actionFixture();
    const response = await performResultReviewAction({
      command,
      actorUid: 'other-teacher',
      storage: {
        ...storage,
        async read(path) {
          if (path === 'users/other-teacher') return teacher;
          return storage.read(path);
        },
      },
      repository: new InMemoryNotificationCommandRepository(),
    });
    expect(response.status).toBe(403);
    expect(commit).not.toHaveBeenCalled();
  });

  it('read-checks an interrupted delayed retry without a third inbox write or resetting read state', async () => {
    const intent: ResultReviewIntent = {
      schemaVersion: 1,
      eventId,
      kind: 'result-reviewed',
      resultId,
      actorUid: teacherId,
      studentId,
      occurredAt,
      dueAt: occurredAt,
      attempts: 2,
      state: 'retrying',
    };
    const reviewedResult = { ...result, markingStatus: 'reviewed', reviewedAt: occurredAt, reviewedBy: teacherId };
    const savedNotification = {
      id: eventId,
      type: 'success',
      title: 'Result Reviewed',
      message: 'Your test result has been reviewed. View your score.',
      link: `/result/${resultId}`,
      read: true,
      createdAt: occurredAt,
    };
    const updateIntent = vi.fn(async () => undefined);
    const storage: ResultReviewActionStorage = {
      async read(path) {
        return path === `test_results/${resultId}` ? reviewedResult
          : path === `users/${teacherId}` ? teacher
            : path === `notifications/${studentId}/${eventId}` ? savedNotification : null;
      },
      async commit() { throw new Error('unexpected'); },
      updateIntent,
      async dueIntents() { return [intent]; },
      async claimRetry() { throw new Error('retry already claimed'); },
    };
    const repository = new InMemoryNotificationCommandRepository();
    await retryDueResultReviewNotifications({}, occurredAt + 3_600_000, {
      storage,
      repository,
      read: storage.read.bind(storage),
    });
    expect(repository.snapshot()).toEqual({});
    expect(updateIntent).toHaveBeenCalledWith(expect.objectContaining({ state: 'done', attempts: 2 }));
  });
});
