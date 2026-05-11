import { get, ref, update, type Database } from 'firebase/database';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { database as defaultDatabase } from '../firebase';
import type { ReadingV2DerivedProjection } from './readingV2Projection.service';
import type {
  ReadingV2PublishCommitPlan,
  ReadingV2PublishCommitOperation,
  ReadingV2PublishRelationshipIndexWrite,
} from './readingV2PublishPipeline.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

export interface ReadingV2FirebasePublishUpdates {
  readonly commitPath: string;
  readonly operationKeys: readonly string[];
  readonly updates: Readonly<Record<string, unknown>>;
}

export type ReadingV2FirebasePublishCommitStatus = 'committed' | 'already-committed';

export interface ReadingV2FirebasePublishCommitResult extends ReadingV2FirebasePublishUpdates {
  readonly status: ReadingV2FirebasePublishCommitStatus;
}

export interface ReadingV2FirebasePublishCommitOptions {
  readonly database?: Database;
  readonly committedAt?: string;
}

interface ExistingPublishCommitMarker {
  readonly operationKeys?: unknown;
}

const sorted = (values: readonly string[]): readonly string[] => [...values].sort();

const sameStringSet = (left: readonly string[], right: readonly string[]): boolean => {
  const sortedLeft = sorted(left);
  const sortedRight = sorted(right);

  return sortedLeft.length === sortedRight.length && sortedLeft.every((value, index) => value === sortedRight[index]);
};

const getExistingOperationKeys = (value: ExistingPublishCommitMarker | null): readonly string[] =>
  Array.isArray(value?.operationKeys) && value.operationKeys.every((entry) => typeof entry === 'string')
    ? value.operationKeys
    : [];

const getSessionCode = (projection: ReadingV2DerivedProjection): string => {
  const prefix = 'session-safe:';
  const suffix = `:${projection.sourceSnapshotVersionId}`;

  if (!projection.projectionId.startsWith(prefix) || !projection.projectionId.endsWith(suffix)) {
    return projection.projectionId;
  }

  return projection.projectionId.slice(prefix.length, -suffix.length);
};

const getProjectionPath = (
  commitPlan: ReadingV2PublishCommitPlan,
  projection: ReadingV2DerivedProjection,
): string => {
  const materialId = projection.materialId ?? commitPlan.materialId;

  if (projection.projectionKind === 'student-safe') {
    return readingV2StoragePaths.studentSafeTests(materialId, projection.sourceSnapshotVersionId);
  }

  if (projection.projectionKind === 'session-safe') {
    return readingV2StoragePaths.sessionSafePayloads(getSessionCode(projection), projection.sourceSnapshotVersionId);
  }

  if (projection.projectionKind === 'review') {
    return readingV2StoragePaths.reviewProjections(materialId, projection.sourceSnapshotVersionId);
  }

  if (projection.projectionKind === 'analytics') {
    return readingV2StoragePaths.analyticsOutputs(materialId, projection.sourceSnapshotVersionId);
  }

  if (projection.projectionKind === 'preview') {
    return readingV2StoragePaths.previewPayloads(projection.projectionId.replace(/^preview:/, ''));
  }

  const unsupportedProjectionKind: never = projection.projectionKind;
  throw new Error(`Unsupported Reading V2 projection kind for Firebase publish: ${unsupportedProjectionKind}`);
};

const relationshipIndexValue = (
  write: ReadingV2PublishRelationshipIndexWrite,
  ownerId: string,
  updatedAt: string,
): Record<string, unknown> => ({
  ...write,
  ownerId,
  deliveryEngine: READING_V2_ENGINE,
  updatedAt,
});

const countProjectionInteractions = (projection: ReadingV2DerivedProjection | undefined): number =>
  projection?.content?.taskGroups?.reduce(
    (total, taskGroup) => total + (taskGroup.interactions?.length ?? 0),
    0,
  ) ?? 0;

const omitUndefinedForFirebase = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => (entry === undefined ? null : omitUndefinedForFirebase(entry)));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, omitUndefinedForFirebase(entry)]),
    );
  }

  return value;
};

const sanitizeFirebaseUpdates = (updates: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(updates).map(([path, value]) => [path, omitUndefinedForFirebase(value)]),
  );

const isProjectionOperation = (
  operation: ReadingV2PublishCommitOperation,
): operation is Extract<ReadingV2PublishCommitOperation, { readonly kind: 'projection' }> =>
  operation.kind === 'projection';

