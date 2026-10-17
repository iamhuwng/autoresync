import { describe, expect, it } from 'vitest';
import {
  BOOK_RUNTIME_RECOVERY_SCHEMA_VERSION,
  InMemoryBookRuntimeRecoveryProjectionStore,
  createBookRuntimeRecoveryAdapter,
  createBookRuntimeRecoveryProjection,
  createBookRuntimeRecoveryHold,
  isBookRuntimeRecoveryProjection,
  runtimeRecoveryProjectionKey,
} from './bookRuntime.recovery';

const projection = (overrides: Partial<Parameters<typeof createBookRuntimeRecoveryProjection>[0]> = {}) =>
  createBookRuntimeRecoveryProjection({
    recoveryOperationId: 'recovery-123',
    recordKind: 'submission',
    recordId: 'attempt-1',
    idempotencyKey: 'operation-1',
    recipientId: 'student-1',
    contextId: 'homework-1',
    contextKind: 'homework',
    ownerId: 'teacher-1',
    bindingId: 'delivery-1',
    bindingRevision: 3,
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersion: 2,
    activityVersionId: 'activity-1-v2',
    interactionId: 'interaction-1',
    feedbackPolicy: 'after-review',
    sourceProvenance: [{ sourceKey: 'source-1', sourceVersionId: 'source-1-v2', pages: [4] }],
    metadata: {
      attemptId: 'attempt-1',
      resultId: 'attempt-1:result',
      status: 'submitted',
      feedbackRelease: 'pending',
      operationId: 'operation-1',
    },
    canonicalFingerprint: 'fnv1a64:terminal-1',
    ...overrides,
  });

describe('Book runtime recovery contract', () => {
  it('creates an unavailable, read-denied hold and strips terminal payloads from projections', () => {
    const hold = createBookRuntimeRecoveryHold({
      recoveryOperationId: 'recovery-123',
      recipientId: 'student-1',
      contextId: 'solo-1',
    });
    expect(hold).toMatchObject({
      schemaVersion: BOOK_RUNTIME_RECOVERY_SCHEMA_VERSION,
      deliveryState: 'unavailable',
      readDenied: true,
      activation: 'held-for-reconciliation',
    });

    const value = projection();
    expect(isBookRuntimeRecoveryProjection(value)).toBe(true);
    expect(value).not.toHaveProperty('response');
    expect(value).not.toHaveProperty('prompt');
    expect(value).not.toHaveProperty('answerKey');
    expect(Object.isFrozen(value)).toBe(true);
  });

  it('rejects sensitive metadata and preserves exact projection identity', () => {
    expect(() => projection({
      metadata: { response: 'student-answer' } as never,
    })).toThrow('book_runtime_recovery_projection_invalid');
    expect(runtimeRecoveryProjectionKey({
      recoveryOperationId: 'recovery-123', recordKind: 'result', recordId: 'attempt-1',
    })).toBe('recovery-123~result~attempt-1');
  });

  it('uses hold and projection CAS semantics for deterministic replay and drift conflict', async () => {
    const store = new InMemoryBookRuntimeRecoveryProjectionStore();
    const adapter = createBookRuntimeRecoveryAdapter({
      context: { recoveryOperationId: 'recovery-123', phase: 'rebuilding' },
      store,
    });
    const value = projection();
    await expect(adapter.rebuild({ projections: [value] })).resolves.toMatchObject({
      report: { restored: 1, rebuilt: 1, skippedIdempotent: 0 },
    });
    await expect(adapter.rebuild({ projections: [value] })).resolves.toMatchObject({
      report: { restored: 0, rebuilt: 1, skippedIdempotent: 1 },
    });
    const drift = projection({ canonicalFingerprint: 'fnv1a64:drift' });
    await expect(adapter.rebuild({ projections: [drift] })).rejects.toThrow('book_runtime_recovery_projection_conflict');
    await expect(store.readHold({ recipientId: 'student-1', contextId: 'homework-1' })).resolves.toMatchObject({
      recoveryOperationId: 'recovery-123', readDenied: true, deliveryState: 'unavailable',
    });
  });

  it('keeps Solo, Homework, Course, and Class projections isolated even when keys repeat', async () => {
    const store = new InMemoryBookRuntimeRecoveryProjectionStore();
    const adapter = createBookRuntimeRecoveryAdapter({
      context: { recoveryOperationId: 'recovery-123', phase: 'rebuilding' },
      store,
    });
    const values = (['solo', 'homework', 'course', 'class'] as const).map((contextKind) => projection({
      contextId: `${contextKind}-1`,
      contextKind,
    }));
    await expect(adapter.rebuild({ projections: values })).resolves.toMatchObject({
      report: { restored: 4, rebuilt: 4, skippedIdempotent: 0 },
    });
    for (const value of values) {
      await expect(store.readHold({ recipientId: value.recipientId, contextId: value.contextId })).resolves.toMatchObject({
        contextId: value.contextId,
        readDenied: true,
      });
      expect(store.read({ recipientId: value.recipientId, contextId: value.contextId, projectionKey: value.projectionKey })).toMatchObject({
        contextId: value.contextId,
        contextKind: value.contextKind,
      });
    }
  });

  it('does not allow an adapter in reconciliation phase to stage runtime rows', async () => {
    const adapter = createBookRuntimeRecoveryAdapter({
      context: { recoveryOperationId: 'recovery-123', phase: 'reconciling' },
      store: new InMemoryBookRuntimeRecoveryProjectionStore(),
    });
    await expect(adapter.rebuild({ projections: [projection()] })).rejects.toThrow('book_runtime_recovery_phase_denied');
  });
});
