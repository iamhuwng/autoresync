import { describe, expect, it, vi } from 'vitest';
import { InMemoryNotificationCommandRepository } from '../../../cloudflare/src/upload-worker/notifications/repository';
import { createBookUpdateNotificationEmissionAdapter } from '../../../cloudflare/src/upload-worker/book-updates/update-notification-emitter';
import {
  createBookUpdateFinalizer,
  type BookUpdateNotificationPlanResolver,
} from '../../../cloudflare/src/upload-worker/book-updates/update-finalizer';
import {
  transitionBookUpdateActionRecord,
  type BookUpdateActionRepository,
} from '../../../cloudflare/src/upload-worker/book-updates/update-action';
import type { BookUpdateActionRecord } from './bookUpdateAction.types';
import type {
  BookUpdateNotificationEmissionPort,
  BookUpdateNotificationPlan,
} from './bookUpdateNotification.types';

const committedAction = (state: BookUpdateActionRecord['state'] = 'committed'): BookUpdateActionRecord => ({
  schemaVersion: 1,
  actionId: 'action-1', actorId: 'teacher-1', ownerId: 'teacher-1', bookId: 'book-1',
  snapshotId: 'snapshot-1', snapshotFingerprint: 'a'.repeat(64), idempotencyKey: 'operation-1',
  requestFingerprint: 'b'.repeat(64), reason: 'Reviewed update', selections: [{
    contextKey: 'homework:homework-1', placementId: 'placement-1', choice: 'apply-with-redo',
  }],
  state,
  stateRevision: state === 'committed' ? 2 : state === 'notification-pending' ? 3 : 1,
  acceptedAt: '2026-08-10T00:00:00.000Z', committedAt: state === 'applying' ? null : '2026-08-10T00:02:00.000Z',
  updatedAt: state === 'notification-pending' ? '2026-08-10T00:03:00.000Z' : '2026-08-10T00:02:00.000Z',
  terminalFailureCode: null,
  audit: {
    actorId: 'teacher-1', acceptedAt: '2026-08-10T00:00:00.000Z', reason: 'Reviewed update',
    bookId: 'book-1', oldActivityVersionId: 'activity-v1', newActivityVersionId: 'activity-v2',
    selectedContextKeys: ['homework:homework-1'], classifications: ['redo-required'],
    affectedCount: 1, checkpointCount: 1, regradeCount: 0, notificationCount: 1,
    terminalStatus: null, terminalAt: null,
  },
  recovery: {
    restoreBehavior: 'resume-or-compensate', replaySideEffects: 'none',
    recoveryLedgerRoot: 'book_update_action_recovery',
  },
});

class MemoryActions implements BookUpdateActionRepository {
  constructor(public action: BookUpdateActionRecord) {}
  async accept() { return { status: 'replayed' as const, action: this.action }; }
  async findByIdempotency() { return this.action; }
  async read(ownerId: string, actionId: string) {
    return this.action.ownerId === ownerId && this.action.actionId === actionId ? this.action : null;
  }
  async transition(input: Parameters<BookUpdateActionRepository['transition']>[0]) {
    if (this.action.state !== input.expectedState || this.action.stateRevision !== input.expectedRevision) {
      return { status: 'conflict' as const };
    }
    this.action = transitionBookUpdateActionRecord(
      this.action, input.nextState, input.at, input.terminalFailureCode,
    );
    return { status: 'advanced' as const, action: this.action };
  }
}

const plan = (overrides: Partial<BookUpdateNotificationPlan> = {}): BookUpdateNotificationPlan => ({
  recipientId: 'student-1', homeworkId: 'homework-1', classification: 'redo-required',
  choice: 'apply-with-redo', destinationView: 'updated-homework', checkpointAvailable: true,
  deadlineAt: '2026-08-12T00:00:00.000Z', actionSummary: 'Your Book activity changed and needs another attempt.',
  ...overrides,
});

const resolver = (plans: readonly BookUpdateNotificationPlan[]): BookUpdateNotificationPlanResolver => ({
  resolve: vi.fn(async () => plans),
});

