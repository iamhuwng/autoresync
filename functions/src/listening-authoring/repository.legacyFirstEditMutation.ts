import { requestHash } from './canonical';
import {
  LISTENING_AUTHORING_SCHEMA_VERSION,
  LISTENING_LEGACY_FREEZE_DECISION_REF,
} from './constants';
import {
  createOperationScopeKey,
  createSucceededOperationRecord,
  deriveAssetIds,
} from './repository.operationRecords';
import {
  cloneDraftRecord,
  cloneRecord,
  cloneVersionRecord,
  isPlainObject,
  normalizeDraftRecord,
  normalizeVersionRecord,
  type LegacyFirstEditTransactionInput,
  type LegacyFirstEditTransactionResult,
  type LegacyListeningTestRecord,
  type ListeningAuthoringDraftRecord,
  type ListeningAuthoringOperationRecord,
  type ListeningPublishedVersionRecord,
  type PublishedDraftTransactionPayload,
} from './repository.shared';
import type { ListeningAuthoringDocumentV1 } from './contracts';
import { parseDocument } from './validation.document';

export interface LegacyFirstEditMutationState {
  legacyTests: Map<string, LegacyListeningTestRecord>;
  drafts: Map<string, ListeningAuthoringDraftRecord>;
  versions: Map<string, ListeningPublishedVersionRecord>;
  operationsById: Map<string, ListeningAuthoringOperationRecord>;
  operationIdsByLookupKey: Map<string, string>;
}

const documentFieldNames = [
  'title',
  'type',
  'skill',
  'duration',
  'difficulty',
  'questionCount',
  'isPublic',
  'isComplete',
  'missingAnswerCount',
  'displayMode',
  'metadata',
  'audioSections',
  'questionImages',
  'questions',
  'settings',
  'statistics',
] as const;

const requireFiniteNumber = (value: unknown, fieldName: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }
  return value;
};

const requireNonEmptyString = (value: unknown, fieldName: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value;
};

const readLegacyDocument = (
  value: unknown,
): ListeningAuthoringDocumentV1 => {
  if (!isPlainObject(value)) {
    throw new Error('legacy listening document must be a plain object.');
  }
  const documentInput = Object.fromEntries(
    documentFieldNames
      .filter((fieldName) => Object.prototype.hasOwnProperty.call(value, fieldName))
      .map((fieldName) => [fieldName, value[fieldName]]),
  );
  parseDocument(documentInput);
  return cloneRecord(documentInput) as unknown as ListeningAuthoringDocumentV1;
};

export const normalizeLegacyListeningTest = (
  value: unknown,
  expectedTestId: string,
): LegacyListeningTestRecord => {
  if (!isPlainObject(value)) {
    throw new Error(`legacy test ${expectedTestId} must be a plain object.`);
  }

  const id = requireNonEmptyString(value.id, `legacy test ${expectedTestId}.id`);
  if (id !== expectedTestId) {
    throw new Error(`legacy test path/id mismatch for ${expectedTestId}.`);
  }
  requireNonEmptyString(
    value.ownerId,
    `legacy test ${expectedTestId}.ownerId`,
  );
  requireNonEmptyString(
    value.createdBy,
    `legacy test ${expectedTestId}.createdBy`,
  );
  if (value.isPublished !== true) {
    throw new Error(`legacy test ${expectedTestId} must be published.`);
  }

  readLegacyDocument(value);
  requireFiniteNumber(value.createdAt, `legacy test ${expectedTestId}.createdAt`);
  requireFiniteNumber(value.updatedAt, `legacy test ${expectedTestId}.updatedAt`);
  const normalized = cloneRecord(value) as unknown as LegacyListeningTestRecord;

  if (value.authoringVersioning !== undefined) {
    if (!isPlainObject(value.authoringVersioning)) {
      throw new Error(`legacy test ${expectedTestId}.authoringVersioning must be a record.`);
    }
    const metadata = value.authoringVersioning;
    if (
      metadata.frozen !== true ||
      metadata.versionNumber !== 1 ||
      metadata.decisionRef !== LISTENING_LEGACY_FREEZE_DECISION_REF
    ) {
      throw new Error(`legacy test ${expectedTestId} has malformed freeze metadata.`);
    }
    requireNonEmptyString(
      metadata.versionId,
      `legacy test ${expectedTestId}.authoringVersioning.versionId`,
    );
    requireFiniteNumber(
      metadata.frozenAt,
      `legacy test ${expectedTestId}.authoringVersioning.frozenAt`,
    );
    requireNonEmptyString(
      metadata.frozenBy,
      `legacy test ${expectedTestId}.authoringVersioning.frozenBy`,
    );
  }

  return normalized;
};

