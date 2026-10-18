import * as admin from 'firebase-admin';

import {
  cloneOperationRecord,
  createOperationScopeKey,
  deriveAssetIds,
  inferCreatedFromResult,
  readTerminalOperationResult,
} from './repository.operationRecords';
import {
  findDraftLocation,
  findOperationByScopeKey,
  pathForPrefix,
} from './repository.firebaseSupport';
import { firebaseLifecycleTransaction } from './repository.firebaseLifecycle';
import { firebaseLegacyFirstEditTransaction } from './repository.firebaseLegacyFirstEdit';
import {
  firebaseClaimOperation,
  firebaseCompleteOperation,
} from './repository.firebaseOperations';
import { firebasePublishDraftTransaction } from './repository.firebasePublish';
import {
  createFirebaseVersionTransaction,
  nextFirebaseVersionNumber,
} from './repository.firebaseVersions';
import { runSaveDraftMutation } from './repository.saveDraftMutation';
import {
  LISTENING_AUTHORING_ROOT,
  assertNoActiveListeningTempCleanupLease,
  assertNoDeletedListeningTempAssets,
  cloneDraftRecord,
  cloneRecord,
  normalizeDraftRecord,
  type ClaimOperationInput,
  type CreateListeningPublishedVersionInput,
  type LifecycleTransactionInput,
  type LifecycleTransactionResult,
  type LegacyFirstEditTransactionInput,
  type LegacyFirstEditTransactionResult,
  type ListeningAuthoringDraftRecord,
  type ListeningAuthoringOperationRecord,
  type ListeningAuthoringOperationResult,
  type ListeningAuthoringRepository,
  type ListeningPublishedVersionRecord,
  type OperationClaim,
  type PublishDraftTransactionInput,
  type PublishDraftTransactionResult,
  type RepositoryIdPrefix,
  type SaveDraftTransactionInput,
  type SaveDraftTransactionResult,
  type UpdateDraftTransactionResult,
} from './repository.shared';

interface FirebaseRepositoryOptions {
  now?: () => number;
}

interface ListeningAuthoringRootState {
  drafts?: Record<string, ListeningAuthoringDraftRecord>;
  revision_drafts?: Record<string, ListeningAuthoringDraftRecord>;
  versions?: Record<string, ListeningPublishedVersionRecord>;
  operations?: Record<string, ListeningAuthoringOperationRecord>;
}

const cloneRootState = (value: ListeningAuthoringRootState): ListeningAuthoringRootState =>
  cloneRecord(value);

class FirebaseListeningAuthoringRepository implements ListeningAuthoringRepository {
  private readonly now: () => number;

  constructor(
    private readonly db: admin.database.Database,
    options: FirebaseRepositoryOptions = {},
  ) {
    this.now = options.now ?? Date.now;
  }

  allocateId(prefix: RepositoryIdPrefix): string {
    const key = this.db.ref(pathForPrefix(prefix)).push().key;
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error(`failed to allocate ${prefix} id.`);
    }

