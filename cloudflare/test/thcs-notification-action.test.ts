import { describe, expect, it } from 'vitest';
import {
  parseThcsNotificationAction,
  performThcsNotificationAction,
  retryDueThcsNotifications,
  type ThcsNotificationIntent,
  type ThcsNotificationKind,
  type ThcsNotificationStorage,
} from '../src/upload-worker/notifications/thcs-notification-action.ts';
import { InMemoryNotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';

const now = 1_800_000_000_000;
const teacherId = 'teacher-thcs';
const students = ['student-a', 'student-b'];
const assignment = (intent?: ThcsNotificationIntent) => ({
  id: 'homework-thcs', createdBy: teacherId, materialType: 'thcs-test',
  title: 'Saved THCS title', materialTitle: 'Material title', scheduling: { dueDate: now + 86_400_000 },
  target: { type: 'class', classId: 'class-thcs' },
  ...(intent ? { notificationIntent: intent } : {}),
});
const result = (intent?: ThcsNotificationIntent) => ({
  resultId: 'result-thcs', studentId: students[0], testTitle: 'Saved test title', testType: 'THCS-THPT',
  submittedAt: now, thcsData: { gradingStatus: 'fully-graded', scaledScore: 8.5 },
  ...(intent ? { notificationIntent: intent } : {}),
});
const intent = (kind: ThcsNotificationKind, id: string): ThcsNotificationIntent => ({
  schemaVersion: 1, actionId: id, kind, occurredAt: now, dueAt: now + 3_600_000, attempts: 0, state: 'pending',
});
const fixture = () => {
  const values = new Map<string, unknown>([
    ['homework:homework-thcs', assignment(intent('homework-assigned', 'homework-thcs'))],
    ['result:result-thcs', result(intent('fully-graded', 'result-thcs'))],
    ['class:class-thcs', { createdBy: teacherId, students: { [students[0]]: { status: 'active' }, [students[1]]: { status: 'active' } } }],
    [`user:${teacherId}`, { role: 'teacher' }],
    [`user:${students[0]}`, { role: 'student' }],
  ]);
  const reports: unknown[] = [];
  const storage: ThcsNotificationStorage = {
    async readHomework(id) { return values.get(`homework:${id}`) ?? null; },
    async readResult(id) { return values.get(`result:${id}`) ?? null; },
    async readClass(id) { return values.get(`class:${id}`) ?? null; },
    async readUser(id) { return values.get(`user:${id}`) ?? null; },
    async saveIntent(kind, id, next) {
      const key = `${kind === 'homework-assigned' ? 'homework' : 'result'}:${id}`;
      const current = values.get(key) as Record<string, unknown>;
      values.set(key, { ...current, notificationIntent: next });
    },
    async dueIntents(time, limit) {
      return [...values.entries()].flatMap(([key, value]) => {
        const [prefix, id] = key.split(':');
        const kind: ThcsNotificationKind = prefix === 'homework' ? 'homework-assigned' : 'fully-graded';
        const current = value as Record<string, unknown>;
        const stored = current.notificationIntent as ThcsNotificationIntent | undefined;
        return stored && stored.dueAt <= time && ['pending', 'sending', 'retry_due', 'retrying'].includes(stored.state)
          ? [{ kind, recordId: id!, intent: stored }] : [];
      }).slice(0, limit);
    },
    async reportFailure(kind, id, value) { reports.push({ kind, id, value }); },
  };
  return { values, reports, storage };
};
const commandRequest = (kind: ThcsNotificationKind, id: string, extra: Record<string, unknown> = {}) => new Request('https://worker.example/thcs-notifications/actions', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `${kind}:${id}` },
  body: JSON.stringify({ schemaVersion: 1, kind, authorityRecordId: id, ...extra }),
});

