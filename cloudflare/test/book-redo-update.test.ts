import { describe, expect, it } from 'vitest';
import {
  createBookRedoUpdateExecutor,
  type BookRedoBindingPort,
  type BookRedoUpdateFinalizer,
} from '../src/upload-worker/book-updates/redo-update.ts';
import {
  createBookRedoCheckpointApplier,
  type BookRedoCheckpointRepository,
} from '../src/upload-worker/book-updates/redo-checkpoint-apply.ts';
import {
  InMemoryBookRedoPhaseReceiptRepository,
} from '../src/upload-worker/book-updates/redo-receipt-repository.ts';
import {
  transitionBookUpdateActionRecord,
  type BookUpdateActionRepository,
} from '../src/upload-worker/book-updates/update-action.ts';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types';
import type {
  BookRedoCurrentProjectionPort,
  BookRedoStudentPlan,
} from '../../src/services/book-delivery/bookRedoUpdate.types';
import {
  createBookRedoCurrentProjectionAdapter,
  type BookRedoCurrentProjection,
} from '../../src/services/book-delivery/bookRedoCurrentProjection.adapter';
import type { BookRedoCheckpoint } from '../../src/services/book-activity/bookRedoCheckpointProjection.service';
import type { BookUpdateActionRecord } from '../../src/services/book-delivery/bookUpdateAction.types';
import fragment from '../src/upload-worker/book-rules/fragments/40B.json';

const NOW = '2026-08-10T09:00:00.000Z';

const binding = (update: Partial<BookDeliveryBinding> = {}): BookDeliveryBinding => ({
  schemaVersion: 3,
  bindingId: 'binding-old',
  revision: 3,
  status: 'active',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'owner-1', authorityBoundary: 'book-owner' },
  book: {
    bookId: 'book-1', bookMode: 'pdf', bookRevision: 1,
    publicationId: 'publication-1', publicationRevision: 1, publicationStatus: 'published',
  },
  scope: { kind: 'placements', nodeKeys: ['node-1'], placementIds: ['placement-1', 'placement-2'] },
  outline: [],
  context: {
    contextId: 'homework-1', recipientId: 'student-1', ownerId: 'owner-1',
    kind: 'homework', entitlementBasis: 'assignment',
  },
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{ sourceKey: 'source-1', sourceVersionId: 'source-version-1', lifecycle: 'verified-usable', localPageScope: { kind: 'all', pages: [] } }],
  },
  placements: [
    {
      placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'old-version-1', activityVersion: 1,
      nodeKey: 'node-1', order: 0, contextMode: 'required', pageGroupKeys: [], sourcePageScopes: [],
    },
    {
      placementId: 'placement-2', activityId: 'activity-2', activityVersionId: 'old-version-2', activityVersion: 1,
      nodeKey: 'node-1', order: 1, contextMode: 'required', pageGroupKeys: [], sourcePageScopes: [],
    },
  ],
  schedulePolicy: { policyId: 'policy-1', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: NOW,
  ...update,
});

const action = (state: BookUpdateActionRecord['state'] = 'accepted'): BookUpdateActionRecord => ({
  schemaVersion: 1,
  actionId: 'action-1', actorId: 'owner-1', ownerId: 'owner-1', bookId: 'book-1',
  snapshotId: 'snapshot-1', snapshotFingerprint: 'a'.repeat(64), idempotencyKey: 'redo-key-0001',
  requestFingerprint: 'b'.repeat(64), reason: 'Replace the activity',
  selections: [
    { contextKey: 'homework:1', placementId: 'placement-1', choice: 'apply-with-redo' },
    { contextKey: 'homework:1', placementId: 'placement-2', choice: 'apply-with-redo' },
  ],
  state,
  stateRevision: state === 'accepted' ? 0 : 1,
  acceptedAt: NOW,
  committedAt: state === 'committed' ? NOW : null,
  updatedAt: NOW,
  terminalFailureCode: null,
  audit: {
    actorId: 'owner-1', acceptedAt: NOW, reason: 'Replace the activity', bookId: 'book-1',
    oldActivityVersionId: 'old-version-1', newActivityVersionId: 'new-version-1',
    selectedContextKeys: ['homework:1'], classifications: ['redo-required'], affectedCount: 1,
    checkpointCount: 1, regradeCount: 0, notificationCount: 1, terminalStatus: null, terminalAt: null,
  },
  recovery: { restoreBehavior: 'resume-or-compensate', replaySideEffects: 'none', recoveryLedgerRoot: 'book_update_action_recovery' },
});

