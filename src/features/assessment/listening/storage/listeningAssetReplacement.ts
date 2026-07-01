import type { ListeningAssetCommitReference } from './listeningAssetCommit';
import {
  isListeningCleanupDeletionStopped,
  type ListeningStorageRollbackControls,
} from './listeningAssetRollback';

export interface ListeningAssetPlaybackReference {
  readonly assetId: string;
  readonly audioUrl: string;
  readonly streamUrl?: string;
  readonly reference: ListeningAssetCommitReference;
}

export interface ListeningAssetReplacementUpload {
  readonly assetId: string;
  readonly uploadSessionId: string;
  readonly tempKey: string;
  readonly audioUrl: string;
  readonly streamUrl?: string;
}

export interface ListeningAssetReplacementState {
  readonly ownerId: string;
  readonly draftId: string;
  readonly authoritativeReference: ListeningAssetPlaybackReference;
  readonly pendingReplacement?: ListeningAssetReplacementUpload & {
    readonly status: 'commit-unresolved' | 'committed-awaiting-save';
    readonly cleanupQueued: boolean;
    readonly startedAt: number;
  };
}

export interface ListeningAssetReplacementTempCleanupOperation {
  readonly operation: 'cleanup-temp';
  readonly assetId: string;
  readonly tempKey: string;
  readonly reason: 'replacement-cancelled' | 'failed-save-publish';
}

export interface ListeningAssetReplacementCleanupStoppedOperation {
  readonly operation: 'cleanup-stopped';
  readonly assetId: string;
  readonly reason: 'replacement-cancelled' | 'failed-save-publish';
}

export type ListeningAssetReplacementCleanupOperation =
  | ListeningAssetReplacementTempCleanupOperation
  | ListeningAssetReplacementCleanupStoppedOperation;

export interface ListeningAssetReplacementReferenceOperation {
  readonly operation: 'remove-reference';
  readonly assetId: string;
  readonly reference: ListeningAssetCommitReference;
}

export interface ListeningAssetReplacementCompletion {
  readonly authoritativeReference: ListeningAssetPlaybackReference;
  readonly nextState: ListeningAssetReplacementState;
  readonly referenceOperations: ListeningAssetReplacementReferenceOperation[];
  readonly cleanupOperations: ListeningAssetReplacementCleanupOperation[];
}

export function startListeningAssetReplacement(input: {
  readonly ownerId: string;
  readonly draftId: string;
  readonly current: ListeningAssetPlaybackReference;
  readonly replacement: ListeningAssetReplacementUpload;
  readonly existing?: ListeningAssetReplacementState;
  readonly now: number;
}): ListeningAssetReplacementState {
  if (input.existing?.pendingReplacement && !input.existing.pendingReplacement.cleanupQueued) {
    throw new Error('replacement_commit_unresolved');
  }
  if (input.replacement.assetId === input.current.assetId) {
    throw new Error('replacement_requires_new_asset_id');
  }
  return {
    ownerId: input.ownerId,
    draftId: input.draftId,
    authoritativeReference: input.current,
    pendingReplacement: {
      ...input.replacement,
      status: 'commit-unresolved',
      cleanupQueued: false,
      startedAt: input.now,
    },
  };
}

const requirePending = (
  state: ListeningAssetReplacementState,
): NonNullable<ListeningAssetReplacementState['pendingReplacement']> => {
  if (!state.pendingReplacement) throw new Error('replacement_missing');
  return state.pendingReplacement;
};

const cleanupFor = (
  pending: NonNullable<ListeningAssetReplacementState['pendingReplacement']>,
  reason: ListeningAssetReplacementCleanupOperation['reason'],
  rollbackControls?: ListeningStorageRollbackControls,
): ListeningAssetReplacementCleanupOperation => ({
  ...(isListeningCleanupDeletionStopped(rollbackControls)
    ? {
        operation: 'cleanup-stopped' as const,
        assetId: pending.assetId,
        reason,
      }
    : {
        operation: 'cleanup-temp' as const,
        assetId: pending.assetId,
        tempKey: pending.tempKey,
        reason,
      }),
});

const withCleanupQueued = (
  state: ListeningAssetReplacementState,
): ListeningAssetReplacementState => {
  const pending = requirePending(state);
  return {
    ...state,
    pendingReplacement: {
      ...pending,
      cleanupQueued: true,
    },
  };
};

export function completeListeningAssetReplacement(input: {
  readonly state: ListeningAssetReplacementState;
  readonly committedReplacement: ListeningAssetPlaybackReference;
  readonly surroundingSaveSucceeded: boolean;
  readonly now: number;
  readonly rollbackControls?: ListeningStorageRollbackControls;
}): ListeningAssetReplacementCompletion {
  const pending = requirePending(input.state);
  if (input.committedReplacement.assetId !== pending.assetId) {
    throw new Error('replacement_asset_mismatch');
  }
  if (!input.surroundingSaveSucceeded) {
    return {
      authoritativeReference: input.state.authoritativeReference,
      nextState: withCleanupQueued(input.state),
      referenceOperations: [],
      cleanupOperations: [cleanupFor(pending, 'failed-save-publish', input.rollbackControls)],
    };
  }

  return {
    authoritativeReference: input.committedReplacement,
    nextState: {
      ownerId: input.state.ownerId,
      draftId: input.state.draftId,
      authoritativeReference: input.committedReplacement,
    },
    referenceOperations: [
      {
        operation: 'remove-reference',
        assetId: input.state.authoritativeReference.assetId,
        reference: input.state.authoritativeReference.reference,
      },
    ],
    cleanupOperations: [],
  };
}

export function cancelListeningAssetReplacement(input: {
  readonly state: ListeningAssetReplacementState;
  readonly now: number;
  readonly rollbackControls?: ListeningStorageRollbackControls;
}): ListeningAssetReplacementCompletion {
  const pending = requirePending(input.state);
  return {
    authoritativeReference: input.state.authoritativeReference,
    nextState: withCleanupQueued(input.state),
    referenceOperations: [],
    cleanupOperations: [cleanupFor(pending, 'replacement-cancelled', input.rollbackControls)],
  };
}
