import { describe, expect, it } from 'vitest';
import {
  parseEnrollmentAction,
  performEnrollmentAction,
  retryDueCourseRequestNotifications,
  type CourseRequestNotificationIntent,
  type CourseRequestNotificationStorage,
} from '../src/upload-worker/notifications/enrollment-action.ts';
import { InMemoryNotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';

const requestId = 'request-001';
const studentId = 'student-001';
const teacherId = 'teacher-001';
const courseId = 'course-001';
const start = 1_800_000_000_000;

const makeRequest = (intent: CourseRequestNotificationIntent) => ({
  id: requestId, studentId, studentName: 'Untrusted student name',
  courseId, courseName: 'Untrusted course name', teacherId,
  type: 'join', status: 'approved', requestedAt: start - 1000,
  expiresAt: start + 100_000, processedAt: start, processedBy: teacherId,
  rejectionReason: 'untrusted copy', notificationIntent: intent,
});

const fixture = (initialState: CourseRequestNotificationIntent['state'] = 'pending') => {
  const intent: CourseRequestNotificationIntent = {
    schemaVersion: 1, actionId: requestId, kind: 'course-request-decision',
    occurredAt: start, dueAt: start + 60 * 60 * 1000,
    attempts: 0, state: initialState,
  };
  const rows = new Map<string, unknown>([
    [`course_requests/${requestId}`, makeRequest(intent)],
    [`courses/${courseId}`, { ownerId: teacherId, name: 'Canonical Algebra' }],
    [`users/${teacherId}`, { role: 'teacher' }],
    [`users/${studentId}`, { role: 'student' }],
  ]);
  const storage: CourseRequestNotificationStorage = {
    async read(path) { return rows.get(path) ?? null; },
    async updateIntent(id, next) {
      const request = rows.get(`course_requests/${id}`) as ReturnType<typeof makeRequest>;
      rows.set(`course_requests/${id}`, { ...request, notificationIntent: next });
    },
    async claimImmediate(id, now) {
      const request = rows.get(`course_requests/${id}`) as ReturnType<typeof makeRequest>;
      const current = request.notificationIntent;
      if (current.state !== 'pending' || current.attempts !== 0) return null;
      const next: CourseRequestNotificationIntent = {
        ...current, state: 'sending', attempts: 1, dueAt: now + 60 * 60 * 1000,
      };
      rows.set(`course_requests/${id}`, { ...request, notificationIntent: next });
      return next;
    },
    async dueRequests(now) {
      const request = rows.get(`course_requests/${requestId}`) as ReturnType<typeof makeRequest>;
      const current = request.notificationIntent;
      return current.dueAt <= now && ['pending', 'sending', 'retry_due', 'retrying'].includes(current.state)
        ? [{ requestId, intent: current }]
        : [];
    },
    async claimRetry(id, now) {
      const request = rows.get(`course_requests/${id}`) as ReturnType<typeof makeRequest>;
      const current = request.notificationIntent;
      if (current.dueAt > now || current.attempts >= 2
        || !['pending', 'sending', 'retry_due', 'retrying'].includes(current.state)) return null;
      const next: CourseRequestNotificationIntent = {
        ...current, state: 'retrying', attempts: (current.attempts + 1) as 1 | 2,
        dueAt: now + 60 * 60 * 1000,
      };
      rows.set(`course_requests/${id}`, { ...request, notificationIntent: next });
      return next;
    },
    async notificationExists() { return rows.get('inbox-exists') === true; },
    async reportFailure() { rows.set('reported', true); },
  };
  return { rows, storage, repository: new InMemoryNotificationCommandRepository(), intent };
};

const actionRequest = (actionId = requestId, extras: Record<string, unknown> = {}) => new Request(
  'https://worker.example/enrollment-notifications/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': actionId },
    body: JSON.stringify({ schemaVersion: 1, actionId, ...extras }),
  },
);

