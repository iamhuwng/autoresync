import { describe, expect, it, vi } from 'vitest';
import {
  parseManualGradeCommand,
  performManualGradeAction,
  retryDueGradeNotifications,
  type GradeNotificationIntent,
  type GradeNotificationStorage,
  type ManualGradeCommand,
} from '../src/upload-worker/notifications/grade-notification-action.ts';

const now = 1_800_000_000_000;
const eventId = 'd3b07384-d9a0-4f7b-8a2e-4cb975c3a001';
const sessionCode = 'session-thcs-1';
const studentId = 'student-thcs-1';
const actorUid = 'teacher-thcs-1';
const baseQuestion = { studentAnswer: 'answer', pointsMax: 2, writingResult: { autoScore: 1 } };

const command: ManualGradeCommand = {
  schemaVersion: 1, actionType: 'manual-question-grade', eventId, sessionCode, studentId,
  questionNumber: 3, pointsEarned: 2, feedback: 'Clear answer',
};

const fixture = () => {
  const intents = new Map<string, GradeNotificationIntent>();
  let savedQuestion: Record<string, unknown> | null = null;
  const storage: GradeNotificationStorage = {
    async readSession() { return { createdByUserId: actorUid, testId: 'test-thcs-1', results: {
      [studentId]: { questionResults: { '3': baseQuestion } },
    } }; },
    async readTest() { return { testType: 'THCS-THPT', title: 'Saved THCS test' }; },
    async readUser(uid) { return uid === actorUid ? { role: 'teacher' } : { role: 'student' }; },
    async readIntent(id) { return intents.get(id) ?? null; },
    async commitManualGrade(input) { savedQuestion = input.questionResult; intents.set(input.intent.eventId, input.intent); },
    async updateIntent(intent) { intents.set(intent.eventId, intent); },
    async dueIntents() { return []; },
    async claimRetry() { return null; },
    async reportFailure() {},
  };
  return { storage, intents, get savedQuestion() { return savedQuestion; } };
};

const request = (value: unknown, key = eventId) => new Request('https://worker.example/grading-notifications/manual', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(value),
});

describe('manual THCS question grade notifications', () => {
  it('accepts only a grade occurrence identity and bounded grade input', async () => {
    await expect(parseManualGradeCommand(request(command))).resolves.toEqual(command);
    await expect(parseManualGradeCommand(request({ ...command, recipientId: 'attacker' }))).rejects.toThrow('grade_notification_invalid');
    await expect(parseManualGradeCommand(request(command, 'different-event'))).rejects.toThrow('grade_notification_invalid');
  });

  it('checks saved session, teacher, student, result, and THCS test authority before one atomic grade and intent commit', async () => {
    const f = fixture();
    const create = vi.fn(async () => ({ status: 'created' as const, notificationId: eventId }));
    const response = await performManualGradeAction({ command, actorUid, storage: f.storage,
      repository: { create }, now: () => now });
    expect(response).toMatchObject({ status: 200, body: { status: 'committed', notificationStatus: 'delivered' } });
    expect(f.savedQuestion).toMatchObject({
      studentAnswer: 'answer', pointsMax: 2, pointsEarned: 2,
      writingResult: { autoScore: 1, teacherScore: 2, teacherFeedback: 'Clear answer', gradingTier: 'teacher-graded' },
    });
    expect(f.intents.get(eventId)).toMatchObject({ eventId, kind: 'individual-question-graded',
      actorUid, studentId, questionNumber: 3, testTitle: 'Saved THCS test', state: 'done' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      operationId: eventId, recipientId: studentId, now,
      notification: expect.objectContaining({ title: 'Grade Updated', message: expect.stringContaining('Saved THCS test') }),
    }));
  });

  it('rejects non-owner teachers before grade commit', async () => {
    const f = fixture();
    const commitManualGrade = vi.fn();
    const storage = { ...f.storage, async commitManualGrade() { commitManualGrade(); },
      async readSession() { return { createdByUserId: 'another-teacher', testId: 'test-thcs-1', results: {
        [studentId]: { questionResults: { '3': baseQuestion } },
      } }; } };
    const response = await performManualGradeAction({ command, actorUid, storage, repository: { create: vi.fn() } });
    expect(response.status).toBe(403);
    expect(commitManualGrade).not.toHaveBeenCalled();
  });

  it('allows one later retry and writes an admin issue after retry failure', async () => {
    const f = fixture();
    const commitIntent: GradeNotificationIntent = {
      schemaVersion: 1, eventId, kind: 'individual-question-graded', sessionCode, studentId, actorUid,
      testTitle: 'Saved THCS test', questionNumber: 3, pointsEarned: 2, occurredAt: now,
      dueAt: now + 3_600_000, attempts: 1, state: 'retry_due',
    };
    f.intents.set(eventId, commitIntent);
    const reportFailure = vi.fn();
    const storage: GradeNotificationStorage = {
      ...f.storage,
      async dueIntents(_time, limit) { expect(limit).toBe(2); return [commitIntent]; },
      async claimRetry() { return { ...commitIntent, attempts: 2, state: 'retrying' }; },
      reportFailure,
    };
    await retryDueGradeNotifications({ storage, repository: { async create() { throw new Error('offline'); } }, now: () => now + 3_600_001 });
    expect(reportFailure).toHaveBeenCalledWith(expect.objectContaining({ state: 'failed', attempts: 2 }), now + 3_600_001);
    expect(f.intents.get(eventId)).toMatchObject({ state: 'failed', attempts: 2 });
  });
});
