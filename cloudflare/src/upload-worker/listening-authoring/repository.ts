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
import { FirebaseRtdbRestClient, type RepositoryEnv as RtdbRepositoryEnv } from './rtdb.ts';
import { requestHash } from '../../../../functions/src/listening-authoring/canonical.ts';
import { parseDocument } from '../../../../functions/src/listening-authoring/validation.document.ts';
import { ListeningAssetCommitError } from '../../../../src/features/assessment/listening/storage/listeningAssetCommit.ts';
import { ListeningAuthoringAssets, type ListeningAssetBucket, type PreparedListeningDocument } from './assets.ts';
import { buildListeningPublishedMaterialUpdates } from './published-material.ts';
import { replaceListeningPublishedAudio } from './audio-replacement.ts';
import {
  getMaterialSummaryRecordPath,
  type MaterialSummary,
} from '../../../../src/services/materialCatalog/materialSummaryPort.service.ts';

interface ListeningAuthoringRootState {
  drafts?: Record<string, ListeningAuthoringDraftRecord>;
  revision_drafts?: Record<string, ListeningAuthoringDraftRecord>;
  versions?: Record<string, ListeningPublishedVersionRecord>;
  operations?: Record<string, ListeningAuthoringOperationRecord>;
}
export interface RepositoryEnv extends RtdbRepositoryEnv {
  readonly R2_BUCKET?: ListeningAssetBucket;
  readonly PUBLIC_URL?: string;
}
const DEFAULT_MAX_RETRIES = 5;
const normalizeRoot = (value: unknown): ListeningAuthoringRootState =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? cloneRecord(value as ListeningAuthoringRootState)
    : {};
