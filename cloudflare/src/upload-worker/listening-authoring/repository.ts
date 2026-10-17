import {
  LISTENING_AUTHORING_ROOT,
  cloneDraftRecord,
  cloneRecord,
  cloneVersionRecord,
  normalizeDraftRecord,
  normalizeVersionRecord,
  type CreateListeningPublishedVersionInput,
  type LifecycleTransactionInput,
  type LifecycleTransactionResult,
  type LegacyFirstEditTransactionInput,
  type LegacyFirstEditTransactionResult,
  type LegacyListeningTestRecord,
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
} from '../../../../functions/src/listening-authoring/repository.shared.ts';
import {
  cloneOperationRecord,
  createOperationScopeKey,
} from '../../../../functions/src/listening-authoring/repository.operationRecords.ts';
import { runLifecycleMutation } from '../../../../functions/src/listening-authoring/repository.lifecycleMutation.ts';
import {
  normalizeLegacyListeningTest,
  runLegacyFirstEditMutation,
} from '../../../../functions/src/listening-authoring/repository.legacyFirstEditMutation.ts';
import { runPublishDraftMutation } from '../../../../functions/src/listening-authoring/repository.publishMutation.ts';
import { runSaveDraftMutation } from '../../../../functions/src/listening-authoring/repository.saveDraftMutation.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from './rtdb.ts';

interface ListeningAuthoringRootState {
  drafts?: Record<string, ListeningAuthoringDraftRecord>;
  revision_drafts?: Record<string, ListeningAuthoringDraftRecord>;
  versions?: Record<string, ListeningPublishedVersionRecord>;
  operations?: Record<string, ListeningAuthoringOperationRecord>;
}
const DEFAULT_MAX_RETRIES = 5;
const normalizeRoot = (value: unknown): ListeningAuthoringRootState =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? cloneRecord(value as ListeningAuthoringRootState)
    : {};
