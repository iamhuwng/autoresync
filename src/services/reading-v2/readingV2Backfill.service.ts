import {
  type ReadingV2AnchorId,
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
  type ReadingV2DerivedProjection,
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
import { validateReadingV2Draft } from './readingV2Validation.service';

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
  readonly studentSafeProjection?: ReadingV2DerivedProjection | null;
  readonly reviewProjection?: ReadingV2DerivedProjection | null;
}

export type ReadingV2CanonicalBackfillClassification =
  | 'valid'
  | 'auto-repairable'
  | 'manual-review-required'
  | 'unsafe-to-write';

export type ReadingV2CanonicalBackfillIssueCode =
  | 'duplicate-stimulus-anchor-id'
  | 'missing-stimulus-anchor'
  | 'duplicate-visible-number'
  | 'projection-anchor-mismatch'
  | 'canonical-validation-blocked';

export interface ReadingV2CanonicalBackfillSafetyIssue {
  readonly code: ReadingV2CanonicalBackfillIssueCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly objectId?: string;
  readonly stimulusId?: string;
  readonly anchorId?: string;
  readonly interactionId?: string;
  readonly questionNumber?: number;
  readonly projectionKind?: string;
  readonly autoRepairable?: boolean;
}

export interface ReadingV2CanonicalBackfillSafetyReport {
  readonly classification: ReadingV2CanonicalBackfillClassification;
  readonly issues: readonly ReadingV2CanonicalBackfillSafetyIssue[];
  readonly scannedProjections: readonly string[];
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
  readonly canonicalSafety: ReadingV2CanonicalBackfillSafetyReport;
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

const cloneRecord = <T>(value: T): T =>
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);

const unique = <T extends string>(values: readonly T[]): T[] => Array.from(new Set(values));

const sourceTitleSlugFor = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'reading-v2';

const backfillSafetyIssue = (
  code: ReadingV2CanonicalBackfillIssueCode,
  message: string,
  details: Omit<ReadingV2CanonicalBackfillSafetyIssue, 'code' | 'message' | 'severity'> = {},
  severity: 'warning' | 'error' = 'error',
): ReadingV2CanonicalBackfillSafetyIssue => ({
  code,
  severity,
  message,
  ...details,
});

const stimulusContentAnchorIds = (
  content: ReadingV2Document['stimuli'][string]['content'],
): readonly ReadingV2AnchorId[] => {
  if (content.kind === 'passage-content') {
    return content.paragraphs.flatMap((paragraph) => paragraph.anchorId ? [paragraph.anchorId] : []);
  }

  if (content.kind === 'table-content') {
    return content.rows.flatMap((row) =>
      row.flatMap((cell) => [
        ...(cell.anchorId ? [cell.anchorId] : []),
        ...(cell.anchorIds ?? []),
        ...((cell.splitSourceCells ?? []).flatMap((splitCell) => [
          ...(splitCell.anchorId ? [splitCell.anchorId] : []),
          ...(splitCell.anchorIds ?? []),
        ])),
      ]),
    );
  }

  if (content.kind === 'flowchart-content') {
    return content.steps.flatMap((step) => step.anchorId ? [step.anchorId] : []);
  }

  if (content.kind === 'diagram-content') {
    return content.hotspots.map((hotspot) => hotspot.anchorId);
  }

  return [];
};

