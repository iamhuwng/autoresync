import { get, ref, type Database } from 'firebase/database';
import { database as defaultDatabase } from '../firebase';
import {
  readingV2Ids,
  type ReadingV2AuthoringRecoveryRecord,
  type ReadingV2AuthoringPublicationBase,
  type ReadingV2AuthoringContext,
  type ReadingV2Document,
  type ReadingV2FullTestComposition,
  type ReadingV2MaterialId,
  type ReadingV2PublishedSnapshot,
  type ReadingV2SnapshotVersionId,
} from '../../types/readingV2.types';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';
import { normalizeReadingV2FirebaseDocument } from './readingV2FirebaseDocument.service';
import {
  type ReadingV2MaterialMetadata,
} from './readingV2MaterialMetadata.service';
import type { ReadingV2StudioWorkflowOrigin } from './readingV2StudioWorkflow.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';
import {
  isReadingV2AuthoringRecoveryRecord,
  readingV2AuthoringRecoveryRecordId,
  recoveryLocatorDocument,
} from './readingV2PublicationRecovery.service';

export type ReadingV2PublishedRevisionSourceStatus =
  | 'loaded'
  | 'missing-metadata'
  | 'missing-snapshot-version'
  | 'missing-snapshot'
  | 'invalid-snapshot';

export interface ReadingV2PublishedRevisionSource {
  readonly status: ReadingV2PublishedRevisionSourceStatus;
  readonly materialId: ReadingV2MaterialId;
  readonly metadata?: ReadingV2MaterialMetadata;
  readonly snapshot?: ReadingV2PublishedSnapshot;
  readonly recovery?: ReadingV2AuthoringRecoveryRecord;
  readonly authoringContext?: ReadingV2AuthoringContext;
  readonly workflowOrigin?: ReadingV2StudioWorkflowOrigin;
  readonly authoringMetadata?: Readonly<Record<string, unknown>>;
  readonly message?: string;
}

