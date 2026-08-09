import { describe, expect, it, vi } from 'vitest';
import type { BookImpactSnapshot } from './bookImpactSnapshot.types';
import type { BookImpactSnapshotRepository } from '../../../cloudflare/src/upload-worker/book-updates/impact-snapshot';
import {
  advanceBookUpdateAction,
  createBookUpdateActionService,
  isLegalBookUpdateActionTransition,
  transitionBookUpdateActionRecord,
  type BookUpdateActionRepository,
} from '../../../cloudflare/src/upload-worker/book-updates/update-action';
import type {
  BookUpdateActionCommand,
  BookUpdateActionRecord,
  BookUpdateActionState,
} from './bookUpdateAction.types';
import { BOOK_UPDATE_ACTION_STATES } from './bookUpdateAction.types';
import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/40A.json';
import snapshotFragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/39C.json';
import { composeGeneratedBookRules } from '../../../cloudflare/src/upload-worker/book-rules/generated-fragment-composer';
import { createBookUpdateActionCommandHandler } from '../../../cloudflare/src/upload-worker/book-updates/update-action-command';

const now = '2026-08-10T00:05:00.000Z';
const hash = (character: string) => character.repeat(64);

const snapshot = (): BookImpactSnapshot => ({
  schemaVersion: 1,
  snapshotId: 'snapshot-1', actorId: 'teacher-1', ownerId: 'teacher-1', bookId: 'book-1',
  inputFingerprint: hash('a'),
  immutableInputs: {
    oldActivityVersionId: 'activity-v1', newActivityVersionId: 'activity-v2',
    oldActivityFingerprint: hash('a'), newActivityFingerprint: hash('b'),
    placementFingerprint: hash('c'), manifestFingerprint: hash('d'),
    sourceFingerprint: hash('e'), scheduleFingerprint: hash('f'),
  },
  adapters: [],
  contexts: [{
    contextKey: 'homework:homework-1',
    impact: {
      contextId: 'homework-1', contextKind: 'homework', ownerId: 'teacher-1', recipientId: 'student-1',
      bindingId: 'binding-1', bindingRevision: 1, status: 'active', lifecycle: 'in-progress',
      bookId: 'book-1', bookRevision: 1, publicationId: 'publication-1', publicationRevision: 1,
      effectiveWindow: { dueAt: '2026-08-09T00:00:00.000Z' } as never,
      placements: [{
        placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'activity-v1',
        activityVersion: 1, nodeKey: 'unit-1', order: 0, effectiveWindow: null,
        sourceRefs: [],
      }],
      attempts: [], sources: [], replacement: [],
      classification: {
        primaryEffect: 'added', effects: ['added'], reasons: ['activity-added'],
        requiresRedo: false, requiresRegrade: false,
      },
    },
    updateAuthority: { ownerId: 'teacher-1', actorId: 'teacher-1', permitted: true },
    recipientScope: { recipientId: 'student-1', lifecycle: 'in-progress', status: 'active' },
    activityChoices: [{
      activityId: 'activity-1', activityVersionId: 'activity-v1', placementId: 'placement-1',
      primaryEffect: 'added', allowedChoices: ['exclude-added', 'include-required'], selectedChoice: null,
    }],
    estimatedCheckpointCount: 0,
    estimatedNotificationCount: 1,
  }],
  createdAt: '2026-08-10T00:00:00.000Z', expiresAt: '2026-08-10T00:15:00.000Z',
  recovery: {
    backupInventory: 'include-metadata', restoreBehavior: 'retain-read-only',
    expiryBehavior: 'retain-audit-deny-reuse', sideEffectsOnReplay: 'none',
    recoveryLedgerRoot: 'book_impact_snapshot_recovery',
  },
});

class MemoryActions implements BookUpdateActionRepository {
  action: BookUpdateActionRecord | null = null;

  async accept(action: BookUpdateActionRecord) {
    if (!this.action) {
      this.action = action;
      return { status: 'accepted' as const, action };
    }
    return this.action.requestFingerprint === action.requestFingerprint
      ? { status: 'replayed' as const, action: this.action }
      : { status: 'conflict' as const };
  }

  async read() { return this.action; }

  async findByIdempotency(_ownerId: string, idempotencyKey: string) {
    return this.action?.idempotencyKey === idempotencyKey ? this.action : null;
  }