const scanStimulusAnchorIntegrity = (
  document: ReadingV2Document,
): ReadingV2CanonicalBackfillSafetyIssue[] => {
  const issues: ReadingV2CanonicalBackfillSafetyIssue[] = [];

  Object.values(document.stimuli).forEach((stimulus) => {
    const seen = new Set<string>();
    const duplicated = new Set<string>();

    stimulus.anchorIds.forEach((anchorId) => {
      if (seen.has(anchorId)) {
        duplicated.add(anchorId);
      }
      seen.add(anchorId);
    });

    duplicated.forEach((anchorId) => {
      const anchor = document.anchors[anchorId];
      const deterministic = anchor?.stimulusId === stimulus.stimulusId;
      issues.push(
        backfillSafetyIssue(
          'duplicate-stimulus-anchor-id',
          deterministic
            ? `Stimulus ${stimulus.stimulusId} repeats anchor ${anchorId}; dry-run can de-dupe this registry entry.`
            : `Stimulus ${stimulus.stimulusId} repeats anchor ${anchorId}, but the anchor object is missing or scoped elsewhere.`,
          {
            stimulusId: stimulus.stimulusId,
            anchorId,
            objectId: stimulus.stimulusId,
            autoRepairable: deterministic,
          },
          deterministic ? 'warning' : 'error',
        ),
      );
    });

    stimulus.anchorIds.forEach((anchorId) => {
      const anchor = document.anchors[anchorId];
      if (!anchor) {
        issues.push(
          backfillSafetyIssue(
            'missing-stimulus-anchor',
            `Stimulus ${stimulus.stimulusId} references missing anchor ${anchorId}.`,
            { stimulusId: stimulus.stimulusId, anchorId, objectId: stimulus.stimulusId },
          ),
        );
        return;
      }

      if (anchor.stimulusId !== stimulus.stimulusId) {
        issues.push(
          backfillSafetyIssue(
            'missing-stimulus-anchor',
            `Stimulus ${stimulus.stimulusId} references anchor ${anchorId} owned by ${anchor.stimulusId}.`,
            { stimulusId: stimulus.stimulusId, anchorId, objectId: stimulus.stimulusId },
          ),
        );
      }
    });

    stimulusContentAnchorIds(stimulus.content).forEach((anchorId) => {
      if (!document.anchors[anchorId] || !seen.has(anchorId)) {
        issues.push(
          backfillSafetyIssue(
            'missing-stimulus-anchor',
            `Stimulus ${stimulus.stimulusId} content references anchor ${anchorId} outside the canonical registry.`,
            { stimulusId: stimulus.stimulusId, anchorId, objectId: stimulus.stimulusId },
          ),
        );
      }
    });
  });

  Object.values(document.interactions).forEach((interaction) => {
    [
      ...(interaction.primaryAnchorId ? [interaction.primaryAnchorId] : []),
      ...(interaction.contextAnchorIds ?? []),
    ].forEach((anchorId) => {
      if (!document.anchors[anchorId]) {
        issues.push(
          backfillSafetyIssue(
            'missing-stimulus-anchor',
            `Interaction ${interaction.interactionId} references missing anchor ${anchorId}.`,
            { interactionId: interaction.interactionId, anchorId, objectId: interaction.interactionId },
          ),
        );
      }
    });
  });

  Object.values(document.taskGroups).forEach((taskGroup) => {
    taskGroup.stimulusRefs.forEach((stimulusRef) => {
      const stimulus = document.stimuli[stimulusRef.stimulusId];
      const stimulusAnchorIds = new Set(stimulus?.anchorIds ?? []);

      (stimulusRef.anchorIds ?? []).forEach((anchorId) => {
        if (!stimulus || !document.anchors[anchorId] || !stimulusAnchorIds.has(anchorId)) {
          issues.push(
            backfillSafetyIssue(
              'missing-stimulus-anchor',
              `Task group ${taskGroup.taskGroupId} references anchor ${anchorId} outside stimulus ${stimulusRef.stimulusId}.`,
              {
                stimulusId: stimulusRef.stimulusId,
                anchorId,
                objectId: taskGroup.taskGroupId,
              },
            ),
          );
        }
      });
    });
  });

  return issues;
};