export interface LoadReadingV2PublishedRevisionSourceOptions {
  readonly database?: Database;
  /** Omit for the current head; pass a version to reopen that exact publication. */
  readonly snapshotVersionId?: string;
  /** Recovery is private authoring data; only the owner or super admin may request it. */
  readonly ownerId?: string;
  readonly role?: 'teacher' | 'super_admin';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const getString = (record: Record<string, unknown>, key: string): string | undefined =>
  typeof record[key] === 'string' ? record[key] : undefined;

const toComposition = (value: unknown): ReadingV2FullTestComposition | null => {
  if (!isRecord(value) || typeof value.compositionId !== 'string' || typeof value.testMaterialId !== 'string'
    || typeof value.ownerId !== 'string' || !Array.isArray(value.passageRefs)) {
    return null;
  }
  return value as unknown as ReadingV2FullTestComposition;
};

const publicationBaseFrom = (
  metadata: ReadingV2MaterialMetadata,
  headRecovery: ReadingV2AuthoringRecoveryRecord,
  currentComposition?: ReadingV2FullTestComposition,
): ReadingV2AuthoringPublicationBase => {
  if (!Number.isSafeInteger(metadata.materialRevision) || (metadata.materialRevision ?? 0) < 1
    || !metadata.publishedSnapshotVersionId
    || metadata.state !== 'published') {
    throw new Error('Published material has no valid current revision base.');
  }
  const generated = headRecovery.authoring.expectedBases?.generatedPassages;
  const headDocument = recoveryLocatorDocument(headRecovery);
  if (headRecovery.locator.kind === 'inline' && (!Array.isArray(generated) || generated.length === 0)) {
    throw new Error('Composition-first publication has no generated passage recovery bases.');
  }
  if (generated !== undefined && (!Array.isArray(generated)
    || !generated.every((item) => isRecord(item)
      && typeof item.sectionId === 'string' && item.sectionId.length > 0
      && typeof item.materialId === 'string' && item.materialId.length > 0
      && typeof item.snapshotVersionId === 'string' && item.snapshotVersionId.length > 0
      && Number.isSafeInteger(item.materialRevision) && Number(item.materialRevision) >= 1)
    || new Set(generated.map((item) => item.sectionId)).size !== generated.length
    || new Set(generated.map((item) => item.materialId)).size !== generated.length
    || (headDocument && (generated.length !== headDocument.sectionIds.length
      || generated.some((item) => !headDocument.sectionIds.includes(item.sectionId)))))) {
    throw new Error('Published authoring recovery has invalid generated passage bases.');
  }
  if (generated !== undefined) {
    if (!currentComposition || currentComposition.compositionId !== metadata.compositionId
      || currentComposition.testMaterialId !== metadata.materialId
      || currentComposition.ownerId !== metadata.ownerId
      || currentComposition.state !== 'published'
      || currentComposition.publishedVersionId !== metadata.publishedSnapshotVersionId
      || currentComposition.materialRevision !== metadata.materialRevision
      || currentComposition.passageRefs.length !== generated.length
      || generated.some((item) => {
        const ref = currentComposition.passageRefs.find((candidate) => candidate.passageMaterialId === item.materialId);
        return !ref || ref.snapshotVersionId !== item.snapshotVersionId;
      })) {
      throw new Error('Published authoring recovery generated passage bases do not match the current composition refs.');
    }
  }
  return {
    materialRevision: metadata.materialRevision!,
    snapshotVersionId: metadata.publishedSnapshotVersionId,
    ...(metadata.compositionId ? { compositionId: metadata.compositionId } : {}),
    ...(generated ? { generatedPassages: generated as ReadingV2AuthoringPublicationBase['generatedPassages'] } : {}),
  };
};


const toMetadata = (value: unknown): ReadingV2MaterialMetadata | null => {
  if (!isRecord(value)) {
    return null;
  }

  const materialId = getString(value, 'materialId');
  const ownerId = getString(value, 'ownerId');
  const title = getString(value, 'title');

  if (!materialId || !ownerId || !title) {
    return null;
  }

  return value as unknown as ReadingV2MaterialMetadata;
};

const toPublishedSnapshot = (value: unknown): ReadingV2PublishedSnapshot | null => {
  if (!isRecord(value)) {
    return null;
  }

  const snapshotVersionId = getString(value, 'snapshotVersionId');
  const materialId = getString(value, 'materialId');
  const ownerId = getString(value, 'ownerId');
  const publishedAt = getString(value, 'publishedAt');
  const publishedBy = getString(value, 'publishedBy');

  if (!snapshotVersionId || !materialId || !ownerId || !publishedAt || !publishedBy || !isRecord(value.document)) {
    return null;
  }

  const rawSnapshot = value as unknown as ReadingV2PublishedSnapshot;
  const snapshot: ReadingV2PublishedSnapshot = {
    ...rawSnapshot,
    document: normalizeReadingV2FirebaseDocument(rawSnapshot.document),
  };
  assertValidReadingV2CanonicalDocument(snapshot.document);
  return snapshot;
};

export const loadReadingV2PublishedRevisionSource = async (
  materialIdInput: string,
  options: LoadReadingV2PublishedRevisionSourceOptions = {},
): Promise<ReadingV2PublishedRevisionSource> => {
  const materialId = readingV2Ids.materialId(materialIdInput);
  const targetDatabase = options.database ?? defaultDatabase;
  const metadataSnapshot = await get(ref(targetDatabase, readingV2StoragePaths.materialMetadata(materialId)));

  if (!metadataSnapshot.exists()) {
    return {
      status: 'missing-metadata',
      materialId,
      message: `No Reading V2 material metadata was found for ${materialId}.`,
    };
  }

  const metadata = toMetadata(metadataSnapshot.val());
  const snapshotVersionId = options.snapshotVersionId ?? metadata?.publishedSnapshotVersionId;

  if (!metadata || !snapshotVersionId) {
    return {
      status: 'missing-snapshot-version',
      materialId,
      metadata: metadata ?? undefined,
      message: `Reading V2 material ${materialId} does not reference a published snapshot version.`,
    };
  }

  if (metadata.materialId !== materialId) {
    return { status: 'invalid-snapshot', materialId, message: 'Published material metadata identity does not match.' };
  }

  const recoveryAuthorized = Boolean(
    options.ownerId && (options.role === 'super_admin' || options.ownerId === metadata.ownerId),
  );

  try {
    const readRecovery = async (versionId: string): Promise<ReadingV2AuthoringRecoveryRecord | undefined> => {
      const recoverySnapshot = await get(ref(
        targetDatabase,
        readingV2StoragePaths.provenance(readingV2AuthoringRecoveryRecordId(
          materialId, versionId as ReadingV2SnapshotVersionId,
        )),
      ));
      if (recoverySnapshot.exists()) {
        const candidate = recoverySnapshot.val();
        if (!isReadingV2AuthoringRecoveryRecord(candidate)
          || candidate.ownerId !== metadata.ownerId
          || candidate.materialId !== materialId
          || candidate.snapshotVersionId !== versionId) {
          throw new Error('Published authoring recovery identity or locator is invalid.');
        }
        const context = candidate.authoring.authoringContext;
        return {
          ...candidate,
          authoring: {
            ...candidate.authoring,
            sourceRefs: candidate.authoring.sourceRefs ?? [],
            ...(context ? { authoringContext: {
              ...context,
              scope: { ...context.scope, requirementIds: context.scope.requirementIds ?? [] },
              requirements: (context.requirements ?? []).map((requirement) => ({
                ...requirement, lineIds: requirement.lineIds ?? [],
              })),
              interpretations: context.interpretations ?? [],
              unboundTargets: context.unboundTargets ?? [],
            } } : {}),
          },
        };
      }
      return undefined;
    };
    const recovery = recoveryAuthorized ? await readRecovery(snapshotVersionId) : undefined;
    const headRecovery = recoveryAuthorized && metadata.publishedSnapshotVersionId
      ? metadata.publishedSnapshotVersionId === snapshotVersionId
        ? recovery : await readRecovery(metadata.publishedSnapshotVersionId)
      : undefined;
    if (recovery && !headRecovery) {
      throw new Error('Published material has no current authoring recovery base.');
    }
    let currentComposition: ReadingV2FullTestComposition | undefined;
    if (headRecovery?.authoring.expectedBases?.generatedPassages && metadata.compositionId) {
      const compositionSnapshot = await get(ref(
        targetDatabase,
        readingV2StoragePaths.fullTestCompositions(metadata.compositionId),
      ));
      currentComposition = compositionSnapshot.exists()
        ? toComposition(compositionSnapshot.val()) ?? undefined
        : undefined;
    }

    let storedSnapshot: ReadingV2PublishedSnapshot | null = null;
    if (recovery?.locator.kind !== 'inline') {
      const publishedSnapshot = await get(ref(
        targetDatabase,
        readingV2StoragePaths.publishedSnapshots(materialId, snapshotVersionId),
      ));
      storedSnapshot = publishedSnapshot.exists() ? toPublishedSnapshot(publishedSnapshot.val()) : null;
    }
    if (storedSnapshot && (storedSnapshot.materialId !== materialId
      || storedSnapshot.snapshotVersionId !== snapshotVersionId
      || storedSnapshot.ownerId !== metadata.ownerId)) {
      throw new Error('Published snapshot identity does not match its material and version.');
    }
    if (recovery?.locator.kind === 'published-snapshot' && !storedSnapshot) {
      throw new Error('Published authoring recovery references a missing snapshot.');
    }
    const inlineDocument = recovery ? recoveryLocatorDocument(recovery) : null;
    const snapshot = storedSnapshot ?? (inlineDocument && recovery ? {
      snapshotVersionId: snapshotVersionId as ReadingV2SnapshotVersionId,
      materialId,
      ownerId: metadata.ownerId,
      document: inlineDocument,
      publishedAt: recovery.createdAt,
      publishedBy: recovery.createdBy,
    } : null);
    if (!snapshot) {
      return {
        status: 'missing-snapshot', materialId, metadata,
        message: `No exact published document was found for ${materialId}/${snapshotVersionId}.`,
      };
    }
    return {
      status: 'loaded', materialId, metadata, snapshot,
      ...(recovery ? {
        recovery,
        authoringContext: recovery.authoring.authoringContext,
        workflowOrigin: {
          mode: 'revise-published', sourceMaterialId: materialId,
          sourceSnapshotVersionId: snapshotVersionId,
          publicationBase: publicationBaseFrom(metadata, headRecovery!, currentComposition),
        } as ReadingV2StudioWorkflowOrigin,
        authoringMetadata: recovery.authoring.metadata,
      } : {}),
      message: `Loaded published snapshot ${snapshotVersionId} for ${materialId}.`,
    };
  } catch (error) {
    return {
      status: 'invalid-snapshot', materialId, metadata,
      message: error instanceof Error ? error.message : `Published snapshot ${snapshotVersionId} is invalid.`,
    };
  }
};
