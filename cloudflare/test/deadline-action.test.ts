import { describe, expect, it, vi } from 'vitest';
import {
  createDeadlineNotificationHandlers,
  parseDeadlineAction,
  type DeadlineNotificationStorage,
  type ManualHomeworkReminderIntent,
} from '../src/upload-worker/notifications/deadline-action.ts';

const eventId = 'e0f4bd82-4693-4c85-a384-7a949e1216da';
const intent: ManualHomeworkReminderIntent = {
  eventId, homeworkId: 'homework-1', studentId: 'student-1', actorUid: 'teacher-1',
  occurredAt: 10_000, state: 'pending', attempts: 0, dueAt: 3_610_000,
};
const request = () => new Request('https://worker.example/deadline-notifications/actions', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': eventId },
  body: JSON.stringify({ eventId }),
});

const storageFor = (override: Partial<DeadlineNotificationStorage> = {}) => ({
  readIntent: vi.fn(async () => ({ intent, version: 'v1' })),
  readHomework: vi.fn(async () => ({
    id: 'homework-1', createdBy: 'teacher-1', title: 'Unit 4',
    target: { type: 'students', studentIds: ['student-1'] },
    studentOverrides: { 'student-1': { reminderCount: 1, lastRemindedAt: intent.occurredAt } },
  })),
  updateIntent: vi.fn(async (_eventId: string, _intent: ManualHomeworkReminderIntent, _version: string) => 'v2'),
  dueIntents: vi.fn(async () => []),
  notificationExists: vi.fn(async () => false),
  reportFailure: vi.fn(async () => {}),
  ...override,
});

describe('deadline manual reminder action', () => {
  it('accepts an event ID only and derives the notice from saved assignment authority', async () => {
    await expect(parseDeadlineAction(request())).resolves.toEqual({ eventId });
    const storage = storageFor();
    const repository = { create: vi.fn(async () => ({ status: 'created' as const, notificationId: 'notice-1' })) };
    const handlers = createDeadlineNotificationHandlers({ storage, repository, now: () => 20_000 });

    const result = await handlers.action({ request: request(), uid: 'teacher-1' });

    expect(result.init.status).toBe(200);
    expect(storage.readHomework).toHaveBeenCalledWith('homework-1', 'student-1');
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: 'student-1',
      notification: expect.objectContaining({
        type: 'homework_reminder', title: '⚡ Homework Reminder',
        message: 'Your teacher sent you a homework reminder.',
        link: expect.stringContaining('homework-1'),
      }),
    }));
  });

  it('rejects a wake from an actor other than the saved teacher', async () => {
    const storage = storageFor();
    const repository = { create: vi.fn() };
    const handlers = createDeadlineNotificationHandlers({ storage, repository });
    const result = await handlers.action({ request: request(), uid: 'teacher-2' });
    expect(result.init.status).toBe(403);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('does not accept a recipient absent from the saved assignment target', async () => {
    const storage = storageFor({ readHomework: vi.fn(async () => ({
      id: 'homework-1', createdBy: 'teacher-1', title: 'Unit 4', target: { type: 'students', studentIds: ['student-2'] },
      studentOverrides: { 'student-1': { reminderCount: 1, lastRemindedAt: intent.occurredAt } },
    })) });
    const repository = { create: vi.fn(async () => ({ status: 'created' as const, notificationId: 'notice-1' })) };
    const handlers = createDeadlineNotificationHandlers({ storage, repository, now: () => 20_000 });
    await handlers.action({ request: request(), uid: 'teacher-1' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('reports a fresh failed reminder and skips a held retry while suppressed', async () => {
    const storage = storageFor({ retrySuppressed: vi.fn(async () => true) });
    const repository = { create: vi.fn(async () => { throw new Error('offline'); }) };
    const handlers = createDeadlineNotificationHandlers({ storage, repository, now: () => 20_000 });
    const response = await handlers.action({ request: request(), uid: 'teacher-1' });
    expect(response.body.status).toBe('failed');
    expect(storage.reportFailure).toHaveBeenCalledOnce();
    expect(storage.reportFailure).toHaveBeenCalledWith(expect.objectContaining({ eventId }), 20_000, 'delivery_backend_error');
    expect(storage.updateIntent).toHaveBeenLastCalledWith(eventId,
      expect.objectContaining({ state: 'failed', attempts: 1 }), 'v2');

    storage.dueIntents.mockResolvedValue([{ intent: { ...intent, state: 'retry_due', attempts: 1, dueAt: 0 }, version: 'v3' }]);
    await handlers.retryDue();
    expect(repository.create).toHaveBeenCalledOnce();
  });

  it('does not treat a replayed inbox item as fresh recovery evidence', async () => {
    const storage = storageFor({ recordSuccess: vi.fn(async () => {}) });
    const repository = { create: vi.fn(async () => ({ status: 'replayed' as const, notificationId: 'notice-1' })) };
    const handlers = createDeadlineNotificationHandlers({ storage, repository, now: () => 20_000 });
    expect((await handlers.action({ request: request(), uid: 'teacher-1' })).body.status).toBe('delivered');
    expect(storage.recordSuccess).not.toHaveBeenCalled();
  });
});
