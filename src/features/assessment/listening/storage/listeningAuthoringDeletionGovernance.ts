import type {
  ListeningAuthoringDraftRecord,
  ListeningPublishedVersionRecord,
} from '../types/listeningAuthoring.types';

export interface ListeningDraftSoftDeleteResult {
  readonly status: 'soft-deleted';
  readonly draftId: string;
  readonly conflictToken: number;
  readonly recoverableUntil: number;
}

export interface ListeningPublishedArchiveResult {
  readonly status: 'archived';
  readonly versionId: string;
  readonly retainedReferenceCount: number;
}

const RECOVERY_MS = 7 * 24 * 60 * 60 * 1000;

export function softDeleteListeningDraft(input: {
  readonly draft: ListeningAuthoringDraftRecord;
  readonly ownerId: string;
  readonly expectedConflictToken: number;
  readonly now: number;
  readonly reasonCode?: string;
}): ListeningAuthoringDraftRecord & ListeningDraftSoftDeleteResult {
  if (input.draft.ownerId !== input.ownerId) {
    throw new Error('draft_owner_mismatch');
  }
  if (input.draft.conflictToken !== input.expectedConflictToken) {
    throw new Error('draft_conflict');
  }
  return {
    ...input.draft,
    state: 'soft-deleted',
    conflictToken: input.draft.conflictToken + 1,
    updatedAt: input.now,
    softDelete: {
      deletedAt: input.now,
      deletedBy: input.ownerId,
      reasonCode: input.reasonCode,
      priorConflictToken: input.draft.conflictToken,
      restoreCount: input.draft.softDelete?.restoreCount ?? 0,
    },
    status: 'soft-deleted',
    recoverableUntil: input.now + RECOVERY_MS,
  };
}

export function archiveListeningPublishedVersion(input: {
  readonly version: ListeningPublishedVersionRecord;
  readonly ownerId: string;
  readonly now: number;
  readonly reason?: string;
}): ListeningPublishedVersionRecord & ListeningPublishedArchiveResult {
  if (input.version.ownerId !== input.ownerId) {
    throw new Error('version_owner_mismatch');
  }
  const retainedReferenceCount = Object.values(input.version.retainedPins)
    .reduce((total, refs) => total + (refs?.length ?? 0), 0);
  return {
    ...input.version,
    state: 'archived',
    archiveMetadata: {
      archivedAt: input.now,
      archivedBy: input.ownerId,
      reason: input.reason,
    },
    status: 'archived',
    retainedReferenceCount,
  };
}
