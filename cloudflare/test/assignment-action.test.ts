import { describe, expect, it } from 'vitest';
import {
  parseAssignmentAction, performAssignmentAction, retryDueAssignmentNotifications,
  type AssignmentNotificationIntent, type AssignmentNotificationStorage,
} from '../src/upload-worker/notifications/assignment-action.ts';
import { InMemoryNotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';

const requestId = 'request-assignment-1';
const studentId = 'student-assignment-1';
const teacherId = 'teacher-assignment-1';
const adminId = 'admin-assignment-1';
const assignmentId = 'assignment-1';
const start = 1_800_000_000_000;
const fixture = () => {
  const intent: AssignmentNotificationIntent = { schemaVersion: 1, actionId: requestId,
    kind: 'assignment-request-approved', occurredAt: start, dueAt: start + 3_600_000, attempts: 0, state: 'pending' };
  const baseRequest = { id: requestId, teacherId, studentId, studentEmail: 'student@example.com', status: 'approved',
    reviewedBy: adminId, reviewedAt: start, assignmentId, notificationIntent: intent };
  const values = new Map<string, unknown>([
    [`student_requests/${requestId}`, baseRequest],
    [`student_teacher_assignments/${assignmentId}`, { id: assignmentId, studentId, teacherId, status: 'active' }],
    [`users/${adminId}`, { role: 'super_admin' }],
    [`users/${studentId}`, { role: 'student', displayName: 'Untrusted snapshot student' }],
    [`users/${teacherId}`, { role: 'teacher', displayName: 'Canonical teacher' }],
  ]);
  const storage: AssignmentNotificationStorage = {
    async read(path) { return values.get(path) ?? null; },
    async updateIntent(id, next) { values.set(`student_requests/${id}`, { ...baseRequest, notificationIntent: next }); },
    async claimImmediate(id, now) {
      const current = (values.get(`student_requests/${id}`) as typeof baseRequest).notificationIntent;
      if (current.state !== 'pending' || current.attempts !== 0) return null;
      const claimed = { ...current, state: 'sending' as const, attempts: 1 as const, dueAt: now + 3_600_000 };
      values.set(`student_requests/${id}`, { ...baseRequest, notificationIntent: claimed });
      return claimed;
    },
    async dueRequests(now) {
      const current = (values.get(`student_requests/${requestId}`) as typeof baseRequest).notificationIntent;
      return current.dueAt <= now ? [{ requestId, intent: current }] : [];
    },
    async claimRetry(id, now) {
      const current = (values.get(`student_requests/${id}`) as typeof baseRequest).notificationIntent;
      if (current.dueAt > now || current.attempts >= 2) return null;
      const claimed = { ...current, state: 'retrying' as const, attempts: (current.attempts + 1) as 1 | 2, dueAt: now + 3_600_000 };
      values.set(`student_requests/${id}`, { ...baseRequest, notificationIntent: claimed });
      return claimed;
    },
    async notificationsExist() { return values.get('all-notifications-exist') === true; },
    async reportFailure() { values.set('reported', true); },
  };
  return { values, storage, repository: new InMemoryNotificationCommandRepository() };
};
const actionRequest = (extra: Record<string, unknown> = {}) => new Request('https://worker.example/assignment-notifications/actions', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
  body: JSON.stringify({ schemaVersion: 1, actionId: requestId, ...extra }),
});

describe('assignment approval notification action', () => {
  it('accepts only source identity, never caller content', async () => {
    await expect(parseAssignmentAction(actionRequest())).resolves.toEqual({ schemaVersion: 1, actionId: requestId });
    await expect(parseAssignmentAction(actionRequest({ recipientId: studentId }))).rejects.toThrow('assignment_action_invalid');
  });

  it('verifies active assignment and delivers stable trusted notices to both parties', async () => {
    const { storage, repository } = fixture();
    const input = { command: { schemaVersion: 1 as const, actionId: requestId }, actorUid: adminId,
      storage, repository: () => repository, now: () => start };
    await expect(performAssignmentAction(input)).resolves.toMatchObject({ status: 200,
      body: { status: 'committed', notificationStatus: 'delivered' } });
    const notices = Object.values(repository.snapshot());
    expect(notices).toHaveLength(2);
    expect(notices).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Student Request Approved', message: 'Your request for student Untrusted snapshot student has been approved.', link: '/teacher/students' }),
      expect.objectContaining({ title: 'New Teacher Assigned', message: 'You have been assigned to Canonical teacher.', link: '/student/dashboard' }),
    ]));
    await expect(performAssignmentAction(input)).resolves.toMatchObject({ body: { status: 'replayed' } });
    expect(Object.values(repository.snapshot())).toHaveLength(2);
  });

  it('rejects a non-admin actor or a missing/inactive saved assignment', async () => {
    const { values, storage, repository } = fixture();
    const input = { command: { schemaVersion: 1 as const, actionId: requestId }, actorUid: teacherId, storage, repository: () => repository };
    await expect(performAssignmentAction(input)).resolves.toMatchObject({ status: 409 });
    values.set(`student_teacher_assignments/${assignmentId}`, { id: assignmentId, studentId, teacherId, status: 'removed' });
    await expect(performAssignmentAction({ ...input, actorUid: adminId, now: () => start })).resolves.toMatchObject({ status: 403 });
  });

  it('keeps an idempotency conflict retryable and a state-write outage from failing approval', async () => {
    const { storage } = fixture();
    let intentWrite = false;
    const conflicted = { async create() { return { status: 'idempotency-conflict' as const, notificationId: 'conflict' }; } };
    const flakyStorage: AssignmentNotificationStorage = {
      ...storage,
      async updateIntent() { intentWrite = true; throw new Error('temporary storage outage'); },
    };
    const result = await performAssignmentAction({ command: { schemaVersion: 1, actionId: requestId }, actorUid: adminId,
      storage: flakyStorage, repository: () => conflicted, now: () => start });
    expect(result).toMatchObject({ status: 200, body: { status: 'committed', notificationStatus: 'retry_due' } });
    expect(intentWrite).toBe(true);
  });

  it('persists the first attempt and does one later retry with one terminal report', async () => {
    const { values, storage } = fixture();
    const failed = { async create() { throw new Error('offline'); } };
    const input = { command: { schemaVersion: 1 as const, actionId: requestId }, actorUid: adminId,
      storage, repository: () => failed, now: () => start };
    await expect(performAssignmentAction(input)).resolves.toMatchObject({ body: { notificationStatus: 'retry_due' } });
    await retryDueAssignmentNotifications(storage, failed, () => start + 3_600_001);
    expect((values.get(`student_requests/${requestId}`) as { notificationIntent: AssignmentNotificationIntent }).notificationIntent)
      .toMatchObject({ attempts: 2, state: 'failed' });
    expect(values.get('reported')).toBe(true);
  });
});