describe('course request notification action', () => {
  it('accepts only the request identity and rejects browser-supplied recipient or content', async () => {
    await expect(parseEnrollmentAction(actionRequest())).resolves.toEqual({ schemaVersion: 1, actionId: requestId });
    await expect(parseEnrollmentAction(actionRequest(requestId, { recipientId: studentId })))
      .rejects.toThrow('enrollment_action_invalid');
  });

  it('builds trusted content, delivers one stable inbox notice, and ignores repeated immediate wakes', async () => {
    const { rows, storage, repository } = fixture();
    const input = {
      command: { schemaVersion: 1 as const, actionId: requestId }, actorUid: teacherId,
      storage, repository: () => repository, now: () => start,
    };
    await expect(performEnrollmentAction(input)).resolves.toMatchObject({
      status: 200, body: { status: 'committed', notificationStatus: 'delivered' },
    });
    const snapshot = repository.snapshot();
    expect(Object.values(snapshot)).toHaveLength(1);
    expect(Object.keys(snapshot)[0]).toMatch(/^notifications\/student-001\//u);
    expect(Object.values(snapshot)[0]).toMatchObject({
      title: 'Course Request Approved',
      message: 'Your request to join "Canonical Algebra" was approved.',
      link: '/student/courses',
      createdAt: start,
    });
    await expect(performEnrollmentAction(input)).resolves.toMatchObject({
      body: { status: 'replayed', notificationStatus: 'delivered' },
    });
    expect(repository.snapshot()).toEqual(snapshot);
    expect((rows.get(`course_requests/${requestId}`) as ReturnType<typeof makeRequest>).notificationIntent.state).toBe('done');
  });

  it('rejects a wrong actor and preserves the intent after an immediate delivery outage', async () => {
    const { storage, repository } = fixture();
    const input = {
      command: { schemaVersion: 1 as const, actionId: requestId }, actorUid: 'other-user',
      storage, repository: () => repository, now: () => start,
    };
    await expect(performEnrollmentAction(input)).resolves.toMatchObject({ status: 403 });
    await expect(performEnrollmentAction({ ...input, actorUid: teacherId, repository: () => { throw new Error('outage'); } }))
      .resolves.toMatchObject({ body: { status: 'committed', notificationStatus: 'retry_due' } });
  });

  it('uses one later delivery attempt and reports one terminal issue after failure', async () => {
    const { rows, storage } = fixture('retry_due');
    const request = rows.get(`course_requests/${requestId}`) as ReturnType<typeof makeRequest>;
    const intent = { ...request.notificationIntent, attempts: 1 as const, dueAt: start };
    rows.set(`course_requests/${requestId}`, { ...request, notificationIntent: intent });
    const failedRepository = { async create() { throw new Error('outage'); } };
    await retryDueCourseRequestNotifications(storage, failedRepository, start + 1000);
    expect((rows.get(`course_requests/${requestId}`) as ReturnType<typeof makeRequest>).notificationIntent)
      .toMatchObject({ attempts: 2, state: 'failed' });
    expect(rows.get('reported')).toBe(true);
  });

  it('recognizes a sent inbox row after a retry worker crashes before marking the intent done', async () => {
    const { rows, storage } = fixture('retrying');
    const request = rows.get(`course_requests/${requestId}`) as ReturnType<typeof makeRequest>;
    rows.set(`course_requests/${requestId}`, { ...request, notificationIntent: {
      ...request.notificationIntent, attempts: 2, dueAt: start,
    } });
    rows.set('inbox-exists', true);
    await retryDueCourseRequestNotifications(storage, new InMemoryNotificationCommandRepository(), start + 1000);
    expect((rows.get(`course_requests/${requestId}`) as ReturnType<typeof makeRequest>).notificationIntent)
      .toMatchObject({ attempts: 2, state: 'done' });
    expect(rows.has('reported')).toBe(false);
  });
});
