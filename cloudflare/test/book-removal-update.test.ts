import { describe, expect, it, vi } from 'vitest';
import fragment41B from '../src/upload-worker/book-rules/fragments/41B.json';
import {
  createBookRemovalUpdateExecutor,
  FirebaseRestBookRemovalPhaseReceiptRepository,
  InMemoryBookRemovalPhaseReceiptRepository,
  type BookRemovalAuditPort,
  type BookRemovalCompletionProjectionPort,
  type BookRemovalExclusionProjectionPort,
  type BookRemovalHistoricalProjectionPort,
  type BookRemovalPhaseReceiptRepository,
  type BookRemovalUpdateOperation,
  type BookRemovalUpdatePlan,
  type BookRemovalUpdateResolver,
} from '../src/upload-worker/book-updates/removal-update';
import {
  transitionBookUpdateActionRecord,
  type BookUpdateActionRepository,
} from '../src/upload-worker/book-updates/update-action';
import type { BookUpdateActionRecord } from '../../src/services/book-delivery/bookUpdateAction.types';
import type { BookRemovalCompletionProjection } from '../../src/services/book-homework/bookRemovalCompletionProjection.service';

const at = '2026-08-10T00:01:00.000Z';

const actionFor = (
  operations: readonly BookRemovalUpdateOperation[],
  state: BookUpdateActionRecord['state'] = 'accepted',
): BookUpdateActionRecord => ({
  schemaVersion: 1,
  actionId: 'action-1', actorId: 'teacher-1', ownerId: 'teacher-1', bookId: 'book-1',
  snapshotId: 'snapshot-1', snapshotFingerprint: 'a'.repeat(64), idempotencyKey: 'operation-1',
  requestFingerprint: 'b'.repeat(64), reason: 'Reviewed removal',
  selections: operations.map((operation) => ({
    contextKey: operation.contextKey, placementId: operation.placementId, choice: operation.choice,
  })),
  state, stateRevision: state === 'accepted' ? 0 : 1,
  acceptedAt: at, committedAt: state === 'committed' ? at : null, updatedAt: at,
  terminalFailureCode: null,
  audit: {
    actorId: 'teacher-1', acceptedAt: at, reason: 'Reviewed removal', bookId: 'book-1',
    oldActivityVersionId: 'activity-v1', newActivityVersionId: 'activity-v2',
    selectedContextKeys: [...new Set(operations.map((operation) => operation.contextKey))],
    classifications: ['removed'], affectedCount: operations.length,
    checkpointCount: 0, regradeCount: 0, notificationCount: operations.length,
    terminalStatus: state === 'committed' ? 'committed' : null,
    terminalAt: state === 'committed' ? at : null,
  },
  recovery: {
    restoreBehavior: 'resume-or-compensate', replaySideEffects: 'none',
    recoveryLedgerRoot: 'book_update_action_recovery',
  },
});

class MemoryActions implements BookUpdateActionRepository {
  readonly transitions: string[] = [];

  constructor(public action: BookUpdateActionRecord) {}

  async accept() { return { status: 'replayed' as const, action: this.action }; }
  async findByIdempotency() { return this.action; }
  async read() { return this.action; }
  async transition(input: Parameters<BookUpdateActionRepository['transition']>[0]) {
    if (this.action.state !== input.expectedState || this.action.stateRevision !== input.expectedRevision) {
      return { status: 'conflict' as const };
    }
    this.transitions.push(`${this.action.state}->${input.nextState}`);
    this.action = transitionBookUpdateActionRecord(this.action, input.nextState, input.at, input.terminalFailureCode);
    return { status: 'advanced' as const, action: this.action };
  }
}

const operation = (
  contextKind: BookRemovalUpdateOperation['contextKind'],
  lifecycle: BookRemovalUpdateOperation['lifecycle'],
  index: number,
): BookRemovalUpdateOperation => {
  const contextId = `${contextKind}-${index}`;
  return {
    actionId: 'action-1', ownerId: 'teacher-1', bookId: 'book-1',
    contextKey: `${contextKind}:${contextId}`, contextId, studentId: `student-${index}`,
    placementId: `placement-${index}`, reason: 'Reviewed removal',
    contextKind, lifecycle, activityId: `activity-${index}`, oldActivityVersionId: `activity-v${index}`,
    choice: 'remove-from-current', feedbackRelease: index % 2 === 0 ? 'released' : 'hidden',
  };
};

const planFor = (operationValue: BookRemovalUpdateOperation): BookRemovalUpdatePlan => ({
  schemaVersion: 1, actionId: 'action-1', ownerId: 'teacher-1', bookId: 'book-1',
  contextKey: operationValue.contextKey, contextId: operationValue.contextId,
  contextKind: operationValue.contextKind, studentId: operationValue.studentId,
  reason: operationValue.reason, createdAt: at, operations: [operationValue],
});

