import * as admin from 'firebase-admin';

import {
  LISTENING_AUTHORING_ROOT,
  cloneDraftRecord,
  cloneRecord,
  cloneVersionRecord,
  type LifecycleTransactionInput,
  type LifecycleTransactionResult,
  type ListeningAuthoringDraftRecord,
  type ListeningAuthoringOperationRecord,
  type ListeningPublishedVersionRecord,
} from './repository.shared';
import {
  cloneOperationRecord,
  createOperationScopeKey,
} from './repository.operationRecords';
import { runLifecycleMutation } from './repository.lifecycleMutation';

interface ListeningAuthoringRootState {
  drafts?: Record<string, ListeningAuthoringDraftRecord>;
  revision_drafts?: Record<string, ListeningAuthoringDraftRecord>;
  versions?: Record<string, ListeningPublishedVersionRecord>;
  operations?: Record<string, ListeningAuthoringOperationRecord>;
}

const cloneRootState = (value: ListeningAuthoringRootState): ListeningAuthoringRootState =>
  cloneRecord(value);

export const firebaseLifecycleTransaction = async (
  db: admin.database.Database,
  input: LifecycleTransactionInput,
): Promise<LifecycleTransactionResult> => {
  const rootRef = db.ref(LISTENING_AUTHORING_ROOT);
  let outcome: LifecycleTransactionResult | null = null;

  const transaction = await rootRef.transaction((currentValue) => {
    const current: ListeningAuthoringRootState =
      currentValue !== null ? cloneRootState(currentValue as ListeningAuthoringRootState) : {};
    const drafts = new Map<string, ListeningAuthoringDraftRecord>([
      ...Object.entries(current.drafts ?? {}),
      ...Object.entries(current.revision_drafts ?? {}),
    ]);
    const versions = new Map<string, ListeningPublishedVersionRecord>(
      Object.entries(current.versions ?? {}),
    );
    const operationsById = new Map<string, ListeningAuthoringOperationRecord>(
      Object.entries(current.operations ?? {}),
    );
    const operationIdsByLookupKey = new Map<string, string>();
    for (const operation of operationsById.values()) {
      operationIdsByLookupKey.set(createOperationScopeKey(operation), operation.operationId);
    }

    outcome = runLifecycleMutation(
      { drafts, versions, operationsById, operationIdsByLookupKey },
      input,
    );

    const savedOperation = operationsById.get(input.operationId);
    if (savedOperation === undefined) {
      return undefined;
    }

    current.drafts = current.drafts ?? {};
    current.revision_drafts = current.revision_drafts ?? {};
    current.versions = current.versions ?? {};
    current.operations = current.operations ?? {};

    const savedDraft = drafts.get(input.targetId);
    if (savedDraft !== undefined) {
      if (savedDraft.recordType === 'draft') {
        current.drafts[input.targetId] = cloneDraftRecord(savedDraft);
      } else {
        current.revision_drafts[input.targetId] = cloneDraftRecord(savedDraft);
      }
    }

    const savedVersion = versions.get(input.targetId);
    if (savedVersion !== undefined) {
      current.versions[input.targetId] = cloneVersionRecord(savedVersion);
    }

    current.operations[input.operationId] = cloneOperationRecord(savedOperation);
    return current;
  }, undefined, false);

  if (outcome !== null) {
    return outcome;
  }

  if (!transaction.committed) {
    throw new Error(`lifecycle transaction failed for ${input.targetId}.`);
  }

  throw new Error(`lifecycle transaction missing outcome for ${input.targetId}.`);
};
