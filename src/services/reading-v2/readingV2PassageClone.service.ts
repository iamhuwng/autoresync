// @ts-nocheck
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { buildMaterialCatalogIndexWrites } from '../materialCatalog/materialCatalogIndexes.service';
import {
  READING_V2_SCHEMA_VERSION,
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2MaterialId,
  type ReadingV2PublishedSnapshot,
  type ReadingV2ReadingPassageMaterial,
  type ReadingV2SnapshotVersionId,
} from '../../types/readingV2.types';
import {
  deriveReadingV2MaterialMetadata,
} from './readingV2MaterialMetadata.service';
import {
  assertReadingV2ProjectionIsStudentSanitized,
  generateReadingV2ReviewProjection,
  generateReadingV2StudentSafeProjection,
} from './readingV2Projection.service';
import {
  buildReadingV2DuplicateIndexRow,
  getReadingV2DuplicateIndexPath,
} from './readingV2PassageDuplicateGuard.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

export interface ReadingV2PassageCloneRepository {
  readonly read: (path: string) => Promise<unknown>;
  readonly update: (updates: Record<string, unknown>) => Promise<void>;
}

export interface ReadingV2ClonedPassageRef {
  readonly passageMaterialId: string;
  readonly materialId: string;
  readonly snapshotVersionId: string;
  readonly currentVersionId: string;
  readonly title: string;
  readonly titleSnapshot: string;
  readonly ownerId: string;
  readonly visibility: 'private';
  readonly questionCount: number;
  readonly questionCountSnapshot: number;
  readonly sourceOrderDisplaySnapshot?: string;
  readonly questionRangeSnapshot?: string;
  readonly testTypeIdsSnapshot: readonly string[];
}

export interface ReadingV2PassageCloneResult {
  readonly material: ReadingV2ReadingPassageMaterial & {
    readonly clonedFromMaterialId: string;
    readonly clonedFromSnapshotVersionId: string;
    readonly clonedFromOwnerId: string;
    readonly clonedFromVisibilitySnapshot: string;
    readonly clonedAt: string;
    readonly cloneReason: 'teacher-template-clone';
  };
  readonly snapshot: ReadingV2PublishedSnapshot;
  readonly passageRef: ReadingV2ClonedPassageRef;
  readonly changedPaths: readonly string[];
}

const clone = <T>(value: T): T => structuredClone(value) as T;

