// Reading V2 Repository boundary: accepts canonical/packaging objects only.
// Legacy Reading draft or published-test shapes must stay outside this service.
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import {
  READING_V2_SCHEMA_VERSION,
  type ReadingV2Document,
  type ReadingV2DraftId,
  type ReadingV2DraftRecord,
  type ReadingV2DraftState,
  type ReadingV2FullTest,
  type ReadingV2MaterialId,
  type ReadingV2PassageAsset,
  type ReadingV2PassageAssetId,
  type ReadingV2PassageAssetVersion,
  type ReadingV2PublishedSnapshot,
  type ReadingV2SnapshotVersionId,
  type ReadingV2TaskGroupMaterial,
  type ReadingV2WhereUsedEntry,
} from '../../types/readingV2.types';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';

export interface ReadingV2ConflictRecoveryPayload {
  readonly reason: 'stale-revision-token';
  readonly currentRevisionToken: string;
  readonly recoveryOptions: readonly ['reload-latest', 'duplicate-draft', 'compare-diff'];
}

export class ReadingV2RepositoryConflictError extends Error {
  readonly payload: ReadingV2ConflictRecoveryPayload;

  constructor(payload: ReadingV2ConflictRecoveryPayload) {
    super('Reading V2 draft save rejected because the revision token is stale.');
    this.payload = payload;
  }
}

export interface ReadingV2DraftSaveInput {
  readonly draftId: ReadingV2DraftId;
  readonly baseRevisionToken: string;
  readonly document: ReadingV2Document;
  readonly studioMetadata?: Readonly<Record<string, unknown>>;
  readonly state?: ReadingV2DraftState;
  readonly now?: string;
}

export interface ReadingV2RepositoryStore {
  readonly drafts: Map<string, ReadingV2DraftRecord>;
  readonly publishedSnapshots: Map<string, ReadingV2PublishedSnapshot>;
  readonly passageAssets: Map<string, ReadingV2PassageAsset>;
  readonly passageAssetVersions: Map<string, ReadingV2PassageAssetVersion>;
  readonly whereUsed: Map<string, ReadingV2WhereUsedEntry[]>;
  readonly taskGroupMaterials: Map<string, ReadingV2TaskGroupMaterial>;
  readonly fullTests: Map<string, ReadingV2FullTest>;
}

const createStore = (): ReadingV2RepositoryStore => ({
  drafts: new Map(),
  publishedSnapshots: new Map(),
  passageAssets: new Map(),
  passageAssetVersions: new Map(),
  whereUsed: new Map(),
  taskGroupMaterials: new Map(),
  fullTests: new Map(),
});

const clone = <T>(value: T): T => structuredClone(value) as T;

const REVISION_TOKEN_PATTERN = /-rev-(\d+)$/;

const initialRevisionToken = (draftId: string): string => `${draftId}-rev-1`;

const nextRevisionToken = (draftId: string, currentRevisionToken: string): string => {
  const match = currentRevisionToken.match(REVISION_TOKEN_PATTERN);
  const currentRevision = match ? Number(match[1]) : 1;
  return `${draftId}-rev-${currentRevision + 1}`;
};

