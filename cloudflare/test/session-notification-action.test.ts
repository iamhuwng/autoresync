import { describe, expect, it, vi } from 'vitest';
import { buildSessionNotificationWrites } from '../../src/services/sessionNotificationActionClient.ts';
import { deliverSessionIntentBatch, sessionRosterMatches, SESSION_NOTIFICATION_RECIPIENTS_PER_PASS } from '../src/upload-worker/notifications/session-notification-action.ts';
import type { NotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';

describe('session notification bounded delivery', () => {
  it('rejects omitted or forged recipients before the first pass', () => {
    const event = buildSessionNotificationWrites({
      kind: 'session-opened', sessionCode: 'SESSION1', actorUid: 'teacher-1', classId: 'class-1',
      className: 'Class', testId: 'test-1', testName: 'Test', marker: 1000,
      recipientIds: ['student-1', 'student-2'],
    }).event;
    const canonicalClass = { createdBy: 'teacher-1', students: { 'student-1': true, 'student-2': true } };
    expect(sessionRosterMatches(event, canonicalClass)).toBe(true);
    expect(sessionRosterMatches({ ...event, recipients: { 'student-1': true }, recipientCount: 1 }, canonicalClass)).toBe(false);
    expect(sessionRosterMatches({ ...event, recipients: { 'student-1': true, 'student-3': true } }, canonicalClass)).toBe(false);
  });

  it('advances in batches of ten and retries only first-pass failures once', async () => {
    const recipientIds = Array.from({ length: 25 }, (_, index) => `student-${index}`);
    const { event, queue } = buildSessionNotificationWrites({
      kind: 'test-started', sessionCode: 'SESSION1', actorUid: 'teacher-1', classId: 'class-1',
      className: 'Class', testId: 'test-1', testName: 'Test', marker: 1000, recipientIds,
    });
    const calls: string[] = [];
    let failStudentTen = true;
    const repository: NotificationCommandRepository = {
      create: vi.fn(async ({ recipientId }) => {
        calls.push(recipientId);
        if (recipientId === 'student-10' && failStudentTen) {
          failStudentTen = false;
          return { status: 'idempotency-conflict', notificationId: 'conflict' };
        }
        return { status: 'created', notificationId: 'notice' };
      }),
    };

    let progress = await deliverSessionIntentBatch({ ...queue, state: 'initial_processing' }, repository, 2000);
    expect(calls).toHaveLength(SESSION_NOTIFICATION_RECIPIENTS_PER_PASS);
    expect(progress.initialCursor).toBe(10);
    expect(progress.retryRecipientIds).toEqual(['student-10']);
    expect(progress.state).toBe('initial_due');

    progress = await deliverSessionIntentBatch({ ...progress, state: 'initial_processing' }, repository, 3000);
    progress = await deliverSessionIntentBatch({ ...progress, state: 'initial_processing' }, repository, 4000);
    expect(calls).toHaveLength(25);
    expect(progress.state).toBe('retry_due');
    expect(progress.retryRecipientIds).toEqual(['student-10']);

    progress = await deliverSessionIntentBatch({ ...progress, attempts: 2, state: 'retrying' }, repository, 3_601_000);
    expect(calls.slice(25)).toEqual(['student-10']);
    expect(progress.retryCursor).toBe(1);
    expect(progress.state).toBe('done');
  });
});