const projection = (plan: BookRemovalUpdatePlan): BookRemovalCompletionProjection => ({
  schemaVersion: 1, manifestVersionId: 'manifest-1', recipientId: plan.studentId,
  contextId: plan.contextId, deliveryBindingId: 'delivery-1', bindingRevision: 2,
  completion: { submittedCount: 0, requiredCount: 0, status: 'not_started', isComplete: false },
  grading: { scoredCount: 0, pendingReviewCount: 0, ungradedSubmittedCount: 0 },
  activities: [], excludedHistoricalRows: [], exclusions: [], completionLatched: false,
});

const ports = (receipts: BookRemovalPhaseReceiptRepository, failHistory?: { value: boolean }) => {
  const seen = new Set<string>();
  const history: BookRemovalHistoricalProjectionPort = {
    apply: vi.fn(async ({ operationId, projections }) => {
      const replayed = seen.has(operationId);
      seen.add(operationId);
      return {
        status: replayed ? 'replayed' as const : 'applied' as const,
        historicalRowCount: projections.length,
      };
    }),
  };
  const exclusions: BookRemovalExclusionProjectionPort = {
    apply: vi.fn(async ({ operationId, placementIds }) => ({
      status: seen.has(operationId) ? 'replayed' as const : 'applied' as const,
      excludedPlacementIds: placementIds,
    })),
  };
  const completion: BookRemovalCompletionProjectionPort = {
    recalculate: vi.fn(async ({ plan }) => ({ status: 'applied' as const, projection: projection(plan) })),
  };
  const audit: BookRemovalAuditPort = {
    record: vi.fn(async () => ({ status: 'recorded' as const })),
  };
  const resolver: BookRemovalUpdateResolver = {
    resolve: vi.fn(async (action: BookUpdateActionRecord) => ({
      status: 'ready' as const,
      students: action.selections.map((selection) => {
        const found = allOperations.find((candidate) => candidate.placementId === selection.placementId)!;
        return planFor(found);
      }),
    })),
  };
  return { receipts, history, exclusions, completion, audit, resolver, failHistory };
};

let allOperations: BookRemovalUpdateOperation[] = [];

const executorFor = (
  operations: readonly BookRemovalUpdateOperation[],
  overrides: Partial<ReturnType<typeof ports>> = {},
) => {
  allOperations = [...operations];
  const actions = new MemoryActions(actionFor(operations));
  const base = ports(overrides.receipts ?? new InMemoryBookRemovalPhaseReceiptRepository());
  const merged = { ...base, ...overrides };
  const executor = createBookRemovalUpdateExecutor({
    actions, resolver: merged.resolver, receipts: merged.receipts,
    history: merged.history, exclusions: merged.exclusions,
    completion: merged.completion, audit: merged.audit,
    now: () => new Date(at),
  });
  return { actions, executor, merged };
};