export const createReadingV2Repository = (
  store: ReadingV2RepositoryStore = createStore(),
) => {
  const createDraft = (input: {
    readonly draftId: ReadingV2DraftId;
    readonly ownerId: string;
    readonly document: ReadingV2Document;
    readonly materialId?: ReadingV2MaterialId;
    readonly studioMetadata?: Readonly<Record<string, unknown>>;
    readonly now?: string;
  }): ReadingV2DraftRecord => {
    assertValidReadingV2CanonicalDocument(input.document);

    if (store.drafts.has(input.draftId)) {
      throw new Error(`Reading V2 draft already exists: ${input.draftId}`);
    }

    const now = input.now ?? new Date().toISOString();
    const draft: ReadingV2DraftRecord = {
      draftId: input.draftId,
      ownerId: input.ownerId,
      materialId: input.materialId,
      document: clone(input.document),
      studioMetadata: input.studioMetadata ? clone(input.studioMetadata) : undefined,
      revisionToken: initialRevisionToken(input.draftId),
      state: 'draft',
      createdAt: now,
      updatedAt: now,
    };

    store.drafts.set(input.draftId, clone(draft));
    return clone(draft);
  };

  const loadDraft = (draftId: ReadingV2DraftId): ReadingV2DraftRecord | null => {
    const draft = store.drafts.get(draftId);
    return draft ? clone(draft) : null;
  };

  const saveDraft = (input: ReadingV2DraftSaveInput): ReadingV2DraftRecord => {
    assertValidReadingV2CanonicalDocument(input.document);
    const current = store.drafts.get(input.draftId);

    if (!current) {
      throw new Error(`Reading V2 draft does not exist: ${input.draftId}`);
    }

    if (current.revisionToken !== input.baseRevisionToken) {
      throw new ReadingV2RepositoryConflictError({
        reason: 'stale-revision-token',
        currentRevisionToken: current.revisionToken,
        recoveryOptions: ['reload-latest', 'duplicate-draft', 'compare-diff'],
      });
    }

    const nextDraft: ReadingV2DraftRecord = {
      ...current,
      document: clone(input.document),
      studioMetadata: input.studioMetadata ? clone(input.studioMetadata) : current.studioMetadata,
      revisionToken: nextRevisionToken(input.draftId, current.revisionToken),
      state: input.state ?? current.state,
      updatedAt: input.now ?? new Date().toISOString(),
    };

    store.drafts.set(input.draftId, clone(nextDraft));
    return clone(nextDraft);
  };

  const autosaveDraft = saveDraft;

  const discardDraft = (draftId: ReadingV2DraftId, baseRevisionToken: string): ReadingV2DraftRecord => {
    const current = loadDraft(draftId);

    if (!current) {
      throw new Error(`Reading V2 draft does not exist: ${draftId}`);
    }

    return saveDraft({
      draftId,
      baseRevisionToken,
      document: current.document,
      state: 'discarded',
    });
  };

  const duplicateDraft = (
    sourceDraftId: ReadingV2DraftId,
    newDraftId: ReadingV2DraftId,
    ownerId: string,
  ): ReadingV2DraftRecord => {
    const source = loadDraft(sourceDraftId);

    if (!source) {
      throw new Error(`Reading V2 source draft does not exist: ${sourceDraftId}`);
    }

    return createDraft({
      draftId: newDraftId,
      ownerId,
      document: source.document,
      materialId: source.materialId,
      studioMetadata: source.studioMetadata,
    });
  };

  const listDrafts = (ownerId: string): ReadingV2DraftRecord[] =>
    Array.from(store.drafts.values())
      .filter((draft) => draft.ownerId === ownerId && draft.state !== 'discarded')
      .map(clone);

  const publishSnapshot = (input: {
    readonly materialId: ReadingV2MaterialId;
    readonly snapshotVersionId: ReadingV2SnapshotVersionId;
    readonly ownerId: string;
    readonly document: ReadingV2Document;
    readonly publishedBy: string;
    readonly publishedAt?: string;
  }): ReadingV2PublishedSnapshot => {
    assertValidReadingV2CanonicalDocument(input.document);
    const key = `${input.materialId}/${input.snapshotVersionId}`;

    if (store.publishedSnapshots.has(key)) {
      throw new Error(`Reading V2 published snapshot is immutable: ${key}`);
    }

    const snapshot: ReadingV2PublishedSnapshot = {
      snapshotVersionId: input.snapshotVersionId,
      materialId: input.materialId,
      ownerId: input.ownerId,
      document: clone(input.document),
      publishedAt: input.publishedAt ?? new Date().toISOString(),
      publishedBy: input.publishedBy,
    };

    store.publishedSnapshots.set(key, clone(snapshot));
    return clone(snapshot);
  };

  const loadPublishedSnapshot = (
    materialId: ReadingV2MaterialId,
    snapshotVersionId: ReadingV2SnapshotVersionId,
  ): ReadingV2PublishedSnapshot | null => {
    const snapshot = store.publishedSnapshots.get(`${materialId}/${snapshotVersionId}`);
    return snapshot ? clone(snapshot) : null;
  };

  const savePassageAsset = (asset: ReadingV2PassageAsset): ReadingV2PassageAsset => {
    store.passageAssets.set(asset.passageAssetId, clone(asset));
    return clone(asset);
  };

  const savePassageAssetVersion = (
    version: ReadingV2PassageAssetVersion,
  ): ReadingV2PassageAssetVersion => {
    const dependents = store.whereUsed.get(version.passageAssetId) ?? [];

    if (dependents.some((entry) => entry.consumerKind === 'task-group-material' || entry.consumerKind === 'full-test')) {
      const existingKey = `${version.passageAssetId}/${version.versionId}`;
      if (store.passageAssetVersions.has(existingKey)) {
        throw new Error('Reading V2 passage asset versions with published dependents are immutable.');
      }
    }

    store.passageAssetVersions.set(`${version.passageAssetId}/${version.versionId}`, clone(version));
    return clone(version);
  };

  const createDerivativePassageAsset = (input: {
    readonly sourcePassageAssetId: ReadingV2PassageAssetId;
    readonly derivativePassageAssetId: ReadingV2PassageAssetId;
    readonly ownerId: string;
    readonly version: Omit<ReadingV2PassageAssetVersion, 'passageAssetId' | 'provenance'>;
  }): ReadingV2PassageAssetVersion => {
    savePassageAsset({
      passageAssetId: input.derivativePassageAssetId,
      ownerId: input.ownerId,
      state: 'draft',
      currentVersionId: input.version.versionId,
    });

    return savePassageAssetVersion({
      ...input.version,
      passageAssetId: input.derivativePassageAssetId,
      provenance: {
        sourcePassageAssetId: input.sourcePassageAssetId,
        extractionMethod: 'duplicate',
      },
    });
  };

  const addWhereUsedEntry = (entry: ReadingV2WhereUsedEntry): ReadingV2WhereUsedEntry => {
    const entries = store.whereUsed.get(entry.passageAssetId) ?? [];
    const existingIndex = entries.findIndex(
      (candidate) =>
        candidate.consumerId === entry.consumerId &&
        candidate.consumerKind === entry.consumerKind,
    );
    const nextEntries =
      existingIndex >= 0
        ? entries.map((candidate, index) => (index === existingIndex ? clone(entry) : candidate))
        : [...entries, clone(entry)];

    store.whereUsed.set(entry.passageAssetId, nextEntries);
    return clone(entry);
  };

  const getWhereUsedEntries = (assetId: ReadingV2PassageAssetId): ReadingV2WhereUsedEntry[] =>
    (store.whereUsed.get(assetId) ?? []).map(clone);

  const createTaskGroupMaterial = (
    material: Omit<ReadingV2TaskGroupMaterial, 'deliveryEngine' | 'plane' | 'schemaVersion'>,
  ): ReadingV2TaskGroupMaterial => {
    const stored: ReadingV2TaskGroupMaterial = {
      ...material,
      deliveryEngine: READING_V2_ENGINE,
      plane: 'packaging',
      schemaVersion: READING_V2_SCHEMA_VERSION,
    };
    store.taskGroupMaterials.set(stored.materialId, clone(stored));
    return clone(stored);
  };

  return {
    store,
    createDraft,
    loadDraft,
    saveDraft,
    autosaveDraft,
    discardDraft,
    duplicateDraft,
    listDrafts,
    publishSnapshot,
    loadPublishedSnapshot,
    savePassageAsset,
    savePassageAssetVersion,
    createDerivativePassageAsset,
    addWhereUsedEntry,
    getWhereUsedEntries,
    createTaskGroupMaterial,
  };
};
