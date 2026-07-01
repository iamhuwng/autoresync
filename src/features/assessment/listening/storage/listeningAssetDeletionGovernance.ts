import { LISTENING_PENDING_DELETE_GRACE_MS } from './listeningAssetLifecycle';
import {
  canDeleteListeningAssetUnderRollback,
  type ListeningStorageRollbackControls,
} from './listeningAssetRollback';
import type {
  ListeningMediaAssetRecord,
  ListeningMediaAssetReferences,
  ListeningMediaAssetState,
} from './listeningAssetRegistry';

export const LISTENING_DELETION_TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const LISTENING_ADMIN_DELETION_OPERATION = 'administrative-delete-listening-asset' as const;

export const LISTENING_ASSET_DELETION_STATE_TRANSITIONS: Record<
  ListeningMediaAssetState,
  readonly ListeningMediaAssetState[]
> = {
  temp: ['committing'],
  committing: ['committed', 'temp'],
  committed: ['pending-delete'],
  'pending-delete': ['committed', 'deleted'],
  deleted: ['deleted'],
};

export type ListeningAdministrativeDeletionActorRole = 'super-admin' | 'service-admin' | 'teacher';
export type ListeningAdministrativeDeletionRequestSurface = 'administrative-deletion' | 'teacher-endpoint';

export interface ListeningAdministrativeDeletionOperation {
  readonly operationId: string;
  readonly actorUserId: string;
  readonly actorRole: ListeningAdministrativeDeletionActorRole;
  readonly requestedVia: ListeningAdministrativeDeletionRequestSurface;
  readonly reasonCode: string;
  readonly idempotencyKeyHash: string;
  readonly requestHash: string;
}

export interface ListeningReferenceRecheck {
  readonly assetId: string;
  readonly checkedAt: number;
  readonly references: ListeningMediaAssetReferences;
}

export interface ListeningAssetDeletionTombstone {
  readonly schemaVersion: 1;
  readonly assetId: string;
  readonly ownerId: string;
  readonly uploadSessionId: string;
  readonly state: 'deleted';
  readonly deletedAt: number;
  readonly deletedBy: string;
  readonly deletionOperationId: string;
  readonly reasonCode: string;
  readonly sizeBytes: number;
  readonly contentType: string;
  readonly retainedReferenceCount: number;
  readonly referencesCheckedAt: number;
  readonly tombstoneExpiresAt: number;
}

export interface ListeningAdministrativeDeletionIntent {
  readonly operation: typeof LISTENING_ADMIN_DELETION_OPERATION;
  readonly assetId: string;
  readonly ownerId: string;
  readonly deletedAt: number;
  readonly stateBefore: 'pending-delete';
  readonly stateAfter: 'deleted';
  readonly retainedReferenceCount: number;
  readonly referencesCheckedAt: number;
  readonly tombstoneExpiresAt: number;
}

export interface ListeningAdministrativeDeletionAuditEvent {
  readonly operation: typeof LISTENING_ADMIN_DELETION_OPERATION;
  readonly actorUserId: string;
  readonly actorRole: Exclude<ListeningAdministrativeDeletionActorRole, 'teacher'>;
  readonly assetId: string;
  readonly ownerId: string;
  readonly outcome: 'succeeded';
  readonly reasonCode: string;
  readonly createdAt: number;
}

export interface ListeningAdministrativeDeletionOperationRecord {
  readonly status: 'succeeded';
  readonly operationId: string;
  readonly assetId: string;
  readonly idempotencyKeyHash: string;
  readonly requestHash: string;
  readonly createdAt: number;
  readonly result: Omit<ListeningAdministrativeDeletionPlanResult, 'operationRecord'>;
}

export interface ListeningAdministrativeDeletionPlanResult {
  readonly deletion: ListeningAdministrativeDeletionIntent;
  readonly tombstone: ListeningAssetDeletionTombstone;
  readonly auditEvent: ListeningAdministrativeDeletionAuditEvent;
  readonly operationRecord: ListeningAdministrativeDeletionOperationRecord;
}

