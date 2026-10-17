import * as admin from 'firebase-admin';

import {
  LISTENING_AUTHORING_ROOT,
  cloneDraftRecord,
  cloneRecord,
  cloneVersionRecord,
  type ListeningAuthoringDraftRecord,
  type ListeningAuthoringOperationRecord,
  type ListeningPublishedVersionRecord,
  type PublishDraftTransactionInput,
  type PublishDraftTransactionResult,
} from './repository.shared';
import {
  cloneOperationRecord,
  createOperationScopeKey,
} from './repository.operationRecords';
import { runPublishDraftMutation } from './repository.publishMutation';

interface ListeningAuthoringRootState {
  drafts?: Record<string, ListeningAuthoringDraftRecord>;
  revision_drafts?: Record<string, ListeningAuthoringDraftRecord>;
  versions?: Record<string, ListeningPublishedVersionRecord>;
  operations?: Record<string, ListeningAuthoringOperationRecord>;
}

const cloneRootState = (value: ListeningAuthoringRootState): ListeningAuthoringRootState =>
  cloneRecord(value);

export const firebasePublishDraftTransaction = async (
  db: admin.database.Database,
  input: PublishDraftTransactionInput,
): Promise<PublishDraftTransactionResult> => {
  const rootRef = db.ref(LISTENING_AUTHORING_ROOT);
  let outcome: PublishDraftTransactionResult | null = null;

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
      operationIdsByLookupKey.set(
        createOperationScopeKey(operation),
        operation.operationId,
      );
    }

    outcome = runPublishDraftMutation(
      { drafts, versions, operationsById, operationIdsByLookupKey },
      input,
    );
    if (outcome.kind !== 'published' && outcome.kind !== 'blocked' && outcome.kind !== 'conflict') {
      return undefined;
    }

    current.drafts = current.drafts ?? {};
    current.revision_drafts = current.revision_drafts ?? {};
    current.versions = current.versions ?? {};
    current.operations = current.operations ?? {};

    const savedDraft = drafts.get(input.draftId);
    if (savedDraft !== undefined) {
      if (savedDraft.recordType === 'draft') {
        current.drafts[input.draftId] = cloneDraftRecord(savedDraft);
      } else {
        current.revision_drafts[input.draftId] = cloneDraftRecord(savedDraft);
      }
    }

    const savedVersion = versions.get(input.versionId);
    if (savedVersion !== undefined) {
      current.versions[input.versionId] = cloneVersionRecord(savedVersion);
    }

    const savedOperation = operationsById.get(input.operationId);
    if (savedOperation === undefined) {
      throw new Error(`operation ${input.operationId} missing after publish transaction.`);
    }
    current.operations[input.operationId] = cloneOperationRecord(savedOperation);

    return current;
  }, undefined, false);

  if (outcome !== null) {
    return outcome;
  }

  if (!transaction.committed) {
    throw new Error(`publish transaction failed for ${input.draftId}.`);
  }

  throw new Error(`publish transaction missing outcome for ${input.draftId}.`);
};
