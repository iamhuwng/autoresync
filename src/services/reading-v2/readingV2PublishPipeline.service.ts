import {
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2MaterialId,
  type ReadingV2PassageAssetId,
  type ReadingV2PublishedSnapshot,
  type ReadingV2SnapshotVersionId,
  type ReadingV2WhereUsedEntry,
} from '../../types/readingV2.types';
import type { createReadingV2Repository } from './readingV2Repository.service';
import {
  assertReadingV2ProjectionIsStudentSanitized,
  generateReadingV2AnalyticsProjection,
  generateReadingV2PreviewProjection,
  generateReadingV2ReviewProjection,
  generateReadingV2SessionSafeProjection,
  generateReadingV2StudentSafeProjection,
  type ReadingV2DerivedProjection,
} from './readingV2Projection.service';
import {
  deriveReadingV2MaterialMetadata,
  type ReadingV2MaterialMetadata,
  type ReadingV2MaterialMetadataInput,
  type ReadingV2RelationshipSurface,
} from './readingV2MaterialMetadata.service';
import {
  assertReadingV2PublishGate,
  validateReadingV2Draft,
  type ReadingV2ValidationResult,
} from './readingV2Validation.service';
import { writeReadingV2WhereUsedForPublish } from './readingV2PassageAssetWorkflow.service';

export interface ReadingV2PublishRelationshipIndexWrite {
  readonly surface: ReadingV2RelationshipSurface;
  readonly materialId: ReadingV2MaterialId;
  readonly snapshotVersionId: ReadingV2SnapshotVersionId;
  readonly source:
    | 'published-metadata'
    | 'student-safe-projection'
    | 'session-safe-projection'
    | 'review-projection'
    | 'analytics-projection';
}

export interface ReadingV2PublishPipelineSinks {
  readonly writeProjection?: (projection: ReadingV2DerivedProjection) => void;
  readonly writeMaterialMetadata?: (metadata: ReadingV2MaterialMetadata) => void;
  readonly writeRelationshipIndex?: (write: ReadingV2PublishRelationshipIndexWrite) => void;
  readonly notifyReturnContext?: (notification: {
    readonly materialId: ReadingV2MaterialId;
    readonly snapshotVersionId: ReadingV2SnapshotVersionId;
    readonly context: string;
  }) => void;
}

export type ReadingV2PublishCommitOperation =
  | {
      readonly kind: 'published-snapshot';
      readonly operationKey: string;
      readonly snapshot: ReadingV2PublishedSnapshot;
    }
  | {
      readonly kind: 'projection';
      readonly operationKey: string;
      readonly projection: ReadingV2DerivedProjection;
    }
  | {
      readonly kind: 'material-metadata';
      readonly operationKey: string;
      readonly metadata: ReadingV2MaterialMetadata;
    }
  | {
      readonly kind: 'relationship-index';
      readonly operationKey: string;
      readonly write: ReadingV2PublishRelationshipIndexWrite;
    }
  | {
      readonly kind: 'where-used';
      readonly operationKey: string;
      readonly write: ReadingV2WhereUsedEntry;
    }
  | {
      readonly kind: 'return-context-notification';
      readonly operationKey: string;
      readonly notification: {
        readonly materialId: ReadingV2MaterialId;
        readonly snapshotVersionId: ReadingV2SnapshotVersionId;
        readonly context: string;
      };
    };

export interface ReadingV2PublishCommitPlan {
  readonly commitKey: string;
  readonly materialId: ReadingV2MaterialId;
  readonly snapshotVersionId: ReadingV2SnapshotVersionId;
  readonly operations: readonly ReadingV2PublishCommitOperation[];
}

export interface ReadingV2PublishPipelineInput {
  readonly repository: ReturnType<typeof createReadingV2Repository>;
  readonly materialId: ReadingV2MaterialId;
  readonly ownerId: string;
  readonly document: ReadingV2Document;
  readonly publishedBy: string;
  readonly snapshotVersionId?: ReadingV2SnapshotVersionId;
  readonly publishedAt?: string;
  readonly sessionCodeForProjection?: string;
  readonly metadata?: Omit<ReadingV2MaterialMetadataInput, 'materialId' | 'ownerId' | 'document' | 'sourceSnapshot'>;
  readonly passageAssetUses?: readonly {
    readonly passageAssetId: ReadingV2PassageAssetId;
    readonly consumerKind: ReadingV2WhereUsedEntry['consumerKind'];
  }[];
  readonly returnContext?: string;
}

export interface ReadingV2PublishPipelineResult {
  readonly validation: ReadingV2ValidationResult;
  readonly snapshotVersionId: ReadingV2SnapshotVersionId;
  readonly projections: readonly ReadingV2DerivedProjection[];
  readonly metadata: ReadingV2MaterialMetadata;
  readonly relationshipIndexWrites: readonly ReadingV2PublishRelationshipIndexWrite[];
  readonly whereUsedWrites: readonly ReadingV2WhereUsedEntry[];
  readonly commitPlan: ReadingV2PublishCommitPlan;
  readonly returnContextNotification?: string;
}

