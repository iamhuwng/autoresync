import { describe, expect, it } from 'vitest';
import {
  prepareBookRuntimeRestore,
  persistBookRuntimeRecovery,
  rebuildBookRuntimeProjections,
} from './book-runtime-restore';
import { createBookRuntimeRecoveryAdapter, InMemoryBookRuntimeRecoveryProjectionStore } from '../../../src/services/book-activity/bookRuntime.recovery';
import { makeBookDeliveryTestBinding } from '../../../cloudflare/test/book-delivery.fixture';

const now = '2026-07-27T00:00:00.000Z';

const binding = () => {
  const source = makeBookDeliveryTestBinding() as any;
  return {
    ...source,
    bindingId: 'binding-1',
    status: 'active',
    recipient: { recipientId: 'student-1', recipientKind: 'student' },
    context: { kind: 'homework', contextId: 'homework-1', recipientId: 'student-1', ownerId: 'teacher-1', entitlementBasis: 'assignment' },
  };
};

const sourceAuthorities = new Map([['source-v1', {
  accountId: 'account-1', reservationId: 'reservation-1', bookId: 'book-pdf-1', sourceVersionId: 'source-v1', sourceKey: 'full', ownerId: 'teacher-1', operationKind: 'upload' as const,
  storage: {} as never, available: true,
}]]);

const inventory = (runtimeOverrides: Record<string, unknown> = {}) => {
  const terminalIdentity = {
    schemaVersion: 1, bindingId: 'binding-1', bindingRevision: 1, recipientId: 'student-1', contextId: 'homework-1', placementId: 'placement-1', activityId: 'activity-1', activityVersion: 1, activityVersionId: 'activity-1-v1', interactionId: 'interaction-1', sourceProvenance: [{ sourceKey: 'full', sourceVersionId: 'source-v1', pages: [1] }],
  };
  const runtimeScope = {
    draft: { ...terminalIdentity, revision: 2, response: 'private-answer', updatedByOperationId: 'operation-draft', updatedAt: now },
    attempts: { 'attempt-1': { ...terminalIdentity, attemptId: 'attempt-1', submissionScope: 'activity', requiredInteractionIds: ['interaction-1'], submittedInteractionIds: ['interaction-1'], acknowledgedDraftRevision: 2, attemptNumber: 1, pageGroupKeys: ['group-1'], feedbackRelease: 'pending', response: 'private-answer', createdByOperationId: 'operation-submit', createdAt: now } },
    results: { 'attempt-1:result': { ...terminalIdentity, resultId: 'attempt-1:result', attemptId: 'attempt-1', submissionScope: 'activity', requiredInteractionIds: ['interaction-1'], submittedInteractionIds: ['interaction-1'], acknowledgedDraftRevision: 2, attemptNumber: 1, pageGroupKeys: ['group-1'], feedbackRelease: 'pending', status: 'submitted', response: 'private-answer', createdByOperationId: 'operation-submit', createdAt: now } },
    completions: { 'attempt-1:completion': { ...terminalIdentity, completionId: 'attempt-1:completion', resultId: 'attempt-1:result', attemptId: 'attempt-1', submissionScope: 'activity', requiredInteractionIds: ['interaction-1'], submittedInteractionIds: ['interaction-1'], acknowledgedDraftRevision: 2, attemptNumber: 1, pageGroupKeys: ['group-1'], status: 'completed', createdByOperationId: 'operation-submit', createdAt: now } },
    indexes: {},
    operations: { 'operation-submit': { operationId: 'operation-submit', fingerprint: 'command-fingerprint', status: 'accepted', bindingId: 'binding-1', attemptId: 'attempt-1', attemptNumber: 1, createdAt: now } },
    ...runtimeOverrides,
  };
  const deliveryScope = {
    current: { bindingId: 'binding-1', bindingRevision: 1, recipientId: 'student-1', contextId: 'homework-1', contextKind: 'homework', status: 'active', updatedAt: now },
    records: { 'binding-1': { binding: binding(), recordRevision: 1, status: 'active', createdAt: now, updatedAt: now } },
    recovery: { hold: { kind: 'book-delivery-recovery-hold', schemaVersion: 1, recoveryOperationId: 'recovery-122', recipientId: 'student-1', contextId: 'homework-1', deliveryState: 'unavailable', readDenied: true, activation: 'held-for-reconciliation' } },
  };
  const activityVersions = {
    'activity-1': { 'activity-1-v1': { schemaVersion: 1, activityId: 'activity-1', activityVersionId: 'activity-1-v1', activityVersion: 1, ownerId: 'teacher-1', lifecycle: 'published', projection: { scoring: { feedbackVisibility: 'after-review' } } } },
  };
  return {
    kind: 'book-metadata-inventory',
    roots: [
      { path: 'book_delivery/scopes', present: true, data: { 'student-1': { 'homework-1': deliveryScope } } },
      { path: 'book_activity/versions', present: true, data: activityVersions },
      { path: 'book_runtime/scopes', present: true, data: { 'student-1': { 'homework-1': { 'placement-1': { 'interaction-1': runtimeScope } } } } },
      { path: 'book_activity_evaluations/scopes', present: true, data: {} },
      { path: 'book_runtime/homework_completion', present: true, data: {} },
    ],
  };
};

