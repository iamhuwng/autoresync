import { describe, expect, it } from 'vitest';
import {
  bookUpdateRecoveryFingerprint,
  createBookUpdateRecoveryProjection,
  InMemoryBookUpdateRecoveryProjectionStore,
  rebuildBookUpdateRecoveryProjections,
  createBookUpdateRecoveryAdapter,
} from './bookUpdate.recovery';

const projection = (fingerprint = bookUpdateRecoveryFingerprint({ actionId: 'action-1', state: 'committed' })) => (
  createBookUpdateRecoveryProjection({
    recoveryOperationId: 'recovery-124',
    recordKind: 'notification',
    recordId: 'notification-1',
    idempotencyKey: 'notification-1',
    ownerId: 'teacher-1',
    bookId: 'book-1',
    scopeKey: 'notification-notification-1',
    recipientId: 'student-1',
    contextId: 'homework-1',
    metadata: {
      notificationId: 'notification-1',
      updateActionId: 'action-1',
      recipientId: 'student-1',
      contextId: 'homework-1',
      case: 'review-checkpoint',
      checkpointAvailable: true,
      dispatch: 'held',
    },
    canonicalFingerprint: fingerprint,
  })
);

describe('Book update recovery projections', () => {
  it('keeps held projections privacy-safe and rejects sensitive metadata', () => {
    const value = projection();
    expect(value).toMatchObject({
      state: 'held',
      deliveryState: 'unavailable',
      readDenied: true,
      activation: 'held-for-reconciliation',
      recipientId: 'student-1',
    });
    expect(() => createBookUpdateRecoveryProjection({
      recoveryOperationId: 'recovery-124',
      recordKind: 'notification',
      recordId: 'notification-2',
      ownerId: 'teacher-1',
      bookId: 'book-1',
      scopeKey: 'notification-notification-2',
      metadata: { message: 'private notification body' },
      canonicalFingerprint: 'fingerprint-2',
    })).toThrow('book_update_recovery_projection_invalid');
  });

  it('deduplicates replay, skips completed keys, and rejects drift for the same identity', async () => {
    const value = projection();
    const rebuilt = rebuildBookUpdateRecoveryProjections({
      recoveryContext: { recoveryOperationId: 'recovery-124', phase: 'rebuilding' },
      projections: [value, value],
      completedProjectionKeys: new Set([value.projectionKey]),
    });
    expect(rebuilt.projections).toHaveLength(0);
    expect(rebuilt.report).toMatchObject({ skippedIdempotent: 1, invalid: 1 });

    const store = new InMemoryBookUpdateRecoveryProjectionStore();
    const adapter = createBookUpdateRecoveryAdapter({
      context: { recoveryOperationId: 'recovery-124', phase: 'rebuilding' },
      store,
    });
    await expect(adapter.rebuild({ projections: [value] })).resolves.toMatchObject({ report: { rebuilt: 1 } });
    await expect(adapter.rebuild({ projections: [value] })).resolves.toMatchObject({ report: { skippedIdempotent: 1 } });
    await expect(adapter.rebuild({ projections: [projection('fingerprint-drift')] }))
      .rejects.toThrow('book_update_recovery_projection_conflict');
    await expect(store.readHold({ scopeKey: value.scopeKey })).resolves.toMatchObject({
      recoveryOperationId: 'recovery-124',
      recipientId: 'student-1',
      deliveryState: 'unavailable',
      readDenied: true,
    });
  });

  it('keeps recipient and context scope in the durable hold identity', () => {
    const value = projection();
    const other = createBookUpdateRecoveryProjection({
      ...value,
      recordId: 'notification-2',
      scopeKey: 'notification-notification-2',
      recipientId: 'student-2',
      metadata: { ...value.metadata, notificationId: 'notification-2', recipientId: 'student-2' },
    });
    expect(other.scopeKey).not.toBe(value.scopeKey);
    expect(other.recipientId).toBe('student-2');
    expect(other.contextId).toBe('homework-1');
  });
});