  async transition(input: Parameters<BookUpdateActionRepository['transition']>[0]) {
    if (!this.action) return { status: 'missing' as const };
    if (this.action.state !== input.expectedState || this.action.stateRevision !== input.expectedRevision) {
      return { status: 'conflict' as const };
    }
    this.action = transitionBookUpdateActionRecord(
      this.action, input.nextState, input.at, input.terminalFailureCode,
    );
    return { status: 'advanced' as const, action: this.action };
  }
}

const snapshots = (result: Awaited<ReturnType<BookImpactSnapshotRepository['readCurrent']>> = {
  status: 'ready', snapshot: snapshot(),
}): BookImpactSnapshotRepository => ({
  save: vi.fn(),
  readCurrent: vi.fn(async () => result),
});

const command = (overrides: Partial<BookUpdateActionCommand> = {}): BookUpdateActionCommand => ({
  actorId: 'teacher-1', bookId: 'book-1', snapshotId: 'snapshot-1', snapshotFingerprint: hash('a'),
  idempotencyKey: 'operation-1', reason: 'Apply the reviewed Book update.',
  selections: [{
    contextKey: 'homework:homework-1', placementId: 'placement-1', choice: 'include-required',
    replacementDeadline: '2026-08-11T00:00:00.000Z',
  }],
  ...overrides,
});

describe('#109 update action acceptance', () => {
  it('accepts one explicit current-snapshot command with bounded immutable audit facts', async () => {
    const actions = new MemoryActions();
    const service = createBookUpdateActionService({
      snapshots: snapshots(), actions, now: () => new Date(now), newId: () => 'action-1',
    });
    const result = await service.accept(command());
    expect(result).toMatchObject({ status: 'accepted', action: { state: 'accepted', stateRevision: 0 } });
    if (result.status === 'blocked') throw new Error('unexpected block');
    expect(result.action.audit).toMatchObject({
      actorId: 'teacher-1', oldActivityVersionId: 'activity-v1', newActivityVersionId: 'activity-v2',
      selectedContextKeys: ['homework:homework-1'], classifications: ['added'],
      affectedCount: 1, notificationCount: 1, terminalStatus: null,
    });
    expect(JSON.stringify(result.action)).not.toMatch(/answer|credential|privateUrl|pdfContent/iu);
  });

  it('binds command ownership to the authenticated Worker identity, not crafted body fields', async () => {
    const actions = new MemoryActions();
    const service = createBookUpdateActionService({
      snapshots: snapshots(), actions, now: () => new Date(now), newId: () => 'action-1',
    });
    const handler = createBookUpdateActionCommandHandler(service);
    const crafted = { ...command(), actorId: 'teacher-2', bookId: 'book-2' };
    const response = await handler({
      request: new Request('https://worker.test/book-updates/books/book-1/commands', {
        method: 'POST', body: JSON.stringify(crafted), headers: { 'content-type': 'application/json' },
      }),
      uid: 'teacher-1',
      params: { bookId: 'book-1' },
    });
    expect(response.status).toBe(201);
    expect(actions.action).toMatchObject({ actorId: 'teacher-1', ownerId: 'teacher-1', bookId: 'book-1' });
  });

  it('replays the same idempotent request and rejects reuse with changed choices', async () => {
    const actions = new MemoryActions();
    const snapshotRepository = snapshots();
    const service = createBookUpdateActionService({
      snapshots: snapshotRepository, actions, now: () => new Date(now), newId: () => crypto.randomUUID(),
    });
    await expect(service.accept(command())).resolves.toMatchObject({ status: 'accepted' });
    await expect(service.accept(command())).resolves.toMatchObject({ status: 'replayed' });
    expect(snapshotRepository.readCurrent).toHaveBeenCalledOnce();
    await expect(service.accept(command({ reason: 'A different reason.' })))
      .resolves.toEqual({ status: 'blocked', code: 'idempotency-conflict' });
  });

  it('fails closed for stale, expired, denied, changed-owner, invalid-choice, and missing deadline inputs', async () => {
    for (const status of ['stale', 'expired', 'denied'] as const) {
      const result = status === 'stale' ? { status, snapshotId: 'snapshot-1' } as const
        : status === 'expired' ? { status, snapshotId: 'snapshot-1', expiresAt: now } as const
          : { status } as const;
      await expect(createBookUpdateActionService({ snapshots: snapshots(result), actions: new MemoryActions() })
        .accept(command())).resolves.toMatchObject({ status: 'blocked', code: `snapshot-${status}` });
    }
    const changed = snapshot();
    const changedContext = changed.contexts[0]!;
    const changedOwner = {
      ...changed,
      contexts: [{
        ...changedContext,
        updateAuthority: { ownerId: 'teacher-2', actorId: 'teacher-2', permitted: true as const },
      }],
    };
    await expect(createBookUpdateActionService({
      snapshots: snapshots({ status: 'ready', snapshot: changedOwner }), actions: new MemoryActions(),
      now: () => new Date(now),
    }).accept(command())).resolves.toEqual({ status: 'blocked', code: 'invalid-selection' });
    await expect(createBookUpdateActionService({
      snapshots: snapshots(), actions: new MemoryActions(), now: () => new Date(now),
    }).accept(command({ selections: [{
      contextKey: 'homework:homework-1', placementId: 'placement-1', choice: 'review-only',
    }] }))).resolves.toEqual({ status: 'blocked', code: 'invalid-selection' });
    await expect(createBookUpdateActionService({
      snapshots: snapshots(), actions: new MemoryActions(), now: () => new Date(now),
    }).accept(command({ selections: [{
      contextKey: 'homework:homework-1', placementId: 'placement-1', choice: 'include-required',
    }] }))).resolves.toEqual({ status: 'blocked', code: 'invalid-selection' });
  });
});

