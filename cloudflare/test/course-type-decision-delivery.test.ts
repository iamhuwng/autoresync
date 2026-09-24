import { describe, expect, it } from 'vitest';
import { createCourseTypeDecisionHandlers } from '../src/upload-worker/notifications/course-type-decision-delivery.ts';
import {
  InMemoryNotificationCommandRepository,
  type NotificationCommandRepository,
} from '../src/upload-worker/notifications/repository.ts';
import { resolveCourseTypeDecisionNotice } from '../src/upload-worker/notifications/course-type-decision.ts';
import type {
  CourseTypeDecisionIntent,
  CourseTypeDecisionStorage,
} from '../src/upload-worker/notifications/course-type-decision-store.ts';
import type { CourseTypeDecisionRecord } from '../src/upload-worker/notifications/course-type-decision.ts';

const saved = (intent: CourseTypeDecisionIntent): CourseTypeDecisionRecord => ({
  id: 'request-1',
  teacherId: 'teacher-1',
  typeName: 'History of English',
  status: 'approved',
  approvedBy: 'admin-1',
  approvedAt: 100,
  notificationIntent: intent,
});

const initialIntent = (): CourseTypeDecisionIntent => ({
  eventKind: 'course-type-approved',
  authorityRecordId: 'request-1',
  occurrenceId: 'request-1_approved',
  occurredAt: 100,
  dueAt: 100,
  attempts: 0,
  state: 'due',
});

class MemoryStore implements CourseTypeDecisionStorage {
  current: CourseTypeDecisionRecord;
  reports: CourseTypeDecisionIntent[] = [];
  lastLimit = 0;
  etag = 0;

  constructor(intent = initialIntent()) { this.current = saved(intent); }

  async readRequest(requestId: string) {
    return requestId === this.current.id ? structuredClone(this.current) : null;
  }

  async readIntent(_requestId: string) {
    return {
      intent: structuredClone(this.current.notificationIntent as CourseTypeDecisionIntent),
      etag: String(this.etag),
    };
  }

  async writeIntent(_requestId: string, intent: CourseTypeDecisionIntent, etag: string) {
    if (etag !== String(this.etag)) return false;
    this.etag += 1;
    this.current = saved(structuredClone(intent));
    return true;
  }

  async dueRequests(limit: number) {
    this.lastLimit = limit;
    const intent = this.current.notificationIntent as CourseTypeDecisionIntent;
    return intent.dueAt < 8_640_000_000_000_000 ? [structuredClone(this.current)].slice(0, limit) : [];
  }

  async reportFailure(_request: CourseTypeDecisionRecord, intent: CourseTypeDecisionIntent) {
    if (!this.reports.some((row) => row.occurrenceId === intent.occurrenceId)) this.reports.push(intent);
  }
}

describe('course type decision delivery handler', () => {
  it('checks the saved decision actor and completes the immediate wake', async () => {
    const storage = new MemoryStore();
    const repository = new InMemoryNotificationCommandRepository();
    const handlers = createCourseTypeDecisionHandlers({ storage, repository, now: () => 200 });

    expect(await handlers.dispatch({ requestId: 'request-1', actorUid: 'wrong-actor' })).toEqual({ status: 'forbidden' });
    expect(await handlers.dispatch({ requestId: 'request-1', actorUid: 'admin-1' })).toEqual({ status: 'delivered' });
    expect((storage.current.notificationIntent as CourseTypeDecisionIntent).state).toBe('done');
    expect(Object.values(repository.snapshot())).toHaveLength(1);
  });

  it('makes one delayed retry, then records one terminal issue', async () => {
    let now = 200;
    let calls = 0;
    const storage = new MemoryStore();
    const repository: NotificationCommandRepository = {
      create: async () => {
        calls += 1;
        throw new Error('rtdb_unavailable');
      },
    };
    const handlers = createCourseTypeDecisionHandlers({ storage, repository, now: () => now });

    expect(await handlers.dispatch({ requestId: 'request-1', actorUid: 'admin-1' })).toEqual({ status: 'retry_due' });
    now += 60 * 60 * 1000;
    expect(await handlers.runRetryBatch()).toEqual({ processed: 1 });
    expect(calls).toBe(2);
    expect((storage.current.notificationIntent as CourseTypeDecisionIntent).state).toBe('failed');
    expect(storage.reports).toHaveLength(1);
    expect(storage.lastLimit).toBe(2);
  });

  it('stops the due batch after the first shared repository failure', async () => {
    const rows = new Map([
      ['request-1', saved(initialIntent())],
      ['request-2', { ...saved(initialIntent()), id: 'request-2', notificationIntent: {
        ...initialIntent(), authorityRecordId: 'request-2', occurrenceId: 'request-2_approved',
      } }],
    ]);
    const etags = new Map([['request-1', 0], ['request-2', 0]]);
    const storage: CourseTypeDecisionStorage = {
      readRequest: async (id) => structuredClone(rows.get(id) ?? null),
      readIntent: async (id) => ({
        intent: structuredClone(rows.get(id)?.notificationIntent as CourseTypeDecisionIntent ?? null),
        etag: String(etags.get(id)),
      }),
      writeIntent: async (id, intent, etag) => {
        if (etag !== String(etags.get(id))) return false;
        etags.set(id, (etags.get(id) ?? 0) + 1);
        const row = rows.get(id);
        if (row) rows.set(id, { ...row, notificationIntent: structuredClone(intent) });
        return true;
      },
      dueRequests: async (limit) => [...rows.values()].slice(0, limit),
      reportFailure: async () => {},
    };
    let calls = 0;
    const repository: NotificationCommandRepository = {
      create: async () => {
        calls += 1;
        throw new Error('rtdb_unavailable');
      },
    };
    const handlers = createCourseTypeDecisionHandlers({ storage, repository, now: () => 200 });

    expect(await handlers.runRetryBatch()).toEqual({ processed: 1 });
    expect(calls).toBe(1);
    expect((rows.get('request-1')?.notificationIntent as CourseTypeDecisionIntent).state).toBe('retry_due');
    expect((rows.get('request-2')?.notificationIntent as CourseTypeDecisionIntent).state).toBe('due');
  });

  it('reads back an inbox notice after a retry crash before reporting failure', async () => {
    const retrying: CourseTypeDecisionIntent = {
      ...initialIntent(),
      dueAt: 100,
      attempts: 2,
      state: 'retrying',
    };
    const storage = new MemoryStore(retrying);
    const repository = new InMemoryNotificationCommandRepository();
    const prior = resolveCourseTypeDecisionNotice('request-1', saved(retrying))!;
    await repository.create({
      operationId: prior.operationId,
      recipientId: prior.recipientId,
      notification: prior.notification,
      now: prior.occurredAt,
    });

    storage.current = saved({ ...retrying, dueAt: 200 });
    const handlers = createCourseTypeDecisionHandlers({ storage, repository, now: () => 200 });
    expect(await handlers.runRetryBatch()).toEqual({ processed: 1 });
    expect((storage.current.notificationIntent as CourseTypeDecisionIntent).state).toBe('done');
    expect(storage.reports).toHaveLength(0);
  });
});
