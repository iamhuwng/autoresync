import { describe, expect, it, vi } from 'vitest';
import {
  createHomeworkResetNotificationHandlers,
  type HomeworkResetIntent,
  type HomeworkResetNotificationStorage,
} from '../src/upload-worker/notifications/homework-reset-action.ts';

const intent = (overrides: Partial<HomeworkResetIntent> = {}): HomeworkResetIntent => ({
  schemaVersion: 1, eventId: '123e4567-e89b-42d3-a456-426614174000', homeworkId: 'homework-1',
  studentId: 'student-1', sourceSubmissionId: 'submission-1', actorUid: 'teacher-1', occurredAt: 100, state: 'retry_due', attempts: 0, dueAt: 100,
  ...overrides,
});

class MemoryStorage implements HomeworkResetNotificationStorage {
  current: HomeworkResetIntent;
  version = 1;
  readonly reportFailure = vi.fn(async () => {});
  readonly notificationExists = vi.fn(async () => false);
  retrySuppressed = vi.fn(async () => false);

  constructor(initial = intent()) { this.current = initial; }

  async readIntent(eventId: string) {
    return eventId === this.current.eventId ? { intent: structuredClone(this.current), version: String(this.version) } : null;
  }
  async readHomework(homeworkId: string) {
    return homeworkId === 'homework-1' ? {
      id: 'homework-1', createdBy: 'teacher-1', title: 'Reading practice',
      target: { type: 'students', studentIds: ['student-1'] },
    } : null;
  }
  async updateIntent(eventId: string, next: HomeworkResetIntent, version: string) {
    if (eventId !== this.current.eventId || version !== String(this.version)) return null;
    this.current = structuredClone(next);
    this.version += 1;
    return String(this.version);
  }
  async dueIntents(now: number, limit = 2) {
    expect(limit).toBeLessThanOrEqual(2);
    return this.current.dueAt <= now && ['retry_due', 'sending', 'retrying'].includes(this.current.state)
      ? [{ intent: structuredClone(this.current), version: String(this.version) }] : [];
  }
}

const request = (eventId = intent().eventId) => new Request('https://worker.test/homework-reset-notifications/actions', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': eventId },
  body: JSON.stringify({ eventId }),
});

describe('homework reset notification action', () => {
  it('derives recipient and content from the immutable reset event and assignment', async () => {
    const storage = new MemoryStorage();
    const repository = { create: vi.fn(async (input: Record<string, unknown>) => ({ status: 'created', notificationId: 'notification-1' })) };
    const handlers = createHomeworkResetNotificationHandlers({ storage, repository, now: () => 200 });

    const result = await handlers.action({ request: request(), uid: 'teacher-1' });

    expect(result).toEqual({ body: { status: 'delivered', eventId: intent().eventId }, status: 200 });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: 'student-1', now: 100,
      notification: expect.objectContaining({
        message: 'Your teacher reset your homework. You can now retake it.',
        link: '/student/homework/homework-1',
      }),
    }));
    expect(storage.current).toMatchObject({ state: 'done', attempts: 1 });
  });

  it('rejects an actor who does not match the saved reset authority', async () => {
    const storage = new MemoryStorage();
    const repository = { create: vi.fn() };
    const handlers = createHomeworkResetNotificationHandlers({ storage, repository, now: () => 200 });

    const result = await handlers.action({ request: request(), uid: 'other-teacher' });

    expect(result.status).toBe(403);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('performs only one later retry and records an admin issue after the retry fails', async () => {
    const storage = new MemoryStorage();
    const repository = { create: vi.fn(async () => { throw new Error('offline'); }) };
    let now = 200;
    const handlers = createHomeworkResetNotificationHandlers({ storage, repository, now: () => now });

    await handlers.action({ request: request(), uid: 'teacher-1' });
    expect(storage.current).toMatchObject({ state: 'retry_due', attempts: 1 });
    now += 60 * 60 * 1000;
    await handlers.retryDue();

    expect(repository.create).toHaveBeenCalledTimes(2);
    expect(storage.current).toMatchObject({ state: 'failed', attempts: 2 });
    expect(storage.reportFailure).toHaveBeenCalledTimes(1);
  });

  it('reports an immediate failure with no retry while suppressed', async () => {
    const storage = new MemoryStorage();
    storage.retrySuppressed.mockResolvedValue(true);
    const repository = { create: vi.fn(async () => { throw new Error('offline'); }) };
    const handlers = createHomeworkResetNotificationHandlers({ storage, repository, now: () => 200 });
    expect((await handlers.action({ request: request(), uid: 'teacher-1' })).body.status).toBe('failed');
    expect(storage.current).toMatchObject({ state: 'failed', attempts: 1 });
    expect(storage.reportFailure).toHaveBeenCalledOnce();
    expect(storage.reportFailure).toHaveBeenCalledWith(expect.objectContaining({ eventId: intent().eventId }), 200, 'delivery_backend_error');
    await handlers.retryDue();
    expect(repository.create).toHaveBeenCalledOnce();
  });
});