const plan = (): BookRedoStudentPlan => {
  const current = binding();
  const next = binding({
    bindingId: 'redo:action-1:homework:1:student-1',
    revision: 4,
    createdAt: NOW,
    placements: current.placements.map((placement) => ({
      ...placement,
      activityVersionId: placement.placementId === 'placement-1' ? 'new-version-1' : 'new-version-2',
      activityVersion: 2,
    })),
  });
  return {
    schemaVersion: 1,
    actionId: 'action-1', ownerId: 'owner-1', bookId: 'book-1',
    contextKey: 'homework:1', contextId: 'homework-1', contextKind: 'homework', studentId: 'student-1',
    currentBinding: current, nextBinding: next,
    activities: [
      {
        contextKey: 'homework:1', contextId: 'homework-1', contextKind: 'homework',
        placementId: 'placement-1', activityId: 'activity-1', oldActivityVersionId: 'old-version-1',
        oldSourceVersionIds: ['source-version-1'], lifecycle: 'in-progress', priorAnswer: { answer: 'old' },
        priorResult: { status: 'graded', score: { earnedScore: 1, maximumScore: 2, displayScore: '1/2' } },
        feedbackRelease: 'hidden', changed: true, required: true, newActivityVersion: 2,
      },
      {
        contextKey: 'homework:1', contextId: 'homework-1', contextKind: 'homework',
        placementId: 'placement-2', activityId: 'activity-2', oldActivityVersionId: 'old-version-2',
        oldSourceVersionIds: ['source-version-1'], lifecycle: 'not-started', priorAnswer: null,
        feedbackRelease: 'hidden', changed: true, required: true, newActivityVersion: 2,
      },
    ],
    reason: 'Replace the activity', createdAt: NOW,
  };
};

class MemoryActionRepository implements BookUpdateActionRepository {
  constructor(public record: BookUpdateActionRecord) {}

  async accept(record: BookUpdateActionRecord) { return { status: 'accepted' as const, action: record }; }

  async findByIdempotency() { return null; }

  async read(ownerId: string, actionId: string) {
    return this.record.ownerId === ownerId && this.record.actionId === actionId
      ? structuredClone(this.record)
      : null;
  }

  async transition(input: Parameters<BookUpdateActionRepository['transition']>[0]) {
    if (this.record.ownerId !== input.ownerId || this.record.actionId !== input.actionId) return { status: 'missing' as const };
    if (this.record.state !== input.expectedState || this.record.stateRevision !== input.expectedRevision) return { status: 'conflict' as const };
    this.record = transitionBookUpdateActionRecord(this.record, input.nextState, input.at, input.terminalFailureCode);
    return { status: 'advanced' as const, action: structuredClone(this.record) };
  }
}