describe('THCS notification actions', () => {
  it('accepts only a source record identity', async () => {
    await expect(parseThcsNotificationAction(commandRequest('homework-assigned', 'homework-thcs')))
      .resolves.toEqual({ schemaVersion: 1, kind: 'homework-assigned', authorityRecordId: 'homework-thcs' });
    await expect(parseThcsNotificationAction(commandRequest('homework-assigned', 'homework-thcs', { recipientId: students[0] })))
      .rejects.toThrow('thcs_notification_invalid');
  });

  it('derives assignment recipients and notice content from saved records', async () => {
    const { storage } = fixture();
    const repository = new InMemoryNotificationCommandRepository();
    await expect(performThcsNotificationAction({
      command: { schemaVersion: 1, kind: 'homework-assigned', authorityRecordId: 'homework-thcs' },
      actorUid: teacherId, storage, repository, now: () => now,
    })).resolves.toMatchObject({ status: 200, body: { notificationStatus: 'done' } });
    const rows = Object.values(repository.snapshot());
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'New THCS Homework Assigned', message: 'Your teacher has assigned "Saved THCS title". Due: 2027-01-16', link: '/student/homework/homework-thcs' }),
    ]));
  });

  it('verifies student ownership, derives the fully graded notice, and deduplicates both UI paths', async () => {
    const { storage } = fixture();
    const repository = new InMemoryNotificationCommandRepository();
    const input = { command: { schemaVersion: 1 as const, kind: 'fully-graded' as const, authorityRecordId: 'result-thcs' },
      actorUid: students[0], storage, repository, now: () => now };
    await expect(performThcsNotificationAction(input)).resolves.toMatchObject({ body: { notificationStatus: 'done' } });
    await expect(performThcsNotificationAction(input)).resolves.toMatchObject({ body: { notificationStatus: 'delivered' } });
    const rows = Object.values(repository.snapshot());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: 'Test Fully Graded', message: 'All answers in "Saved test title" have been graded. Your score: 8.5/10.', link: '/result/result-thcs' });
    await expect(performThcsNotificationAction({ ...input, actorUid: teacherId })).resolves.toMatchObject({ status: 403 });
  });

  it('retries only undelivered assignment recipients and reports one exhausted action', async () => {
    const { storage, values, reports } = fixture();
    let failStudent = students[1];
    const delivered = new Set<string>();
    const repository = {
      async create(input: { recipientId: string; operationId: string }) {
        if (input.recipientId === failStudent) throw new Error('temporary outage');
        delivered.add(input.recipientId);
        return { status: 'created' as const, notificationId: input.operationId };
      },
    };
    const command = { schemaVersion: 1 as const, kind: 'homework-assigned' as const, authorityRecordId: 'homework-thcs' };
    await performThcsNotificationAction({ command, actorUid: teacherId, storage, repository, now: () => now });
    failStudent = '';
    await retryDueThcsNotifications({ storage, repository, now: () => now + 3_600_001 });
    expect(delivered).toEqual(new Set(students));
    expect(reports).toHaveLength(0);

    const failedFixture = fixture();
    const failedRepository = { async create(input: { operationId: string }) { throw new Error(input.operationId); } };
    await performThcsNotificationAction({ command, actorUid: teacherId, storage: failedFixture.storage,
      repository: failedRepository, now: () => now });
    await retryDueThcsNotifications({ storage: failedFixture.storage, repository: failedRepository, now: () => now + 3_600_001 });
    expect(failedFixture.reports).toHaveLength(1);
    expect((failedFixture.values.get('homework:homework-thcs') as { notificationIntent: ThcsNotificationIntent }).notificationIntent)
      .toMatchObject({ attempts: 2, state: 'failed' });
  });

  it('caps each assignment delivery pass at ten recipients and continues the first pass before retry', async () => {
    const f = fixture();
    const roster = Array.from({ length: 25 }, (_, index) => `student-${index}`);
    f.values.set('class:class-thcs', { createdBy: teacherId, students: Object.fromEntries(roster.map(id => [id, { status: 'active' }])) });
    const repository = new InMemoryNotificationCommandRepository();
    const command = { schemaVersion: 1 as const, kind: 'homework-assigned' as const, authorityRecordId: 'homework-thcs' };
    await performThcsNotificationAction({ command, actorUid: teacherId, storage: f.storage, repository, now: () => now });
    expect(Object.keys(repository.snapshot())).toHaveLength(10);
    expect((f.values.get('homework:homework-thcs') as { notificationIntent: ThcsNotificationIntent }).notificationIntent)
      .toMatchObject({ state: 'pending', attempts: 0, nextRecipientIndex: 10 });

    await retryDueThcsNotifications({ storage: f.storage, repository, now: () => now + 60_001 });
    expect(Object.keys(repository.snapshot())).toHaveLength(20);
    await retryDueThcsNotifications({ storage: f.storage, repository, now: () => now + 120_002 });
    expect(Object.keys(repository.snapshot())).toHaveLength(25);
    expect((f.values.get('homework:homework-thcs') as { notificationIntent: ThcsNotificationIntent }).notificationIntent)
      .toMatchObject({ state: 'done', attempts: 0 });
  });
});
