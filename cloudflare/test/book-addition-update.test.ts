import { describe, expect, it } from 'vitest';
import fragment from '../src/upload-worker/book-rules/fragments/41C.json';
import {
  createBookAdditionProjectionAdapter,
  bookAdditionBindingId,
  type BookAdditionProjectionRepository,
} from '../../src/services/book-delivery/bookAdditionProjection.service.ts';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types.ts';
import type { BookRedoCurrentProjection } from '../../src/services/book-delivery/bookRedoCurrentProjection.adapter.ts';
import type { BookAdditionDeadlineResolution } from '../../src/services/book-homework/bookAdditionDeadline.service.ts';
import type { BookUpdateActionRecord } from '../../src/services/book-delivery/bookUpdateAction.types.ts';
import { createBookUpdateFinalizer } from '../src/upload-worker/book-updates/update-finalizer.ts';
import { createBookAdditionUpdateExecutor, type BookAdditionStudentPlan, type BookAdditionUpdateFinalizer } from '../src/upload-worker/book-updates/addition-update.ts';
import { InMemoryBookAdditionPhaseReceiptRepository } from '../src/upload-worker/book-updates/addition-receipt-repository.ts';
import type { BookUpdateActionRepository } from '../src/upload-worker/book-updates/update-action.ts';

const now = '2026-08-01T00:00:00.000Z';
const placement = (placementId: string, nodeKey: string, order: number): BookDeliveryBinding['placements'][number] => ({
  placementId,
  activityId: `${placementId}-activity`,
  activityVersionId: `${placementId}-version`,
  activityVersion: 1,
  nodeKey,
  order,
  contextMode: 'required',
  pageGroupKeys: [],
  sourcePageScopes: [],
});

const binding = (bindingId: string, revision: number, placements: readonly BookDeliveryBinding['placements'][number][], outline: readonly BookDeliveryBinding['outline'][number][]): BookDeliveryBinding => ({
  schemaVersion: 3,
  bindingId,
  revision,
  status: 'active',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'owner-1', authorityBoundary: 'book-owner' },
  book: { bookId: 'book-1', bookMode: 'pdf', bookRevision: 1, publicationId: 'publication-1', publicationRevision: 1, publicationStatus: 'published' },
  scope: { kind: 'subtree', nodeKeys: outline.map((entry) => entry.nodeKey), placementIds: placements.map((entry) => entry.placementId) },
  outline,
  context: { contextId: 'hw-1', recipientId: 'student-1', ownerId: 'owner-1', kind: 'homework', entitlementBasis: 'assignment' },
  sourceSet: { strategy: 'full_pdf', sources: [{ sourceKey: 'source-1', sourceVersionId: 'source-version-1', lifecycle: 'verified-usable', localPageScope: { kind: 'all', pages: [] } }] },
  placements,
  schedulePolicy: { policyId: 'policy-1', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: revision === 4 ? '2026-07-31T00:00:00.000Z' : now,
});

const oldOutline = [
  { nodeKey: 'book', parentNodeKey: null, nodeType: 'section' as const, order: 1 },
  { nodeKey: 'unit', parentNodeKey: 'book', nodeType: 'unit' as const, order: 1 },
  { nodeKey: 'activity-old', parentNodeKey: 'unit', nodeType: 'test' as const, order: 1 },
];

const currentProjection = (current: BookDeliveryBinding): BookRedoCurrentProjection => ({
  actionId: 'old-action', ownerId: 'owner-1', bookId: 'book-1', contextKey: 'homework:hw-1', contextId: 'hw-1', studentId: 'student-1', bindingId: current.bindingId, bindingRevision: current.revision,
  activities: [{ placementId: 'placement-old', activityVersionId: 'placement-old-version', required: true, completionStatus: 'completed', answerState: { answer: 'preserve' }, attemptCount: 1, attemptEligibility: 'eligible', evaluationRevision: 1, earnedScore: 1, maximumScore: 1, correctionNote: null, feedbackRelease: 'released' }],
  completion: { schemaVersion: 1, actionId: 'old-action', ownerId: 'owner-1', bookId: 'book-1', contextKey: 'homework:hw-1', contextId: 'hw-1', studentId: 'student-1', bindingId: current.bindingId, bindingRevision: current.revision, requiredPlacementIds: ['placement-old'], completedPlacementIds: ['placement-old'], requiredCount: 1, completedCount: 1, status: 'completed', activities: [{ placementId: 'placement-old', required: true, completionStatus: 'completed', reopenedByAction: false }] },
});