const harness = (overrides: {
  readonly failCurrentOnce?: { value: boolean };
  readonly failAuditOnce?: { value: boolean };
  readonly staleCurrent?: boolean;
} = {}) => {
  const actions = new MemoryActionRepository(action());
  const checkpointRecords = new Map<string, BookRedoCheckpoint>();
  const checkpointRepository: BookRedoCheckpointRepository = {
    async read(input) { return structuredClone(checkpointRecords.get(`${input.ownerId}:${input.checkpointId}`) ?? null); },
    async create(checkpoint) {
      const key = `${checkpoint.ownerId}:${checkpoint.checkpointId}`;
      const existing = checkpointRecords.get(key);
      if (existing) return { status: JSON.stringify(existing) === JSON.stringify(checkpoint) ? 'replayed' as const : 'conflict' as const, checkpoint: existing };
      checkpointRecords.set(key, structuredClone(checkpoint));
      return { status: 'created' as const, checkpoint };
    },
  };
  const checkpoints = createBookRedoCheckpointApplier({ repository: checkpointRepository });
  const currentPlan = plan();
  let bindingState = currentPlan.currentBinding;
  const currentProjection: BookRedoCurrentProjection = {
    actionId: 'previous-action', ownerId: 'owner-1', bookId: 'book-1', contextKey: 'homework:1', contextId: 'homework-1', studentId: 'student-1',
    bindingId: currentPlan.currentBinding.bindingId, bindingRevision: currentPlan.currentBinding.revision,
    activities: [
      {
        placementId: 'placement-1', activityVersionId: 'old-version-1', required: true, completionStatus: 'in-progress', answerState: { answer: 'old' },
        attemptCount: 1, attemptEligibility: 'eligible', evaluationRevision: 1, earnedScore: 1, maximumScore: 2, correctionNote: null, feedbackRelease: 'hidden',
      },
      {
        placementId: 'placement-2', activityVersionId: 'old-version-2', required: true, completionStatus: 'not-started', answerState: null,
        attemptCount: 0, attemptEligibility: 'eligible', evaluationRevision: 0, earnedScore: null, maximumScore: null, correctionNote: null, feedbackRelease: 'hidden',
      },
    ],
    completion: {
      schemaVersion: 1, actionId: 'previous-action', ownerId: 'owner-1', bookId: 'book-1', contextKey: 'homework:1', contextId: 'homework-1', studentId: 'student-1',
      bindingId: currentPlan.currentBinding.bindingId, bindingRevision: currentPlan.currentBinding.revision,
      requiredPlacementIds: ['placement-1', 'placement-2'], completedPlacementIds: [], requiredCount: 2, completedCount: 0, status: 'in-progress', activities: [],
    },
  };
  let currentState = structuredClone(currentProjection);
  let bindingCalls = 0;
  let currentCalls = 0;
  let auditCalls = 0;
  const bindings = {
    async apply(input: Parameters<BookRedoBindingPort['apply']>[0]) {
      if (bindingState.bindingId === currentPlan.nextBinding.bindingId) return { status: 'replayed' as const, binding: currentPlan.nextBinding };
      if (bindingState.bindingId !== input.current.bindingId || bindingState.revision !== input.current.revision) return { status: 'conflict' as const, code: 'binding-revision-stale' };
      bindingState = structuredClone(input.next);
      bindingCalls += 1;
      return { status: 'applied' as const, binding: input.next };
    },
  };
  const current: BookRedoCurrentProjectionPort = {
    async apply(input) {
      currentCalls += 1;
      if (overrides.failCurrentOnce?.value) {
        overrides.failCurrentOnce.value = false;
        throw new Error('crash-after-binding');
      }
      if (overrides.staleCurrent) return { status: 'conflict' as const };
      if (currentState.bindingId !== input.previousBindingId && currentState.bindingId !== input.bindingId) return { status: 'conflict' as const };
      currentState = {
        ...currentState,
        actionId: input.actionId,
        bindingId: input.bindingId,
        bindingRevision: input.bindingRevision,
        activities: currentState.activities.map((activity) => input.selectedPlacementIds.includes(activity.placementId)
          ? { ...activity, activityVersionId: input.nextActivityVersionIds[activity.placementId]!, completionStatus: 'not-started', answerState: null, attemptCount: 0, evaluationRevision: 0, earnedScore: null, maximumScore: null, correctionNote: null }
          : activity),
      };
      return { status: 'applied' as const, visibility: 'new' as const, completionStatus: 'in-progress' as const };
    },
  };
  const audit = {
    async record() {
      auditCalls += 1;
      if (overrides.failAuditOnce?.value) {
        overrides.failAuditOnce.value = false;
        throw new Error('crash-after-completion');
      }
      return { status: 'recorded' as const };
    },
  };
  const finalizerCalls = { value: 0 };
  const finalizer: BookRedoUpdateFinalizer = {
    async finalize() {
      finalizerCalls.value += 1;
      return { status: 'completed' as const, action: actions.record, emitted: 0, replayed: 0 };
    },
  };
  const executor = createBookRedoUpdateExecutor({
    actions,
    resolver: { async resolve() { return { status: 'ready' as const, students: [currentPlan] }; } },
    receipts: new InMemoryBookRedoPhaseReceiptRepository(),
    checkpoints,
    bindings,
    current,
    audit,
    finalizer,
    now: () => new Date(NOW),
  });
  return { executor, actions, checkpointRecords, finalizerCalls, counts: () => ({ bindingCalls, currentCalls, auditCalls }), currentPlan };
};