export const buildReadingV2FirebasePublishUpdates = (
  commitPlan: ReadingV2PublishCommitPlan,
  committedAt = new Date().toISOString(),
): ReadingV2FirebasePublishUpdates => {
  const metadataOperation = commitPlan.operations.find((operation) => operation.kind === 'material-metadata');

  if (!metadataOperation || metadataOperation.kind !== 'material-metadata') {
    throw new Error('Reading V2 Firebase publish adapter requires a material metadata operation.');
  }

  const ownerId = metadataOperation.metadata.ownerId;
  const studentSafeProjection = commitPlan.operations
    .filter(isProjectionOperation)
    .find((operation) => operation.projection.projectionKind === 'student-safe')
    ?.projection;
  const updates: Record<string, unknown> = {};
  const operationKeys = commitPlan.operations.map((operation) => operation.operationKey);
  const whereUsedByAsset = new Map<string, {
    ownerId: string;
    passageAssetId: string;
    entries: Record<string, unknown>;
  }>();

  commitPlan.operations.forEach((operation) => {
    if (operation.kind === 'published-snapshot') {
      updates[
        readingV2StoragePaths.publishedSnapshots(operation.snapshot.materialId, operation.snapshot.snapshotVersionId)
      ] = operation.snapshot;
      return;
    }

    if (operation.kind === 'projection') {
      updates[getProjectionPath(commitPlan, operation.projection)] = operation.projection;
      return;
    }

    if (operation.kind === 'material-metadata') {
      updates[readingV2StoragePaths.materialMetadata(operation.metadata.materialId)] = operation.metadata;
      return;
    }

    if (operation.kind === 'relationship-index') {
      updates[readingV2StoragePaths.relationshipIndexes(operation.write.surface, operation.write.materialId)] =
        relationshipIndexValue(operation.write, ownerId, committedAt);
      return;
    }

    if (operation.kind === 'where-used') {
      const assetEntry = whereUsedByAsset.get(operation.write.passageAssetId) ?? {
        ownerId: operation.write.ownerId,
        passageAssetId: operation.write.passageAssetId,
        entries: {},
      };
      assetEntry.entries[`${operation.write.consumerKind}:${operation.write.consumerId}`] = operation.write;
      whereUsedByAsset.set(operation.write.passageAssetId, assetEntry);
      return;
    }
  });

  whereUsedByAsset.forEach((value, passageAssetId) => {
    updates[readingV2StoragePaths.whereUsedGraph(passageAssetId)] = value;
  });

  updates[`tests/${metadataOperation.metadata.materialId}`] = {
    id: metadataOperation.metadata.materialId,
    materialId: metadataOperation.metadata.materialId,
    ownerId,
    deliveryEngine: READING_V2_ENGINE,
    contentEngine: READING_V2_ENGINE,
    runtimeEngine: READING_V2_ENGINE,
    title: metadataOperation.metadata.title,
    testType: 'IELTS',
    type: 'IELTS',
    skill: 'Reading',
    skillType: 'reading-v2',
    duration: metadataOperation.metadata.durationMinutes,
    questionCount: countProjectionInteractions(studentSafeProjection),
    isPublic: metadataOperation.metadata.visibility === 'library-eligible',
    materialKind: metadataOperation.metadata.materialKind,
    productLabel: metadataOperation.metadata.productLabel,
    publishedSnapshotVersionId: metadataOperation.metadata.publishedSnapshotVersionId,
    updatedAt: committedAt,
    metadata: {
      title: metadataOperation.metadata.title,
      duration: metadataOperation.metadata.durationMinutes,
      difficulty: metadataOperation.metadata.difficulty,
      targetBand: metadataOperation.metadata.targetBand,
      description: metadataOperation.metadata.description,
      tags: metadataOperation.metadata.tags,
      visibility: metadataOperation.metadata.visibility,
      productLabel: metadataOperation.metadata.productLabel,
      materialKind: metadataOperation.metadata.materialKind,
      deliveryEngine: READING_V2_ENGINE,
      publishedSnapshotVersionId: metadataOperation.metadata.publishedSnapshotVersionId,
    },
  };

  const commitPath = readingV2StoragePaths.publishCommits(commitPlan.materialId, commitPlan.snapshotVersionId);
  const writePaths = sorted(Object.keys(updates));

  updates[commitPath] = {
    commitKey: commitPlan.commitKey,
    materialId: commitPlan.materialId,
    snapshotVersionId: commitPlan.snapshotVersionId,
    ownerId,
    deliveryEngine: READING_V2_ENGINE,
    operationKeys,
    writePaths,
    committedAt,
  };

  return {
    commitPath,
    operationKeys,
    updates: sanitizeFirebaseUpdates(updates),
  };
};

export const commitReadingV2PublishPlanToFirebase = async (
  commitPlan: ReadingV2PublishCommitPlan,
  options: ReadingV2FirebasePublishCommitOptions = {},
): Promise<ReadingV2FirebasePublishCommitResult> => {
  const firebaseUpdates = buildReadingV2FirebasePublishUpdates(commitPlan, options.committedAt);
  const targetDatabase = options.database ?? defaultDatabase;

  try {
    await update(ref(targetDatabase), firebaseUpdates.updates);

    return {
      ...firebaseUpdates,
      status: 'committed',
    };
  } catch (writeError) {
    try {
      const commitSnapshot = await get(ref(targetDatabase, firebaseUpdates.commitPath));

      if (!commitSnapshot.exists()) {
        throw writeError;
      }

      const existing = commitSnapshot.val() as ExistingPublishCommitMarker | null;
      const existingOperationKeys = getExistingOperationKeys(existing);

      if (!sameStringSet(existingOperationKeys, firebaseUpdates.operationKeys)) {
        throw new Error('Reading V2 Firebase publish commit marker conflicts with the requested operation keys.');
      }

      return {
        ...firebaseUpdates,
        status: 'already-committed',
      };
    } catch (readError) {
      if (readError instanceof Error && /commit marker conflicts/.test(readError.message)) {
        throw readError;
      }

      throw writeError;
    }
  }
};
