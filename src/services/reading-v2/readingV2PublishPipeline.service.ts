import {
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2FullTestComposition,
  type ReadingV2FullTestId,
  type ReadingV2MaterialId,
  type ReadingV2PassageAssetId,
  type ReadingV2PublishedSnapshot,
  type ReadingV2ReadingPassageMaterial,
  type ReadingV2SnapshotVersionId,
  type ReadingV2WhereUsedEntry,
} from '../../types/readingV2.types';
import {
  type MaterialTestTypeConfig,
  type MaterialTestTypeId,
  type ReadingPassageVisibilityScope,
} from '../../types/materialCatalog.types';
import { buildMaterialCatalogIndexWrites } from '../materialCatalog/materialCatalogIndexes.service';
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
  extractReadingV2PassageMaterials,
  type ReadingV2ExtractedPassageCandidate,
  type ReadingV2PassageExtractionResult,
} from './readingV2PassageExtraction.service';
import {
  buildReadingV2DuplicateIndexRow,
  findReadingV2PassageDuplicateMatches,
  getReadingV2DuplicateIndexPath,
  type ReadingV2DuplicateGuardResult,
  type ReadingV2DuplicateIndexRow,
} from './readingV2PassageDuplicateGuard.service';
import { assertReadingV2RefOnlyFullTestComposition } from './readingV2FullTestComposition.service';
import {
  assertReadingV2MasterHasNoBrokenRefs,
  getReadingV2BrokenReferenceSummaryFromComposition,
  type ReadingV2BrokenRefReason,
} from './readingV2BrokenReference.service';
import {
  assertReadingV2PublishGate,
  ReadingV2PublishGateError,
  validateReadingV2Draft,
  type ReadingV2ValidationResult,
} from './readingV2Validation.service';
import {
  composeReadingV2PassageSetRuntimeProjection,
  type ReadingPassageHomeworkLaunchItem,
} from './readingV2PassageHomeworkLaunch.service';
import { writeReadingV2WhereUsedForPublish } from './readingV2PassageAssetWorkflow.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

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

export interface ReadingV2PublishStorageWrite {
  readonly path: string;
  readonly value: unknown;
  readonly writeKind:
    | 'reading-passage-material'
    | 'reading-passage-material-version'
    | 'reading-passage-published-snapshot'
    | 'reading-passage-student-safe-projection'
    | 'reading-passage-review-projection'
    | 'reading-passage-metadata'
    | 'reading-passage-listing-index'
    | 'reading-passage-duplicate-index'
    | 'full-test-composition'
    | 'full-test-composition-version';
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
      readonly kind: 'storage-write';
      readonly operationKey: string;
      readonly path: string;
      readonly value: unknown;
      readonly writeKind: ReadingV2PublishStorageWrite['writeKind'];
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
  readonly skipReadingPassageExtraction?: boolean;
  readonly readingPassageExtraction?: {
    readonly sourceFullTestId?: ReadingV2FullTestId;
    readonly primaryTestTypeId?: MaterialTestTypeId;
    readonly testTypeIds?: readonly MaterialTestTypeId[];
    readonly testTypeConfigs?: readonly MaterialTestTypeConfig[];
    readonly visibility?: ReadingPassageVisibilityScope;
    readonly durationMinutes?: number;
  };
  readonly duplicateIndexRows?: readonly ReadingV2DuplicateIndexRow[];
  readonly duplicateIndexStatus?: 'available' | 'missing' | 'stale';
  readonly masterComposition?: {
    readonly hasBrokenRefs?: boolean;
    readonly brokenRefCount?: number;
    readonly brokenRefReasons?: readonly ReadingV2BrokenRefReason[];
  };
  readonly returnContext?: string;
  readonly onDiagnosticEvent?: (event: string, payload: Record<string, unknown>) => void;
}

export interface ReadingV2PublishPipelineResult {
  readonly validation: ReadingV2ValidationResult;
  readonly snapshotVersionId: ReadingV2SnapshotVersionId;
  readonly projections: readonly ReadingV2DerivedProjection[];
  readonly metadata: ReadingV2MaterialMetadata;
  readonly relationshipIndexWrites: readonly ReadingV2PublishRelationshipIndexWrite[];
  readonly whereUsedWrites: readonly ReadingV2WhereUsedEntry[];
  readonly readingPassageExtraction?: ReadingV2PassageExtractionResult;
  readonly duplicateWarnings: readonly ReadingV2AutoSplitDuplicateWarning[];
  readonly commitPlan: ReadingV2PublishCommitPlan;
  readonly returnContextNotification?: string;
}

