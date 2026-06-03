import {
  type ReadingV2Document,
  type ReadingV2FullTestComposition,
  type ReadingV2FullTestId,
  type ReadingV2MaterialId,
  type ReadingV2PublishedSnapshot,
  type ReadingV2SnapshotVersionId,
  readingV2Ids,
} from '../../types/readingV2.types';
import {
  type MaterialTestTypeConfig,
  type MaterialTestTypeId,
  type ReadingPassageVisibilityScope,
} from '../../types/materialCatalog.types';
import { buildMaterialCatalogIndexWrites } from '../materialCatalog/materialCatalogIndexes.service';
import {
  assertReadingV2ProjectionIsStudentSanitized,
  generateReadingV2ReviewProjection,
  generateReadingV2StudentSafeProjection,
} from './readingV2Projection.service';
import {
  deriveReadingV2MaterialMetadata,
  type ReadingV2MaterialMetadataInput,
} from './readingV2MaterialMetadata.service';
import {
  extractReadingV2PassageMaterials,
  type ReadingV2PassageExtractionIssue,
  type ReadingV2PassageExtractionResult,
} from './readingV2PassageExtraction.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

export type ReadingV2FullTestPassageBackfillStatus =
  | 'split-ready'
  | 'manual-review'
  | 'already-backfilled';

export interface ReadingV2FullTestPassageBackfillSource {
  readonly materialId: ReadingV2MaterialId;
  readonly ownerId: string;
  readonly title: string;
  readonly document: ReadingV2Document;
  readonly sourceSnapshotVersionId: ReadingV2SnapshotVersionId;
  readonly publishedBy: string;
  readonly sourceFullTestId?: ReadingV2FullTestId;
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly testTypeIds?: readonly MaterialTestTypeId[];
  readonly testTypeConfigs?: readonly MaterialTestTypeConfig[];
  readonly visibility?: ReadingPassageVisibilityScope;
  readonly publicShareable?: boolean;
  readonly durationMinutes?: number;
  readonly existingComposition?: ReadingV2FullTestComposition | null;
}

export interface ReadingV2FullTestPassageBackfillRow {
  readonly materialId: ReadingV2MaterialId;
  readonly sourceSnapshotVersionId: ReadingV2SnapshotVersionId;
  readonly ownerId: string;
  readonly title: string;
  readonly idempotencyKey: string;
  readonly status: ReadingV2FullTestPassageBackfillStatus;
  readonly passageCount: number;
  readonly issues: readonly ReadingV2PassageExtractionIssue[];
  readonly visibilityDowngradedToPrivate: boolean;
  readonly extraction?: ReadingV2PassageExtractionResult;
}

export interface ReadingV2FullTestPassageBackfillReport {
  readonly dryRun: true;
  readonly generatedAt: string;
  readonly totals: {
    readonly total: number;
    readonly splitReady: number;
    readonly manualReview: number;
    readonly alreadyBackfilled: number;
  };
  readonly rows: readonly ReadingV2FullTestPassageBackfillRow[];
}

export interface ReadingV2FullTestPassageBackfillWrite {
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
    | 'full-test-composition'
    | 'full-test-composition-version';
  readonly idempotencyKey: string;
}

const toMaterialId = (value: string): ReadingV2MaterialId => readingV2Ids.materialId(value);

const sourceKey = (
  materialId: ReadingV2MaterialId,
  snapshotVersionId: ReadingV2SnapshotVersionId,
): string => `${materialId}:${snapshotVersionId}`;

const visibilityToMetadataVisibility = (
  visibility: ReadingPassageVisibilityScope,
): ReadingV2MaterialMetadataInput['visibility'] =>
  visibility === 'public' ? 'library-eligible' : 'private';

const buildReadingPassageSnapshotValue = (input: {
  readonly material: ReadingV2PassageExtractionResult['passages'][number]['material'];
  readonly document: ReadingV2Document;
  readonly publishedAt: string;
  readonly publishedBy: string;
}): Record<string, unknown> => ({
  ...input.material,
  document: input.document,
  publishedAt: input.publishedAt,
  publishedBy: input.publishedBy,
});

const buildCompositionVersionValue = (input: {
  readonly composition: ReadingV2FullTestComposition;
  readonly publishedAt: string;
  readonly publishedBy: string;
}): Record<string, unknown> => ({
  ...input.composition,
  publishedAt: input.publishedAt,
  publishedBy: input.publishedBy,
});

const countStatuses = (
  rows: readonly ReadingV2FullTestPassageBackfillRow[],
): ReadingV2FullTestPassageBackfillReport['totals'] => ({
  total: rows.length,
  splitReady: rows.filter((row) => row.status === 'split-ready').length,
  manualReview: rows.filter((row) => row.status === 'manual-review').length,
  alreadyBackfilled: rows.filter((row) => row.status === 'already-backfilled').length,
});