describe('Book runtime restore adapter', () => {
  it('stages metadata-only autosave, submission, terminal rows, and operation receipts under a held context', () => {
    const plan = prepareBookRuntimeRestore({ inventory: inventory(), inventoryFingerprint: 'fingerprint-123', recoveryOperationId: 'recovery-123', sourceAuthorities, expectedOwnerId: 'teacher-1' });
    expect(plan.productionWrites).toBe(0);
    expect(plan.commandExecutions).toBe(0);
    expect(plan.scoringCalls).toBe(0);
    expect(plan.gradingCalls).toBe(0);
    expect(plan.feedbackReleaseWrites).toBe(0);
    expect(plan.completionWrites).toBe(0);
    expect(plan.providerOperations).toBe(0);
    expect(plan.projections.length).toBeGreaterThanOrEqual(5);
    expect(plan.projections.every((projection) => projection.deliveryState === 'unavailable' && projection.readDenied)).toBe(true);
    expect(plan.projections.every((projection) => !Object.hasOwn(projection, 'response'))).toBe(true);
    expect(plan.projections.some((projection) => projection.recordKind === 'autosave')).toBe(true);
    expect(plan.projections.some((projection) => projection.recordKind === 'submission')).toBe(true);
    expect(plan.projections.some((projection) => projection.recordKind === 'operation')).toBe(true);
  });

  it('fails closed for a missing Delivery hold and never repairs the runtime scope', () => {
    const value = inventory();
    const scope = (value.roots[0] as any).data['student-1']['homework-1'];
    delete scope.recovery;
    const plan = prepareBookRuntimeRestore({ inventory: value, inventoryFingerprint: 'fingerprint-123', recoveryOperationId: 'recovery-123', sourceAuthorities });
    expect(plan.projections).toEqual([]);
    expect(plan.report.unavailable).toBeGreaterThan(0);
    expect(plan.productionWrites).toBe(0);
  });

  it('denies a cross-context runtime binding instead of transferring terminal metadata', () => {
    const value = inventory();
    const runtime = (value.roots[2] as any).data['student-1']['homework-1']['placement-1']['interaction-1'];
    const rows = [runtime.draft, ...Object.values(runtime.attempts), ...Object.values(runtime.results), ...Object.values(runtime.completions)] as any[];
    for (const row of rows) row.contextId = 'solo-1';
    const plan = prepareBookRuntimeRestore({ inventory: value, inventoryFingerprint: 'fingerprint-123', recoveryOperationId: 'recovery-123', sourceAuthorities });
    expect(plan.projections).toEqual([]);
    expect(plan.report.invalid).toBeGreaterThan(0);
    expect(plan.productionWrites).toBe(0);
  });

  it('routes writes through the rebuilding adapter and replays deterministic keys', async () => {
    const plan = prepareBookRuntimeRestore({ inventory: inventory(), inventoryFingerprint: 'fingerprint-123', recoveryOperationId: 'recovery-123', sourceAuthorities });
    const store = new InMemoryBookRuntimeRecoveryProjectionStore();
    const adapter = createBookRuntimeRecoveryAdapter({ context: { recoveryOperationId: 'recovery-123', phase: 'rebuilding' }, store });
    const persisted = await persistBookRuntimeRecovery({ plan, adapter });
    expect(persisted.recoveryWrites).toBe(plan.projections.length);
    const replay = rebuildBookRuntimeProjections({ plan, completedProjectionKeys: new Set([plan.projections[0]?.projectionKey]) });
    expect(replay.report.skippedIdempotent).toBe(1);
    expect(replay.productionWrites).toBe(0);
  });

  it('rejects legacy flat runtime roots instead of treating them as canonical authority', () => {
    expect(() => prepareBookRuntimeRestore({ inventory: { ...inventory(), roots: [{ path: 'book_runtime/results', present: true, data: {} }] }, inventoryFingerprint: 'fingerprint-123', recoveryOperationId: 'recovery-123', sourceAuthorities })).toThrow('legacy flat runtime roots');
  });
});