describe('#110 post-commit finalizer', () => {
  it('emits nothing for reorder-only or invisible removal and completes terminally', async () => {
    const base = committedAction();
    const actions = new MemoryActions({
      ...base,
      selections: [
        { contextKey: 'homework:homework-1', placementId: 'placement-1', choice: 'apply-without-redo' },
        { contextKey: 'homework:homework-2', placementId: 'placement-2', choice: 'remove-from-current' },
      ],
      audit: {
        ...base.audit,
        selectedContextKeys: ['homework:homework-1', 'homework:homework-2'],
        classifications: ['removed', 'reordered'],
      },
    });
    const emitter: BookUpdateNotificationEmissionPort = { emit: vi.fn() };
    const finalizer = createBookUpdateFinalizer({
      actions,
      plans: resolver([
        plan({ classification: 'reordered', choice: 'apply-without-redo' }),
        plan({
          recipientId: 'student-2', homeworkId: 'homework-2',
          classification: 'removed', choice: 'remove-from-current',
        }),
      ]),
      emitter,
      now: () => new Date('2026-08-10T00:03:00.000Z'),
    });
    await expect(finalizer.finalize({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'completed', emitted: 0, replayed: 0 });
    expect(emitter.emit).not.toHaveBeenCalled();
    expect(actions.action.state).toBe('completed');
  });

  it('emits at most once per recipient only after committed state', async () => {
    const actions = new MemoryActions(committedAction());
    const emit = vi.fn(async () => ({ status: 'emitted' as const, created: 1, replayed: 0 }));
    const finalizer = createBookUpdateFinalizer({
      actions, plans: resolver([plan(), plan({ recipientId: 'student-2' })]), emitter: { emit },
      now: () => new Date('2026-08-10T00:03:00.000Z'),
    });
    await expect(finalizer.finalize({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'completed', emitted: 2 });
    expect(emit).toHaveBeenCalledTimes(2);

    const precommitEmitter = { emit: vi.fn() };
    const blocked = createBookUpdateFinalizer({
      actions: new MemoryActions(committedAction('applying')),
      plans: resolver([plan()]), emitter: precommitEmitter,
    });
    await expect(blocked.finalize({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toEqual({ status: 'blocked', code: 'action-not-committed' });
    expect(precommitEmitter.emit).not.toHaveBeenCalled();
  });

  it('leaves partial failure pending and safely replays earlier recipients on resume', async () => {
    const actions = new MemoryActions(committedAction());
    const seen = new Set<string>();
    let failSecond = true;
    const emitter: BookUpdateNotificationEmissionPort = {
      emit: vi.fn(async ({ plan: current }) => {
        if (current.recipientId === 'student-2' && failSecond) throw new Error('temporary failure');
        const replayed = seen.has(current.recipientId);
        seen.add(current.recipientId);
        return { status: 'emitted' as const, created: replayed ? 0 : 1, replayed: replayed ? 1 : 0 };
      }),
    };
    const finalizer = createBookUpdateFinalizer({
      actions, plans: resolver([plan(), plan({ recipientId: 'student-2' })]), emitter,
      now: () => new Date('2026-08-10T00:03:00.000Z'),
    });
    await expect(finalizer.finalize({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'notification-pending', code: 'notification-emission-failed' });
    expect(actions.action.state).toBe('notification-pending');
    failSecond = false;
    await expect(finalizer.finalize({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'completed', emitted: 1, replayed: 1 });
  });

  it('keeps malformed destinations and duplicate recipient plans pending', async () => {
    const actions = new MemoryActions(committedAction());
    const finalizer = createBookUpdateFinalizer({
      actions, plans: resolver([plan(), plan()]), emitter: { emit: vi.fn() },
      now: () => new Date('2026-08-10T00:03:00.000Z'),
    });
    await expect(finalizer.finalize({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'notification-pending', code: 'notification-plan-invalid' });
  });
});

describe('#110 ticket-38C notification adapter', () => {
  it('uses deterministic action/recipient identity, structured destination metadata, and replay', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const adapter = createBookUpdateNotificationEmissionAdapter({
      repository, now: () => Date.parse('2026-08-10T00:03:00.000Z'), enabled: true,
    });
    const input = { actionId: 'action-1', committedAt: '2026-08-10T00:02:00.000Z', plan: plan() };
    await expect(adapter.emit(input)).resolves.toMatchObject({ status: 'emitted', created: 1, replayed: 0 });
    await expect(adapter.emit(input)).resolves.toMatchObject({ status: 'emitted', created: 0, replayed: 1 });
  });
});