export const generateReadingV2PreviewOnly = (input: {
  readonly draftId: string;
  readonly ownerId: string;
  readonly document: ReadingV2Document;
  readonly generatedAt?: string;
}): {
  readonly validation: ReadingV2ValidationResult;
  readonly projection: ReadingV2DerivedProjection;
  readonly permanentWrites: readonly [];
} => ({
  validation: validateReadingV2Draft(input.document),
  projection: generateReadingV2PreviewProjection(input),
  permanentWrites: [],
});

const buildRelationshipIndexWrites = (
  materialId: ReadingV2MaterialId,
  snapshotVersionId: ReadingV2SnapshotVersionId,
): ReadingV2PublishRelationshipIndexWrite[] => [
  { surface: 'teacher-lobby', materialId, snapshotVersionId, source: 'published-metadata' },
  { surface: 'material-profile', materialId, snapshotVersionId, source: 'published-metadata' },
  { surface: 'library-listing', materialId, snapshotVersionId, source: 'student-safe-projection' },
  { surface: 'assignment-picker', materialId, snapshotVersionId, source: 'published-metadata' },
  { surface: 'homework-assignment', materialId, snapshotVersionId, source: 'student-safe-projection' },
  { surface: 'course-material', materialId, snapshotVersionId, source: 'student-safe-projection' },
  { surface: 'live-launch-summary', materialId, snapshotVersionId, source: 'session-safe-projection' },
  { surface: 'solo-launch', materialId, snapshotVersionId, source: 'student-safe-projection' },
  { surface: 'result-identity', materialId, snapshotVersionId, source: 'review-projection' },
  { surface: 'analytics', materialId, snapshotVersionId, source: 'analytics-projection' },
];

const buildReadingV2PublishCommitPlan = (input: {
  readonly materialId: ReadingV2MaterialId;
  readonly snapshotVersionId: ReadingV2SnapshotVersionId;
  readonly snapshot: ReadingV2PublishedSnapshot;
  readonly projections: readonly ReadingV2DerivedProjection[];
  readonly metadata: ReadingV2MaterialMetadata;
  readonly relationshipIndexWrites: readonly ReadingV2PublishRelationshipIndexWrite[];
  readonly whereUsedWrites: readonly ReadingV2WhereUsedEntry[];
  readonly returnContext?: string;
}): ReadingV2PublishCommitPlan => {
  const commitKey = `${input.materialId}/${input.snapshotVersionId}`;
  const operations: ReadingV2PublishCommitOperation[] = [
    {
      kind: 'published-snapshot',
      operationKey: `${commitKey}/snapshot`,
      snapshot: input.snapshot,
    },
    ...input.projections.map((projection) => ({
      kind: 'projection' as const,
      operationKey: `${commitKey}/projection/${projection.projectionKind}`,
      projection,
    })),
    {
      kind: 'material-metadata',
      operationKey: `${commitKey}/metadata`,
      metadata: input.metadata,
    },
    ...input.relationshipIndexWrites.map((write) => ({
      kind: 'relationship-index' as const,
      operationKey: `${commitKey}/relationship/${write.surface}`,
      write,
    })),
    ...input.whereUsedWrites.map((write) => ({
      kind: 'where-used' as const,
      operationKey: `${commitKey}/where-used/${write.passageAssetId}/${write.consumerKind}`,
      write,
    })),
  ];

  if (input.returnContext) {
    operations.push({
      kind: 'return-context-notification',
      operationKey: `${commitKey}/return-context/${input.returnContext}`,
      notification: {
        materialId: input.materialId,
        snapshotVersionId: input.snapshotVersionId,
        context: input.returnContext,
      },
    });
  }

  return {
    commitKey,
    materialId: input.materialId,
    snapshotVersionId: input.snapshotVersionId,
    operations,
  };
};

