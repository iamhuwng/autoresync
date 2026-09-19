import { describe, expect, it, vi } from 'vitest';
import { InMemoryNotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';
import { createHomeworkSubmissionNotificationWorker } from '../src/upload-worker/notifications/homework-submission-worker.ts';

const resultId = 'writing-result-1';
const teacherId = 'teacher-1';
const studentId = 'student-1';

const hash32 = (value: string, seed: number): number => {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
};

const operationIdFor = (operationKey: string): string => {
  const hex = [0, 1, 2, 3]
    .map((seed) => hash32(`${operationKey}:${seed}`, seed).toString(16).padStart(8, '0'))
    .join('');
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

const operationId = operationIdFor(
  `homework-submitted:teacher:${resultId}:${teacherId}`,
);

const canonicalResult = {
  resultId,
  studentId,
  studentName: 'Student One',
  testTitle: 'Class Writing Homework',
  context: { type: 'homework' },
  visibility: {
    ownershipResolved: true,
    visibilityOwnerTeacherId: teacherId,
    homeworkId: 'homework-1',
    sourceNameSnapshot: 'Class Writing Homework',
  },
};

const command = (override: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  commandType: 'create-notification',
  operationId,
  producerFamily: 'homework',
  recipientId: teacherId,
  authority: { kind: 'homework', recordId: resultId },
  notification: {
    type: 'info',
    title: 'Homework Submitted',
    message: 'Student One submitted "Class Writing Homework".',
    link: '/teacher/homework/homework-1',
  },
  ...override,
});

const request = (body: unknown) => new Request(
  'https://worker.test/book-notifications/commands',
  {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      'Idempotency-Key': operationId,
      Origin: 'https://kahut1.web.app',
    },
    body: JSON.stringify(body),
  },
);

const verifier = (uid: string) => ({
  verifyToken: vi.fn(async () => ({ valid: true, uid })),
  verifyAuthorizationHeader: vi.fn(async () => ({ valid: true, uid })),
});

const env = {
  NOTIFICATION_RATE_LIMITER: {
    limit: vi.fn(async () => ({ success: true })),
  },
};

describe('homework submission notification production worker', () => {
  it('creates exactly one teacher notification from canonical homework result authority', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const readDatabaseValue = vi.fn(async (_env: Readonly<Record<string, unknown>>, path: string) => {
      expect(path).toBe(`test_results/${resultId}`);
      return canonicalResult;
    });
    const worker = createHomeworkSubmissionNotificationWorker({
      firebaseVerifier: verifier(studentId),
      repositoryFactory: () => repository,
      readDatabaseValue,
      now: () => 1_779_000_000_000,
    });

    const response = await worker.fetch(request(command()), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'created',
      operationId,
      notificationId: operationId,
    });
    expect(repository.snapshot()).toEqual({
      [`notifications/${teacherId}/${operationId}`]: {
        id: operationId,
        type: 'info',
        title: 'Homework Submitted',
        message: 'Student One submitted "Class Writing Homework".',
        link: '/teacher/homework/homework-1',
        read: false,
        createdAt: 1_779_000_000_000,
      },
    });

    const replay = await worker.fetch(request(command()), env);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ status: 'replayed' });
    expect(Object.keys(repository.snapshot())).toHaveLength(1);
  });

  it('rejects a student or teacher recipient that does not match canonical authority', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const worker = createHomeworkSubmissionNotificationWorker({
      firebaseVerifier: verifier('different-student'),
      repositoryFactory: () => repository,
      readDatabaseValue: async () => canonicalResult,
    });

    const wrongActor = await worker.fetch(request(command()), env);
    expect(wrongActor.status).toBe(403);

    const correctActorWorker = createHomeworkSubmissionNotificationWorker({
      firebaseVerifier: verifier(studentId),
      repositoryFactory: () => repository,
      readDatabaseValue: async () => canonicalResult,
    });
    const wrongRecipient = await correctActorWorker.fetch(request(command({
      recipientId: 'teacher-2',
    })), env);
    expect(wrongRecipient.status).toBe(403);
    expect(repository.snapshot()).toEqual({});
  });

  it('rejects content or operation identity that is not the canonical homework-submitted event', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const worker = createHomeworkSubmissionNotificationWorker({
      firebaseVerifier: verifier(studentId),
      repositoryFactory: () => repository,
      readDatabaseValue: async () => canonicalResult,
    });

    const alteredContent = await worker.fetch(request(command({
      notification: {
        type: 'info',
        title: 'Homework Submitted',
        message: 'Arbitrary message',
        link: '/teacher/homework/homework-1',
      },
    })), env);
    expect(alteredContent.status).toBe(403);

    const arbitraryOperation = '00000000-0000-4000-8000-000000000123';
    const arbitraryRequest = new Request(
      'https://worker.test/book-notifications/commands',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
          'Idempotency-Key': arbitraryOperation,
          Origin: 'https://kahut1.web.app',
        },
        body: JSON.stringify(command({ operationId: arbitraryOperation })),
      },
    );
    const alteredOperation = await worker.fetch(arbitraryRequest, env);
    expect(alteredOperation.status).toBe(403);
    expect(repository.snapshot()).toEqual({});
  });
});