const operationLookup = (
  operations: Map<string, ListeningAuthoringOperationRecord>,
): Map<string, string> => {
  const lookup = new Map<string, string>();
  for (const operation of operations.values()) {
    lookup.set(createOperationScopeKey(operation), operation.operationId);
  }
  return lookup;
};
const rootMaps = (root: ListeningAuthoringRootState) => ({
  drafts: new Map<string, ListeningAuthoringDraftRecord>([
    ...Object.entries(root.drafts ?? {}),
    ...Object.entries(root.revision_drafts ?? {}),
  ]),
  versions: new Map<string, ListeningPublishedVersionRecord>(Object.entries(root.versions ?? {})),
  operationsById: new Map<string, ListeningAuthoringOperationRecord>(
    Object.entries(root.operations ?? {}),
  ),
});
const persistRootMaps = (
  root: ListeningAuthoringRootState,
  maps: ReturnType<typeof rootMaps>,
): ListeningAuthoringRootState => {
  const next: ListeningAuthoringRootState = {
    ...root,
    drafts: { ...(root.drafts ?? {}) },
    revision_drafts: { ...(root.revision_drafts ?? {}) },
    versions: { ...(root.versions ?? {}) },
    operations: { ...(root.operations ?? {}) },
  };
  for (const draft of maps.drafts.values()) {
    if (draft.recordType === 'draft') {
      next.drafts![draft.draftId] = cloneDraftRecord(draft);
    } else {
      next.revision_drafts![draft.draftId] = cloneDraftRecord(draft);
    }
  }
  for (const version of maps.versions.values()) {
    next.versions![version.versionId] = cloneVersionRecord(version);
  }
  for (const operation of maps.operationsById.values()) {
    next.operations![operation.operationId] = cloneOperationRecord(operation);
  }
  return next;
};
export class FirebaseRestListeningAuthoringRepository implements ListeningAuthoringRepository {
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(
    private readonly options: {
      env: RepositoryEnv;
      fetchImpl?: typeof fetch;
      getAccessToken?: () => Promise<string>;
      maxRetries?: number;
      now?: () => number;
    },
  ) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.rtdb = new FirebaseRtdbRestClient({
      env: options.env,
      fetchImpl: this.fetchImpl,
      getAccessToken: options.getAccessToken,
    });
  }
  allocateId(prefix: RepositoryIdPrefix): string {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  async getDraft(draftId: string): Promise<ListeningAuthoringDraftRecord | null> {
    const root = await this.readRoot();
    return root.drafts?.[draftId] ?? root.revision_drafts?.[draftId] ?? null;
  }
  async writeDraft(record: ListeningAuthoringDraftRecord): Promise<void> {
    await this.withRootTransaction((root) => {
      const maps = rootMaps(root);
      maps.drafts.set(record.draftId, normalizeDraftRecord(record));
      return { outcome: undefined, nextRoot: persistRootMaps(root, maps), shouldWrite: true };
    });
  }
  async updateDraftTransaction(
    draftId: string,
    expectedConflictToken: number,
    updateFn: (draft: ListeningAuthoringDraftRecord) => ListeningAuthoringDraftRecord,
  ): Promise<UpdateDraftTransactionResult> {
    return this.withRootTransaction((root) => {
      const maps = rootMaps(root);
      const current = maps.drafts.get(draftId);
      if (!current) return { outcome: { kind: 'missing' as const } };
      if (current.conflictToken !== expectedConflictToken) {
        return { outcome: { kind: 'conflict' as const, currentConflictToken: current.conflictToken } };
      }
      const next = normalizeDraftRecord({
        ...updateFn(cloneDraftRecord(current)),
        updatedAt: this.now(),
      });
      maps.drafts.set(draftId, next);
      return {
        outcome: { kind: 'updated' as const, conflictToken: next.conflictToken },
        nextRoot: persistRootMaps(root, maps),
        shouldWrite: true,
      };
    });
  }
  async claimOperation(): Promise<OperationClaim> {
    throw new Error('claimOperation is not used by Worker authoring mutations.');
  }
  async completeOperation<T extends ListeningAuthoringOperationResult>(
    _operationId: string,
    _result: T,
  ): Promise<void> {
    throw new Error('completeOperation is not used by Worker authoring mutations.');
  }
  async saveDraftTransaction(input: SaveDraftTransactionInput): Promise<SaveDraftTransactionResult> {
    return this.withRootTransaction((root) => {
      const maps = rootMaps(root);
      const outcome = runSaveDraftMutation(
        {
          drafts: maps.drafts,
          operationsById: maps.operationsById,
          operationIdsByLookupKey: operationLookup(maps.operationsById),
        },
        input,
        this.now(),
      );
      const shouldWrite = outcome.kind === 'saved' || outcome.kind === 'conflict';
      return {
        outcome,
        nextRoot: shouldWrite ? persistRootMaps(root, maps) : root,
        shouldWrite,
      };
    });
  }
  async publishDraftTransaction(
    input: PublishDraftTransactionInput,
  ): Promise<PublishDraftTransactionResult> {
    return this.withRootTransaction((root) => {
      const maps = rootMaps(root);
      const outcome = runPublishDraftMutation(
        {
          drafts: maps.drafts,
          versions: maps.versions,
          operationsById: maps.operationsById,
          operationIdsByLookupKey: operationLookup(maps.operationsById),
        },
        input,
      );
      const shouldWrite = (
        outcome.kind === 'published' ||
        outcome.kind === 'blocked' ||
        outcome.kind === 'conflict'
      );
      return {
        outcome,
        nextRoot: shouldWrite ? persistRootMaps(root, maps) : root,
        shouldWrite,
      };
    });
  }
  async legacyFirstEditTransaction(
    input: LegacyFirstEditTransactionInput,
  ): Promise<LegacyFirstEditTransactionResult> {
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const authoringCurrent = await this.rtdb.readWithEtag<ListeningAuthoringRootState | null>(
        LISTENING_AUTHORING_ROOT,
      );
      const legacyCurrent = await this.rtdb.readWithEtag<LegacyListeningTestRecord | null>(
        `tests/${input.legacyTestId}`,
      );
      const authoringRoot = normalizeRoot(authoringCurrent.data);
      const maps = rootMaps(authoringRoot);
      const legacyTests = new Map<string, LegacyListeningTestRecord>();
      if (legacyCurrent.data !== null) {
        legacyTests.set(
          input.legacyTestId,
          normalizeLegacyListeningTest(legacyCurrent.data, input.legacyTestId),
        );
      }
      const outcome = runLegacyFirstEditMutation(
        {
          legacyTests,
          drafts: maps.drafts,
          versions: maps.versions,
          operationsById: maps.operationsById,
          operationIdsByLookupKey: operationLookup(maps.operationsById),
        },
        input,
      );
      const shouldWrite = outcome.kind === 'published' || outcome.kind === 'replayed';
      const frozen = legacyTests.get(input.legacyTestId);
      if (!shouldWrite || !frozen) return outcome;
      const authoringMatched = await this.rtdb.writeIfMatch(
        LISTENING_AUTHORING_ROOT,
        persistRootMaps(authoringRoot, maps),
        authoringCurrent.etag,
      );
      if (!authoringMatched) continue;
      const legacyMatched = await this.rtdb.writeIfMatch(
        `tests/${input.legacyTestId}`,
        cloneRecord(frozen),
        legacyCurrent.etag,
      );
      if (!legacyMatched) continue;
      return outcome;
    }
    throw new Error('firebase_rtdb_authoring_legacy_transaction_retries_exhausted');
  }
  async lifecycleTransaction(input: LifecycleTransactionInput): Promise<LifecycleTransactionResult> {
    return this.withRootTransaction((root) => {
      const maps = rootMaps(root);
      const outcome = runLifecycleMutation(
        {
          drafts: maps.drafts,
          versions: maps.versions,
          operationsById: maps.operationsById,
          operationIdsByLookupKey: operationLookup(maps.operationsById),
        },
        input,
      );
      const shouldWrite = maps.operationsById.has(input.operationId);
      return {
        outcome,
        nextRoot: shouldWrite ? persistRootMaps(root, maps) : root,
        shouldWrite,
      };
    });
  }
  async createVersionTransaction(
    input: CreateListeningPublishedVersionInput,
  ): Promise<
    | { kind: 'created'; record: ListeningPublishedVersionRecord }
    | { kind: 'exists'; record: ListeningPublishedVersionRecord }
  > {
    return this.withRootTransaction((root) => {
      const maps = rootMaps(root);
      const existing = maps.versions.get(input.versionId);
      if (existing) return { outcome: { kind: 'exists' as const, record: existing } };
      const versionNumber = [...maps.versions.values()]
        .filter((version) => version.testId === input.testId)
        .reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;
      const record = normalizeVersionRecord({ ...input, versionNumber });
      maps.versions.set(record.versionId, record);
      return {
        outcome: { kind: 'created' as const, record },
        nextRoot: persistRootMaps(root, maps),
        shouldWrite: true,
      };
    });
  }
  async nextVersionNumberTransaction(testId: string): Promise<number> {
    const root = await this.readRoot();
    return [...Object.values(root.versions ?? {})]
      .filter((version) => version.testId === testId)
      .reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;
  }
  async readValue(path: string): Promise<unknown> {
    return this.rtdb.readValue(path);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private async readRoot(): Promise<ListeningAuthoringRootState> {
    const { data } = await this.rtdb.readWithEtag<ListeningAuthoringRootState | null>(
      LISTENING_AUTHORING_ROOT,
    );
    return normalizeRoot(data);
  }

  private async withRootTransaction<T>(
    mutate: (root: ListeningAuthoringRootState) => {
      outcome: T;
      nextRoot?: ListeningAuthoringRootState;
      shouldWrite?: boolean;
      afterWrite?: () => Promise<void>;
    },
  ): Promise<T> {
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<ListeningAuthoringRootState | null>(
        LISTENING_AUTHORING_ROOT,
      );
      const mutation = mutate(normalizeRoot(current.data));
      if (!mutation.shouldWrite) return mutation.outcome;
      const matched = await this.rtdb.writeIfMatch(
        LISTENING_AUTHORING_ROOT,
        mutation.nextRoot ?? {},
        current.etag,
      );
      if (!matched) continue;
      if (mutation.afterWrite) await mutation.afterWrite();
      return mutation.outcome;
    }
    throw new Error('firebase_rtdb_authoring_transaction_retries_exhausted');
  }
}
