import type { ListeningMediaAssetRecord } from './listeningAssetRegistry';

export interface ListeningStorageRollbackControls {
  readonly registryWritesEnabled: boolean;
  readonly cleanupDeletionEnabled: boolean;
  readonly retainReferencedAssets: boolean;
  readonly preserveLegacyPublishReads: boolean;
  readonly mutateExistingAudio: boolean;
  readonly reason: 'task-4.16-storage-rollback';
}

export const LISTENING_STORAGE_ROLLBACK_CONTROLS: ListeningStorageRollbackControls = {
  registryWritesEnabled: false,
  cleanupDeletionEnabled: false,
  retainReferencedAssets: true,
  preserveLegacyPublishReads: true,
  mutateExistingAudio: false,
  reason: 'task-4.16-storage-rollback',
};

export function areListeningRegistryWritesEnabled(
  controls: ListeningStorageRollbackControls | undefined,
): boolean {
  return controls?.registryWritesEnabled !== false;
}

export function isListeningCleanupDeletionStopped(
  controls: ListeningStorageRollbackControls | undefined,
): boolean {
  return controls?.cleanupDeletionEnabled === false;
}

export function shouldRetainListeningExistingAudio(
  controls: ListeningStorageRollbackControls | undefined,
): boolean {
  return controls?.retainReferencedAssets === true || controls?.mutateExistingAudio === false;
}

export function shouldReturnListeningResultReviewToPublicR2(
  controls: ListeningStorageRollbackControls | undefined,
): boolean {
  return controls?.preserveLegacyPublishReads === true
    && controls.cleanupDeletionEnabled === false
    && controls.mutateExistingAudio === false;
}

const retainedReferenceCount = (references: ListeningMediaAssetRecord['references']): number =>
  Object.values(references).reduce((total, group) => total + Object.keys(group ?? {}).length, 0);

export function canDeleteListeningAssetUnderRollback(input: {
  readonly asset: ListeningMediaAssetRecord;
  readonly controls: ListeningStorageRollbackControls | undefined;
}): { readonly allowed: boolean; readonly reason: 'allowed' | 'cleanup_deletion_disabled' | 'referenced_asset_retained' } {
  if (input.controls?.cleanupDeletionEnabled === false) {
    return {
      allowed: false,
      reason: 'cleanup_deletion_disabled',
    };
  }
  if (input.controls?.retainReferencedAssets && retainedReferenceCount(input.asset.references) > 0) {
    return {
      allowed: false,
      reason: 'referenced_asset_retained',
    };
  }
  return {
    allowed: true,
    reason: 'allowed',
  };
}

export function preserveLegacyPublishReadFields<T extends {
  readonly assetId?: string;
  readonly audioUrl?: string;
  readonly streamUrl?: string;
}>(input: {
  readonly record: T;
  readonly controls: ListeningStorageRollbackControls | undefined;
}): T {
  return input.record;
}