const sanitizeFirebaseUpdates = (updates: Record<string, unknown>): Record<string, unknown> => {
  const sanitize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(sanitize);
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, entryValue]) => entryValue !== undefined)
          .map(([key, entryValue]) => [key, sanitize(entryValue)]),
      );
    }

    return value;
  };

  return Object.fromEntries(
    Object.entries(updates)
      .filter(([, value]) => value !== undefined)
      .map(([path, value]) => [path, sanitize(value)]),
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isReadingPassageMaterial = (value: unknown): value is ReadingV2ReadingPassageMaterial =>
  isRecord(value) &&
  value.deliveryEngine === READING_V2_ENGINE &&
  value.plane === 'canonical' &&
  value.passageMaterialId !== undefined &&
  value.ownerId !== undefined &&
  value.currentSnapshotVersionId !== undefined &&
  value.title !== undefined;

const isPublishedSnapshot = (value: unknown): value is ReadingV2PublishedSnapshot =>
  isRecord(value) &&
  typeof value.materialId === 'string' &&
  typeof value.snapshotVersionId === 'string' &&
  typeof value.ownerId === 'string' &&
  isRecord(value.document);

const sanitizeIdPart = (value: string): string => {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'reading-passage';
};

const countInteractions = (document: ReadingV2Document): number =>
  Object.keys(document.interactions ?? {}).length;

const buildDuplicateBodyText = (document: ReadingV2Document): string =>
  JSON.stringify({ stimuli: document.stimuli });

const buildDuplicateQuestionText = (document: ReadingV2Document): string =>
  JSON.stringify({
    taskGroups: document.taskGroups,
    interactions: Object.fromEntries(
      Object.entries(document.interactions ?? {}).map(([interactionId, interaction]) => [
        interactionId,
        {
          interactionId,
          responseShape: interaction.responseShape,
          reviewLabel: interaction.reviewLabel,
          promptText: interaction.promptText,
          primaryAnchorId: interaction.primaryAnchorId,
          contextAnchorIds: interaction.contextAnchorIds,
        },
      ]),
    ),
    optionSets: document.optionSets,
  });

const cloneDocumentForMaterial = (
  document: ReadingV2Document,
  materialId: string,
  title: string,
): ReadingV2Document => ({
  ...clone(document),
  deliveryEngine: READING_V2_ENGINE,
  plane: 'canonical',
  schemaVersion: READING_V2_SCHEMA_VERSION,
  documentId: readingV2Ids.documentId(`${materialId}-document`),
  title,
});

export const cloneReadingV2PublicPassageToTeacherLibrary = async (input: {
  readonly sourceMaterialId: string;
  readonly sourceSnapshotVersionId: string;
  readonly actorTeacherId: string;
  readonly repository: ReadingV2PassageCloneRepository;
  readonly now?: string;
}): Promise<ReadingV2PassageCloneResult> => {
  const sourceMaterialId = input.sourceMaterialId.trim();
  const sourceSnapshotVersionId = input.sourceSnapshotVersionId.trim();
  const actorTeacherId = input.actorTeacherId.trim();

  if (!sourceMaterialId || !sourceSnapshotVersionId || !actorTeacherId) {
    throw new Error('Reading Passage clone requires source material, source snapshot, and teacher id.');
  }

  const material = await input.repository.read(
    readingV2StoragePaths.readingPassageMaterials(sourceMaterialId),
  );
  if (!isReadingPassageMaterial(material)) {
    throw new Error('Reading Passage clone source material was not found.');
  }

  if (material.ownerId === actorTeacherId) {
    throw new Error('Reading Passage clone requires a non-owned source passage.');
  }

  if (material.visibility !== 'public') {
    throw new Error('Reading Passage clone requires a readable public source passage.');
  }

  if (material.state !== 'published') {
    throw new Error('Reading Passage clone requires a published source passage.');
  }

  const sourceSnapshot = await input.repository.read(
    readingV2StoragePaths.publishedSnapshots(sourceMaterialId, sourceSnapshotVersionId),
  );
  if (!isPublishedSnapshot(sourceSnapshot)) {
    throw new Error('Reading Passage clone source published snapshot was not found.');
  }

  if (
    sourceSnapshot.materialId !== material.passageMaterialId ||
    sourceSnapshot.snapshotVersionId !== sourceSnapshotVersionId ||
    sourceSnapshot.ownerId !== material.ownerId
  ) {
    throw new Error('Reading Passage clone source snapshot does not match source material.');
  }

  const clonedAt = input.now ?? new Date().toISOString();
  const clonedMaterialId = readingV2Ids.readingPassageMaterialId(
    `clone-${sanitizeIdPart(actorTeacherId)}-${sanitizeIdPart(sourceMaterialId)}-${sanitizeIdPart(clonedAt)}`,
  );
  const clonedSnapshotVersionId = readingV2Ids.snapshotVersionId(
    `clone-${sanitizeIdPart(sourceSnapshotVersionId)}-${sanitizeIdPart(clonedAt)}`,
  );
  const clonedDocument = cloneDocumentForMaterial(
    sourceSnapshot.document,
    clonedMaterialId,
    material.title,
  );
  const clonedMaterial: ReadingV2PassageCloneResult['material'] = {
    ...clone(material),
    passageMaterialId: clonedMaterialId,
    ownerId: actorTeacherId,
    visibility: 'private',
    state: 'published',
    currentSnapshotVersionId: clonedSnapshotVersionId,
    title: material.title,
    createdAt: clonedAt,
    updatedAt: clonedAt,
    clonedFromMaterialId: material.passageMaterialId,
    clonedFromSnapshotVersionId: sourceSnapshot.snapshotVersionId,
    clonedFromOwnerId: material.ownerId,
    clonedFromVisibilitySnapshot: material.visibility,
    clonedAt,
    cloneReason: 'teacher-template-clone',
  };
  const clonedSnapshot: ReadingV2PublishedSnapshot = {
    materialId: clonedMaterialId as unknown as ReadingV2MaterialId,
    snapshotVersionId: clonedSnapshotVersionId as unknown as ReadingV2SnapshotVersionId,
    ownerId: actorTeacherId,
    document: clonedDocument,
    publishedAt: clonedAt,
    publishedBy: actorTeacherId,
  };
  const studentSafeProjection = generateReadingV2StudentSafeProjection(clonedSnapshot, clonedAt);
  const reviewProjection = generateReadingV2ReviewProjection(clonedSnapshot, clonedAt);
  const metadata = deriveReadingV2MaterialMetadata({
    materialId: clonedMaterialId as unknown as ReadingV2MaterialId,
    ownerId: actorTeacherId,
    document: clonedDocument,
    materialKind: 'reading-passage',
    title: material.title,
    durationMinutes: material.durationMinutes,
    visibility: 'private',
    primaryTestTypeId: material.primaryTestTypeId,
    testTypeIds: material.testTypeIds,
    sourceSnapshot: clonedSnapshot,
    sourceFullTestId: material.sourceFullTestId
      ? material.sourceFullTestId as unknown as ReadingV2MaterialId
      : undefined,
    sourceSnapshotVersionId: material.sourceSnapshotVersionId,
    sourceOrderKind: material.sourceOrder.kind,
    sourceOrderValue: material.sourceOrder.value,
    sourceOrderLabelSnapshot: material.sourceOrder.labelSnapshot,
    sourceOrderDisplaySnapshot: material.sourceOrder.displaySnapshot,
    sourceQuestionRange: material.sourceQuestionRange,
    sourceTitleSnapshot: material.sourceTitleSnapshot,
    updatedAt: clonedAt,
  });
  const materialVersionValue = {
    ...clonedMaterial,
    document: clonedDocument,
    publishedAt: clonedAt,
    publishedBy: actorTeacherId,
  };
  const duplicateIndexRow = buildReadingV2DuplicateIndexRow({
    ownerId: actorTeacherId,
    passageMaterialId: clonedMaterialId,
    currentVersionId: clonedSnapshotVersionId,
    title: material.title,
    state: 'published',
    visibility: 'private',
    source: {
      sourceFullTestId: material.sourceFullTestId,
      sourceOrderDisplay: material.sourceOrder.displaySnapshot,
    },
    testType: {
      ...(material.primaryTestTypeId ? { primaryTestTypeId: material.primaryTestTypeId } : {}),
      testTypeIds: material.testTypeIds,
    },
    questionCount: clonedMaterial.interactionIds.length,
    updatedAt: clonedAt,
    bodyText: buildDuplicateBodyText(clonedDocument),
    questionText: buildDuplicateQuestionText(clonedDocument),
  });
  const indexWrites = buildMaterialCatalogIndexWrites({
    materialId: clonedMaterialId,
    ownerId: actorTeacherId,
    title: material.title,
    visibility: 'private',
    materialKind: 'reading-passage',
    testTypeIds: material.testTypeIds,
    sourceFullTestId: material.sourceFullTestId,
    updatedAt: clonedAt,
  });

  assertReadingV2ProjectionIsStudentSanitized(studentSafeProjection);

  const updates = sanitizeFirebaseUpdates({
    [readingV2StoragePaths.readingPassageMaterials(clonedMaterialId)]: clonedMaterial,
    [readingV2StoragePaths.readingPassageMaterialVersions(clonedMaterialId, clonedSnapshotVersionId)]:
      materialVersionValue,
    [readingV2StoragePaths.publishedSnapshots(clonedMaterialId, clonedSnapshotVersionId)]: clonedSnapshot,
    [readingV2StoragePaths.studentSafeTests(clonedMaterialId, clonedSnapshotVersionId)]: studentSafeProjection,
    [readingV2StoragePaths.reviewProjections(clonedMaterialId, clonedSnapshotVersionId)]: reviewProjection,
    [readingV2StoragePaths.materialMetadata(clonedMaterialId)]: metadata,
    [getReadingV2DuplicateIndexPath(actorTeacherId, clonedMaterialId)]: duplicateIndexRow,
    ...Object.fromEntries(indexWrites.map((write) => [write.path, write.value])),
  });

  await input.repository.update(updates);

  return {
    material: clonedMaterial,
    snapshot: clonedSnapshot,
    changedPaths: Object.keys(updates),
    passageRef: {
      passageMaterialId: clonedMaterialId,
      materialId: clonedMaterialId,
      snapshotVersionId: clonedSnapshotVersionId,
      currentVersionId: clonedSnapshotVersionId,
      title: material.title,
      titleSnapshot: material.title,
      ownerId: actorTeacherId,
      visibility: 'private',
      questionCount: countInteractions(clonedDocument),
      questionCountSnapshot: countInteractions(clonedDocument),
      sourceOrderDisplaySnapshot: material.sourceOrder.displaySnapshot,
      questionRangeSnapshot: material.sourceQuestionRange,
      testTypeIdsSnapshot: material.testTypeIds,
    },
  };
};
