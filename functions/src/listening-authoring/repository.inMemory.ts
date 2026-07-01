import {
  LISTENING_AUTHORING_OPERATION_TTL_MS,
  LISTENING_AUTHORING_SCHEMA_VERSION,
} from './constants';
import {
  cloneOperationRecord,
  createOperationScopeKey,
} from './repository.operationRecords';
import { runLifecycleMutation } from './repository.lifecycleMutation';
import {
  normalizeLegacyListeningTest,
  runLegacyFirstEditMutation,
} from './repository.legacyFirstEditMutation';
import { runPublishDraftMutation } from './repository.publishMutation';
import { runSaveDraftMutation } from './repository.saveDraftMutation';
import {
  cloneDraftRecord,
  cloneRecord,
  cloneVersionRecord,
  extractSequence,
  normalizeDraftRecord,
  normalizeVersionRecord,
  type ClaimOperationInput,
  type CreateListeningPublishedVersionInput,
  type InMemoryListeningAuthoringRepository,
  type InMemoryRepositoryOptions,
  type LegacyFirstEditTransactionInput,
  type LegacyFirstEditTransactionResult,
  type LegacyListeningTestRecord,
  type LifecycleTransactionInput,
  type LifecycleTransactionResult,
  type ListeningAuthoringDraftRecord,
  type ListeningAuthoringOperationRecord,
  type ListeningAuthoringOperationResult,
  type ListeningPublishedVersionRecord,
  type OperationClaim,
  type PublishDraftTransactionInput,
  type PublishDraftTransactionResult,
  type RepositoryIdPrefix,
  type SaveDraftTransactionInput,
  type SaveDraftTransactionResult,
  type UpdateDraftTransactionResult,
} from './repository.shared';

class InMemoryListeningAuthoringRepositoryImpl implements InMemoryListeningAuthoringRepository {
  private readonly now: () => number;

  private readonly drafts = new Map<string, ListeningAuthoringDraftRecord>();

  private readonly legacyTests = new Map<string, LegacyListeningTestRecord>();

  private readonly versions = new Map<string, ListeningPublishedVersionRecord>();

  private readonly operationsById = new Map<string, ListeningAuthoringOperationRecord>();

  private readonly operationIdsByLookupKey = new Map<string, string>();

  private readonly sequences: Record<RepositoryIdPrefix, number> = {
    draft: 1,
    version: 1,
    operation: 1,
  };

  private readonly eventLog: string[] = [];

  constructor(options: InMemoryRepositoryOptions = {}) {
    this.now = options.now ?? Date.now;

    for (const legacyTest of options.seed?.legacyTests ?? []) {
      this.legacyTests.set(
        legacyTest.id,
        normalizeLegacyListeningTest(legacyTest, legacyTest.id),
      );
    }

    for (const draft of options.seed?.drafts ?? []) {
      this.drafts.set(draft.draftId, normalizeDraftRecord(draft));
      this.bumpSequence('draft', draft.draftId);
    }

    for (const version of options.seed?.versions ?? []) {
      const normalized = normalizeVersionRecord(version);
      this.versions.set(version.versionId, normalized);
      this.bumpSequence('version', version.versionId);
    }

    for (const operation of options.seed?.operations ?? []) {
      const normalized = cloneOperationRecord(operation);
      this.operationsById.set(normalized.operationId, normalized);
      this.operationIdsByLookupKey.set(
        createOperationScopeKey(normalized),
        normalized.operationId,
      );
      this.bumpSequence('operation', normalized.operationId);
    }
  }

  allocateId(prefix: RepositoryIdPrefix): string {
    const sequence = this.sequences[prefix];
    this.sequences[prefix] += 1;
    return `${prefix}-${sequence}`;
  }

  async getDraft(draftId: string): Promise<ListeningAuthoringDraftRecord | null> {
    const draft = this.drafts.get(draftId);
    return draft === undefined ? null : cloneDraftRecord(draft);
  }

  async getLegacyTest(testId: string): Promise<LegacyListeningTestRecord | null> {
    const legacyTest = this.legacyTests.get(testId);
    return legacyTest === undefined ? null : cloneRecord(legacyTest);
  }

  async writeDraft(record: ListeningAuthoringDraftRecord): Promise<void> {
    this.drafts.set(record.draftId, normalizeDraftRecord(record));
    this.bumpSequence('draft', record.draftId);
  }

