import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  performClassAction,
  deliverClassIntent,
  missingClassIntentRecipients,
  type ClassActionCommand,
  type ClassActionStorage,
  type ClassNotificationIntent,
} from '../src/upload-worker/notifications/class-action.ts';
import { FirebaseRestNotificationCommandRepository, InMemoryNotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';
import { FirebaseClassActionStorage } from '../src/upload-worker/notifications/class-action-store.ts';
import { FirebaseRtdbRestClient } from '../src/upload-worker/listening-authoring/rtdb.ts';

afterEach(() => vi.restoreAllMocks());

const classId = 'CLASS1';
const studentId = 'student1';
const teacherId = 'teacher1';
const actionId = '00000000-0000-4000-8000-000000000101';
const command = (kind: ClassActionCommand['kind'], id = actionId): ClassActionCommand => ({
  schemaVersion: 1, actionType: 'class-membership-transition', actionId: id,
  kind, classId, studentId,
});

const fixture = () => {
  const rows = new Map<string, unknown>([
    [`classes/${classId}`, {
      id: classId, classCode: classId, name: 'Science', status: 'active',
      createdBy: teacherId, students: {}, settings: { maxStudents: 30 },
    }],
    [`users/${studentId}`, { uid: studentId, role: 'student', displayName: 'Ada', email: 'ada@example.test' }],
    [`users/${teacherId}`, { uid: teacherId, role: 'teacher', displayName: 'Teacher' }],
    ['users/other', { uid: 'other', role: 'teacher' }],
  ]);
  const storage: ClassActionStorage = {
    async read(path) { return rows.get(path) ?? null; },
    async commit({ updates }) {
      for (const { path, value } of updates) {
        if (value === null) rows.delete(path);
        else rows.set(path, value);
      }
      const classRow = rows.get(`classes/${classId}`) as Record<string, unknown>;
      const students = { ...(classRow.students as Record<string, unknown>) };
      const student = rows.get(`classes/${classId}/students/${studentId}`);
      if (student) students[studentId] = student;
      else delete students[studentId];
      rows.set(`classes/${classId}`, { ...classRow, students });
    },
    async updateIntent(intent) { rows.set(`notification_intents/${intent.actionId}`, intent); },
  };
  return { rows, storage, repository: new InMemoryNotificationCommandRepository() };
};

describe('trusted class membership action', () => {
  it('commits pending join and one event, delivers two server-built notices, and replays without resetting read state', async () => {
    const { rows, storage, repository } = fixture();
    const input = {
      command: command('join-pending'), actorUid: studentId, storage,
      repository: () => repository, now: () => 1_800_000_000_000,
    };
    await expect(performClassAction(input)).resolves.toMatchObject({
      status: 200, body: { status: 'committed', notificationStatus: 'delivered' },
    });
    expect((rows.get(`notification_intents/${actionId}`) as ClassNotificationIntent).state).toBe('done');
    const snapshot = repository.snapshot();
    expect(Object.keys(snapshot)).toHaveLength(2);
    expect(Object.values(snapshot).map((row) => row.message)).toEqual([
      "You've requested to join Science. Waiting for teacher approval.",
      'Ada wants to join your class "Science". Review in class management.',
    ]);
    await expect(performClassAction(input)).resolves.toMatchObject({ status: 200, body: { status: 'replayed' } });
    expect(repository.snapshot()).toEqual(snapshot);
  });

  it('keeps a rejected request as immutable event proof after deleting the roster and projection', async () => {
    const { rows, storage, repository } = fixture();
    await performClassAction({ command: command('join-pending'), actorUid: studentId,
      storage, repository: () => repository, now: () => 1_800_000_000_000 });
    const rejectionId = '00000000-0000-4000-8000-000000000102';
    await expect(performClassAction({ command: command('reject', rejectionId), actorUid: teacherId,
      storage, repository: () => repository, now: () => 1_800_000_001_000 })).resolves.toMatchObject({
      status: 200, body: { status: 'committed' },
    });
    expect(rows.has(`classes/${classId}/students/${studentId}`)).toBe(false);
    expect(rows.has(`student_classes/${studentId}/${classId}`)).toBe(false);
    expect(rows.get(`notification_intents/${rejectionId}`)).toMatchObject({
      kind: 'reject', studentName: 'Ada', teacherId,
    });
    expect(Object.keys(repository.snapshot())).toHaveLength(3);
  });

  it('rejects wrong actor and stale approval before writing, but keeps action success when delivery fails', async () => {
    const { rows, storage, repository } = fixture();
    await expect(performClassAction({ command: command('approve'), actorUid: 'other',
      storage, repository: () => repository })).resolves.toMatchObject({ status: 403 });
    await expect(performClassAction({ command: command('approve'), actorUid: teacherId,
      storage, repository: () => repository })).resolves.toMatchObject({ status: 409 });
    expect(rows.has(`notification_intents/${actionId}`)).toBe(false);
    await expect(performClassAction({ command: command('join-pending'), actorUid: studentId,
      storage, repository: () => { throw new Error('backend outage'); },
      now: () => 1_800_000_000_000 })).resolves.toMatchObject({
      status: 200, body: { status: 'committed', notificationStatus: 'retry_due' },
    });
    expect(rows.get(`notification_intents/${actionId}`)).toMatchObject({
      attempts: 1, state: 'retry_due',
    });
  });

  it('reports a fresh immediate failure while retries are suppressed', async () => {
    const { rows, storage } = fixture();
    const reportFailure = vi.fn(async () => {});
    storage.retrySuppressed = async () => true;
    storage.reportFailure = reportFailure;
    await expect(performClassAction({ command: command('join-pending'), actorUid: studentId,
      storage, repository: () => { throw new Error('backend outage'); },
      now: () => 1_800_000_000_000 })).resolves.toMatchObject({
      status: 200, body: { notificationStatus: 'failed' },
    });
    expect(reportFailure).toHaveBeenCalledOnce();
    expect(reportFailure).toHaveBeenCalledWith(expect.objectContaining({ actionId }), 2, 'delivery_backend_error');
    expect(rows.get(`notification_intents/${actionId}`)).toMatchObject({ attempts: 1, state: 'failed' });
  });

  it('recognizes delivered notices after an interrupted retry without sending again', async () => {
    const { rows, storage, repository } = fixture();
    await performClassAction({ command: command('join-pending'), actorUid: studentId,
      storage, repository: () => repository, now: () => 1_800_000_000_000 });
    const intent = rows.get(`notification_intents/${actionId}`) as ClassNotificationIntent;
    const snapshot = repository.snapshot();
    const read = async (path: string) => snapshot[path] ?? null;
    expect(await missingClassIntentRecipients(intent, read)).toBe(0);
    expect(repository.snapshot()).toEqual(snapshot);
  });

  it('resumes partial recipient delivery through conditional create while preserving the read recipient', async () => {
    const { rows, storage, repository } = fixture();
    await performClassAction({ command: command('join-pending'), actorUid: studentId,
      storage, repository: () => repository, now: () => 1_800_000_000_000 });
    const intent = rows.get(`notification_intents/${actionId}`) as ClassNotificationIntent;
    const [studentPath, studentNotice] = Object.entries(repository.snapshot())[0];
    const existing = { ...studentNotice, read: true };
    const inbox = new Map<string, unknown>([[studentPath, existing]]);
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname.slice(1, -5);
      if (init?.method === 'PUT') {
        expect(init.headers).toMatchObject({ 'if-match': 'null_etag' });
        if (inbox.has(path)) return new Response('', { status: 412 });
        inbox.set(path, JSON.parse(String(init.body)));
        return new Response('', { status: 200 });
      }
      return new Response(JSON.stringify(inbox.get(path) ?? null), { headers: { etag: '"existing"' } });
    });
    const remote = new FirebaseRestNotificationCommandRepository({
      env: { FIREBASE_DB_URL: 'https://example.test',
        NOTIFICATION_COMMAND_SERVICE_IDENTITY: 'notification@example.iam.gserviceaccount.com' },
      fetchImpl, getAccessToken: async () => 'token',
    });

    await expect(deliverClassIntent(intent, remote)).resolves.toEqual({
      delivered: true, failedRecipientCount: 0, backendFailure: false, fresh: true,
    });
    expect(inbox.size).toBe(2);
    expect(inbox.get(studentPath)).toEqual(existing);
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual(['PUT', 'GET', 'PUT']);
    expect(await missingClassIntentRecipients(intent, async (path) => inbox.get(path) ?? null)).toBe(0);
  });

  it('does not guess a recipient from a one-recipient pending-join failure count', async () => {
    const { rows, storage, repository } = fixture();
    await performClassAction({ command: command('join-pending'), actorUid: studentId,
      storage, repository: () => repository, now: () => 1_800_000_000_000 });
    const intent = rows.get(`notification_intents/${actionId}`) as ClassNotificationIntent;
    vi.spyOn(FirebaseRtdbRestClient.prototype, 'readWithEtag').mockResolvedValue({ data: null, etag: '"0"' });
    const write = vi.spyOn(FirebaseRtdbRestClient.prototype, 'writeIfMatch').mockResolvedValue(true);
    const remote = new FirebaseClassActionStorage({
      FIREBASE_DB_URL: 'https://example.test', FIREBASE_PROJECT_ID: 'test',
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: '{}',
    });

    await remote.reportFailure(intent, 1, 'inbox_missing_after_claim');

    const issue = write.mock.calls[0][1] as { contextData: Record<string, unknown> };
    expect(issue.contextData.failedRecipientCount).toBe(1);
    expect(issue.contextData).not.toHaveProperty('failedRecipientIds');
  });
});
