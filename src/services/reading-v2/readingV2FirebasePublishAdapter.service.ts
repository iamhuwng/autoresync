import { get, ref, update, type Database } from 'firebase/database';
import { database as defaultDatabase } from '../firebase';
import type { ReadingV2DerivedProjection } from './readingV2Projection.service';
import type {
  ReadingV2PublishCommitPlan,
  ReadingV2PublishCommitOperation,
  ReadingV2PublishRelationshipIndexWrite,
} from './readingV2PublishPipeline.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';
import { buildReadingV2TestBridgeRecord } from './readingV2TestBridge.service';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { createReadingV2MaterialSummary } from '../materialCatalog/materialSummaryAdapters.service';
import { buildMaterialSummaryIndexPlan } from '../materialCatalog/materialSummaryPort.service';

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

const universalSummaryPathForLegacyIndex = (
  path: string,
): string | null => {
  const prefix = 'material_catalog/material_indexes/';
  if (!path.startsWith(prefix)) {
    return null;
  }
  const relative = path.slice(prefix.length);
  if (
    relative.startsWith('by_owner/') ||
    relative.startsWith('by_visibility/') ||
    relative.startsWith('by_material_kind/') ||
    relative.startsWith('by_test_type/')
  ) {
    return `material_catalog/material_summary_indexes/v1/${relative}`;
  }
  return null;
};

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

    if (operation.kind === 'storage-write') {
      updates[operation.path] = operation.value;
      const universalPath = universalSummaryPathForLegacyIndex(operation.path);
      if (universalPath && operation.value === null) {
        updates[universalPath] = null;
      }
      return;
    }
  });

  const studentSafeProjections = new Map(
    commitPlan.operations
      .filter(isProjectionOperation)
      .filter((operation) => operation.projection.projectionKind === 'student-safe')
      .map((operation) => [
        operation.projection.materialId ?? commitPlan.materialId,
        operation.projection,
      ]),
  );
  commitPlan.operations
    .filter((operation): operation is Extract<
      ReadingV2PublishCommitOperation,
      { readonly kind: 'material-metadata' }
    > => operation.kind === 'material-metadata')
    .forEach((operation) => {
      const summary = createReadingV2MaterialSummary(
        operation.metadata,
        studentSafeProjections.get(operation.metadata.materialId),
      );
      if (!summary) {
        return;
      }

      buildMaterialSummaryIndexPlan(summary).forEach((write) => {
        updates[write.path] = write.value;
      });
    });

  whereUsedByAsset.forEach((value, passageAssetId) => {
    updates[readingV2StoragePaths.whereUsedGraph(passageAssetId)] = value;
  });

  updates[`tests/${metadataOperation.metadata.materialId}`] =
    buildReadingV2TestBridgeRecord({
      metadata: metadataOperation.metadata,
      studentSafeProjection,
      updatedAt: committedAt,
    });

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
    if (import.meta.env.DEV && !import.meta.env.VITEST) {
      console.error('[Diag][ReadingV2PublishFirebase] publish_update_denied', JSON.stringify({
        commitPath: firebaseUpdates.commitPath,
        writePaths: Object.keys(firebaseUpdates.updates).sort(),
        operationKeys: firebaseUpdates.operationKeys,
      }));
    }

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