describe('#113 removal update executor', () => {
  it('covers lifecycle and context matrix without a checkpoint/redo/finalizer call', async () => {
    const operations = (['solo', 'homework', 'course', 'class'] as const).flatMap((kind, kindIndex) => (
      (['not-started', 'in-progress', 'submitted', 'completed'] as const).map((lifecycle, lifecycleIndex) => (
        operation(kind, lifecycle, kindIndex * 4 + lifecycleIndex + 1)
      ))
    ));
    const { actions, executor, merged } = executorFor(operations);
    await expect(executor.execute({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'committed', action: { committedAt: at } });
    expect(actions.transitions).toEqual(['accepted->applying', 'applying->committed']);
    expect(merged.history.apply).toHaveBeenCalledTimes(16);
    expect(merged.exclusions.apply).toHaveBeenCalledTimes(16);
    expect(merged.completion.recalculate).toHaveBeenCalledTimes(16);
    expect(merged.audit.record).toHaveBeenCalledTimes(16);
    expect(JSON.stringify({ history: merged.history, exclusions: merged.exclusions, completion: merged.completion, audit: merged.audit }))
      .not.toMatch(/checkpoint|redo|deadline|delete|rewrite/iu);
  });

  it('replays after a receipt CAS crash and converges without duplicate effects', async () => {
    const first = operation('homework', 'submitted', 1);
    const receipts = new InMemoryBookRemovalPhaseReceiptRepository();
    const originalCompareAndSet = receipts.compareAndSet.bind(receipts);
    let failOnce = true;
    receipts.compareAndSet = async (input) => {
      if (failOnce) {
        failOnce = false;
        return { status: 'conflict' as const };
      }
      return originalCompareAndSet(input);
    };
    const firstRun = executorFor([first], { receipts });
    await expect(firstRun.executor.execute({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'pending', completedStudentCount: 0 });
    expect(firstRun.actions.action.state).toBe('applying');
    await expect(firstRun.executor.execute({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'committed' });
    expect(firstRun.actions.action.state).toBe('committed');
    expect(firstRun.merged.history.apply).toHaveBeenCalledTimes(2);
    expect(firstRun.merged.completion.recalculate).toHaveBeenCalledOnce();
    expect(firstRun.merged.audit.record).toHaveBeenCalledOnce();
    expect((await receipts.read({
      ownerId: 'teacher-1', actionId: 'action-1', bookId: 'book-1',
      contextKey: first.contextKey, contextId: first.contextId, studentId: first.studentId,
    }))?.phases.audit.status).toBe('succeeded');
  });

  it('does not reopen completed work and keeps the post-commit finalizer outside this executor', async () => {
    const alreadyCommitted = actionFor([operation('homework', 'completed', 1)], 'committed');
    const actions = new MemoryActions(alreadyCommitted);
    const history = { apply: vi.fn() } as unknown as BookRemovalHistoricalProjectionPort;
    const executor = createBookRemovalUpdateExecutor({
      actions,
      resolver: { resolve: vi.fn() },
      receipts: new InMemoryBookRemovalPhaseReceiptRepository(),
      history,
      exclusions: { apply: vi.fn() },
      completion: { recalculate: vi.fn() },
      audit: { record: vi.fn() },
      now: () => new Date(at),
    });
    await expect(executor.execute({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'replayed', action: { state: 'committed' } });
    expect(history.apply).not.toHaveBeenCalled();
  });

  it('rejects slash-bearing identities before action or receipt repository access', async () => {
    const actions = new MemoryActions(actionFor([operation('homework', 'submitted', 1)]));
    const read = vi.spyOn(actions, 'read');
    const executor = createBookRemovalUpdateExecutor({
      actions,
      resolver: { resolve: vi.fn() },
      receipts: new InMemoryBookRemovalPhaseReceiptRepository(),
      history: { apply: vi.fn() }, exclusions: { apply: vi.fn() },
      completion: { recalculate: vi.fn() }, audit: { record: vi.fn() },
    });
    await expect(executor.execute({ ownerId: 'teacher/other', actionId: 'action-1' }))
      .resolves.toEqual({ status: 'blocked', code: 'invalid-identity' });
    expect(read).not.toHaveBeenCalled();

    let fetches = 0;
    const repository = new FirebaseRestBookRemovalPhaseReceiptRepository({
      env: {
        FIREBASE_DB_URL: 'https://example.firebaseio.com',
        BOOK_UPDATE_REMOVAL_SERVICE_IDENTITY: 'book_update_action_service',
        BOOK_UPDATE_REMOVAL_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'book_update_action_service' }),
      },
      fetchImpl: async () => { fetches += 1; return new Response('{}'); },
    });
    await expect(repository.read({
      ownerId: 'teacher/other', actionId: 'action-1', bookId: 'book-1',
      contextKey: 'homework:homework-1', contextId: 'homework-1', studentId: 'student-1',
    })).resolves.toBeNull();
    expect(fetches).toBe(0);
  });

  it('keeps the new receipt path inactive, service-scoped, and denied at its ancestor', () => {
    const manifest = fragment41B as {
      status: string;
      owner: { serviceIdentity: string; generatedRuleLocations: string[] };
      operations: { path: string; rule: string; expression: string }[];
    };
    expect(manifest.status).toBe('inactive');
    expect(manifest.owner.serviceIdentity).toBe('book_update_action_service');
    expect(manifest.operations.find((entry) => entry.path.endsWith('removal_receipts') && entry.rule === '.read')?.expression).toBe('false');
    expect(manifest.operations.find((entry) => entry.path.endsWith('removal_receipts') && entry.rule === '.write')?.expression).toBe('false');
    const leaf = manifest.operations.find((entry) => entry.rule === '.write' && entry.path.includes('$studentId'))!;
    expect(leaf.expression).toMatch(/auth\.token\.bua/iu);
    expect(leaf.expression).toMatch(/!newData\.child\('history'\)\.exists\(\)/iu);
    expect(manifest.owner.generatedRuleLocations).toHaveLength(5);
  });

  it('delegates mixed or non-removal actions and never commits them as removal', async () => {
    const op = operation('homework', 'submitted', 1);
    const action = actionFor([op]);
    const mixed = { ...action, audit: { ...action.audit, classifications: ['removed', 'reordered'] } };
    const actions = new MemoryActions(mixed);
    const history = { apply: vi.fn() };
    const executor = createBookRemovalUpdateExecutor({
      actions, resolver: { resolve: vi.fn() }, receipts: new InMemoryBookRemovalPhaseReceiptRepository(),
      history, exclusions: { apply: vi.fn() }, completion: { recalculate: vi.fn() }, audit: { record: vi.fn() },
    });
    await expect(executor.execute({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'pending', code: 'delegate-other-update-case' });
    expect(history.apply).not.toHaveBeenCalled();
  });
});