describe('book redo update executor', () => {
  it('seals affected started work once, resets new authority, and commits before finalization', async () => {
    const current = harness();
    await expect(current.executor.finalize({ ownerId: 'owner-1', actionId: 'action-1' })).resolves.toMatchObject({ status: 'blocked', code: 'action-not-committed' });
    expect(current.finalizerCalls.value).toBe(0);
    const result = await current.executor.execute({ ownerId: 'owner-1', actionId: 'action-1' });
    expect(result.status).toBe('committed');
    expect(current.actions.record.state).toBe('committed');
    expect(current.checkpointRecords.size).toBe(1);
    expect([...current.checkpointRecords.values()][0]?.activities).toHaveLength(1);
    await expect(current.executor.finalize({ ownerId: 'owner-1', actionId: 'action-1' })).resolves.toMatchObject({ status: 'completed' });
    expect(current.finalizerCalls.value).toBe(1);
  });

  it('resumes after checkpoint/binding and audit failures without duplicate effects', async () => {
    const current = harness({ failCurrentOnce: { value: true }, failAuditOnce: { value: true } });
    await expect(current.executor.execute({ ownerId: 'owner-1', actionId: 'action-1' })).resolves.toMatchObject({ status: 'pending', code: 'redo-exclusion-apply-failed' });
    expect(current.actions.record.state).toBe('applying');
    await expect(current.executor.execute({ ownerId: 'owner-1', actionId: 'action-1' })).resolves.toMatchObject({ status: 'pending', code: 'audit-apply-failed' });
    const beforeReplay = current.counts();
    expect(beforeReplay.currentCalls).toBe(1);
    await expect(current.executor.execute({ ownerId: 'owner-1', actionId: 'action-1' })).resolves.toMatchObject({ status: 'committed' });
    expect(current.actions.record.state).toBe('committed');
    expect(current.checkpointRecords.size).toBe(1);
    expect(current.counts().currentCalls).toBe(1);
    expect(current.counts().bindingCalls).toBe(1);
    expect(current.counts().auditCalls).toBe(2);
  });

  it('keeps the action applying when the current binding revision is stale', async () => {
    const current = harness({ staleCurrent: true });
    const result = await current.executor.execute({ ownerId: 'owner-1', actionId: 'action-1' });
    expect(result).toMatchObject({ status: 'pending', code: 'binding-revision-stale' });
    expect(current.actions.record.state).toBe('applying');
    expect(current.finalizerCalls.value).toBe(0);
  });

  it('sets new action provenance and preserves it across safe replay', async () => {
    let projection: BookRedoCurrentProjection = {
      actionId: 'previous-action', ownerId: 'owner-1', bookId: 'book-1', contextKey: 'homework:1', contextId: 'homework-1', studentId: 'student-1',
      bindingId: 'binding-old', bindingRevision: 3,
      activities: [{
        placementId: 'placement-1', activityVersionId: 'old-version-1', required: true, completionStatus: 'in-progress',
        answerState: { answer: 'old-answer' }, attemptCount: 1, attemptEligibility: 'eligible', evaluationRevision: 1,
        earnedScore: null, maximumScore: null, correctionNote: null, feedbackRelease: 'hidden',
      }],
      completion: {
        schemaVersion: 1, actionId: 'previous-action', ownerId: 'owner-1', bookId: 'book-1', contextKey: 'homework:1', contextId: 'homework-1', studentId: 'student-1',
        bindingId: 'binding-old', bindingRevision: 3,
        requiredPlacementIds: ['placement-1'], completedPlacementIds: [], requiredCount: 1, completedCount: 0, status: 'in-progress', activities: [],
      },
    };
    let commitCalls = 0;
    const adapter = createBookRedoCurrentProjectionAdapter({
      async read() { return structuredClone(projection); },
      async commit(input) {
        commitCalls += 1;
        projection = structuredClone(input.projection);
        return { status: 'applied' as const };
      },
    });
    const input = {
      operationId: 'action-1:redo:homework:1:homework-1:student-1:redo-exclusion',
      actionId: 'action-1', ownerId: 'owner-1', bookId: 'book-1', contextKey: 'homework:1', contextId: 'homework-1', studentId: 'student-1',
      bindingId: 'redo:action-1:homework:1:student-1', bindingRevision: 4,
      previousBindingId: 'binding-old', previousBindingRevision: 3,
      selectedPlacementIds: ['placement-1'], nextActivityVersionIds: { 'placement-1': 'new-version-1' },
    } as const;
    await expect(adapter.apply(input)).resolves.toMatchObject({ status: 'applied' });
    expect(projection.actionId).toBe('action-1');
    expect(projection.completion.actionId).toBe('action-1');
    projection = {
      ...projection,
      activities: projection.activities.map((activity) => ({
        ...activity,
        answerState: { answer: 'new-authority-answer' },
        attemptCount: 1,
      })),
    };
    await expect(adapter.apply(input)).resolves.toMatchObject({
      status: 'replayed',
      projection: { actionId: 'action-1', activities: [{ answerState: { answer: 'new-authority-answer' } }] },
    });
    expect(commitCalls).toBe(1);
    projection = { ...projection, actionId: 'different-action' };
    await expect(adapter.apply(input)).resolves.toMatchObject({
      status: 'conflict',
      code: 'current-projection-replay-mismatch',
    });
  });

  it('keeps the inactive 40B producer contract deny-only above exact service paths', () => {
    const operations = fragment.operations as readonly {
      readonly path: string;
      readonly rule: string;
      readonly expression: string;
    }[];
    expect(fragment.status).toBe('inactive');
    expect(operations.find((operation) => operation.path === 'book_update_checkpoints' && operation.rule === '.write')?.expression)
      .toBe('false');
    expect(operations.find((operation) => operation.path === 'book_update_redo' && operation.rule === '.write')?.expression)
      .toBe('false');
    const exactWrites = operations.filter((operation) => operation.rule === '.write' && operation.expression !== 'false');
    expect(exactWrites.length).toBeGreaterThan(0);
    expect(exactWrites.every((operation) => operation.expression.includes('auth.token.brd.s == true'))).toBe(true);
    expect(exactWrites.every((operation) => !operation.expression.includes('auth.uid'))).toBe(true);
    expect(exactWrites.some((operation) => operation.expression.includes("!newData.child('pdfAuthority').exists()"))).toBe(true);
    expect(exactWrites.some((operation) => operation.expression.includes("!newData.child('currentGrade').exists()"))).toBe(true);
  });
});