const scanDuplicateVisibleNumbers = (
  document: ReadingV2Document,
): ReadingV2CanonicalBackfillSafetyIssue[] => {
  const seen = new Map<number, string>();
  const duplicates = new Map<number, string[]>();

  Object.values(document.interactions).forEach((interaction) => {
    const displayNumber = interaction.reviewLabel.displayNumber;
    if (typeof displayNumber !== 'number' || !Number.isFinite(displayNumber)) {
      return;
    }

    const firstInteractionId = seen.get(displayNumber);
    if (!firstInteractionId) {
      seen.set(displayNumber, interaction.interactionId);
      return;
    }

    duplicates.set(displayNumber, [
      ...(duplicates.get(displayNumber) ?? [firstInteractionId]),
      interaction.interactionId,
    ]);
  });

  return Array.from(duplicates.entries()).map(([questionNumber, interactionIds]) =>
    backfillSafetyIssue(
      'duplicate-visible-number',
      `Visible Reading V2 question number ${questionNumber} appears in multiple interactions: ${interactionIds.join(', ')}.`,
      {
        questionNumber,
        interactionId: interactionIds[0],
        objectId: document.documentId,
      },
    ),
  );
};

const scanProjectionAnchorMismatch = (
  document: ReadingV2Document,
  projection: ReadingV2DerivedProjection | null | undefined,
): ReadingV2CanonicalBackfillSafetyIssue[] => {
  if (!projection) {
    return [];
  }

  const issues: ReadingV2CanonicalBackfillSafetyIssue[] = [];
  const projectionKind = projection.projectionKind;

  projection.content.anchors.forEach((anchor) => {
    if (!document.anchors[anchor.anchorId]) {
      issues.push(
        backfillSafetyIssue(
          'projection-anchor-mismatch',
          `${projectionKind} projection references anchor ${anchor.anchorId} absent from source canonical anchors.`,
          {
            anchorId: anchor.anchorId,
            stimulusId: anchor.stimulusId,
            projectionKind,
            objectId: projection.projectionId,
          },
        ),
      );
    }
  });

  projection.content.stimuli.forEach((projectedStimulus) => {
    const sourceStimulus = document.stimuli[projectedStimulus.stimulusId];
    const sourceAnchorIds = new Set<string>(sourceStimulus?.anchorIds ?? []);
    const projectedAnchorIds = new Set(projectedStimulus.anchorIds);

    if (!sourceStimulus) {
      issues.push(
        backfillSafetyIssue(
          'projection-anchor-mismatch',
          `${projectionKind} projection references missing stimulus ${projectedStimulus.stimulusId}.`,
          {
            stimulusId: projectedStimulus.stimulusId,
            projectionKind,
            objectId: projection.projectionId,
          },
        ),
      );
      return;
    }

    projectedStimulus.anchorIds.forEach((anchorId) => {
      if (!sourceAnchorIds.has(anchorId)) {
        issues.push(
          backfillSafetyIssue(
            'projection-anchor-mismatch',
            `${projectionKind} projection stimulus ${projectedStimulus.stimulusId} references anchor ${anchorId} outside source stimulus registry.`,
            {
              stimulusId: projectedStimulus.stimulusId,
              anchorId,
              projectionKind,
              objectId: projection.projectionId,
            },
          ),
        );
      }
    });

    sourceStimulus.anchorIds.forEach((anchorId) => {
      if (!projectedAnchorIds.has(anchorId)) {
        issues.push(
          backfillSafetyIssue(
            'projection-anchor-mismatch',
            `${projectionKind} projection stimulus ${projectedStimulus.stimulusId} omits source anchor ${anchorId}.`,
            {
              stimulusId: projectedStimulus.stimulusId,
              anchorId,
              projectionKind,
              objectId: projection.projectionId,
            },
          ),
        );
      }
    });
  });

  projection.content.taskGroups.forEach((taskGroup) => {
    taskGroup.stimulusRefs.forEach((stimulusRef) => {
      const stimulus = document.stimuli[stimulusRef.stimulusId];
      const sourceAnchorIds = new Set<string>(stimulus?.anchorIds ?? []);

      (stimulusRef.anchorIds ?? []).forEach((anchorId) => {
        if (!stimulus || !sourceAnchorIds.has(anchorId)) {
          issues.push(
            backfillSafetyIssue(
              'projection-anchor-mismatch',
              `${projectionKind} projection task group ${taskGroup.taskGroupId} references anchor ${anchorId} outside source stimulus ${stimulusRef.stimulusId}.`,
              {
                stimulusId: stimulusRef.stimulusId,
                anchorId,
                projectionKind,
                objectId: projection.projectionId,
              },
            ),
          );
        }
      });
    });
  });

  return issues;
};