const normalizeStoredDocument = (
  document: ListeningAuthoringDraftRecord['document'],
): ListeningAuthoringDraftRecord['document'] => {
  // RTDB removes empty arrays/maps; restore required collections before strict parsing.
  const normalized = parseDocument({
    ...document,
    audioSections: document.audioSections === undefined ? [] : document.audioSections,
    questions: document.questions === undefined ? [] : Array.isArray(document.questions) ? document.questions.map(question => ({
      ...question,
      answer: question.answer === undefined ? '' : question.answer,
    })) : document.questions,
    metadata: { ...document.metadata, tags: document.metadata?.tags === undefined ? [] : document.metadata.tags },
  });
  // Omit optional empty collections before publish hashing, matching their persisted form.
  if (normalized.questionImages?.length === 0) delete normalized.questionImages;
  for (const question of normalized.questions) {
    if (question.options?.length === 0) delete question.options;
    if (question.acceptableAnswers?.length === 0) delete question.acceptableAnswers;
    if (question.context?.contextLines?.length === 0) delete question.context.contextLines;
    if (question.context && Object.keys(question.context).length === 0) delete question.context;
  }
  for (const image of normalized.questionImages ?? []) {
    if (image.questionRange && Object.keys(image.questionRange).length === 0) delete image.questionRange;
  }
  return normalized;
};
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
  private readonly assets: ListeningAuthoringAssets;

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
    this.assets = new ListeningAuthoringAssets({ rtdb: this.rtdb, bucket: options.env.R2_BUCKET,
      publicUrl: options.env.PUBLIC_URL, now: () => this.now() });
  }
  allocateId(prefix: RepositoryIdPrefix): string {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  async getDraft(draftId: string): Promise<ListeningAuthoringDraftRecord | null> {
    const root = await this.readRoot();
    const draft = root.drafts?.[draftId] ?? root.revision_drafts?.[draftId];
    return draft ? { ...draft, document: normalizeStoredDocument(draft.document) } : null;
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
        ...updateFn({ ...cloneDraftRecord(current), document: normalizeStoredDocument(current.document) }),
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
    return this.withRootTransaction(async (root) => {
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
      let prepared: PreparedListeningDocument | undefined;
      if (outcome.kind === 'saved' || outcome.kind === 'replayed') {
        const draft = maps.drafts.get(outcome.result.draftId)!;
        prepared = await this.assets.prepare(input.ownerId, normalizeStoredDocument(draft.document), {
          kind: 'drafts', id: draft.draftId,
          sourcePath: `${LISTENING_AUTHORING_ROOT}/${draft.recordType === 'draft' ? 'drafts' : 'revision_drafts'}/${draft.draftId}`,
        });
        if (outcome.kind === 'saved') maps.drafts.set(draft.draftId, { ...draft, document: prepared.document });
      }
      return {
        outcome,
        nextRoot: shouldWrite ? persistRootMaps(root, maps) : root,
        shouldWrite,
        afterWrite: prepared ? () => this.assets.finalize(prepared!) : undefined,
      };
    });
  }
  async publishDraftTransaction(
    input: PublishDraftTransactionInput,
  ): Promise<PublishDraftTransactionResult> {
    const result = await this.withRootTransaction(async (root) => {
      const maps = rootMaps(root);
      const current = maps.drafts.get(input.draftId);
      if (current?.ownerId === input.ownerId) {
        maps.drafts.set(current.draftId, { ...current, document: normalizeStoredDocument(current.document) });
      }
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
      let prepared: PreparedListeningDocument | undefined;
      if (outcome.kind === 'published' || outcome.kind === 'replayed') {
        const version = maps.versions.get(outcome.result.versionId)!;
        try {
          prepared = await this.assets.prepare(input.ownerId, normalizeStoredDocument(version.document), {
            kind: 'versions', id: version.versionId, sourcePath: `${LISTENING_AUTHORING_ROOT}/versions/${version.versionId}`,
          });
        } catch (error) {
          if (!(error instanceof ListeningAssetCommitError)) throw error;
          const existing = root.drafts?.[input.draftId] ?? root.revision_drafts?.[input.draftId];
          return { outcome: { kind: 'blocked' as const, draftId: input.draftId,
            conflictToken: existing?.conflictToken ?? input.expectedConflictToken,
            blockers: [{ field: 'audioSections', severity: 'blocker' as const,
              guidance: `Audio could not be verified (${error.code}). Re-upload missing audio before publishing.` }] },
            shouldWrite: false };
        }
        if (outcome.kind === 'published') {
          maps.versions.set(version.versionId, { ...version, document: prepared.document, documentHash: requestHash(prepared.document) });
          const draft = maps.drafts.get(input.draftId)!;
          maps.drafts.set(draft.draftId, { ...draft, document: prepared.document });
        }
      }
      return {
        outcome,
        nextRoot: shouldWrite ? persistRootMaps(root, maps) : root,
        shouldWrite,
        afterWrite: prepared ? () => this.assets.finalize(prepared!) : undefined,
      };
    });
    if (result.kind === 'published' || result.kind === 'replayed') {
      await this.synchronizePublishedMaterial(result.result.versionId, true);
    }
    return result;
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
    const result = await this.withRootTransaction((root) => {
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
    if (result.kind === 'archived') {
      await this.synchronizePublishedMaterial(result.result.versionId);
    }
    return result;
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

  private async synchronizePublishedMaterial(versionId: string, assetsFinalized = false): Promise<void> {
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const root = await this.readRoot();
      const requested = root.versions?.[versionId];
      if (!requested) throw new Error('listening_published_version_missing');
      const latest = cloneVersionRecord(Object.values(root.versions ?? {})
        .filter((version) => version.testId === requested.testId)
        .reduce((current, version) => version.versionNumber > current.versionNumber ? version : current, requested));
      latest.document = normalizeStoredDocument(latest.document);
      // Publish already finalized this immutable version; a racing newer version still needs verification.
      if ((!assetsFinalized || latest.versionId !== versionId)
        && latest.archive.state !== 'archived' && !latest.compatibility.frozenLegacyVersion1) {
        const prepared = await this.assets.prepare(latest.ownerId, latest.document, {
          kind: 'versions', id: latest.versionId, sourcePath: `${LISTENING_AUTHORING_ROOT}/versions/${latest.versionId}`,
        });
        await this.assets.finalize(prepared);
      }
      const [previousSummary, previousRuntime] = await Promise.all([
        this.rtdb.readValue(getMaterialSummaryRecordPath(latest.testId)),
        this.rtdb.readValue(`tests/${latest.testId}`),
      ]);
      await this.rtdb.patchAdminMultiLocation(buildListeningPublishedMaterialUpdates(
        latest, previousSummary as MaterialSummary | null, previousRuntime as Record<string, unknown> | null,
      ));
      // A concurrent publish/archive must not leave an older projection as the final write.
      const current = await this.readRoot();
      const currentLatest = Object.values(current.versions ?? {})
        .filter((version) => version.testId === latest.testId)
        .reduce((newest, version) => version.versionNumber > newest.versionNumber ? version : newest,
          current.versions?.[latest.versionId] ?? latest);
      if (currentLatest.versionId === latest.versionId
        && currentLatest.archive.state === latest.archive.state) {
        if (latest.archive.state === 'active') {
          const previousIds = new Set([requested.previousVersionId, latest.previousVersionId]);
          for (const previousId of previousIds) {
            const previous = previousId ? current.versions?.[previousId] : undefined;
            if (previous) await replaceListeningPublishedAudio({ rtdb: this.rtdb, bucket: this.options.env.R2_BUCKET,
              previous, current: latest, versions: current.versions ?? {}, now: this.now(),
              verify: asset => this.assets.verifyCommittedAudio(asset) });
          }
        }
        return;
      }
    }
    throw new Error('listening_material_projection_retries_exhausted');
  }

  private async withRootTransaction<T>(
    mutate: (root: ListeningAuthoringRootState) => {
      outcome: T;
      nextRoot?: ListeningAuthoringRootState;
      shouldWrite?: boolean;
      afterWrite?: () => Promise<void>;
    } | Promise<{ outcome: T; nextRoot?: ListeningAuthoringRootState; shouldWrite?: boolean; afterWrite?: () => Promise<void> }>,
  ): Promise<T> {
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<ListeningAuthoringRootState | null>(
        LISTENING_AUTHORING_ROOT,
      );
      const mutation = await mutate(normalizeRoot(current.data));
      if (!mutation.shouldWrite) {
        if (mutation.afterWrite) await mutation.afterWrite();
        return mutation.outcome;
      }
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
