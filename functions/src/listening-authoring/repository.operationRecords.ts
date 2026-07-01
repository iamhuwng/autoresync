import {
  LISTENING_AUTHORING_OPERATION_TTL_MS,
  LISTENING_AUTHORING_SCHEMA_VERSION,
} from './constants';
import type {
  ListeningAuthoringDocumentV1,
  ListeningAuthoringOperationRecord,
  ListeningAuthoringOperationResult,
  ListeningAuthoringOperationTargetType,
  ListeningAuthoringOperationType,
} from './contracts';
import { cloneRecord } from './repository.shared';

export const createOperationScopeKey = (input: {
  ownerId: string;
  operationType: ListeningAuthoringOperationType;
  targetId: string;
  idempotencyKeyHash: string;
}): string =>
  `${input.ownerId}::${input.operationType}::${input.targetId}::${input.idempotencyKeyHash}`;

export const deriveAssetIds = (document: ListeningAuthoringDocumentV1): Record<string, true> => {
  const assetIds: Record<string, true> = {};

  for (const section of document.audioSections) {
    const assetId = section.assetId;
    if (typeof assetId === 'string' && assetId.length > 0) {
      assetIds[assetId] = true;
    }
  }

  return assetIds;
};

export const createSucceededOperationRecord = (input: {
  operationId: string;
  operationType: ListeningAuthoringOperationType;
  targetType: ListeningAuthoringOperationTargetType;
  ownerId: string;
  targetId: string;
  idempotencyKeyHash: string;
  requestHash: string;
  expectedConflictToken?: number;
  result: ListeningAuthoringOperationResult;
  completedAt: number;
}): ListeningAuthoringOperationRecord => ({
  schemaVersion: LISTENING_AUTHORING_SCHEMA_VERSION,
  operationId: input.operationId,
  operationType: input.operationType,
  targetType: input.targetType,
  ownerId: input.ownerId,
  targetId: input.targetId,
  idempotencyKeyHash: input.idempotencyKeyHash,
  requestHash: input.requestHash,
  expectedConflictToken: input.expectedConflictToken,
  status: 'succeeded',
  result: cloneRecord(input.result),
  createdAt: input.completedAt,
  completedAt: input.completedAt,
  expiresAt: input.completedAt + LISTENING_AUTHORING_OPERATION_TTL_MS,
});

export const createFailedOperationRecord = (input: {
  operationId: string;
  operationType: ListeningAuthoringOperationType;
  targetType: ListeningAuthoringOperationTargetType;
  ownerId: string;
  targetId: string;
  idempotencyKeyHash: string;
  requestHash: string;
  expectedConflictToken?: number;
  errorCode: string;
  result: ListeningAuthoringOperationResult;
  completedAt: number;
}): ListeningAuthoringOperationRecord => ({
  schemaVersion: LISTENING_AUTHORING_SCHEMA_VERSION,
  operationId: input.operationId,
  operationType: input.operationType,
  targetType: input.targetType,
  ownerId: input.ownerId,
  targetId: input.targetId,
  idempotencyKeyHash: input.idempotencyKeyHash,
  requestHash: input.requestHash,
  expectedConflictToken: input.expectedConflictToken,
  status: 'failed',
  result: cloneRecord(input.result),
  errorCode: input.errorCode,
  createdAt: input.completedAt,
  completedAt: input.completedAt,
  expiresAt: input.completedAt + LISTENING_AUTHORING_OPERATION_TTL_MS,
});

export const cloneOperationRecord = <T extends ListeningAuthoringOperationResult>(
  record: ListeningAuthoringOperationRecord<T>,
): ListeningAuthoringOperationRecord<T> => cloneRecord(record);

export const createSaveDraftResult = (
  draftId: string,
  conflictToken: number,
): Required<Pick<ListeningAuthoringOperationResult, 'draftId' | 'conflictToken'>> => ({
  draftId,
  conflictToken,
});

export const inferCreatedFromResult = (
  result: Required<Pick<ListeningAuthoringOperationResult, 'draftId' | 'conflictToken'>>,
): boolean => result.conflictToken === 1;

export const readTerminalOperationResult = (
  operation: ListeningAuthoringOperationRecord,
): Required<Pick<ListeningAuthoringOperationResult, 'draftId' | 'conflictToken'>> => {
  if (
    operation.completedAt === undefined ||
    operation.result === undefined ||
    typeof operation.result.draftId !== 'string' ||
    operation.result.draftId.length === 0 ||
    typeof operation.result.conflictToken !== 'number' ||
    !Number.isInteger(operation.result.conflictToken) ||
    operation.result.conflictToken <= 0
  ) {
    throw new Error(`malformed or incomplete operation ${operation.operationId}.`);
  }

  return {
    draftId: operation.result.draftId,
    conflictToken: operation.result.conflictToken,
  };
};