const scanCanonicalValidationBlockers = (
  document: ReadingV2Document,
  existingIssues: readonly ReadingV2CanonicalBackfillSafetyIssue[],
): ReadingV2CanonicalBackfillSafetyIssue[] =>
  validateReadingV2Draft(document).blockingIssues.flatMap((blockingIssue) => {
    if (blockingIssue.code === 'duplicate-stimulus-anchor' || blockingIssue.code === 'duplicate-numbering') {
      return [];
    }

    if (
      blockingIssue.code === 'invalid-packaged-material-assembly' &&
      blockingIssue.message.includes('references duplicate anchors') &&
      existingIssues.some((existingIssue) =>
        existingIssue.code === 'duplicate-stimulus-anchor-id' &&
        existingIssue.autoRepairable === true
      )
    ) {
      return [];
    }

    return [
      backfillSafetyIssue(
        'canonical-validation-blocked',
        `Canonical validation blocks backfill: ${blockingIssue.message}`,
        {
          objectId: blockingIssue.objectId,
        },
      ),
    ];
  });

const classifyCanonicalBackfillSafety = (
  issues: readonly ReadingV2CanonicalBackfillSafetyIssue[],
): ReadingV2CanonicalBackfillClassification => {
  if (issues.length === 0) {
    return 'valid';
  }

  if (issues.every((issue) => issue.code === 'duplicate-stimulus-anchor-id' && issue.autoRepairable === true)) {
    return 'auto-repairable';
  }

  if (issues.some((issue) =>
    issue.code === 'missing-stimulus-anchor' ||
    issue.code === 'projection-anchor-mismatch' ||
    issue.code === 'canonical-validation-blocked'
  )) {
    return 'unsafe-to-write';
  }

  return 'manual-review-required';
};

export const scanReadingV2CanonicalBackfillSafety = (input: {
  readonly document: ReadingV2Document;
  readonly studentSafeProjection?: ReadingV2DerivedProjection | null;
  readonly reviewProjection?: ReadingV2DerivedProjection | null;
}): ReadingV2CanonicalBackfillSafetyReport => {
  const scannedProjections = [
    ...(input.studentSafeProjection ? [input.studentSafeProjection.projectionKind] : []),
    ...(input.reviewProjection ? [input.reviewProjection.projectionKind] : []),
  ];
  const stimulusIssues = scanStimulusAnchorIntegrity(input.document);
  const issues = [
    ...stimulusIssues,
    ...scanDuplicateVisibleNumbers(input.document),
    ...scanProjectionAnchorMismatch(input.document, input.studentSafeProjection),
    ...scanProjectionAnchorMismatch(input.document, input.reviewProjection),
    ...scanCanonicalValidationBlockers(input.document, stimulusIssues),
  ];

  return {
    classification: classifyCanonicalBackfillSafety(issues),
    issues,
    scannedProjections,
  };
};

const repairAutoRepairableCanonicalBackfillDocument = (
  document: ReadingV2Document,
  safety: ReadingV2CanonicalBackfillSafetyReport,
): ReadingV2Document => {
  if (safety.classification !== 'auto-repairable') {
    return document;
  }

  return {
    ...cloneRecord(document),
    stimuli: Object.fromEntries(
      Object.entries(document.stimuli).map(([stimulusId, stimulus]) => [
        stimulusId,
        {
          ...cloneRecord(stimulus),
          anchorIds: unique(stimulus.anchorIds),
        },
      ]),
    ),
  };
};

