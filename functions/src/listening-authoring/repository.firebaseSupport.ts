import * as admin from 'firebase-admin';

import { LISTENING_AUTHORING_PATHS } from './constants';
import {
  cloneOperationRecord,
  createOperationScopeKey,
} from './repository.operationRecords';
import {
  normalizeDraftRecord,
  type ListeningAuthoringDraftRecord,
  type ListeningAuthoringOperationRecord,
  type RepositoryIdPrefix,
} from './repository.shared';

export const pathForPrefix = (prefix: RepositoryIdPrefix): string => {
  switch (prefix) {
    case 'draft':
      return LISTENING_AUTHORING_PATHS.drafts;
    case 'version':
      return LISTENING_AUTHORING_PATHS.versions;
    case 'operation':
      return LISTENING_AUTHORING_PATHS.operations;
  }
};

export const pathForDraftRecord = (record: ListeningAuthoringDraftRecord): string =>
  record.recordType === 'draft'
    ? LISTENING_AUTHORING_PATHS.drafts
    : LISTENING_AUTHORING_PATHS.revisionDrafts;

export const findDraftLocation = async (
  db: admin.database.Database,
  draftId: string,
): Promise<{ ref: admin.database.Reference; record: ListeningAuthoringDraftRecord } | null> => {
  const draftRef = db.ref(`${LISTENING_AUTHORING_PATHS.drafts}/${draftId}`);
  const draftSnapshot = await draftRef.once('value');
  if (draftSnapshot.exists()) {
    return {
      ref: draftRef,
      record: normalizeDraftRecord(draftSnapshot.val() as ListeningAuthoringDraftRecord),
    };
  }

  const revisionDraftRef = db.ref(
    `${LISTENING_AUTHORING_PATHS.revisionDrafts}/${draftId}`,
  );
  const revisionDraftSnapshot = await revisionDraftRef.once('value');
  if (revisionDraftSnapshot.exists()) {
    return {
      ref: revisionDraftRef,
      record: normalizeDraftRecord(
        revisionDraftSnapshot.val() as ListeningAuthoringDraftRecord,
      ),
    };
  }

  return null;
};

export const findOperationByScopeKey = async (
  db: admin.database.Database,
  scopeKey: string,
): Promise<ListeningAuthoringOperationRecord | null> => {
  const scopeParts = scopeKey.split('::');
  const idempotencyKeyHash = scopeParts[scopeParts.length - 1] ?? '';
  const snapshot = await db
    .ref(LISTENING_AUTHORING_PATHS.operations)
    .orderByChild('idempotencyKeyHash')
    .equalTo(idempotencyKeyHash)
    .once('value');

  if (!snapshot.exists()) {
    return null;
  }

  const records = Object.values(
    snapshot.val() as Record<string, ListeningAuthoringOperationRecord>,
  );
  const matchedRecord = records.find(
    (record) => createOperationScopeKey(record) === scopeKey,
  );
  return matchedRecord === undefined ? null : cloneOperationRecord(matchedRecord);
};
