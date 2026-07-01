import * as admin from 'firebase-admin';

import {
  LISTENING_AUTHORING_OPERATION_TTL_MS,
  LISTENING_AUTHORING_PATHS,
  LISTENING_AUTHORING_SCHEMA_VERSION,
} from './constants';
import {
  cloneOperationRecord,
  createOperationScopeKey,
} from './repository.operationRecords';
import { findOperationByScopeKey } from './repository.firebaseSupport';
import { cloneRecord } from './repository.shared';
import type {
  ClaimOperationInput,
  ListeningAuthoringOperationRecord,
  ListeningAuthoringOperationResult,
  OperationClaim,
} from './repository.shared';

export const firebaseClaimOperation = async (
  db: admin.database.Database,
  input: ClaimOperationInput,
  now: () => number,
): Promise<OperationClaim> => {
  const lookupKey = createOperationScopeKey(input);
  const operationsRef = db.ref(LISTENING_AUTHORING_PATHS.operations);
  let transactionOutcome: OperationClaim | null = null;

  const transaction = await operationsRef.transaction((currentValue) => {
    const current =
      currentValue !== null
        ? (currentValue as Record<string, ListeningAuthoringOperationRecord>)
        : {};

    const existing = Object.values(current).find(
      (record) =>
        record.idempotencyKeyHash === input.idempotencyKeyHash &&
        record.ownerId === input.ownerId &&
        record.operationType === input.operationType &&
        record.targetId === input.targetId,
    );
    if (existing !== undefined) {
      transactionOutcome =
        existing.requestHash === input.requestHash
          ? { kind: 'existing', record: cloneOperationRecord(existing) }
          : { kind: 'conflict', record: cloneOperationRecord(existing) };
      return undefined;
    }

    if (current[input.operationId] !== undefined) {
      throw new Error(`operation ${input.operationId} already exists.`);
    }

    const createdAt = now();
    const record: ListeningAuthoringOperationRecord = {
      schemaVersion: LISTENING_AUTHORING_SCHEMA_VERSION,
      operationId: input.operationId,
      operationType: input.operationType,
      targetType: input.targetType,
      ownerId: input.ownerId,
      targetId: input.targetId,
      idempotencyKeyHash: input.idempotencyKeyHash,
      requestHash: input.requestHash,
      expectedConflictToken: input.expectedConflictToken,
      status: 'pending',
      createdAt,
      expiresAt: createdAt + LISTENING_AUTHORING_OPERATION_TTL_MS,
    };
    transactionOutcome = { kind: 'claimed', record: cloneOperationRecord(record) };

    return {
      ...current,
      [record.operationId]: cloneOperationRecord(record),
    };
  }, undefined, false);

  if (transactionOutcome !== null) {
    return transactionOutcome;
  }

  if (transaction.committed) {
    throw new Error('operations transaction committed without outcome.');
  }

  const existing = await findOperationByScopeKey(db, lookupKey);
  if (existing !== null) {
    return existing.requestHash === input.requestHash
      ? { kind: 'existing', record: existing }
      : { kind: 'conflict', record: existing };
  }

  throw new Error(`operation lookup ${lookupKey} missing after transaction.`);
};

export const firebaseCompleteOperation = async <T extends ListeningAuthoringOperationResult>(
  db: admin.database.Database,
  operationId: string,
  result: T,
  now: () => number,
): Promise<void> => {
  const operationRef = db.ref(`${LISTENING_AUTHORING_PATHS.operations}/${operationId}`);
  const clonedResult = cloneRecord(result);
  const completedAt = now();
  const state: {
    outcome: 'updated' | 'already-succeeded' | 'already-failed' | 'missing';
  } = { outcome: 'missing' };
  const transaction = await operationRef.transaction((currentValue) => {
    if (currentValue === null) {
      state.outcome = 'missing';
      return undefined;
    }

    const current = currentValue as ListeningAuthoringOperationRecord<T>;
    if (current.status === 'succeeded') {
      state.outcome = 'already-succeeded';
      return undefined;
    }
    if (current.status === 'failed') {
      state.outcome = 'already-failed';
      return undefined;
    }

    state.outcome = 'updated';
    return {
      ...current,
      status: 'succeeded',
      result: clonedResult,
      completedAt,
      expiresAt: completedAt + LISTENING_AUTHORING_OPERATION_TTL_MS,
    };
  }, undefined, false);

  if (state.outcome === 'updated' || state.outcome === 'already-succeeded') {
    return;
  }
  if (state.outcome === 'already-failed') {
    throw new Error(`operation ${operationId} already failed.`);
  }
  if (!transaction.committed || state.outcome === 'missing') {
    throw new Error(`operation ${operationId} not found.`);
  }
};
