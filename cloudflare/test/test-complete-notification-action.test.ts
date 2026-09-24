import { describe, expect, it } from 'vitest';
import { InMemoryNotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';
import {
  performTestCompleteNotificationAction,
  retryDueTestCompleteNotifications,
  testCompleteNotificationId,
  type TestCompleteNotificationIntent,
  type TestCompleteNotificationStorage,
} from '../src/upload-worker/notifications/test-complete-notification-action.ts';

class MemoryStorage implements TestCompleteNotificationStorage {
  result: Record<string, unknown>;
  users: Record<string, unknown>;
  sessions: Record<string, unknown>;
  issues: Array<{ resultId: string; intent: TestCompleteNotificationIntent }> = [];
  failWrites = false;

  constructor(overrides: { result?: Record<string, unknown>; users?: Record<string, unknown>; sessions?: Record<string, unknown> } = {}) {
    this.result = { resultId: 'result-1', studentId: 'student-1', studentName: 'Student', testTitle: 'Math',
      testType: 'reading', totalScore: 8, maxScore: 10, submittedAt: 1000,
      testCompleteNotificationIntent: this.intent(), ...overrides.result };
    this.users = { 'student-1': { role: 'student' }, 'teacher-1': { role: 'teacher' }, ...overrides.users };
    this.sessions = { 'session-1': { teacherId: 'teacher-1', ...overrides.sessions } };
  }
  intent(overrides: Partial<TestCompleteNotificationIntent> = {}): TestCompleteNotificationIntent {
    return { schemaVersion: 1, actionId: 'result-1', kind: 'test-completed', actorUid: 'student-1',
      actorRole: 'student', occurredAt: 1000, dueAt: 1000, attempts: 0, state: 'pending', ...overrides };
  }
  async readResult() { return this.result; }
  async readUser(id: string) { return this.users[id] ?? null; }
  async readSession(id: string) { return this.sessions[id] ?? null; }
  async saveIntent(_id: string, intent: TestCompleteNotificationIntent) {
    if (this.failWrites && intent.state === 'retrying') throw new Error('write unavailable');
    this.result.testCompleteNotificationIntent = intent;
  }
  async claimInitial() {
    const intent = this.result.testCompleteNotificationIntent as TestCompleteNotificationIntent;
    if (intent.state !== 'pending' || intent.attempts !== 0) return null;
    return this.result.testCompleteNotificationIntent = this.intent({ ...intent, state: 'sending', dueAt: 60_000 });
  }
  async claimRetry(_id: string, now: number) {
    const intent = this.result.testCompleteNotificationIntent as TestCompleteNotificationIntent;
    if (!((intent.state === 'retry_due' && intent.attempts === 1) || (intent.state === 'sending' && intent.attempts === 0))
      || intent.dueAt > now) return null;
    return this.result.testCompleteNotificationIntent = this.intent({ ...intent, attempts: 2, state: 'retrying', dueAt: now + 60_000 });
  }
  async dueIntents(now: number) {
    const intent = this.result.testCompleteNotificationIntent as TestCompleteNotificationIntent;
    return (intent.state === 'retry_due' && intent.attempts === 1 || intent.state === 'sending' && intent.attempts === 0)
      && intent.dueAt <= now ? [{ resultId: 'result-1', intent }] : [];
  }
  async reportFailure(resultId: string, intent: TestCompleteNotificationIntent) { this.issues.push({ resultId, intent }); }
}

describe('test-complete notification action', () => {
  it('verifies the saved student authority and delivers fixed content with a stable result-specific ID', async () => {
    const storage = new MemoryStorage();
    const repository = new InMemoryNotificationCommandRepository();
    const response = await performTestCompleteNotificationAction({ resultId: 'result-1', actorUid: 'student-1', storage, repository, now: () => 2000 });

    expect(response.body).toEqual({ status: 'delivered', resultId: 'result-1' });
    expect(repository.snapshot()[`notifications/student-1/${testCompleteNotificationId('result-1', 'student-1')}`])
      .toMatchObject({ title: 'Test Complete', message: 'Your test result is ready.', link: '/result/result-1', createdAt: 1000 });
    expect(storage.result.testCompleteNotificationIntent).toMatchObject({ state: 'done' });
  });

  it('rejects another student, THCS results, and a teacher without the saved session ownership', async () => {
    const wrongStudent = await performTestCompleteNotificationAction({ resultId: 'result-1', actorUid: 'teacher-1',
      storage: new MemoryStorage(), repository: new InMemoryNotificationCommandRepository() });
    expect(wrongStudent.status).toBe(403);

    const thcsStorage = new MemoryStorage({ result: { testType: 'THCS-THPT' } });
    expect((await performTestCompleteNotificationAction({ resultId: 'result-1', actorUid: 'student-1',
      storage: thcsStorage, repository: new InMemoryNotificationCommandRepository() })).status).toBe(403);

    const teacherIntent = new MemoryStorage({ result: {
      teacherId: 'teacher-1', sessionCode: 'session-1',
      context: { type: 'class_session', configApplied: { source: 'teacher_override' } },
      testCompleteNotificationIntent: undefined,
    } });
    teacherIntent.result.testCompleteNotificationIntent = teacherIntent.intent({ actorUid: 'teacher-1', actorRole: 'teacher' });
    teacherIntent.sessions['session-1'] = { teacherId: 'other-teacher' };
    expect((await performTestCompleteNotificationAction({ resultId: 'result-1', actorUid: 'teacher-1',
      storage: teacherIntent, repository: new InMemoryNotificationCommandRepository() })).status).toBe(403);
  });

  it('schedules one retry, then records one admin issue if delivery still fails', async () => {
    const storage = new MemoryStorage();
    const first = { create: async () => { throw new Error('offline'); } } as unknown as InMemoryNotificationCommandRepository;
    await performTestCompleteNotificationAction({ resultId: 'result-1', actorUid: 'student-1', storage,
      repository: first, now: () => 2000 });
    expect(storage.result.testCompleteNotificationIntent).toMatchObject({ state: 'retry_due', attempts: 1, dueAt: 3_602_000 });

    await retryDueTestCompleteNotifications({ storage, repository: first, now: () => 3_602_000 });
    expect(storage.result.testCompleteNotificationIntent).toMatchObject({ state: 'failed', attempts: 2 });
    expect(storage.issues).toHaveLength(1);
    await retryDueTestCompleteNotifications({ storage, repository: first, now: () => 9_000_000 });
    expect(storage.issues).toHaveLength(1);
  });

  it('recovers a first attempt left in sending after a Worker interruption', async () => {
    const storage = new MemoryStorage();
    storage.result.testCompleteNotificationIntent = storage.intent({ state: 'sending', dueAt: 1000 });
    await retryDueTestCompleteNotifications({ storage,
      repository: { create: async () => ({ status: 'created', notificationId: 'unused' }) } as unknown as InMemoryNotificationCommandRepository,
      now: () => 1000 });
    expect(storage.result.testCompleteNotificationIntent).toMatchObject({ state: 'done', attempts: 2 });
  });
});