    return `${prefix}-${key}`;
  }

  async getDraft(draftId: string): Promise<ListeningAuthoringDraftRecord | null> {
    const located = await findDraftLocation(this.db, draftId);
    return located === null ? null : cloneDraftRecord(located.record);
  }

  async writeDraft(record: ListeningAuthoringDraftRecord): Promise<void> {
    const normalized = normalizeDraftRecord(record);
    const transaction = await this.db.ref(LISTENING_AUTHORING_ROOT).transaction((currentValue) => {
      const current: ListeningAuthoringRootState =
        currentValue !== null ? cloneRootState(currentValue as ListeningAuthoringRootState) : {};
      assertNoActiveListeningTempCleanupLease(current, this.now());
      assertNoDeletedListeningTempAssets(current, normalized.assetIds);
      assertNoDeletedListeningTempAssets(current, deriveAssetIds(normalized.document));
      const collection = normalized.recordType === 'draft' ? 'drafts' : 'revision_drafts';
      current[collection] = {
        ...(current[collection] ?? {}),
        [normalized.draftId]: cloneDraftRecord(normalized),
      };
      return current;
    }, undefined, false);
    if (!transaction.committed) throw new Error(`write draft transaction failed for ${normalized.draftId}.`);
  }

  async updateDraftTransaction(
    draftId: string,
    expectedConflictToken: number,
    updateFn: (draft: ListeningAuthoringDraftRecord) => ListeningAuthoringDraftRecord,
  ): Promise<UpdateDraftTransactionResult> {
    let transactionResult: UpdateDraftTransactionResult = { kind: 'missing' };
    await this.db.ref(LISTENING_AUTHORING_ROOT).transaction((currentValue) => {
      const root: ListeningAuthoringRootState =
        currentValue !== null ? cloneRootState(currentValue as ListeningAuthoringRootState) : {};
      assertNoActiveListeningTempCleanupLease(root, this.now());
      const raw = root.drafts?.[draftId] ?? root.revision_drafts?.[draftId];
      if (!raw) {
        transactionResult = { kind: 'missing' };
        return undefined;
      }
      const current = normalizeDraftRecord(raw);
      if (current.conflictToken !== expectedConflictToken) {
        transactionResult = {
          kind: 'conflict',
          currentConflictToken: current.conflictToken,
        };
        return undefined;
      }

      const next = normalizeDraftRecord(updateFn(cloneDraftRecord(current)));
      if (next.draftId !== draftId) {
        throw new Error(`draft transaction cannot change draftId from ${draftId}.`);
      }
      if (next.recordType !== current.recordType) {
        throw new Error(`draft transaction cannot change recordType from ${current.recordType}.`);
      }

      const stored = normalizeDraftRecord({
        ...next,
        updatedAt: this.now(),
      });
      assertNoDeletedListeningTempAssets(root, stored.assetIds);
      assertNoDeletedListeningTempAssets(root, deriveAssetIds(stored.document));
      transactionResult = {
        kind: 'updated',
        conflictToken: stored.conflictToken,
      };
      const collection = stored.recordType === 'draft' ? 'drafts' : 'revision_drafts';
      root[collection] = { ...(root[collection] ?? {}), [draftId]: stored };
      return root;
    }, undefined, false);

    return transactionResult;
  }

  async claimOperation(input: ClaimOperationInput): Promise<OperationClaim> {
    return firebaseClaimOperation(this.db, input, this.now);
  }

  async completeOperation<T extends ListeningAuthoringOperationResult>(
    operationId: string,
    result: T,
  ): Promise<void> {
    return firebaseCompleteOperation(this.db, operationId, result, this.now);
  }

  async saveDraftTransaction(input: SaveDraftTransactionInput): Promise<SaveDraftTransactionResult> {
    const rootRef = this.db.ref(LISTENING_AUTHORING_ROOT);
    let outcome: SaveDraftTransactionResult | null = null;

    const transaction = await rootRef.transaction((currentValue) => {
      const current: ListeningAuthoringRootState =
        currentValue !== null ? cloneRootState(currentValue as ListeningAuthoringRootState) : {};
      assertNoActiveListeningTempCleanupLease(current, this.now());
      assertNoDeletedListeningTempAssets(current, deriveAssetIds(input.document));
      const drafts = new Map<string, ListeningAuthoringDraftRecord>([
        ...Object.entries(current.drafts ?? {}),
        ...Object.entries(current.revision_drafts ?? {}),
      ]);
      const operationsById = new Map<string, ListeningAuthoringOperationRecord>(
        Object.entries(current.operations ?? {}),
      );
      const operationIdsByLookupKey = new Map<string, string>();
      for (const operation of operationsById.values()) {
        operationIdsByLookupKey.set(createOperationScopeKey(operation), operation.operationId);
      }

      const completedAt = this.now();
      outcome = runSaveDraftMutation(
        { drafts, operationsById, operationIdsByLookupKey },
        input,
        completedAt,
      );

      if (outcome.kind !== 'saved' && outcome.kind !== 'conflict') {
        if (outcome.kind === 'replayed' || outcome.kind === 'idempotency-conflict') {
          return undefined;
        }

        return undefined;
      }

      current.drafts = current.drafts ?? {};
      current.revision_drafts = current.revision_drafts ?? {};
      current.operations = current.operations ?? {};

      const savedDraft = drafts.get(input.draftId);
      if (savedDraft !== undefined) {
        if (savedDraft.recordType === 'draft') {
          current.drafts[input.draftId] = cloneDraftRecord(savedDraft);
        } else {
          current.revision_drafts[input.draftId] = cloneDraftRecord(savedDraft);
        }
      }

      const savedOperation = [...operationsById.values()].find(
        (operation) => operation.operationId === input.operationId,
      );
      if (savedOperation === undefined) {
        throw new Error(`operation ${input.operationId} missing after atomic save.`);
      }
      current.operations[input.operationId] = cloneOperationRecord(savedOperation);

      return current;
    }, undefined, false);

    if (outcome !== null) {
      return outcome;
    }

    if (!transaction.committed) {
      const existing = await findOperationByScopeKey(
        this.db,
        createOperationScopeKey({
          ownerId: input.ownerId,
          operationType: 'save-draft',
          targetId: input.draftId,
          idempotencyKeyHash: input.idempotencyKeyHash,
        }),
      );
      if (existing !== null) {
        if (existing.requestHash !== input.requestHash) {
          return {
            kind: 'idempotency-conflict',
            draftId: input.draftId,
            operationId: existing.operationId,
          };
        }

        if (existing.status === 'succeeded') {
          const result = readTerminalOperationResult(existing);
          return {
            kind: 'replayed',
            created: inferCreatedFromResult(result),
            result,
          };
        }

        if (
          existing.status === 'failed' &&
          (existing.errorCode === 'conflict' || existing.errorCode === 'invalid-state')
        ) {
          const result = readTerminalOperationResult(existing);
          return {
            kind: 'conflict',
            draftId: result.draftId,
            expectedConflictToken: existing.expectedConflictToken,
            currentConflictToken: result.conflictToken,
          };
        }
      }
    }

    throw new Error(`save draft transaction failed for ${input.draftId}.`);
  }

  async publishDraftTransaction(
    input: PublishDraftTransactionInput,
  ): Promise<PublishDraftTransactionResult> {
    return firebasePublishDraftTransaction(this.db, input);
  }

  async legacyFirstEditTransaction(
    input: LegacyFirstEditTransactionInput,
  ): Promise<LegacyFirstEditTransactionResult> {
    return firebaseLegacyFirstEditTransaction(this.db, input);
  }

  async lifecycleTransaction(input: LifecycleTransactionInput): Promise<LifecycleTransactionResult> {
    return firebaseLifecycleTransaction(this.db, input);
  }

  async createVersionTransaction(
    input: CreateListeningPublishedVersionInput,
  ): Promise<
    | { kind: 'created'; record: ListeningPublishedVersionRecord }
    | { kind: 'exists'; record: ListeningPublishedVersionRecord }
  > {
    return createFirebaseVersionTransaction(this.db, input);
  }

  async nextVersionNumberTransaction(testId: string): Promise<number> {
    return nextFirebaseVersionNumber(this.db, testId);
  }

}

export const createFirebaseListeningAuthoringRepository = (
  db: admin.database.Database,
  options?: FirebaseRepositoryOptions,
): ListeningAuthoringRepository => new FirebaseListeningAuthoringRepository(db, options);