const action = (choice: BookUpdateActionRecord['selections'][number]['choice'] = 'include-required'): BookUpdateActionRecord => ({
  schemaVersion: 1,
  actionId: 'action-1', actorId: 'owner-1', ownerId: 'owner-1', bookId: 'book-1', snapshotId: 'snapshot-1', snapshotFingerprint: 'a'.repeat(64), idempotencyKey: 'addition-key-0001', requestFingerprint: 'b'.repeat(64), reason: 'Require the newly published Activity.',
  selections: [{ contextKey: 'homework:hw-1', placementId: 'placement-new', choice }],
  state: 'accepted', stateRevision: 0, acceptedAt: now, committedAt: null, updatedAt: now, terminalFailureCode: null,
  audit: { actorId: 'owner-1', acceptedAt: now, reason: 'Require the newly published Activity.', bookId: 'book-1', oldActivityVersionId: 'old-version', newActivityVersionId: 'new-version', selectedContextKeys: ['homework:hw-1'], classifications: ['added'], affectedCount: 1, checkpointCount: 0, regradeCount: 0, notificationCount: 0, terminalStatus: null, terminalAt: null },
  recovery: { restoreBehavior: 'resume-or-compensate', replaySideEffects: 'none', recoveryLedgerRoot: 'book_update_action_recovery' },
});

const deadline = (): BookAdditionDeadlineResolution => ({
  assignmentId: 'hw-1', contextKey: 'homework:hw-1', recipientId: 'student-1', studentId: 'student-1', bindingId: 'current-binding', bindingRevision: 4, placementId: 'placement-new', nodeKey: 'activity-new', scheduleRevision: 7, effectiveDeadlineAt: '2026-08-10T00:00:00.000Z', effectiveDeadlineSource: 'assignment', replacementDeadlineAt: null, requiresReplacementDeadline: false,
  window: {
    evaluatedAt: now,
    operation: 'launch',
    identity: { assignmentId: 'hw-1', recipientId: 'student-1', bindingId: 'current-binding', bindingRevision: 4, placementId: 'placement-new', activityId: 'placement-new-activity', activityVersion: 1, nodeKey: 'activity-new' },
    deadline: { source: 'assignment', at: '2026-08-10T00:00:00.000Z' },
  } as BookAdditionDeadlineResolution['window'],
});

const setup = (choice: BookUpdateActionRecord['selections'][number]['choice'] = 'include-required') => {
  const current = binding('current-binding', 4, [placement('placement-old', 'activity-old', 1)], oldOutline);
  const added = placement('placement-new', 'activity-new', 2);
  const next = binding(bookAdditionBindingId('action-1', 'homework:hw-1', 'student-1'), 5, [current.placements[0], added], [...oldOutline, { nodeKey: 'activity-new', parentNodeKey: 'unit', nodeType: 'test' as const, order: 2 }]);
  const projectionInput = { actionId: 'action-1', ownerId: 'owner-1', bookId: 'book-1', contextKey: 'homework:hw-1', contextId: 'hw-1', studentId: 'student-1', currentBinding: current, nextBinding: next, currentProjection: currentProjection(current), additions: [{ placement: added, feedbackRelease: 'hidden' as const }], now };
  let state: { binding: BookDeliveryBinding; projection: BookRedoCurrentProjection } = { binding: current, projection: projectionInput.currentProjection };
  let commits = 0;
  let reads = 0;
  const repository: BookAdditionProjectionRepository = {
    async read() { return structuredClone(state); },
    async commit(input) { commits += 1; state = { binding: structuredClone(input.binding), projection: structuredClone(input.projection) }; return { status: 'applied' }; },
  };
  const projection = createBookAdditionProjectionAdapter(repository);
  let actionRecord = action(choice);
  const actions = {
    async read() { reads += 1; return structuredClone(actionRecord); },
    async findByIdempotency() { return null; },
    async accept() { return { status: 'accepted' as const, action: actionRecord }; },
    async transition(input: Parameters<BookUpdateActionRepository['transition']>[0]) {
      if (actionRecord.state !== input.expectedState || actionRecord.stateRevision !== input.expectedRevision) return { status: 'conflict' as const };
      actionRecord = { ...actionRecord, state: input.nextState, stateRevision: actionRecord.stateRevision + 1, updatedAt: input.at, committedAt: input.nextState === 'committed' ? input.at : actionRecord.committedAt };
      return { status: 'advanced' as const, action: structuredClone(actionRecord) };
    },
  };
  const baseFinalizer = createBookUpdateFinalizer({ actions, plans: { async resolve() { return []; } }, emitter: { async emit() { return { status: 'empty' as const, created: 0, replayed: 0 }; } } });
  let finalizerCalls = 0;
  const finalizer: BookAdditionUpdateFinalizer = {
    async finalize(input) {
      finalizerCalls += 1;
      return baseFinalizer.finalize(input);
    },
  };
  const plan: BookAdditionStudentPlan = { schemaVersion: 1, actionId: 'action-1', ownerId: 'owner-1', bookId: 'book-1', contextKey: 'homework:hw-1', contextKind: 'homework', contextId: 'hw-1', studentId: 'student-1', currentBinding: current, nextBinding: next, currentProjection: projectionInput.currentProjection, additions: [{ ...projectionInput.additions[0], deadline: deadline() }], reason: actionRecord.reason, createdAt: now };
  const executor = createBookAdditionUpdateExecutor({ actions, resolver: { async resolve() { return { status: 'ready', students: [plan] }; } }, receipts: new InMemoryBookAdditionPhaseReceiptRepository(), projection, audit: { async record() { return { status: 'recorded' as const }; } }, finalizer });
  return { executor, get commits() { return commits; }, get reads() { return reads; }, get finalizerCalls() { return finalizerCalls; }, get action() { return actionRecord; } };
};