export interface ReadingV2AutoSplitDuplicateWarning {
  readonly passageMaterialId: ReadingV2MaterialId;
  readonly result: ReadingV2DuplicateGuardResult;
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

const compactDiagnosticPayload = (payload: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );

const sourceTitleSlugFor = (input: Pick<ReadingV2PublishPipelineInput, 'metadata' | 'document'>): string =>
  (input.metadata?.title ?? input.document.title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'reading-v2';

const emitPublishCanonicalValidationBlocked = (
  input: ReadingV2PublishPipelineInput,
  validation: ReadingV2ValidationResult,
): void => {
  validation.blockingIssues.forEach((issue) => {
    input.onDiagnosticEvent?.('publish_canonical_validation_blocked', compactDiagnosticPayload({
      outcome: 'blocked',
      issueCode: issue.code,
      materialId: input.materialId,
      sourceTitleSlug: sourceTitleSlugFor(input),
      stimulusId: issue.objectId?.startsWith('stimulus-') ? issue.objectId : undefined,
    }));
  });
};

const emitPassageExtractionCanonicalValidationBlocked = (
  input: ReadingV2PublishPipelineInput,
  extraction: ReadingV2PassageExtractionResult,
): void => {
  extraction.validationIssues
    .filter((issue) => issue.severity === 'error')
    .forEach((issue) => {
      input.onDiagnosticEvent?.('passage_extraction_canonical_validation_blocked', compactDiagnosticPayload({
        outcome: 'blocked',
        issueCode: issue.code,
        materialId: input.materialId,
        sourceTitleSlug: sourceTitleSlugFor(input),
        stimulusId: issue.sectionId,
      }));
    });
};

const toMaterialId = (value: string): ReadingV2MaterialId => readingV2Ids.materialId(value);

const storageOperation = (
  commitKey: string,
  write: ReadingV2PublishStorageWrite,
): ReadingV2PublishCommitOperation => ({
  kind: 'storage-write',
  operationKey: `${commitKey}/storage/${write.path}`,
  path: write.path,
  value: write.value,
  writeKind: write.writeKind,
});

const visibilityToMetadataVisibility = (
  visibility: ReadingPassageVisibilityScope,
): ReadingV2MaterialMetadataInput['visibility'] =>
  visibility === 'public' ? 'library-eligible' : 'private';

const metadataVisibilityToReadingPassageVisibility = (
  visibility: ReadingV2MaterialMetadata['visibility'],
): ReadingPassageVisibilityScope => (visibility === 'library-eligible' ? 'public' : 'private');

const isFullTestMaterialKind = (
  materialKind: ReadingV2MaterialMetadataInput['materialKind'] | undefined,
): boolean => materialKind === 'full-test' || materialKind === 'reading-v2-full-test-composition';

const resolveReadingPassageExtractionInput = (
  input: ReadingV2PublishPipelineInput,
  metadata: ReadingV2MaterialMetadata,
): ReadingV2PublishPipelineInput['readingPassageExtraction'] => {
  if (input.skipReadingPassageExtraction) {
    return undefined;
  }

  if (input.readingPassageExtraction) {
    return {
      sourceFullTestId:
        input.readingPassageExtraction.sourceFullTestId ??
        (isFullTestMaterialKind(input.metadata?.materialKind)
          ? readingV2Ids.fullTestId(input.materialId)
          : undefined),
      primaryTestTypeId: input.readingPassageExtraction.primaryTestTypeId ?? metadata.primaryTestTypeId,
      testTypeIds: input.readingPassageExtraction.testTypeIds ?? metadata.testTypeIds,
      testTypeConfigs: input.readingPassageExtraction.testTypeConfigs ?? input.metadata?.testTypeConfigs,
      visibility:
        input.readingPassageExtraction.visibility ??
        metadataVisibilityToReadingPassageVisibility(metadata.visibility),
      durationMinutes: input.readingPassageExtraction.durationMinutes ?? metadata.durationMinutes,
    };
  }

  if (!isFullTestMaterialKind(input.metadata?.materialKind)) {
    return undefined;
  }

  return {
    sourceFullTestId: readingV2Ids.fullTestId(input.materialId),
    primaryTestTypeId: metadata.primaryTestTypeId,
    testTypeIds: metadata.testTypeIds,
    testTypeConfigs: input.metadata?.testTypeConfigs,
    visibility: metadataVisibilityToReadingPassageVisibility(metadata.visibility),
    durationMinutes: metadata.durationMinutes,
  };
};

const buildReadingPassageSnapshotValue = (input: {
  readonly material: ReadingV2ReadingPassageMaterial;
  readonly document: ReadingV2Document;
  readonly publishedAt: string;
  readonly publishedBy: string;
}): Record<string, unknown> => ({
  ...input.material,
  document: input.document,
  publishedAt: input.publishedAt,
  publishedBy: input.publishedBy,
});

const buildReadingPassagePublishedSnapshot = (input: {
  readonly candidate: ReadingV2ExtractedPassageCandidate;
  readonly ownerId: string;
  readonly publishedAt: string;
  readonly publishedBy: string;
}): ReadingV2PublishedSnapshot => ({
  snapshotVersionId: input.candidate.material.currentSnapshotVersionId,
  materialId: toMaterialId(input.candidate.material.passageMaterialId),
  ownerId: input.ownerId,
  document: input.candidate.document,
  publishedAt: input.publishedAt,
  publishedBy: input.publishedBy,
});

const buildDuplicateBodyText = (candidate: ReadingV2ExtractedPassageCandidate): string =>
  JSON.stringify({
    stimulus: candidate.stimulus.content,
  });

const buildDuplicateQuestionText = (candidate: ReadingV2ExtractedPassageCandidate): string =>
  JSON.stringify({
    taskGroups: candidate.taskGroups.map((taskGroup) => ({
      taskGroupId: taskGroup.taskGroupId,
      officialTaskType: taskGroup.officialTaskType,
      groupTitle: taskGroup.groupTitle,
      instructionBlocks: taskGroup.instructionBlocks,
      answerRule: taskGroup.answerRule,
      stimulusRefs: taskGroup.stimulusRefs,
      optionSetRefs: taskGroup.optionSetRefs,
    })),
    interactions: candidate.interactions.map((interaction) => ({
      interactionId: interaction.interactionId,
      responseShape: interaction.responseShape,
      reviewLabel: interaction.reviewLabel,
      promptText: interaction.promptText,
      primaryAnchorId: interaction.primaryAnchorId,
      contextAnchorIds: interaction.contextAnchorIds,
    })),
    optionSets: candidate.optionSets,
  });

const assertDuplicateIndexReady = (
  input: Pick<ReadingV2PublishPipelineInput, 'duplicateIndexStatus'>,
): void => {
  if (input.duplicateIndexStatus === 'missing') {
    throw new Error('Reading V2 auto-split duplicate index is missing; publish cannot fall back to canonical scans.');
  }

  if (input.duplicateIndexStatus === 'stale') {
    throw new Error('Reading V2 auto-split duplicate index is stale; publish cannot fall back to canonical scans.');
  }
};

const buildReadingPassageDuplicateArtifacts = (input: {
  readonly extraction: ReadingV2PassageExtractionResult;
  readonly ownerId: string;
  readonly duplicateIndexRows?: readonly ReadingV2DuplicateIndexRow[];
  readonly publishedAt: string;
}): {
  readonly warnings: readonly ReadingV2AutoSplitDuplicateWarning[];
  readonly writes: readonly ReadingV2PublishStorageWrite[];
} => {
  const rows = input.duplicateIndexRows ?? [];
  const warnings: ReadingV2AutoSplitDuplicateWarning[] = [];
  const writes: ReadingV2PublishStorageWrite[] = [];

  input.extraction.passages.forEach((candidate) => {
    const passageMaterialId = toMaterialId(candidate.material.passageMaterialId);
    const bodyText = buildDuplicateBodyText(candidate);
    const questionText = buildDuplicateQuestionText(candidate);
    const result = findReadingV2PassageDuplicateMatches({
      teacherId: input.ownerId,
      candidate: {
        title: candidate.material.title,
        source: {
          sourceFullTestId: candidate.material.sourceFullTestId,
          sourceOrderDisplay: candidate.material.sourceOrder.displaySnapshot,
        },
        bodyText,
        questionText,
      },
      rows,
      currentMaterialId: candidate.material.passageMaterialId,
    });

    if (result.shouldWarn) {
      warnings.push({ passageMaterialId, result });
    }

    writes.push({
      path: getReadingV2DuplicateIndexPath(input.ownerId, candidate.material.passageMaterialId),
      value: buildReadingV2DuplicateIndexRow({
        ownerId: input.ownerId,
        passageMaterialId: candidate.material.passageMaterialId,
        currentVersionId: candidate.material.currentSnapshotVersionId,
        title: candidate.material.title,
        state: candidate.material.state === 'archived' ? 'archived' : 'published',
        visibility: candidate.material.visibility,
        source: {
          sourceFullTestId: candidate.material.sourceFullTestId,
          sourceOrderDisplay: candidate.material.sourceOrder.displaySnapshot,
        },
        testType: {
          ...(candidate.material.primaryTestTypeId
            ? { primaryTestTypeId: candidate.material.primaryTestTypeId }
            : {}),
          testTypeIds: candidate.material.testTypeIds,
        },
        questionCount: candidate.material.interactionIds.length,
        updatedAt: input.publishedAt,
        bodyText,
        questionText,
      }),
      writeKind: 'reading-passage-duplicate-index',
    });
  });

  return { warnings, writes };
};

const buildCompositionVersionValue = (input: {
  readonly composition: ReadingV2FullTestComposition;
  readonly publishedAt: string;
  readonly publishedBy: string;
}): Record<string, unknown> => ({
  ...input.composition,
  publishedAt: input.publishedAt,
  publishedBy: input.publishedBy,
});

const buildReadingPassageStorageWrites = (input: {
  readonly extraction: ReadingV2PassageExtractionResult;
  readonly ownerId: string;
  readonly testMaterialId: ReadingV2MaterialId;
  readonly snapshotVersionId: ReadingV2SnapshotVersionId;
  readonly publishedAt: string;
  readonly publishedBy: string;
  readonly testTypeConfigs?: readonly MaterialTestTypeConfig[];
  readonly duplicateIndexWrites?: readonly ReadingV2PublishStorageWrite[];
}): ReadingV2PublishStorageWrite[] => {
  assertReadingV2RefOnlyFullTestComposition(input.extraction.composition);
  const passageWrites = input.extraction.passages.flatMap((candidate): ReadingV2PublishStorageWrite[] => {
    const passageMaterialId = toMaterialId(candidate.material.passageMaterialId);
    const passageSnapshot = buildReadingPassagePublishedSnapshot({
      candidate,
      ownerId: input.ownerId,
      publishedAt: input.publishedAt,
      publishedBy: input.publishedBy,
    });
    const studentSafeProjection = generateReadingV2StudentSafeProjection(
      passageSnapshot,
      input.publishedAt,
    );
    const reviewProjection = generateReadingV2ReviewProjection(passageSnapshot, input.publishedAt);
    const metadata = deriveReadingV2MaterialMetadata({
      materialId: passageMaterialId,
      ownerId: input.ownerId,
      document: candidate.document,
      materialKind: 'reading-passage',
      title: candidate.material.title,
      durationMinutes: candidate.material.durationMinutes,
      visibility: visibilityToMetadataVisibility(candidate.material.visibility),
      primaryTestTypeId: candidate.material.primaryTestTypeId,
      testTypeIds: candidate.material.testTypeIds,
      testTypeConfigs: input.testTypeConfigs,
      sourceFullTestId: candidate.material.sourceFullTestId
        ? toMaterialId(candidate.material.sourceFullTestId)
        : undefined,
      sourceSnapshotVersionId: candidate.material.sourceSnapshotVersionId,
      sourceOrderKind: candidate.material.sourceOrder.kind,
      sourceOrderValue: candidate.material.sourceOrder.value,
      sourceOrderLabelSnapshot: candidate.material.sourceOrder.labelSnapshot,
      sourceOrderDisplaySnapshot: candidate.material.sourceOrder.displaySnapshot,
      sourceQuestionRange: candidate.material.sourceQuestionRange,
      sourceTitleSnapshot: candidate.material.sourceTitleSnapshot,
      updatedAt: input.publishedAt,
    });
    const indexWrites = buildMaterialCatalogIndexWrites({
      materialId: candidate.material.passageMaterialId,
      ownerId: input.ownerId,
      title: candidate.material.title,
      visibility: candidate.material.visibility,
      materialKind: 'reading-passage',
      testTypeIds: candidate.material.testTypeIds,
      sourceFullTestId: candidate.material.sourceFullTestId,
      updatedAt: input.publishedAt,
    });

    assertReadingV2ProjectionIsStudentSanitized(studentSafeProjection);

    return [
      {
        path: readingV2StoragePaths.readingPassageMaterials(candidate.material.passageMaterialId),
        value: candidate.material,
        writeKind: 'reading-passage-material',
      },
      {
        path: readingV2StoragePaths.readingPassageMaterialVersions(
          candidate.material.passageMaterialId,
          candidate.material.currentSnapshotVersionId,
        ),
        value: buildReadingPassageSnapshotValue({
          material: candidate.material,
          document: candidate.document,
          publishedAt: input.publishedAt,
          publishedBy: input.publishedBy,
        }),
        writeKind: 'reading-passage-material-version',
      },
      {
        path: readingV2StoragePaths.publishedSnapshots(
          candidate.material.passageMaterialId,
          candidate.material.currentSnapshotVersionId,
        ),
        value: passageSnapshot,
        writeKind: 'reading-passage-published-snapshot',
      },
      {
        path: readingV2StoragePaths.studentSafeTests(
          candidate.material.passageMaterialId,
          candidate.material.currentSnapshotVersionId,
        ),
        value: studentSafeProjection,
        writeKind: 'reading-passage-student-safe-projection',
      },
      {
        path: readingV2StoragePaths.reviewProjections(
          candidate.material.passageMaterialId,
          candidate.material.currentSnapshotVersionId,
        ),
        value: reviewProjection,
        writeKind: 'reading-passage-review-projection',
      },
      {
        path: readingV2StoragePaths.materialMetadata(candidate.material.passageMaterialId),
        value: metadata,
        writeKind: 'reading-passage-metadata',
      },
      ...((input.duplicateIndexWrites ?? []).filter((write) =>
        write.path.endsWith(`/${candidate.material.passageMaterialId}`),
      )),
      ...indexWrites.map((write) => ({
        path: write.path,
        value: write.value,
        writeKind: 'reading-passage-listing-index' as const,
      })),
    ];
  });

  return [
    ...passageWrites,
    {
      path: readingV2StoragePaths.fullTestCompositions(input.extraction.composition.compositionId),
      value: input.extraction.composition,
      writeKind: 'full-test-composition',
    },
    {
      path: readingV2StoragePaths.fullTestCompositionVersions(
        input.extraction.composition.compositionId,
        input.snapshotVersionId,
      ),
      value: buildCompositionVersionValue({
        composition: input.extraction.composition,
        publishedAt: input.publishedAt,
        publishedBy: input.publishedBy,
      }),
      writeKind: 'full-test-composition-version',
    },
  ];
};

const compositionProjectionItems = (
  composition: ReadingV2FullTestComposition,
): readonly ReadingPassageHomeworkLaunchItem[] =>
  [...composition.passageRefs]
    .sort((left, right) => left.order - right.order)
    .map((ref) => ({
      passageMaterialId: ref.passageMaterialId,
      snapshotVersionId: ref.snapshotVersionId,
      titleSnapshot: ref.titleSnapshot || ref.title,
      questionCount: ref.questionCountSnapshot || ref.questionCount,
      testTypeIds: [...ref.testTypeIdsSnapshot],
      sourceOrderDisplay: ref.sourceOrderDisplaySnapshot || ref.source?.sourceOrderDisplay,
      sourceFullTestTitle: ref.source?.sourceFullTestTitle,
      order: ref.order,
    }));

const buildCompositionFirstMasterProjections = (input: {
  readonly materialId: ReadingV2MaterialId;
  readonly snapshotVersionId: ReadingV2SnapshotVersionId;
  readonly ownerId: string;
  readonly publishedAt: string;
  readonly publishedBy: string;
  readonly metadata: ReadingV2MaterialMetadata;
  readonly extraction: ReadingV2PassageExtractionResult;
  readonly sessionCodeForProjection?: string;
}): readonly ReadingV2DerivedProjection[] => {
  const items = compositionProjectionItems(input.extraction.composition);
  const studentSafePassageProjections = input.extraction.passages.map((candidate) =>
    generateReadingV2StudentSafeProjection(
      buildReadingPassagePublishedSnapshot({
        candidate,
        ownerId: input.ownerId,
        publishedAt: input.publishedAt,
        publishedBy: input.publishedBy,
      }),
      input.publishedAt,
    ),
  );
  const reviewPassageProjections = input.extraction.passages.map((candidate) =>
    generateReadingV2ReviewProjection(
      buildReadingPassagePublishedSnapshot({
        candidate,
        ownerId: input.ownerId,
        publishedAt: input.publishedAt,
        publishedBy: input.publishedBy,
      }),
      input.publishedAt,
    ),
  );
  const studentSafeProjection = composeReadingV2PassageSetRuntimeProjection({
    title: input.metadata.title,
    materialId: input.materialId,
    sourceDocumentId: input.extraction.composition.compositionId,
    projectionId: `student-safe:${input.materialId}:${input.snapshotVersionId}`,
    projectionKind: 'student-safe',
    sourceSnapshotVersionId: input.snapshotVersionId,
    runtimeContract: 'student-runtime',
    items,
    projections: studentSafePassageProjections,
    generatedAt: input.publishedAt,
  });
  const sessionSafeProjection = generateReadingV2SessionSafeProjection({
    sessionCode: input.sessionCodeForProjection ?? 'publish-template',
    studentSafeProjection,
    generatedAt: input.publishedAt,
  });
  const reviewProjection = composeReadingV2PassageSetRuntimeProjection({
    title: input.metadata.title,
    materialId: input.materialId,
    sourceDocumentId: input.extraction.composition.compositionId,
    projectionId: `review:${input.materialId}:${input.snapshotVersionId}`,
    projectionKind: 'review',
    sourceSnapshotVersionId: input.snapshotVersionId,
    runtimeContract: 'review-shell',
    items,
    projections: reviewPassageProjections,
    generatedAt: input.publishedAt,
  });

  assertReadingV2ProjectionIsStudentSanitized(studentSafeProjection);
  assertReadingV2ProjectionIsStudentSanitized(sessionSafeProjection);

  return [studentSafeProjection, sessionSafeProjection, reviewProjection];
};

const buildReadingV2PublishCommitPlan = (input: {
  readonly materialId: ReadingV2MaterialId;
  readonly snapshotVersionId: ReadingV2SnapshotVersionId;
  readonly snapshot?: ReadingV2PublishedSnapshot;
  readonly projections: readonly ReadingV2DerivedProjection[];
  readonly metadata: ReadingV2MaterialMetadata;
  readonly relationshipIndexWrites: readonly ReadingV2PublishRelationshipIndexWrite[];
  readonly whereUsedWrites: readonly ReadingV2WhereUsedEntry[];
  readonly storageWrites?: readonly ReadingV2PublishStorageWrite[];
  readonly returnContext?: string;
}): ReadingV2PublishCommitPlan => {
  const commitKey = `${input.materialId}/${input.snapshotVersionId}`;
  const operations: ReadingV2PublishCommitOperation[] = [
    ...(input.snapshot
      ? [{
      kind: 'published-snapshot',
      operationKey: `${commitKey}/snapshot`,
      snapshot: input.snapshot,
    } as const]
      : []),
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
    ...(input.storageWrites ?? []).map((write) => storageOperation(commitKey, write)),
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
  readonly snapshot?: ReadingV2PublishedSnapshot;
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

  const hasStorageWrites = commitPlan.operations.some((operation) => operation.kind === 'storage-write');
  if (!committedSnapshot && !hasStorageWrites) {
    throw new Error('Reading V2 publish commit plan is missing an immutable snapshot operation.');
  }

  return {
    snapshot: committedSnapshot ?? undefined,
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
  if (input.masterComposition) {
    assertReadingV2MasterHasNoBrokenRefs(
      getReadingV2BrokenReferenceSummaryFromComposition(input.masterComposition),
    );
  }

  let validation: ReadingV2ValidationResult;
  try {
    validation = assertReadingV2PublishGate(input.document);
  } catch (error) {
    if (error instanceof ReadingV2PublishGateError) {
      emitPublishCanonicalValidationBlocked(input, error.result);
    }
    throw error;
  }
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
  const baseMetadata = deriveReadingV2MaterialMetadata({
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
  const readingPassageExtractionInput = resolveReadingPassageExtractionInput(input, baseMetadata);
  const readingPassageExtraction = readingPassageExtractionInput
    ? extractReadingV2PassageMaterials({
        document: input.document,
        ownerId: input.ownerId,
        sourceFullTestId: readingPassageExtractionInput.sourceFullTestId,
        testMaterialId: input.materialId,
        sourceSnapshotVersionId: snapshotVersionId,
        sourceTitleSnapshot: baseMetadata.title,
        primaryTestTypeId: readingPassageExtractionInput.primaryTestTypeId,
        testTypeIds: readingPassageExtractionInput.testTypeIds,
        testTypeConfigs: readingPassageExtractionInput.testTypeConfigs,
        visibility: readingPassageExtractionInput.visibility,
        durationMinutes: readingPassageExtractionInput.durationMinutes,
        createdAt: publishedAt,
      })
    : undefined;
  const metadata: ReadingV2MaterialMetadata = readingPassageExtraction
    ? {
        ...baseMetadata,
        compositionId: readingPassageExtraction.composition.compositionId,
      }
    : baseMetadata;
  const writesCompositionFirstMaster = Boolean(readingPassageExtraction);

  if (readingPassageExtraction?.validationIssues.some((entry) => entry.severity === 'error')) {
    emitPassageExtractionCanonicalValidationBlocked(input, readingPassageExtraction);
    const codes = readingPassageExtraction.validationIssues
      .filter((entry) => entry.severity === 'error')
      .map((entry) => entry.code)
      .join(', ');
    throw new Error(`Reading V2 passage extraction blocked publish: ${codes}`);
  }

  const projections = writesCompositionFirstMaster
    ? buildCompositionFirstMasterProjections({
        materialId: input.materialId,
        snapshotVersionId,
        ownerId: input.ownerId,
        publishedAt,
        publishedBy: input.publishedBy,
        metadata,
        extraction: readingPassageExtraction!,
        sessionCodeForProjection: input.sessionCodeForProjection,
      })
    : (() => {
        const studentSafeProjection = generateReadingV2StudentSafeProjection(stagedSnapshot, publishedAt);
        const sessionSafeProjection = generateReadingV2SessionSafeProjection({
          sessionCode: input.sessionCodeForProjection ?? 'publish-template',
          studentSafeProjection,
          generatedAt: publishedAt,
        });
        const reviewProjection = generateReadingV2ReviewProjection(stagedSnapshot, publishedAt);
        const analyticsProjection = generateReadingV2AnalyticsProjection(stagedSnapshot, publishedAt);

        assertReadingV2ProjectionIsStudentSanitized(studentSafeProjection);
        assertReadingV2ProjectionIsStudentSanitized(sessionSafeProjection);

        return [
          studentSafeProjection,
          sessionSafeProjection,
          reviewProjection,
          analyticsProjection,
        ];
      })();

  if (readingPassageExtraction) {
    assertDuplicateIndexReady(input);
  }
  const duplicateArtifacts = readingPassageExtraction
    ? buildReadingPassageDuplicateArtifacts({
        extraction: readingPassageExtraction,
        ownerId: input.ownerId,
        duplicateIndexRows: input.duplicateIndexRows,
        publishedAt,
      })
    : { warnings: [], writes: [] };

  const storageWrites = readingPassageExtraction
    ? buildReadingPassageStorageWrites({
        extraction: readingPassageExtraction,
        ownerId: input.ownerId,
        testMaterialId: input.materialId,
        snapshotVersionId,
        publishedAt,
        publishedBy: input.publishedBy,
        testTypeConfigs: readingPassageExtractionInput?.testTypeConfigs,
        duplicateIndexWrites: duplicateArtifacts.writes,
      })
    : [];
  const commitPlan = buildReadingV2PublishCommitPlan({
    materialId: input.materialId,
    snapshotVersionId,
    snapshot: writesCompositionFirstMaster ? undefined : stagedSnapshot,
    projections,
    metadata,
    relationshipIndexWrites,
    whereUsedWrites,
    storageWrites,
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
    readingPassageExtraction,
    duplicateWarnings: duplicateArtifacts.warnings,
    commitPlan,
    returnContextNotification: input.returnContext,
  };
};
