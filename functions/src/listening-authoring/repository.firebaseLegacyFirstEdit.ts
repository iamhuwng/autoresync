import * as admin from 'firebase-admin';

import {
  cloneOperationRecord,
  createOperationScopeKey,
  deriveAssetIds,
} from './repository.operationRecords';
import {
  normalizeLegacyListeningTest,
  runLegacyFirstEditMutation,
} from './repository.legacyFirstEditMutation';
import {
  assertNoActiveListeningTempCleanupLease,
  assertNoDeletedListeningTempAssets,
  cloneDraftRecord,
  cloneRecord,
  cloneVersionRecord,
  type LegacyFirstEditTransactionInput,
  type LegacyFirstEditTransactionResult,
  type LegacyListeningTestRecord,
  type ListeningAuthoringDraftRecord,
  type ListeningAuthoringOperationRecord,
  type ListeningPublishedVersionRecord,
} from './repository.shared';

interface ListeningAuthoringRootState {
  drafts?: Record<string, ListeningAuthoringDraftRecord>;
  revision_drafts?: Record<string, ListeningAuthoringDraftRecord>;
  versions?: Record<string, ListeningPublishedVersionRecord>;
  operations?: Record<string, ListeningAuthoringOperationRecord>;
}

interface DatabaseRootState {
  tests?: Record<string, unknown>;
  listening_authoring?: ListeningAuthoringRootState;
  [path: string]: unknown;
}

export const firebaseLegacyFirstEditTransaction = async (
  db: admin.database.Database,
  input: LegacyFirstEditTransactionInput,
): Promise<LegacyFirstEditTransactionResult> => {
  const rootRef = db.ref();
  let outcome: LegacyFirstEditTransactionResult | null = null;

  const transaction = await rootRef.transaction((currentValue) => {
    const current: DatabaseRootState =
      currentValue !== null ? cloneRecord(currentValue as DatabaseRootState) : {};
    const authoring = current.listening_authoring ?? {};
    assertNoActiveListeningTempCleanupLease(authoring, Date.now());
    const rawLegacyTests = current.tests ?? {};
    const legacyTests = new Map<string, LegacyListeningTestRecord>();
    for (const [testId, value] of Object.entries(rawLegacyTests)) {
      if (testId === input.legacyTestId) {
        const normalized = normalizeLegacyListeningTest(value, testId);
        assertNoDeletedListeningTempAssets(authoring, deriveAssetIds(normalized));
        legacyTests.set(testId, normalized);
      }
    }
    const drafts = new Map<string, ListeningAuthoringDraftRecord>([
      ...Object.entries(authoring.drafts ?? {}),
      ...Object.entries(authoring.revision_drafts ?? {}),
    ]);
    const versions = new Map<string, ListeningPublishedVersionRecord>(
      Object.entries(authoring.versions ?? {}),
    );
    const operationsById = new Map<string, ListeningAuthoringOperationRecord>(
      Object.entries(authoring.operations ?? {}),
    );
    const operationIdsByLookupKey = new Map<string, string>();
    for (const operation of operationsById.values()) {
      operationIdsByLookupKey.set(createOperationScopeKey(operation), operation.operationId);
    }

    outcome = runLegacyFirstEditMutation(
      { legacyTests, drafts, versions, operationsById, operationIdsByLookupKey },
      input,
    );
    const savedOperation = operationsById.get(input.operationId);
    if (savedOperation === undefined) {
      return undefined;
    }

    const savedLegacyTest = legacyTests.get(input.legacyTestId);
    const savedDraft = drafts.get(input.revisionDraftId);
    const savedVersion = versions.get(input.versionId);
    if (
      savedLegacyTest === undefined ||
      savedDraft === undefined ||
      savedVersion === undefined
    ) {
      throw new Error(`legacy first-edit transaction incomplete for ${input.legacyTestId}.`);
    }

    current.tests = {
      ...rawLegacyTests,
      [input.legacyTestId]: cloneRecord(savedLegacyTest),
    };
    current.listening_authoring = {
      ...authoring,
      drafts: authoring.drafts ?? {},
      revision_drafts: {
        ...(authoring.revision_drafts ?? {}),
        [savedDraft.draftId]: cloneDraftRecord(savedDraft),
      },
      versions: {
        ...(authoring.versions ?? {}),
        [savedVersion.versionId]: cloneVersionRecord(savedVersion),
      },
      operations: {
        ...(authoring.operations ?? {}),
        [savedOperation.operationId]: cloneOperationRecord(savedOperation),
      },
    };
    return current;
  }, undefined, false);

  if (outcome !== null) {
    return outcome;
  }
  if (!transaction.committed) {
    throw new Error(`legacy first-edit transaction failed for ${input.legacyTestId}.`);
  }
  throw new Error(`legacy first-edit transaction missing outcome for ${input.legacyTestId}.`);
};
