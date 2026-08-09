import { describe, expect, it, vi } from 'vitest';
import {
  createBookNonRedoUpdateExecutor,
  type BookNonRedoUpdateResolver,
} from '../../../cloudflare/src/upload-worker/book-updates/non-redo-update';
import {
  transitionBookUpdateActionRecord,
  type BookUpdateActionRepository,
} from '../../../cloudflare/src/upload-worker/book-updates/update-action';
import type { BookUpdateActionRecord } from './bookUpdateAction.types';
import type {
  BookNonRedoUpdateGradingPort,
  BookNonRedoUpdateOperation,
  BookNonRedoUpdateProjectionPort,
} from './bookNonRedoUpdate.types';

const hash = (character: string) => character.repeat(64);

const action = (operations: readonly BookNonRedoUpdateOperation[]): BookUpdateActionRecord => ({
  schemaVersion: 1,
  actionId: 'action-1', actorId: 'teacher-1', ownerId: 'teacher-1', bookId: 'book-1',
  snapshotId: 'snapshot-1', snapshotFingerprint: hash('a'), idempotencyKey: 'operation-1',
  requestFingerprint: hash('b'), reason: 'Reviewed non-redo update',
  selections: operations.map((operation) => ({
    contextKey: operation.contextKey,
    placementId: operation.placementId,
    choice: operation.choice,
  })),
  state: 'accepted', stateRevision: 0,
  acceptedAt: '2026-08-10T00:00:00.000Z', committedAt: null,
  updatedAt: '2026-08-10T00:00:00.000Z', terminalFailureCode: null,
  audit: {
    actorId: 'teacher-1', acceptedAt: '2026-08-10T00:00:00.000Z', reason: 'Reviewed non-redo update',
    bookId: 'book-1', oldActivityVersionId: 'activity-v1', newActivityVersionId: 'activity-v2',
    selectedContextKeys: [...new Set(operations.map((operation) => operation.contextKey))],
    classifications: [...new Set(operations.map((operation) => (
      operation.kind === 'display-only' ? 'display-only'
        : operation.kind === 'reorder' ? 'reordered'
          : operation.kind === 'regrade-objective' || operation.kind === 'regrade-rubric-review' ? 'regrade'
            : 'moved'
    )))],
    affectedCount: operations.length, checkpointCount: 0, regradeCount: 0, notificationCount: 0,
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
  async read() { return this.action; }
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

const display = (
  contextKind: 'solo' | 'homework' | 'course' | 'class' = 'homework',
  lifecycle: 'not-started' | 'in-progress' | 'submitted' | 'completed' = 'in-progress',
  index = 1,
): BookNonRedoUpdateOperation => ({
  kind: 'display-only', contextKey: `${contextKind}:${contextKind}-${index}`, contextKind, lifecycle,
  placementId: `placement-${index}`, activityId: 'activity-1',
  oldActivityVersionId: 'activity-v1', newActivityVersionId: 'activity-v2',
  choice: 'apply-without-redo', displayFingerprint: hash('c'), studentVisibleChange: true,
});

const evaluationTarget = (contextKind: 'solo' | 'homework' | 'course' | 'class' = 'homework') => ({
  attemptId: 'attempt-1', resultId: 'attempt-1:result', recipientId: 'student-1',
  bindingId: 'binding-1', bindingRevision: 1, contextKind, contextId: `${contextKind}-1`,
  placementId: 'placement-1', activityId: 'activity-1', activityVersion: 1,
  interactionId: 'interaction-1', activityVersionId: 'activity-v1', attemptNumber: 1,
  pageGroupKeys: ['page-1'], sourceProvenance: [],
});

const resolver = (operations: readonly BookNonRedoUpdateOperation[]): BookNonRedoUpdateResolver => ({
  resolve: vi.fn(async () => ({ status: 'ready' as const, operations })),
});

const grading = (): BookNonRedoUpdateGradingPort => ({
  regradeObjective: vi.fn(async () => ({ status: 'applied' as const })),
  queueRubricReview: vi.fn(async () => ({ status: 'queued' as const })),
});

describe('#112 non-redo update executor', () => {
  it('applies display-only across lifecycle/context fixtures without any answer, checkpoint, or eligibility write surface', async () => {
    const contexts = ['solo', 'homework', 'course', 'class'] as const;
    const lifecycles = ['not-started', 'in-progress', 'submitted', 'completed'] as const;
    const operations = contexts.flatMap((contextKind, contextIndex) => lifecycles.map(
      (lifecycle, lifecycleIndex) => display(contextKind, lifecycle, contextIndex * 4 + lifecycleIndex + 1),
    ));
    const actions = new MemoryActions(action(operations));
    const apply = vi.fn(async () => ({ status: 'applied' as const }));
    const executor = createBookNonRedoUpdateExecutor({
      actions, resolver: resolver(operations), projections: { apply }, grading: grading(),
      now: () => new Date('2026-08-10T00:01:00.000Z'),
    });
    await expect(executor.execute({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'committed', action: { committedAt: '2026-08-10T00:01:00.000Z' } });
    expect(apply).toHaveBeenCalledTimes(16);
    expect(JSON.stringify(apply.mock.calls)).not.toMatch(/answer|checkpoint|completion|eligibility|attemptCount/iu);
  });

  it('reorders and retained-moves only projection identity/order/schedule, then replays the committed action', async () => {
    const operations: BookNonRedoUpdateOperation[] = [{
      ...display(), kind: 'reorder', order: 4,
    }, {
      ...display('course', 'completed', 2), kind: 'move-retained', parentRef: 'module-2', order: 1,
      scheduleFingerprint: hash('d'),
    }];
    const actions = new MemoryActions(action(operations));
    const seen = new Set<string>();
    const projections: BookNonRedoUpdateProjectionPort = {
      apply: vi.fn(async ({ operationId }) => {
        const replayed = seen.has(operationId);
        seen.add(operationId);
        return { status: replayed ? 'replayed' as const : 'applied' as const };
      }),
    };
    const executor = createBookNonRedoUpdateExecutor({
      actions, resolver: resolver(operations), projections, grading: grading(),
      now: () => new Date('2026-08-10T00:01:00.000Z'),
    });
    await expect(executor.execute({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'committed' });
    await expect(executor.execute({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'replayed' });
    expect(projections.apply).toHaveBeenCalledTimes(2);
  });

  it('appends objective regrade history but queues rubric review without automatic score mutation', async () => {
    const operations: BookNonRedoUpdateOperation[] = [{
      ...display(), kind: 'regrade-objective', evaluationTarget: evaluationTarget(), expectedEvaluationRevision: 2,
    }, {
      ...display('class', 'submitted', 2), kind: 'regrade-rubric-review',
      evaluationTarget: { ...evaluationTarget('class'), contextId: 'class-2', placementId: 'placement-2' },
      expectedEvaluationRevision: 3,
    }];
    const actions = new MemoryActions(action(operations));
    const gradingPort = grading();
    const projections = { apply: vi.fn() };
    const executor = createBookNonRedoUpdateExecutor({
      actions, resolver: resolver(operations), projections, grading: gradingPort,
      now: () => new Date('2026-08-10T00:01:00.000Z'),
    });
    await expect(executor.execute({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'committed' });
    expect(gradingPort.regradeObjective).toHaveBeenCalledOnce();
    expect(gradingPort.queueRubricReview).toHaveBeenCalledOnce();
    expect(projections.apply).not.toHaveBeenCalled();
  });

  it('keeps stale/unsupported/partial work retryable and delegates moved-out/in semantics', async () => {
    const objective = {
      ...display(), kind: 'regrade-objective' as const,
      evaluationTarget: evaluationTarget(), expectedEvaluationRevision: 2,
    };
    const staleActions = new MemoryActions(action([objective]));
    const staleExecutor = createBookNonRedoUpdateExecutor({
      actions: staleActions, resolver: resolver([objective]), projections: { apply: vi.fn() },
      grading: { ...grading(), regradeObjective: vi.fn(async () => ({ status: 'stale' as const })) },
      now: () => new Date('2026-08-10T00:01:00.000Z'),
    });
    await expect(staleExecutor.execute({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'pending', code: 'objective-regrade-stale' });
    expect(staleActions.action.state).toBe('applying');

    const unsupportedActions = new MemoryActions(action([objective]));
    await expect(createBookNonRedoUpdateExecutor({
      actions: unsupportedActions,
      resolver: resolver([objective]),
      projections: { apply: vi.fn() },
      grading: { ...grading(), regradeObjective: vi.fn(async () => ({ status: 'unsupported' as const })) },
      now: () => new Date('2026-08-10T00:01:00.000Z'),
    }).execute({ ownerId: 'teacher-1', actionId: 'action-1' }))
      .resolves.toMatchObject({ status: 'pending', code: 'objective-regrade-unsupported' });

    for (const kind of ['move-out', 'move-in'] as const) {
      const operation = {
        ...display(), kind,
        choice: kind === 'move-out' ? 'remove-from-current' as const : 'include-required' as const,
      } as BookNonRedoUpdateOperation;
      const actions = new MemoryActions(action([operation]));
      await expect(createBookNonRedoUpdateExecutor({
        actions, resolver: resolver([operation]), projections: { apply: vi.fn() }, grading: grading(),
        now: () => new Date('2026-08-10T00:01:00.000Z'),
      }).execute({ ownerId: 'teacher-1', actionId: 'action-1' }))
        .resolves.toMatchObject({
          status: 'pending', code: kind === 'move-out' ? 'delegate-removal-case' : 'delegate-addition-case',
        });
    }
  });
});