const readPublishedResult = (
  operation: ListeningAuthoringOperationRecord,
): PublishedDraftTransactionPayload => {
  const result = operation.result;
  if (
    operation.completedAt === undefined ||
    result === undefined ||
    typeof result.draftId !== 'string' ||
    typeof result.versionId !== 'string' ||
    typeof result.versionNumber !== 'number' ||
    typeof result.conflictToken !== 'number'
  ) {
    throw new Error(`malformed legacy publish operation ${operation.operationId}.`);
  }
  return {
    draftId: result.draftId,
    versionId: result.versionId,
    versionNumber: result.versionNumber,
    conflictToken: result.conflictToken,
  };
};

const findRevisionDraft = (
  state: LegacyFirstEditMutationState,
  legacyTestId: string,
  versionId: string,
): ListeningAuthoringDraftRecord | undefined =>
  [...state.drafts.values()].find((draft) => (
    draft.recordType === 'revision-draft'
    && draft.testId === legacyTestId
    && draft.createdFromVersionId === versionId
  ));

const freezeLegacyFromVersion = (
  state: LegacyFirstEditMutationState,
  input: LegacyFirstEditTransactionInput,
  version: ListeningPublishedVersionRecord,
): void => {
  const legacy = state.legacyTests.get(input.legacyTestId);
  if (legacy === undefined || legacy.ownerId !== input.ownerId || legacy.authoringVersioning) {
    return;
  }
  state.legacyTests.set(input.legacyTestId, {
    ...cloneRecord(legacy),
    authoringVersioning: {
      frozen: true,
      versionId: version.versionId,
      versionNumber: 1,
      frozenAt: version.publishedAt,
      frozenBy: version.publishedBy,
      decisionRef: LISTENING_LEGACY_FREEZE_DECISION_REF,
    },
  });
};

