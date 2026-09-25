import { describe, expect, it, vi } from 'vitest';
import { InMemoryNotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';
import { createHomeworkSubmissionNotificationWorker } from '../src/upload-worker/notifications/homework-submission-worker.ts';

const resultId = 'writing-result-1';
const canonicalResult = {
  resultId, studentId: 'student-1', context: { type: 'homework' },
  visibility: { ownershipResolved: true, visibilityOwnerTeacherId: 'teacher-1', homeworkId: 'homework-1' },
};
const request = (body: unknown) => new Request('https://worker.test/book-notifications/commands', {
  method: 'POST',
  headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json', Origin: 'https://kahut1.web.app' },
  body: JSON.stringify(body),
});
const command = { schemaVersion: 1, eventKind: 'homework-submitted', recordId: resultId };
const env = { NOTIFICATION_RATE_LIMITER: { limit: async () => ({ success: true }) } };
const verifier = (uid: string) => ({
  verifyToken: vi.fn(async () => ({ valid: true, uid })),
  verifyAuthorizationHeader: vi.fn(async () => ({ valid: true, uid })),
});

describe('homework submission event dispatch', () => {
  it('derives the recipient and content from a committed result and intent', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const hasCommittedIntent = vi.fn(async () => true);
    const recordImmediateOutcome = vi.fn(async () => {});
    const worker = createHomeworkSubmissionNotificationWorker({
      firebaseVerifier: verifier('student-1'), repositoryFactory: () => repository,
      readDatabaseValue: async () => canonicalResult, hasCommittedIntent,
      markDelivered: async () => true, recordImmediateOutcome, now: () => 1_779_000_000_000,
    });
    const response = await worker.fetch(request(command), env);
    expect(response.status).toBe(200);
    expect(hasCommittedIntent).toHaveBeenCalledWith(env, {
      resultId, studentId: 'student-1', teacherId: 'teacher-1', homeworkId: 'homework-1',
    });
    expect(Object.values(repository.snapshot())).toEqual([expect.objectContaining({
      type: 'info', title: 'Homework Submitted', message: 'A student submitted homework.',
      link: '/teacher/homework/homework-1', read: false,
    })]);
    expect((await worker.fetch(request(command), env)).status).toBe(200);
    expect(Object.keys(repository.snapshot())).toHaveLength(1);
    expect(recordImmediateOutcome).toHaveBeenCalledOnce();
  });

  it('records a failed immediate attempt after verifying the committed intent', async () => {
    const recordImmediateOutcome = vi.fn(async () => {});
    const worker = createHomeworkSubmissionNotificationWorker({
      firebaseVerifier: verifier('student-1'),
      repositoryFactory: () => ({ create: async () => { throw new Error('inbox_unavailable'); } }),
      readDatabaseValue: async () => canonicalResult, hasCommittedIntent: async () => true,
      recordImmediateOutcome,
    });
    expect((await worker.fetch(request(command), env)).status).toBe(500);
    expect(recordImmediateOutcome).toHaveBeenCalledWith(env, {
      resultId, studentId: 'student-1', teacherId: 'teacher-1', homeworkId: 'homework-1',
      reasonCode: 'delivery_backend_error',
    }, false, expect.any(Number));
  });

  it('rejects uncommitted and caller-authored notifications before writing', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const worker = createHomeworkSubmissionNotificationWorker({
      firebaseVerifier: verifier('student-1'), repositoryFactory: () => repository,
      readDatabaseValue: async () => canonicalResult, hasCommittedIntent: async () => false,
    });
    expect((await worker.fetch(request(command), env)).status).toBe(403);
    expect((await worker.fetch(request({ ...command, recipientId: 'teacher-2' }), env)).status).toBe(400);
    expect((await worker.fetch(request({ ...command, notification: { title: 'Injected' } }), env)).status).toBe(400);
    expect(repository.snapshot()).toEqual({});
  });

  it('rejects a result belonging to another student', async () => {
    const worker = createHomeworkSubmissionNotificationWorker({
      firebaseVerifier: verifier('other-student'), readDatabaseValue: async () => canonicalResult,
    });
    expect((await worker.fetch(request(command), env)).status).toBe(403);
  });
});