export const planReadingV2FullTestPassageBackfill = (input: {
  readonly fullTests: readonly ReadingV2FullTestPassageBackfillSource[];
  readonly now?: string;
}): ReadingV2FullTestPassageBackfillReport => {
  const generatedAt = input.now ?? new Date().toISOString();
  const rows = input.fullTests.map((fullTest): ReadingV2FullTestPassageBackfillRow => {
    const idempotencyKey = sourceKey(fullTest.materialId, fullTest.sourceSnapshotVersionId);

    if (fullTest.existingComposition?.passageRefs.length) {
      return {
        materialId: fullTest.materialId,
        sourceSnapshotVersionId: fullTest.sourceSnapshotVersionId,
        ownerId: fullTest.ownerId,
        title: fullTest.title,
        idempotencyKey,
        status: 'already-backfilled',
        passageCount: fullTest.existingComposition.passageRefs.length,
        issues: [],
        visibilityDowngradedToPrivate: false,
      };
    }

    const requestedVisibility =
      fullTest.visibility === 'public' && fullTest.publicShareable === true ? 'public' : 'private';
    const visibilityDowngradedToPrivate =
      fullTest.visibility === 'public' && requestedVisibility === 'private';
    const extraction = extractReadingV2PassageMaterials({
      document: fullTest.document,
      ownerId: fullTest.ownerId,
      sourceFullTestId: fullTest.sourceFullTestId,
      testMaterialId: fullTest.materialId,
      sourceSnapshotVersionId: fullTest.sourceSnapshotVersionId,
      sourceTitleSnapshot: fullTest.title,
      primaryTestTypeId: fullTest.primaryTestTypeId,
      testTypeIds: fullTest.testTypeIds,
      testTypeConfigs: fullTest.testTypeConfigs,
      visibility: requestedVisibility,
      durationMinutes: fullTest.durationMinutes,
      createdAt: generatedAt,
    });
    const status =
      extraction.canPublish && extraction.passages.length > 0 ? 'split-ready' : 'manual-review';

    return {
      materialId: fullTest.materialId,
      sourceSnapshotVersionId: fullTest.sourceSnapshotVersionId,
      ownerId: fullTest.ownerId,
      title: fullTest.title,
      idempotencyKey,
      status,
      passageCount: extraction.passages.length,
      issues: extraction.validationIssues,
      visibilityDowngradedToPrivate,
      extraction,
    };
  });

  return {
    dryRun: true,
    generatedAt,
    totals: countStatuses(rows),
    rows,
  };
};

