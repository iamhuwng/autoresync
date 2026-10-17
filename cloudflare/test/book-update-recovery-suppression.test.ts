import { describe, expect, it, vi } from 'vitest';
import { createBookUpdateActionService } from '../src/upload-worker/book-updates/update-action.ts';
import { createBookUpdateFinalizer } from '../src/upload-worker/book-updates/update-finalizer.ts';
import { createBookRedoCheckpointApplier } from '../src/upload-worker/book-updates/redo-checkpoint-apply.ts';
import { createBookNotificationEmitter } from '../src/upload-worker/notifications/book-emitter.ts';
import { createReplacementSagaService } from '../src/upload-worker/book-delivery/replacement-saga/service.ts';
import { createRetiredByteDeletionOwner } from '../src/upload-worker/book-delivery/retired-byte-deletion/service.ts';

const heldContext = {
  recoveryOperationId: 'recovery-124',
  operationId: 'recovery-124',
  operationState: 'running',
  finalReconciliation: 'pending' as const,
};

describe('#124 production recovery suppression seams', () => {
  it('blocks update acceptance and finalization before canonical repositories are touched', async () => {
    const fail = vi.fn(() => { throw new Error('producer touched'); });
    const update = createBookUpdateActionService({
      snapshots: { readCurrent: fail } as never,
      actions: { findByIdempotency: fail } as never,
      recoveryContext: heldContext,
    });
    await expect(update.accept({} as never)).resolves.toEqual({
      status: 'blocked',
      code: 'recovery-side-effect-suppressed',
    });

    const finalizer = createBookUpdateFinalizer({
      actions: { read: fail } as never,
      plans: { resolve: fail } as never,
      emitter: { emit: fail } as never,
      recoveryContext: heldContext,
    });
    await expect(finalizer.finalize({ ownerId: 'teacher-1', actionId: 'action-1' })).resolves.toEqual({
      status: 'blocked',
      code: 'recovery-side-effect-suppressed',
    });
    expect(fail).not.toHaveBeenCalled();
  });

  it('skips checkpoint and notification producers without resolving actions or dispatching', async () => {
    const fail = vi.fn(() => { throw new Error('producer touched'); });
    const checkpoint = createBookRedoCheckpointApplier({
      repository: { read: fail, create: fail },
      recoveryContext: heldContext,
    });
    await expect(checkpoint.apply({} as never)).resolves.toEqual({ status: 'skipped' });

    const emitter = createBookNotificationEmitter({
      repository: { create: fail },
      resolveCommittedAction: fail,
      resolveDestination: fail,
      enabled: true,
      recoveryContext: heldContext,
    });
    await expect(emitter.emit({} as never)).resolves.toEqual({
      status: 'disabled',
      created: 0,
      replayed: 0,
      notificationIds: [],
    });
    expect(fail).not.toHaveBeenCalled();
  });

  it('blocks replacement and exact-delete owners before ledger, provider, or cleanup access', async () => {
    const fail = vi.fn(() => { throw new Error('external mutation touched'); });
    const replacement = createReplacementSagaService({ recoveryContext: heldContext } as never);
    await expect(replacement.execute({} as never)).resolves.toEqual({
      status: 'blocked',
      code: 'recovery-side-effect-suppressed',
    });

    const deletion = createRetiredByteDeletionOwner({ recoveryContext: heldContext } as never);
    await expect(deletion.enqueueExactDeletion({} as never)).resolves.toEqual({ status: 'pending' });
    await expect(deletion.execute({ ownerId: 'teacher-1', deletionId: 'delete-1' })).resolves.toEqual({
      status: 'blocked',
      code: 'recovery-side-effect-suppressed',
    });
    expect(fail).not.toHaveBeenCalled();
  });
});