export function assertListeningMediaAssetStateTransition(
  from: ListeningMediaAssetState,
  to: ListeningMediaAssetState,
): ListeningMediaAssetState {
  if (!LISTENING_ASSET_DELETION_STATE_TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid_asset_state_transition:${from}->${to}`);
  }
  return to;
}

export function countListeningRetainedReferences(references: ListeningMediaAssetReferences): number {
  return Object.values(references).reduce((total, group) => total + Object.keys(group ?? {}).length, 0);
}

export function createListeningAssetDeletionTombstone(input: {
  readonly asset: ListeningMediaAssetRecord;
  readonly operation: ListeningAdministrativeDeletionOperation;
  readonly retainedReferenceCount: number;
  readonly referencesCheckedAt: number;
  readonly deletedAt: number;
}): ListeningAssetDeletionTombstone {
  return {
    schemaVersion: 1,
    assetId: input.asset.assetId,
    ownerId: input.asset.ownerId,
    uploadSessionId: input.asset.uploadSessionId,
    state: 'deleted',
    deletedAt: input.deletedAt,
    deletedBy: input.operation.actorUserId,
    deletionOperationId: input.operation.operationId,
    reasonCode: input.operation.reasonCode,
    sizeBytes: input.asset.sizeBytes,
    contentType: input.asset.contentType,
    retainedReferenceCount: input.retainedReferenceCount,
    referencesCheckedAt: input.referencesCheckedAt,
    tombstoneExpiresAt: input.deletedAt + LISTENING_DELETION_TOMBSTONE_RETENTION_MS,
  };
}

function assertAdministrativeOperation(operation: ListeningAdministrativeDeletionOperation): asserts operation is (
  ListeningAdministrativeDeletionOperation & {
    readonly actorRole: Exclude<ListeningAdministrativeDeletionActorRole, 'teacher'>;
    readonly requestedVia: 'administrative-deletion';
  }
) {
  if (operation.requestedVia === 'teacher-endpoint') {
    throw new Error('teacher_endpoint_delete_forbidden');
  }
  if (operation.actorRole === 'teacher') {
    throw new Error('administrative_delete_requires_admin_actor');
  }
}

function assertIdempotentReplay(input: {
  readonly assetId: string;
  readonly operation: ListeningAdministrativeDeletionOperation;
  readonly previousOperation?: ListeningAdministrativeDeletionOperationRecord;
}): ListeningAdministrativeDeletionPlanResult | undefined {
  if (!input.previousOperation) return undefined;
  if (
    input.previousOperation.assetId === input.assetId
    && input.previousOperation.idempotencyKeyHash === input.operation.idempotencyKeyHash
    && input.previousOperation.requestHash === input.operation.requestHash
  ) {
    return {
      ...input.previousOperation.result,
      operationRecord: input.previousOperation,
    };
  }
  if (
    input.previousOperation.assetId === input.assetId
    && input.previousOperation.idempotencyKeyHash === input.operation.idempotencyKeyHash
  ) {
    throw new Error('administrative_delete_idempotency_conflict');
  }
  return undefined;
}

export function planListeningAdministrativeAssetDeletion(input: {
  readonly asset: ListeningMediaAssetRecord;
  readonly operation: ListeningAdministrativeDeletionOperation;
  readonly referenceRecheck?: ListeningReferenceRecheck;
  readonly previousOperation?: ListeningAdministrativeDeletionOperationRecord;
  readonly rollbackControls?: ListeningStorageRollbackControls;
  readonly now: number;
}): ListeningAdministrativeDeletionPlanResult {
  const replay = assertIdempotentReplay({
    assetId: input.asset.assetId,
    operation: input.operation,
    previousOperation: input.previousOperation,
  });
  if (replay) return replay;

  assertAdministrativeOperation(input.operation);

  const rollbackDecision = canDeleteListeningAssetUnderRollback({
    asset: input.asset,
    controls: input.rollbackControls,
  });
  if (!rollbackDecision.allowed) throw new Error(rollbackDecision.reason);

  if (input.asset.state !== 'pending-delete') {
    throw new Error(`asset_not_pending_delete:${input.asset.state}`);
  }
  if (!input.asset.pendingDeleteAt || !input.asset.deleteAfter) {
    throw new Error('pending_delete_grace_not_elapsed');
  }
  if (
    input.now < input.asset.pendingDeleteAt + LISTENING_PENDING_DELETE_GRACE_MS
    || input.now < input.asset.deleteAfter
  ) {
    throw new Error('pending_delete_grace_not_elapsed');
  }
  if (countListeningRetainedReferences(input.asset.references) > 0) {
    throw new Error('retained_references_block_delete');
  }
  if (!input.referenceRecheck) {
    throw new Error('reference_recheck_required');
  }
  if (input.referenceRecheck.assetId !== input.asset.assetId) {
    throw new Error('reference_recheck_asset_mismatch');
  }
  if (input.referenceRecheck.checkedAt !== input.now) {
    throw new Error('reference_recheck_not_immediate');
  }

  const retainedReferenceCount = countListeningRetainedReferences(input.referenceRecheck.references);
  if (retainedReferenceCount > 0) {
    throw new Error('retained_references_block_delete');
  }

  assertListeningMediaAssetStateTransition(input.asset.state, 'deleted');

  const tombstone = createListeningAssetDeletionTombstone({
    asset: input.asset,
    operation: input.operation,
    retainedReferenceCount,
    referencesCheckedAt: input.referenceRecheck.checkedAt,
    deletedAt: input.now,
  });
  const deletion: ListeningAdministrativeDeletionIntent = {
    operation: LISTENING_ADMIN_DELETION_OPERATION,
    assetId: input.asset.assetId,
    ownerId: input.asset.ownerId,
    deletedAt: input.now,
    stateBefore: 'pending-delete',
    stateAfter: 'deleted',
    retainedReferenceCount,
    referencesCheckedAt: input.referenceRecheck.checkedAt,
    tombstoneExpiresAt: tombstone.tombstoneExpiresAt,
  };
  const auditEvent: ListeningAdministrativeDeletionAuditEvent = {
    operation: LISTENING_ADMIN_DELETION_OPERATION,
    actorUserId: input.operation.actorUserId,
    actorRole: input.operation.actorRole,
    assetId: input.asset.assetId,
    ownerId: input.asset.ownerId,
    outcome: 'succeeded',
    reasonCode: input.operation.reasonCode,
    createdAt: input.now,
  };

  const resultWithoutOperationRecord: Omit<ListeningAdministrativeDeletionPlanResult, 'operationRecord'> = {
    deletion,
    tombstone,
    auditEvent,
  };
  const operationRecord: ListeningAdministrativeDeletionOperationRecord = {
    status: 'succeeded',
    operationId: input.operation.operationId,
    assetId: input.asset.assetId,
    idempotencyKeyHash: input.operation.idempotencyKeyHash,
    requestHash: input.operation.requestHash,
    createdAt: input.now,
    result: resultWithoutOperationRecord,
  };
  return {
    ...resultWithoutOperationRecord,
    operationRecord,
  };
}