export const createReadingV2FullTestPassageBackfillWritePlan = (input: {
  readonly report: ReadingV2FullTestPassageBackfillReport;
  readonly approvedBy?: string;
}): ReadingV2FullTestPassageBackfillWrite[] => {
  if (!input.approvedBy?.trim()) {
    throw new Error('Reading V2 passage backfill writes require explicit lead approval.');
  }

  const approvedBy = input.approvedBy.trim();

  return input.report.rows.flatMap((row): ReadingV2FullTestPassageBackfillWrite[] => {
    if (row.status !== 'split-ready' || !row.extraction) {
      return [];
    }

    const passageWrites = row.extraction.passages.flatMap((candidate): ReadingV2FullTestPassageBackfillWrite[] => {
      const passageMaterialId = toMaterialId(candidate.material.passageMaterialId);
      const passageSnapshot: ReadingV2PublishedSnapshot = {
        snapshotVersionId: candidate.material.currentSnapshotVersionId,
        materialId: passageMaterialId,
        ownerId: row.ownerId,
        document: candidate.document,
        publishedAt: input.report.generatedAt,
        publishedBy: approvedBy,
      };
      const studentSafeProjection = generateReadingV2StudentSafeProjection(
        passageSnapshot,
        input.report.generatedAt,
      );
      const reviewProjection = generateReadingV2ReviewProjection(passageSnapshot, input.report.generatedAt);
      const metadata = deriveReadingV2MaterialMetadata({
        materialId: passageMaterialId,
        ownerId: row.ownerId,
        document: candidate.document,
        materialKind: 'reading-passage',
        title: candidate.material.title,
        durationMinutes: candidate.material.durationMinutes,
        visibility: visibilityToMetadataVisibility(candidate.material.visibility),
        primaryTestTypeId: candidate.material.primaryTestTypeId,
        testTypeIds: candidate.material.testTypeIds,
        sourceFullTestId: row.materialId,
        sourceSnapshotVersionId: candidate.material.sourceSnapshotVersionId,
        sourceOrderKind: candidate.material.sourceOrder.kind,
        sourceOrderValue: candidate.material.sourceOrder.value,
        sourceOrderLabelSnapshot: candidate.material.sourceOrder.labelSnapshot,
        sourceOrderDisplaySnapshot: candidate.material.sourceOrder.displaySnapshot,
        sourceQuestionRange: candidate.material.sourceQuestionRange,
        sourceTitleSnapshot: candidate.material.sourceTitleSnapshot,
        updatedAt: input.report.generatedAt,
      });
      const indexWrites = buildMaterialCatalogIndexWrites({
        materialId: candidate.material.passageMaterialId,
        ownerId: row.ownerId,
        title: candidate.material.title,
        visibility: candidate.material.visibility,
        materialKind: 'reading-passage',
        testTypeIds: candidate.material.testTypeIds,
        sourceFullTestId: row.materialId,
        updatedAt: input.report.generatedAt,
      });

      assertReadingV2ProjectionIsStudentSanitized(studentSafeProjection);

      return [
        {
          path: readingV2StoragePaths.readingPassageMaterials(candidate.material.passageMaterialId),
          value: candidate.material,
          writeKind: 'reading-passage-material',
          idempotencyKey: row.idempotencyKey,
        },
        {
          path: readingV2StoragePaths.readingPassageMaterialVersions(
            candidate.material.passageMaterialId,
            candidate.material.currentSnapshotVersionId,
          ),
          value: buildReadingPassageSnapshotValue({
            material: candidate.material,
            document: candidate.document,
            publishedAt: input.report.generatedAt,
            publishedBy: approvedBy,
          }),
          writeKind: 'reading-passage-material-version',
          idempotencyKey: row.idempotencyKey,
        },
        {
          path: readingV2StoragePaths.publishedSnapshots(
            candidate.material.passageMaterialId,
            candidate.material.currentSnapshotVersionId,
          ),
          value: passageSnapshot,
          writeKind: 'reading-passage-published-snapshot',
          idempotencyKey: row.idempotencyKey,
        },
        {
          path: readingV2StoragePaths.studentSafeTests(
            candidate.material.passageMaterialId,
            candidate.material.currentSnapshotVersionId,
          ),
          value: studentSafeProjection,
          writeKind: 'reading-passage-student-safe-projection',
          idempotencyKey: row.idempotencyKey,
        },
        {
          path: readingV2StoragePaths.reviewProjections(
            candidate.material.passageMaterialId,
            candidate.material.currentSnapshotVersionId,
          ),
          value: reviewProjection,
          writeKind: 'reading-passage-review-projection',
          idempotencyKey: row.idempotencyKey,
        },
        {
          path: readingV2StoragePaths.materialMetadata(candidate.material.passageMaterialId),
          value: metadata,
          writeKind: 'reading-passage-metadata',
          idempotencyKey: row.idempotencyKey,
        },
        ...indexWrites.map((write) => ({
          path: write.path,
          value: write.value,
          writeKind: 'reading-passage-listing-index' as const,
          idempotencyKey: row.idempotencyKey,
        })),
      ];
    });

    return [
      ...passageWrites,
      {
        path: readingV2StoragePaths.fullTestCompositions(row.extraction.composition.compositionId),
        value: row.extraction.composition,
        writeKind: 'full-test-composition',
        idempotencyKey: row.idempotencyKey,
      },
      {
        path: readingV2StoragePaths.fullTestCompositionVersions(
          row.extraction.composition.compositionId,
          row.sourceSnapshotVersionId,
        ),
        value: buildCompositionVersionValue({
          composition: row.extraction.composition,
          publishedAt: input.report.generatedAt,
          publishedBy: approvedBy,
        }),
        writeKind: 'full-test-composition-version',
        idempotencyKey: row.idempotencyKey,
      },
    ];
  });
};

export const runReadingV2FullTestPassageBackfill = async (input: {
  readonly report: ReadingV2FullTestPassageBackfillReport;
  readonly approvedBy?: string;
  readonly write: (write: ReadingV2FullTestPassageBackfillWrite) => void | Promise<void>;
}): Promise<{
  readonly written: number;
  readonly skippedManualReview: number;
  readonly skippedAlreadyBackfilled: number;
}> => {
  const writes = createReadingV2FullTestPassageBackfillWritePlan({
    report: input.report,
    approvedBy: input.approvedBy,
  });

  for (const write of writes) {
    await input.write(write);
  }

  return {
    written: writes.length,
    skippedManualReview: input.report.totals.manualReview,
    skippedAlreadyBackfilled: input.report.totals.alreadyBackfilled,
  };
};
