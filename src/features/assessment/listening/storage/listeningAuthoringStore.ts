import type {
  ListeningAuthoringDraftRecord,
  ListeningAuthoringOperationRecord,
  ListeningOperationType,
  ListeningPublishedVersionRecord,
} from '../types/listeningAuthoring.types';

export interface ListeningAuthoringStoreSnapshot {
  readonly drafts: Record<string, ListeningAuthoringDraftRecord>;
  readonly versions: Record<string, ListeningPublishedVersionRecord>;
  readonly operations: Record<string, ListeningAuthoringOperationRecord>;
}

export interface ListeningAuthoringStore {
  getDraft(draftId: string): Promise<ListeningAuthoringDraftRecord | null>;
  writeDraft(record: ListeningAuthoringDraftRecord): Promise<void>;
  getVersion(versionId: string): Promise<ListeningPublishedVersionRecord | null>;
  createVersion(record: ListeningPublishedVersionRecord): Promise<void>;
  writeVersionMetadata(record: ListeningPublishedVersionRecord): Promise<void>;
  getOperation(input: {
    readonly ownerId: string;
    readonly operationType: ListeningOperationType;
    readonly targetId: string;
    readonly idempotencyKeyHash: string;
  }): Promise<ListeningAuthoringOperationRecord | null>;
  writeOperation(record: ListeningAuthoringOperationRecord): Promise<void>;
  listVersionsByTest(testId: string): Promise<ListeningPublishedVersionRecord[]>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const operationKey = (input: {
  readonly ownerId: string;
  readonly operationType: ListeningOperationType;
  readonly targetId: string;
  readonly idempotencyKeyHash: string;
}): string => [
  input.ownerId,
  input.operationType,
  input.targetId,
  input.idempotencyKeyHash,
].join('|');

export function createInMemoryListeningAuthoringStore(initial?: Partial<ListeningAuthoringStoreSnapshot>):
  ListeningAuthoringStore & { snapshot(): ListeningAuthoringStoreSnapshot } {
  const drafts = { ...(initial?.drafts ?? {}) };
  const versions = { ...(initial?.versions ?? {}) };
  const operations = { ...(initial?.operations ?? {}) };

  return {
    async getDraft(draftId) {
      return drafts[draftId] ? clone(drafts[draftId]) : null;
    },
    async writeDraft(record) {
      drafts[record.draftId] = clone(record);
    },
    async getVersion(versionId) {
      return versions[versionId] ? clone(versions[versionId]) : null;
    },
    async createVersion(record) {
      if (versions[record.versionId]) {
        throw new Error('immutable_version_exists');
      }
      versions[record.versionId] = clone(record);
    },
    async writeVersionMetadata(record) {
      const existing = versions[record.versionId];
      if (!existing) {
        throw new Error('version_not_found');
      }
      const immutableBefore = {
        versionId: existing.versionId,
        draftId: existing.draftId,
        ownerId: existing.ownerId,
        testId: existing.testId,
        versionNumber: existing.versionNumber,
        sourceDraftPath: existing.sourceDraftPath,
        sourceDraftId: existing.sourceDraftId,
        sourceLegacyTestId: existing.sourceLegacyTestId,
        document: existing.document,
        documentHash: existing.documentHash,
        retainedPins: existing.retainedPins,
        publishedAt: existing.publishedAt,
        compatibility: existing.compatibility,
      };
      const immutableAfter = {
        versionId: record.versionId,
        draftId: record.draftId,
        ownerId: record.ownerId,
        testId: record.testId,
        versionNumber: record.versionNumber,
        sourceDraftPath: record.sourceDraftPath,
        sourceDraftId: record.sourceDraftId,
        sourceLegacyTestId: record.sourceLegacyTestId,
        document: record.document,
        documentHash: record.documentHash,
        retainedPins: record.retainedPins,
        publishedAt: record.publishedAt,
        compatibility: record.compatibility,
      };
      if (JSON.stringify(immutableBefore) !== JSON.stringify(immutableAfter)) {
        throw new Error('immutable_version_metadata_only');
      }
      versions[record.versionId] = clone(record);
    },
    async getOperation(input) {
      const record = operations[operationKey(input)];
      return record ? clone(record) : null;
    },
    async writeOperation(record) {
      operations[operationKey(record)] = clone(record);
    },
    async listVersionsByTest(testId) {
      return Object.values(versions)
        .filter(version => version.testId === testId)
        .map(clone)
        .sort((a, b) => a.versionNumber - b.versionNumber);
    },
    snapshot() {
      return clone({ drafts, versions, operations });
    },
  };
}