describe('#109 monotonic action state machine', () => {
  const legal = new Set([
    'accepted>applying', 'accepted>compensating', 'accepted>terminal-failure',
    'applying>committed', 'applying>compensating', 'applying>terminal-failure',
    'committed>notification-pending', 'committed>completed', 'committed>compensating', 'committed>terminal-failure',
    'notification-pending>completed', 'notification-pending>compensating', 'notification-pending>terminal-failure',
    'compensating>compensated', 'compensating>terminal-failure',
  ]);

  it('classifies every legal and illegal transition explicitly', () => {
    for (const from of BOOK_UPDATE_ACTION_STATES) {
      for (const to of BOOK_UPDATE_ACTION_STATES) {
        expect(isLegalBookUpdateActionTransition(from, to)).toBe(legal.has(`${from}>${to}`));
      }
    }
  });

  it('uses revision CAS for crash resume and records terminal audit state once', async () => {
    const actions = new MemoryActions();
    const service = createBookUpdateActionService({
      snapshots: snapshots(), actions, now: () => new Date(now), newId: () => 'action-1',
    });
    await service.accept(command());
    await expect(advanceBookUpdateAction({
      repository: actions, ownerId: 'teacher-1', actionId: 'action-1', expectedState: 'accepted',
      expectedRevision: 0, nextState: 'applying', at: '2026-08-10T00:06:00.000Z',
    })).resolves.toMatchObject({ status: 'advanced', action: { stateRevision: 1 } });
    await expect(advanceBookUpdateAction({
      repository: actions, ownerId: 'teacher-1', actionId: 'action-1', expectedState: 'accepted',
      expectedRevision: 0, nextState: 'applying', at: '2026-08-10T00:06:00.000Z',
    })).resolves.toEqual({ status: 'conflict' });
    await expect(advanceBookUpdateAction({
      repository: actions, ownerId: 'teacher-1', actionId: 'action-1', expectedState: 'applying',
      expectedRevision: 1, nextState: 'terminal-failure', at: '2026-08-10T00:07:00.000Z',
      terminalFailureCode: 'downstream_failed',
    })).resolves.toMatchObject({
      status: 'advanced',
      action: { state: 'terminal-failure', audit: { terminalStatus: 'terminal-failure' } },
    });
  });
});

describe('#109 inactive rules fragment', () => {
  it('denies ancestors and limits descendants to scoped expiring service claims', () => {
    expect(fragment.status).toBe('inactive');
    const operations = fragment.operations as readonly { path: string; expression: string }[];
    expect(operations.filter((entry) => entry.path === 'book_update_actions')
      .every((entry) => entry.expression === 'false')).toBe(true);
    expect(operations.filter((entry) => entry.expression !== 'false')
      .every((entry) => entry.expression.includes('auth.token.bua.s == true')
        && entry.expression.includes('auth.token.bua.o == $ownerId')
        && entry.expression.includes('auth.token.bua.dl >= now'))).toBe(true);
    expect(() => composeGeneratedBookRules([
      { sourcePath: 'fragments/39C.json', fragment: snapshotFragment },
      { sourcePath: 'fragments/40A.json', fragment },
    ], { requiredFragmentIds: ['39C', '40A'] })).not.toThrow();
  });
});
