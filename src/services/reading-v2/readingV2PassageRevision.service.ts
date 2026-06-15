import {
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2DraftId,
  type ReadingV2ReadingPassageMaterial,
  type ReadingV2ReadingPassageMaterialId,
  type ReadingV2SnapshotVersionId,
} from '../../types/readingV2.types';

export type ReadingV2PassageRevisionDraftState =
  | 'draft-revision'
  | 'ready-to-republish'
  | 'discarded';

export interface ReadingV2PassageRevisionDraft {
  readonly draftId: ReadingV2DraftId;
  readonly ownerId: string;
  readonly sourcePassageMaterialId: ReadingV2ReadingPassageMaterialId;
  readonly baseSnapshotVersionId: ReadingV2SnapshotVersionId;
  readonly document: ReadingV2Document;
  readonly state: ReadingV2PassageRevisionDraftState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly openedBy: string;
}

export interface ReadingV2PassageMaterialVersion {
  readonly passageMaterialId: ReadingV2ReadingPassageMaterialId;
  readonly snapshotVersionId: ReadingV2SnapshotVersionId;
  readonly previousSnapshotVersionId: ReadingV2SnapshotVersionId;
  readonly document: ReadingV2Document;
  readonly publishedAt: string;
  readonly publishedBy: string;
}

export interface ReadingV2PassageRevisionRepublishResult {
  readonly material: ReadingV2ReadingPassageMaterial;
  readonly version: ReadingV2PassageMaterialVersion;
  readonly previousSnapshotVersionId: ReadingV2SnapshotVersionId;
}

const clone = <T>(value: T): T => structuredClone(value) as T;

const revisionDraftId = (
  passageMaterialId: ReadingV2ReadingPassageMaterialId,
  snapshotVersionId: ReadingV2SnapshotVersionId,
): ReadingV2DraftId =>
  readingV2Ids.draftId(`revision-${passageMaterialId}-${snapshotVersionId}`);

export const openReadingV2PassageRevisionDraft = (input: {
  readonly material: ReadingV2ReadingPassageMaterial;
  readonly publishedDocument: ReadingV2Document;
  readonly existingDrafts: readonly ReadingV2PassageRevisionDraft[];
  readonly openedBy: string;
  readonly now?: string;
}): ReadingV2PassageRevisionDraft => {
  const existing = input.existingDrafts.find(
    (draft) =>
      draft.sourcePassageMaterialId === input.material.passageMaterialId &&
      draft.baseSnapshotVersionId === input.material.currentSnapshotVersionId &&
      draft.state !== 'discarded',
  );

  if (existing) {
    return existing;
  }

  const now = input.now ?? new Date().toISOString();

  return {
    draftId: revisionDraftId(input.material.passageMaterialId, input.material.currentSnapshotVersionId),
    ownerId: input.material.ownerId,
    sourcePassageMaterialId: input.material.passageMaterialId,
    baseSnapshotVersionId: input.material.currentSnapshotVersionId,
    document: clone(input.publishedDocument),
    state: 'draft-revision',
    createdAt: now,
    updatedAt: now,
    openedBy: input.openedBy,
  };
};

export const republishReadingV2PassageRevisionDraft = (input: {
  readonly draft: ReadingV2PassageRevisionDraft;
  readonly currentMaterial: ReadingV2ReadingPassageMaterial;
  readonly nextSnapshotVersionId: ReadingV2SnapshotVersionId;
  readonly publishedBy: string;
  readonly now?: string;
}): ReadingV2PassageRevisionRepublishResult => {
  if (input.draft.sourcePassageMaterialId !== input.currentMaterial.passageMaterialId) {
    throw new Error('Reading V2 passage revision draft does not belong to the current material.');
  }

  if (input.draft.baseSnapshotVersionId !== input.currentMaterial.currentSnapshotVersionId) {
    throw new Error('Reading V2 passage revision draft is stale; reload latest passage before republish.');
  }

  const publishedAt = input.now ?? new Date().toISOString();
  const previousSnapshotVersionId = input.currentMaterial.currentSnapshotVersionId;
  const material: ReadingV2ReadingPassageMaterial = {
    ...input.currentMaterial,
    state: 'published',
    currentSnapshotVersionId: input.nextSnapshotVersionId,
    updatedAt: publishedAt,
  };

  return {
    material,
    previousSnapshotVersionId,
    version: {
      passageMaterialId: input.currentMaterial.passageMaterialId,
      snapshotVersionId: input.nextSnapshotVersionId,
      previousSnapshotVersionId,
      document: clone(input.draft.document),
      publishedAt,
      publishedBy: input.publishedBy,
    },
  };
};