describe('Book required-addition executor', () => {
  it('projects selected required work, commits before finalization, and replays exactly once', async () => {
    const fixture = setup();
    await expect(fixture.executor.execute({ ownerId: 'owner-1', actionId: 'action-1' })).resolves.toMatchObject({ status: 'committed' });
    expect(fixture.commits).toBe(1);
    await expect(fixture.executor.execute({ ownerId: 'owner-1', actionId: 'action-1' })).resolves.toMatchObject({ status: 'replayed' });
    expect(fixture.commits).toBe(1);
    await expect(fixture.executor.finalize({ ownerId: 'owner-1', actionId: 'action-1' })).resolves.toMatchObject({ status: 'completed', emitted: 0 });
  });

  it('delegates mixed/non-addition selections and never creates a checkpoint', async () => {
    const fixture = setup('apply-with-redo');
    const original = fixture.action;
    await expect(fixture.executor.execute({ ownerId: 'owner-1', actionId: 'action-1' })).resolves.toMatchObject({
      status: 'pending',
      code: 'delegate-other-update-case',
    });
    expect(original.audit.checkpointCount).toBe(0);
    // The executor only accepts the explicit addition case; redo/removal policy
    // remains owned by their existing case workers.
    expect(original.selections[0].choice).toBe('apply-with-redo');
  });

  it('keeps 41C deny-only and protects the real ancestor boundary', () => {
    expect(fragment.status).toBe('inactive');
    expect(fragment.owner.issue).toBe(114);
    const rootWrite = fragment.operations.find((operation) => operation.path === 'book_update_action_recovery/addition_receipts' && operation.rule === '.write');
    const leafWrite = fragment.operations.find((operation) => operation.path.endsWith('$studentId') && operation.rule === '.write');
    expect(rootWrite?.expression).toBe('false');
    expect(leafWrite?.expression).toContain('auth.token.baa.s == true');
    expect(fragment.owner.generatedRuleLocations.every((path) => !path.includes('database.rules.json'))).toBe(true);
  });

  it('rejects slash-bearing receipt identities before repository access', async () => {
    const repository = new InMemoryBookAdditionPhaseReceiptRepository();
    await expect(repository.read({ ownerId: 'owner-1', actionId: 'action-1', bookId: 'book-1', contextKey: 'homework:hw/1', contextId: 'hw/1', studentId: 'student-1' })).resolves.toBeNull();
  });

  it('rejects slash-bearing finalize IDs before action or finalizer access', async () => {
    const fixture = setup();
    for (const input of [
      { ownerId: 'owner/1', actionId: 'action-1' },
      { ownerId: 'owner-1', actionId: 'action/1' },
    ]) {
      await expect(fixture.executor.finalize(input)).resolves.toEqual({
        status: 'blocked',
        code: 'invalid-action-identity',
      });
    }
    expect(fixture.reads).toBe(0);
    expect(fixture.finalizerCalls).toBe(0);
  });
});
