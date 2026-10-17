import * as admin from 'firebase-admin';

import {
  LISTENING_AUTHORING_PATHS,
  LISTENING_AUTHORING_SCHEMA_VERSION,
} from './constants';
import {
  cloneVersionRecord,
  normalizeVersionMap,
  normalizeVersionRecord,
  type CreateListeningPublishedVersionInput,
  type ListeningPublishedVersionRecord,
} from './repository.shared';

export const createFirebaseVersionTransaction = async (
  db: admin.database.Database,
  input: CreateListeningPublishedVersionInput,
): Promise<
  | { kind: 'created'; record: ListeningPublishedVersionRecord }
  | { kind: 'exists'; record: ListeningPublishedVersionRecord }
> => {
  const versionsRef = db.ref(LISTENING_AUTHORING_PATHS.versions);
  let outcome:
    | { kind: 'created'; record: ListeningPublishedVersionRecord }
    | { kind: 'exists'; record: ListeningPublishedVersionRecord }
    | null = null;
  const transaction = await versionsRef.transaction((currentValue) => {
    const current =
      currentValue !== null
        ? normalizeVersionMap(currentValue as Record<string, unknown>)
        : {};

    const existingById = current[input.versionId];
    if (existingById !== undefined) {
      outcome = { kind: 'exists', record: cloneVersionRecord(existingById) };
      return undefined;
    }

    const versionNumber =
      Object.values(current)
        .filter((existing) => existing.testId === input.testId)
        .reduce((max, existing) => Math.max(max, existing.versionNumber), 0) + 1;

    const created = normalizeVersionRecord({
      ...input,
      schemaVersion: LISTENING_AUTHORING_SCHEMA_VERSION,
      versionNumber,
    });
    outcome = { kind: 'created', record: cloneVersionRecord(created) };

    return {
      ...current,
      [created.versionId]: created,
    };
  }, undefined, false);

  if (outcome !== null) {
    return outcome;
  }

  if (!transaction.committed) {
    throw new Error(`version transaction failed for ${input.versionId}.`);
  }

  throw new Error(`version transaction missing outcome for ${input.versionId}.`);
};

export const nextFirebaseVersionNumber = async (
  db: admin.database.Database,
  testId: string,
): Promise<number> => {
  const snapshot = await db
    .ref(LISTENING_AUTHORING_PATHS.versions)
    .orderByChild('testId')
    .equalTo(testId)
    .once('value');

  if (!snapshot.exists()) {
    return 1;
  }

  const versions = Object.values(
    normalizeVersionMap(snapshot.val() as Record<string, unknown>),
  );
  const maxVersionNumber = versions.reduce(
    (max, version) => Math.max(max, version.versionNumber),
    0,
  );
  return maxVersionNumber + 1;
};