export const commitReadingV2PublishPlanToRepository = (
  repository: ReturnType<typeof createReadingV2Repository>,
  commitPlan: ReadingV2PublishCommitPlan,
): {
  readonly snapshot: ReadingV2PublishedSnapshot;
  readonly whereUsedWrites: readonly ReadingV2WhereUsedEntry[];
} => {
  const previousSnapshots = new Map(repository.store.publishedSnapshots);
  const previousWhereUsed = new Map(
    Array.from(repository.store.whereUsed.entries()).map(([key, entries]) => [
      key,
      structuredClone(entries) as ReadingV2WhereUsedEntry[],
    ]),
  );
  const whereUsedWrites: ReadingV2WhereUsedEntry[] = [];
  let committedSnapshot: ReadingV2PublishedSnapshot | null = null;

  try {
    commitPlan.operations.forEach((operation) => {
      if (operation.kind === 'published-snapshot') {
        committedSnapshot = repository.publishSnapshot({
          materialId: operation.snapshot.materialId,
          snapshotVersionId: operation.snapshot.snapshotVersionId,
          ownerId: operation.snapshot.ownerId,
          document: operation.snapshot.document,
          publishedBy: operation.snapshot.publishedBy,
          publishedAt: operation.snapshot.publishedAt,
        });
      }

      if (operation.kind === 'where-used') {
        whereUsedWrites.push(writeReadingV2WhereUsedForPublish(repository, operation.write));
      }
    });
  } catch (error) {
    repository.store.publishedSnapshots.clear();
    previousSnapshots.forEach((snapshot, key) => repository.store.publishedSnapshots.set(key, snapshot));
    repository.store.whereUsed.clear();
    previousWhereUsed.forEach((entries, key) => repository.store.whereUsed.set(key, entries));
    throw error;
  }

  if (!committedSnapshot) {
    throw new Error('Reading V2 publish commit plan is missing an immutable snapshot operation.');
  }

  return {
    snapshot: committedSnapshot,
    whereUsedWrites,
  };
};

export const dispatchReadingV2PublishCommitPlanToSinks = (
  commitPlan: ReadingV2PublishCommitPlan,
  sinks: ReadingV2PublishPipelineSinks,
): readonly string[] => {
  const dispatchedOperationKeys: string[] = [];

  commitPlan.operations.forEach((operation) => {
    if (operation.kind === 'projection') {
      sinks.writeProjection?.(operation.projection);
      dispatchedOperationKeys.push(operation.operationKey);
    }

    if (operation.kind === 'material-metadata') {
      sinks.writeMaterialMetadata?.(operation.metadata);
      dispatchedOperationKeys.push(operation.operationKey);
    }

    if (operation.kind === 'relationship-index') {
      sinks.writeRelationshipIndex?.(operation.write);
      dispatchedOperationKeys.push(operation.operationKey);
    }

    if (operation.kind === 'return-context-notification') {
      sinks.notifyReturnContext?.(operation.notification);
      dispatchedOperationKeys.push(operation.operationKey);
    }
  });

  return dispatchedOperationKeys;
};

export const publishReadingV2Material = (
  input: ReadingV2PublishPipelineInput,
): ReadingV2PublishPipelineResult => {
  const validation = assertReadingV2PublishGate(input.document);
  const snapshotVersionId =
    input.snapshotVersionId ??
    readingV2Ids.snapshotVersionId(`snapshot-${input.materialId}-${Date.now().toString(36)}`);
  const publishedAt = input.publishedAt ?? new Date().toISOString();

  const stagedSnapshot: ReadingV2PublishedSnapshot = {
    snapshotVersionId,
    materialId: input.materialId,
    ownerId: input.ownerId,
    document: input.document,
    publishedAt,
    publishedBy: input.publishedBy,
  };
  const studentSafeProjection = generateReadingV2StudentSafeProjection(stagedSnapshot, publishedAt);
  const sessionSafeProjection = generateReadingV2SessionSafeProjection({
    sessionCode: input.sessionCodeForProjection ?? 'publish-template',
    studentSafeProjection,
    generatedAt: publishedAt,
  });
  const reviewProjection = generateReadingV2ReviewProjection(stagedSnapshot, publishedAt);
  const analyticsProjection = generateReadingV2AnalyticsProjection(stagedSnapshot, publishedAt);
  const projections = [
    studentSafeProjection,
    sessionSafeProjection,
    reviewProjection,
    analyticsProjection,
  ];

  assertReadingV2ProjectionIsStudentSanitized(studentSafeProjection);
  assertReadingV2ProjectionIsStudentSanitized(sessionSafeProjection);

  const metadata = deriveReadingV2MaterialMetadata({
    ...input.metadata,
    materialId: input.materialId,
    ownerId: input.ownerId,
    document: input.document,
    sourceSnapshot: stagedSnapshot,
    updatedAt: publishedAt,
  });
  const relationshipIndexWrites = buildRelationshipIndexWrites(input.materialId, snapshotVersionId);
  const whereUsedWrites = (input.passageAssetUses ?? []).map((use) => ({
    passageAssetId: use.passageAssetId,
    ownerId: input.ownerId,
    consumerId: input.materialId,
    consumerKind: use.consumerKind,
  }));
  const commitPlan = buildReadingV2PublishCommitPlan({
    materialId: input.materialId,
    snapshotVersionId,
    snapshot: stagedSnapshot,
    projections,
    metadata,
    relationshipIndexWrites,
    whereUsedWrites,
    returnContext: input.returnContext,
  });
  const committed = commitReadingV2PublishPlanToRepository(input.repository, commitPlan);

  return {
    validation,
    snapshotVersionId,
    projections,
    metadata,
    relationshipIndexWrites,
    whereUsedWrites: committed.whereUsedWrites,
    commitPlan,
    returnContextNotification: input.returnContext,
  };
};