export const runLegacyFirstEditMutation = (
  state: LegacyFirstEditMutationState,
  input: LegacyFirstEditTransactionInput,
): LegacyFirstEditTransactionResult => {
  const scopeKey = createOperationScopeKey({
    ownerId: input.ownerId,
    operationType: 'publish',
    targetId: input.legacyTestId,
    idempotencyKeyHash: input.idempotencyKeyHash,
  });
  const existingOperationId = state.operationIdsByLookupKey.get(scopeKey);
  if (existingOperationId !== undefined) {
    const existingOperation = state.operationsById.get(existingOperationId);
    if (existingOperation === undefined) {
      throw new Error(`operation ${existingOperationId} missing for legacy publish.`);
    }
    if (existingOperation.requestHash !== input.requestHash) {
      return {
        kind: 'idempotency-conflict',
        draftId: input.revisionDraftId,
        operationId: existingOperation.operationId,
      };
    }
    if (existingOperation.status !== 'succeeded') {
      throw new Error(`malformed legacy publish operation ${existingOperation.operationId}.`);
    }
    const result = readPublishedResult(existingOperation);
    const version = state.versions.get(result.versionId);
    const revision = state.drafts.get(result.draftId);
    if (
      version !== undefined &&
      revision !== undefined &&
      version.versionNumber === 1 &&
      version.sourceDraftPath === 'legacy_tests' &&
      version.sourceLegacyTestId === input.legacyTestId
    ) {
      freezeLegacyFromVersion(state, input, version);
    }
    return { kind: 'replayed', result };
  }
  if (state.operationsById.has(input.operationId)) {
    throw new Error(`operation ${input.operationId} already exists.`);
  }

  const legacy = state.legacyTests.get(input.legacyTestId);
  if (legacy === undefined || legacy.ownerId !== input.ownerId) {
    return { kind: 'not-found', draftId: input.revisionDraftId };
  }

  const existingFreeze = legacy.authoringVersioning;
  if (existingFreeze !== undefined) {
    const version = state.versions.get(existingFreeze.versionId);
    const revision = [...state.drafts.values()].find((draft) => (
      draft.recordType === 'revision-draft'
      && draft.testId === input.legacyTestId
      && draft.createdFromVersionId === existingFreeze.versionId
    ));
    if (
      version === undefined ||
      revision === undefined ||
      version.versionNumber !== 1 ||
      version.sourceDraftPath !== 'legacy_tests' ||
      version.sourceLegacyTestId !== input.legacyTestId
    ) {
      throw new Error(`legacy test ${input.legacyTestId} freeze links are incomplete.`);
    }
    const result: PublishedDraftTransactionPayload = {
      draftId: revision.draftId,
      versionId: version.versionId,
      versionNumber: version.versionNumber,
      conflictToken: revision.conflictToken,
    };
    const operation = createSucceededOperationRecord({
      operationId: input.operationId,
      operationType: 'publish',
      targetType: 'legacy-test',
      ownerId: input.ownerId,
      targetId: input.legacyTestId,
      idempotencyKeyHash: input.idempotencyKeyHash,
      requestHash: input.requestHash,
      result,
      completedAt: input.publishedAt,
    });
    state.operationsById.set(operation.operationId, operation);
    state.operationIdsByLookupKey.set(scopeKey, operation.operationId);
    return { kind: 'replayed', result };
  }

  const duplicateLegacyVersion = [...state.versions.values()].find((version) => (
    version.sourceDraftPath === 'legacy_tests'
    && version.sourceLegacyTestId === input.legacyTestId
  ));
  if (duplicateLegacyVersion !== undefined) {
    const revision = findRevisionDraft(state, input.legacyTestId, duplicateLegacyVersion.versionId);
    if (
      revision === undefined ||
      duplicateLegacyVersion.versionNumber !== 1 ||
      duplicateLegacyVersion.ownerId !== input.ownerId ||
      duplicateLegacyVersion.publishOperationId === undefined
    ) {
      throw new Error(`legacy test ${input.legacyTestId} has conflicting versioning state.`);
    }
    const result: PublishedDraftTransactionPayload = {
      draftId: revision.draftId,
      versionId: duplicateLegacyVersion.versionId,
      versionNumber: duplicateLegacyVersion.versionNumber,
      conflictToken: revision.conflictToken,
    };
    const operation = createSucceededOperationRecord({
      operationId: input.operationId,
      operationType: 'publish',
      targetType: 'legacy-test',
      ownerId: input.ownerId,
      targetId: input.legacyTestId,
      idempotencyKeyHash: input.idempotencyKeyHash,
      requestHash: input.requestHash,
      result,
      completedAt: input.publishedAt,
    });
    state.operationsById.set(operation.operationId, operation);
    state.operationIdsByLookupKey.set(scopeKey, operation.operationId);
    freezeLegacyFromVersion(state, input, duplicateLegacyVersion);
    return { kind: 'replayed', result };
  }
  if (
    state.versions.has(input.versionId) ||
    state.drafts.has(input.revisionDraftId)
  ) {
    throw new Error(`legacy test ${input.legacyTestId} has conflicting versioning state.`);
  }

  const document = readLegacyDocument(legacy);
  const assetIds = deriveAssetIds(document);
  const version = normalizeVersionRecord({
    schemaVersion: LISTENING_AUTHORING_SCHEMA_VERSION,
    recordType: 'published-version',
    versionId: input.versionId,
    versionNumber: 1,
    testId: input.legacyTestId,
    ownerId: input.ownerId,
    sourceDraftPath: 'legacy_tests',
    sourceLegacyTestId: input.legacyTestId,
    document: cloneRecord(document),
    assetIds,
    publishedAt: input.publishedAt,
    publishedBy: input.ownerId,
    publishOperationId: input.operationId,
    documentHash: requestHash(document),
    archive: { state: 'active' },
    compatibility: {
      legacyTestPath: `tests/${input.legacyTestId}`,
      frozenLegacyVersion1: true,
    },
  });
  const revision = normalizeDraftRecord({
    schemaVersion: LISTENING_AUTHORING_SCHEMA_VERSION,
    recordType: 'revision-draft',
    draftId: input.revisionDraftId,
    testId: input.legacyTestId,
    ownerId: input.ownerId,
    state: 'active',
    conflictToken: 1,
    createdFromVersionId: version.versionId,
    createdFromVersionNumber: 1,
    document: cloneRecord(document),
    assetIds,
    createdAt: input.publishedAt,
    createdBy: input.ownerId,
    updatedAt: input.publishedAt,
    updatedBy: input.ownerId,
    lastOperationId: input.operationId,
  });
  const result: PublishedDraftTransactionPayload = {
    draftId: revision.draftId,
    versionId: version.versionId,
    versionNumber: 1,
    conflictToken: 1,
  };
  const operation = createSucceededOperationRecord({
    operationId: input.operationId,
    operationType: 'publish',
    targetType: 'legacy-test',
    ownerId: input.ownerId,
    targetId: input.legacyTestId,
    idempotencyKeyHash: input.idempotencyKeyHash,
    requestHash: input.requestHash,
    result,
    completedAt: input.publishedAt,
  });

  state.legacyTests.set(input.legacyTestId, {
    ...cloneRecord(legacy),
    authoringVersioning: {
      frozen: true,
      versionId: version.versionId,
      versionNumber: 1,
      frozenAt: input.publishedAt,
      frozenBy: input.ownerId,
      decisionRef: LISTENING_LEGACY_FREEZE_DECISION_REF,
    },
  });
  state.versions.set(version.versionId, cloneVersionRecord(version));
  state.drafts.set(revision.draftId, cloneDraftRecord(revision));
  state.operationsById.set(operation.operationId, operation);
  state.operationIdsByLookupKey.set(scopeKey, operation.operationId);

  return { kind: 'published', result };
};