  async updateDraftTransaction(
    draftId: string,
    expectedConflictToken: number,
    updateFn: (draft: ListeningAuthoringDraftRecord) => ListeningAuthoringDraftRecord,
  ): Promise<UpdateDraftTransactionResult> {
    const current = this.drafts.get(draftId);
    if (current === undefined) {
      return { kind: 'missing' };
    }

    if (current.conflictToken !== expectedConflictToken) {
      return { kind: 'conflict', currentConflictToken: current.conflictToken };
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
    this.drafts.set(draftId, stored);

    return {
      kind: 'updated',
      conflictToken: stored.conflictToken,
    };
  }

  async claimOperation(input: ClaimOperationInput): Promise<OperationClaim> {
    const lookupKey = createOperationScopeKey(input);
    const existingOperationId = this.operationIdsByLookupKey.get(lookupKey);
    if (existingOperationId !== undefined) {
      const existing = this.operationsById.get(existingOperationId);
      if (existing === undefined) {
        throw new Error(`operation ${existingOperationId} missing for lookup key ${lookupKey}.`);
      }

      const clonedExisting = cloneOperationRecord(existing);
      return existing.requestHash === input.requestHash
        ? { kind: 'existing', record: clonedExisting }
        : { kind: 'conflict', record: clonedExisting };
    }
    if (this.operationsById.has(input.operationId)) {
      throw new Error(`operation ${input.operationId} already exists.`);
    }

    const createdAt = this.now();
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

    this.operationsById.set(record.operationId, cloneOperationRecord(record));
    this.operationIdsByLookupKey.set(lookupKey, record.operationId);
    this.bumpSequence('operation', record.operationId);
    this.eventLog.push(`claim:${record.operationId}`);

    return { kind: 'claimed', record: cloneOperationRecord(record) };
  }

  async completeOperation<T extends ListeningAuthoringOperationResult>(
    operationId: string,
    result: T,
  ): Promise<void> {
    const current = this.operationsById.get(operationId);
    if (current === undefined) {
      throw new Error(`operation ${operationId} not found.`);
    }

    if (current.status === 'succeeded') {
      return;
    }
    if (current.status === 'failed') {
      throw new Error(`operation ${operationId} already failed.`);
    }

    const completedAt = this.now();
    const updated: ListeningAuthoringOperationRecord<T> = {
      ...cloneOperationRecord(current),
      status: 'succeeded',
      result: cloneRecord(result),
      completedAt,
      expiresAt: completedAt + LISTENING_AUTHORING_OPERATION_TTL_MS,
    };

    this.operationsById.set(operationId, cloneOperationRecord(updated));
  }

  async saveDraftTransaction(input: SaveDraftTransactionInput): Promise<SaveDraftTransactionResult> {
    const result = runSaveDraftMutation(
      {
        drafts: this.drafts,
        operationsById: this.operationsById,
        operationIdsByLookupKey: this.operationIdsByLookupKey,
      },
      input,
      this.now(),
    );

    if (this.operationsById.has(input.operationId)) {
      this.bumpSequence('operation', input.operationId);
    }

    return result;
  }

  async publishDraftTransaction(
    input: PublishDraftTransactionInput,
  ): Promise<PublishDraftTransactionResult> {
    const result = runPublishDraftMutation(
      {
        drafts: this.drafts,
        versions: this.versions,
        operationsById: this.operationsById,
        operationIdsByLookupKey: this.operationIdsByLookupKey,
      },
      input,
    );

    if (this.operationsById.has(input.operationId)) {
      this.bumpSequence('operation', input.operationId);
    }
    if (this.versions.has(input.versionId)) {
      this.bumpSequence('version', input.versionId);
    }

    return result;
  }

  async legacyFirstEditTransaction(
    input: LegacyFirstEditTransactionInput,
  ): Promise<LegacyFirstEditTransactionResult> {
    const result = runLegacyFirstEditMutation(
      {
        legacyTests: this.legacyTests,
        drafts: this.drafts,
        versions: this.versions,
        operationsById: this.operationsById,
        operationIdsByLookupKey: this.operationIdsByLookupKey,
      },
      input,
    );

    if (this.operationsById.has(input.operationId)) {
      this.bumpSequence('operation', input.operationId);
    }
    if (this.versions.has(input.versionId)) {
      this.bumpSequence('version', input.versionId);
    }
    if (this.drafts.has(input.revisionDraftId)) {
      this.bumpSequence('draft', input.revisionDraftId);
    }

    return result;
  }

  async lifecycleTransaction(input: LifecycleTransactionInput): Promise<LifecycleTransactionResult> {
    const result = runLifecycleMutation(
      {
        drafts: this.drafts,
        versions: this.versions,
        operationsById: this.operationsById,
        operationIdsByLookupKey: this.operationIdsByLookupKey,
      },
      input,
    );

    if (this.operationsById.has(input.operationId)) {
      this.bumpSequence('operation', input.operationId);
    }

    return result;
  }

  async createVersionTransaction(
    input: CreateListeningPublishedVersionInput,
  ): Promise<
    | { kind: 'created'; record: ListeningPublishedVersionRecord }
    | { kind: 'exists'; record: ListeningPublishedVersionRecord }
  > {
    const existingById = this.versions.get(input.versionId);
    if (existingById !== undefined) {
      return { kind: 'exists', record: cloneVersionRecord(existingById) };
    }

    const versionNumber =
      [...this.versions.values()]
        .filter((existing) => existing.testId === input.testId)
        .reduce((max, existing) => Math.max(max, existing.versionNumber), 0) + 1;

    const created = normalizeVersionRecord({
      ...input,
      schemaVersion: LISTENING_AUTHORING_SCHEMA_VERSION,
      versionNumber,
    });
    this.versions.set(created.versionId, created);
    this.bumpSequence('version', created.versionId);

    return { kind: 'created', record: cloneVersionRecord(created) };
  }

  async nextVersionNumberTransaction(testId: string): Promise<number> {
    return (
      [...this.versions.values()]
        .filter((existing) => existing.testId === testId)
        .reduce((max, existing) => Math.max(max, existing.versionNumber), 0) + 1
    );
  }

  events(): readonly string[] {
    return [...this.eventLog];
  }

  listOperationClaims(): readonly ListeningAuthoringOperationRecord[] {
    return [...this.operationsById.values()].map((record) => cloneOperationRecord(record));
  }

  listVersions(): readonly ListeningPublishedVersionRecord[] {
    return [...this.versions.values()].map((record) => cloneVersionRecord(record));
  }

  private bumpSequence(prefix: RepositoryIdPrefix, value: string): void {
    const sequence = extractSequence(value, prefix);
    if (sequence !== undefined) {
      this.sequences[prefix] = Math.max(this.sequences[prefix], sequence + 1);
    }
  }
}

export const createInMemoryListeningAuthoringRepository = (
  options: InMemoryRepositoryOptions = {},
): InMemoryListeningAuthoringRepository =>
  new InMemoryListeningAuthoringRepositoryImpl(options);