const canonicalSafetyIssuesToExtractionIssues = (
  safety: ReadingV2CanonicalBackfillSafetyReport,
): readonly ReadingV2PassageExtractionIssue[] =>
  safety.issues.map((safetyIssue) => ({
    code: 'backfill-canonical-validation-blocked',
    severity: safetyIssue.severity === 'warning' ? 'warning' : 'error',
    message: safetyIssue.message,
    interactionId: safetyIssue.interactionId ?? safetyIssue.objectId,
  }));

const emitBackfillCanonicalValidationBlocked = (
  input: {
    readonly onDiagnosticEvent?: (event: string, payload: Record<string, unknown>) => void;
    readonly fullTest: ReadingV2FullTestPassageBackfillSource;
    readonly issues: readonly ReadingV2CanonicalBackfillSafetyIssue[];
  },
): void => {
  input.issues
    .filter((issue) => issue.severity === 'error')
    .forEach((issue) => {
      input.onDiagnosticEvent?.('backfill_canonical_validation_blocked', compactDiagnosticPayload({
        outcome: 'blocked',
        issueCode: issue.code,
        materialId: input.fullTest.materialId,
        sourceTitleSlug: sourceTitleSlugFor(input.fullTest.title),
        stimulusId: issue.stimulusId,
      }));
    });
};

const compactDiagnosticPayload = (payload: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );

export const planReadingV2FullTestPassageBackfill = (input: {
  readonly fullTests: readonly ReadingV2FullTestPassageBackfillSource[];
  readonly now?: string;
  readonly onDiagnosticEvent?: (event: string, payload: Record<string, unknown>) => void;
}): ReadingV2FullTestPassageBackfillReport => {
  const generatedAt = input.now ?? new Date().toISOString();
  const rows = input.fullTests.map((fullTest): ReadingV2FullTestPassageBackfillRow => {
    const idempotencyKey = sourceKey(fullTest.materialId, fullTest.sourceSnapshotVersionId);
    const canonicalSafety = scanReadingV2CanonicalBackfillSafety({
      document: fullTest.document,
      studentSafeProjection: fullTest.studentSafeProjection,
      reviewProjection: fullTest.reviewProjection,
    });

    if (fullTest.existingComposition?.passageRefs.length) {
      return {
        materialId: fullTest.materialId,
        sourceSnapshotVersionId: fullTest.sourceSnapshotVersionId,
        ownerId: fullTest.ownerId,
        title: fullTest.title,
        idempotencyKey,
        status: 'already-backfilled',
        passageCount: fullTest.existingComposition.passageRefs.length,
        issues: canonicalSafetyIssuesToExtractionIssues(canonicalSafety),
        canonicalSafety,
        visibilityDowngradedToPrivate: false,
      };
    }

    if (
      canonicalSafety.classification === 'manual-review-required' ||
      canonicalSafety.classification === 'unsafe-to-write'
    ) {
      emitBackfillCanonicalValidationBlocked({
        onDiagnosticEvent: input.onDiagnosticEvent,
        fullTest,
        issues: canonicalSafety.issues,
      });

      return {
        materialId: fullTest.materialId,
        sourceSnapshotVersionId: fullTest.sourceSnapshotVersionId,
        ownerId: fullTest.ownerId,
        title: fullTest.title,
        idempotencyKey,
        status: 'manual-review',
        passageCount: 0,
        issues: canonicalSafetyIssuesToExtractionIssues(canonicalSafety),
        canonicalSafety,
        visibilityDowngradedToPrivate: false,
      };
    }

    const requestedVisibility =
      fullTest.visibility === 'public' && fullTest.publicShareable === true ? 'public' : 'private';
    const visibilityDowngradedToPrivate =
      fullTest.visibility === 'public' && requestedVisibility === 'private';
    const extractionDocument = repairAutoRepairableCanonicalBackfillDocument(
      fullTest.document,
      canonicalSafety,
    );
    const extraction = extractReadingV2PassageMaterials({
      document: extractionDocument,
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
      issues: [...canonicalSafetyIssuesToExtractionIssues(canonicalSafety), ...extraction.validationIssues],
      canonicalSafety,
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
