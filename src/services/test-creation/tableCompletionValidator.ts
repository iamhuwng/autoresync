// @ts-nocheck
import type {
  TableCompletionDiagnostic,
  TableCompletionDiagnosticsField,
  TableCompletionFallbackKind,
  TableCompletionGroupV1,
  TableCompletionLossFlag,
  TableCompletionSourceKind,
  TableCompletionSourceOutcome,
  TableCompletionUnsupportedRepairState,
  TableCompletionValidationSeverity,
} from '../../types/tableCompletion';
import type {
  TableCompletionCanonicalizationMetadata,
  TableCompletionCanonicalizationResult,
} from './tableCompletionCanonicalizer';

export type TableCompletionIssueSeverity =
  | 'blocking'
  | 'acknowledgement-required'
  | 'informational';

export type TableCompletionIssueCode =
  | 'degraded-table-source'
  | 'missing-table-source'
  | 'blank-count-mismatch'
  | 'blank-anchor-loss'
  | 'blank-missing-anchor'
  | 'question-multi-anchor'
  | 'duplicate-or-missing-question-number'
  | 'blank-missing-cell'
  | 'invalid-overlap-span'
  | 'missing-structure'
  | 'unresolved-task-classification'
  | 'title-row-lost'
  | 'header-band-lost'
  | 'caption-lost'
  | 'span-flattening'
  | 'row-removal'
  | 'deterministic-source-ignored'
  | 'table-instruction-without-usable-table'
  | 'inferred-headers'
  | 'inferred-spans'
  | 'source-order-conflict'
  | 'possible-non-table-structure'
  | 'missing-header-lineage'
  | 'partial-structure-recovery'
  | 'inferred-caption'
  | 'normalized-note-rows'
  | 'cosmetic-format-recovery';

export interface TableCompletionIssue {
  code: TableCompletionIssueCode;
  severity: TableCompletionIssueSeverity;
  message: string;
  groupId: string;
  questionNumber?: number;
  blankId?: string;
  cellId?: string;
  details?: Record<string, unknown>;
}

const BLOCKING_CODES: TableCompletionIssueCode[] = [
  'degraded-table-source',
  'missing-table-source',
  'blank-count-mismatch',
  'blank-anchor-loss',
  'blank-missing-anchor',
  'question-multi-anchor',
  'duplicate-or-missing-question-number',
  'blank-missing-cell',
  'invalid-overlap-span',
  'missing-structure',
  'unresolved-task-classification',
  'title-row-lost',
  'header-band-lost',
  'caption-lost',
  'span-flattening',
  'row-removal',
  'deterministic-source-ignored',
  'table-instruction-without-usable-table',
];

const ACKNOWLEDGEMENT_REQUIRED_CODES: TableCompletionIssueCode[] = [
  'inferred-headers',
  'inferred-spans',
  'source-order-conflict',
  'possible-non-table-structure',
  'missing-header-lineage',
  'partial-structure-recovery',
];

const WARNING_FLAG_TO_CODE: Partial<
  Record<
    TableCompletionIssueCode,
    keyof Pick<
      TableCompletionCanonicalizationMetadata,
      | 'inferredHeaders'
      | 'inferredSpans'
      | 'partialStructureRecovery'
      | 'normalizedNoteRows'
      | 'cosmeticFormatRecovery'
      | 'inferredCaption'
    >
  >
> = {
  'inferred-headers': 'inferredHeaders',
  'inferred-spans': 'inferredSpans',
  'partial-structure-recovery': 'partialStructureRecovery',
  'normalized-note-rows': 'normalizedNoteRows',
  'cosmetic-format-recovery': 'cosmeticFormatRecovery',
  'inferred-caption': 'inferredCaption',
};

const INFORMATIONAL_CODES: TableCompletionIssueCode[] = [
  'inferred-caption',
  'normalized-note-rows',
  'cosmetic-format-recovery',
];

const getIssueSeverity = (
  code: TableCompletionIssueCode,
): TableCompletionIssueSeverity => {
  if (BLOCKING_CODES.includes(code)) {
    return 'blocking';
  }

  if (ACKNOWLEDGEMENT_REQUIRED_CODES.includes(code)) {
    return 'acknowledgement-required';
  }

  if (INFORMATIONAL_CODES.includes(code)) {
    return 'informational';
  }

  return 'blocking';
};

const ISSUE_SEVERITY_RANK: Record<TableCompletionIssueSeverity, number> = {
  informational: 1,
  'acknowledgement-required': 2,
  blocking: 3,
};

const getHighestValidationSeverity = (
  issues: TableCompletionIssue[],
): TableCompletionValidationSeverity => {
  if (issues.length === 0) {
    return 'none';
  }

  return issues.reduce<TableCompletionValidationSeverity>((highest, issue) => {
    if (highest === 'none') {
      return issue.severity;
    }

    const highestRank =
      highest === 'none' ? 0 : ISSUE_SEVERITY_RANK[highest];
    return ISSUE_SEVERITY_RANK[issue.severity] > highestRank ? issue.severity : highest;
  }, 'none');
};

const getUnsupportedRepairState = (
  severity: TableCompletionValidationSeverity,
): TableCompletionUnsupportedRepairState => {
  if (severity === 'blocking') {
    return 're-run-or-reclassify-required';
  }

  if (severity === 'acknowledgement-required') {
    return 'acknowledgement-required';
  }

  return 'none';
};

const createIssue = (
  groupId: string,
  code: TableCompletionIssueCode,
  message: string,
  details?: Record<string, unknown>,
  extras?: Partial<Pick<TableCompletionIssue, 'questionNumber' | 'blankId' | 'cellId'>>,
): TableCompletionIssue => ({
  code,
  severity: getIssueSeverity(code),
  message,
  groupId,
  ...(extras?.questionNumber !== undefined ? { questionNumber: extras.questionNumber } : {}),
  ...(extras?.blankId ? { blankId: extras.blankId } : {}),
  ...(extras?.cellId ? { cellId: extras.cellId } : {}),
  ...(details ? { details } : {}),
});

const LOSS_FLAG_MESSAGES: Record<TableCompletionLossFlag, string> = {
  'title-row-lost': 'Source title row was not preserved in the canonical table.',
  'header-band-lost': 'Source header band was not preserved in the canonical table.',
  'caption-lost': 'Source caption text was not preserved in the canonical table.',
  'span-flattening': 'Source row or column spans were flattened during canonicalization.',
  'row-removal': 'One or more source rows were dropped during canonicalization.',
  'blank-anchor-loss': 'Source blank anchors could not be preserved cleanly.',
  'deterministic-source-ignored':
    'A deterministic table source existed, but the canonicalizer had to fall back to a weaker source.',
  'table-instruction-without-usable-table':
    'The source instructed the system to complete a table, but no usable table survived canonicalization.',
};

const getDefaultSourceKind = (
  metadata: Pick<TableCompletionCanonicalizationMetadata, 'sourceShape'>,
): TableCompletionSourceKind => {
  if (metadata.sourceShape === 'legacy-table-headers-transport') {
    return 'legacy-section-headers';
  }

  return metadata.sourceShape;
};

const getDefaultFallbackKind = (
  sourceKind: TableCompletionSourceKind,
  sourceOutcome: TableCompletionSourceOutcome,
): TableCompletionFallbackKind => {
  if (sourceOutcome === 'deterministic-table') {
    return 'none';
  }

  if (
    sourceKind === 'ai-structured'
    || sourceKind === 'legacy-section-headers'
    || sourceKind === 'legacy-options-headers'
  ) {
    return sourceKind;
  }

  return 'none';
};

const detectSpanOverlap = (group: TableCompletionGroupV1): TableCompletionIssue[] => {
  const issues: TableCompletionIssue[] = [];
  const occupied = new Set<string>();
  const rowOrder = new Map(group.rows.map((row) => [row.rowId, row.order]));
  const columnOrder = new Map(group.columns.map((column) => [column.columnId, column.order]));

  for (const cell of group.cells) {
    if (cell.rowSpan < 1 || cell.colSpan < 1) {
      issues.push(
        createIssue(
          group.groupId,
          'invalid-overlap-span',
          `Cell ${cell.cellId} has invalid span values.`,
          { rowSpan: cell.rowSpan, colSpan: cell.colSpan },
          { cellId: cell.cellId },
        ),
      );
      continue;
    }

    const rowIndex = rowOrder.get(cell.rowId);
    const columnIndex = columnOrder.get(cell.columnId);
    if (rowIndex === undefined || columnIndex === undefined) {
      continue;
    }

    for (let rowOffset = 0; rowOffset < cell.rowSpan; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < cell.colSpan; columnOffset += 1) {
        const key = `${rowIndex + rowOffset}:${columnIndex + columnOffset}`;
        if (occupied.has(key)) {
          issues.push(
            createIssue(
              group.groupId,
              'invalid-overlap-span',
              `Cell ${cell.cellId} overlaps another spanning cell.`,
              { overlapKey: key },
              { cellId: cell.cellId },
            ),
          );
          return issues;
        }
        occupied.add(key);
      }
    }
  }

  return issues;
};

const validateMetadataFlags = (
  group: TableCompletionGroupV1,
  metadata: TableCompletionCanonicalizationMetadata,
): TableCompletionIssue[] => {
  const issues: TableCompletionIssue[] = [];

  if (metadata.sourceOutcome === 'degraded-table-source') {
    issues.push(
      createIssue(
        group.groupId,
        'degraded-table-source',
        'This table was recovered from a degraded source and must be repaired before publish.',
        {
          sourceKind: metadata.sourceKind,
          fallbackKind: metadata.fallbackKind,
          lossFlags: metadata.lossFlags,
        },
      ),
    );
  }

  if (metadata.inferredHeaders) {
    issues.push(
      createIssue(
        group.groupId,
        'inferred-headers',
        'Column headers were inferred because the source did not provide stable header text.',
      ),
    );
  }

  if (metadata.inferredSpans) {
    issues.push(
      createIssue(
        group.groupId,
        'inferred-spans',
        'Row or column spans were inferred from partial source evidence.',
      ),
    );
  }

  if (group.visualOrderConflict) {
    issues.push(
      createIssue(
        group.groupId,
        'source-order-conflict',
        'Canonical reading order differs from ascending visible question numbers.',
        { canonicalReadingOrder: group.canonicalReadingOrder },
      ),
    );
  }

  if (metadata.partialStructureRecovery) {
    issues.push(
      createIssue(
        group.groupId,
        'partial-structure-recovery',
        'The canonicalizer recovered only part of the source structure.',
      ),
    );
  }

  if (metadata.inferredCaption) {
    issues.push(
      createIssue(
        group.groupId,
        'inferred-caption',
        'Caption text was inferred rather than read directly from source structure.',
      ),
    );
  }

  if (metadata.normalizedNoteRows) {
    issues.push(
      createIssue(
        group.groupId,
        'normalized-note-rows',
        'Note rows were normalized during canonicalization.',
      ),
    );
  }

  if (metadata.cosmeticFormatRecovery) {
    issues.push(
      createIssue(
        group.groupId,
        'cosmetic-format-recovery',
        'Cosmetic source cleanup was applied while building the canonical table.',
      ),
    );
  }

  if (metadata.sourceShape === 'aligned-text' && group.columns.length < 2) {
    issues.push(
      createIssue(
        group.groupId,
        'possible-non-table-structure',
        'Aligned text source does not clearly prove a table structure.',
      ),
    );
  }

  metadata.lossFlags.forEach((lossFlag) => {
    issues.push(
      createIssue(group.groupId, lossFlag, LOSS_FLAG_MESSAGES[lossFlag], {
        sourceOutcome: metadata.sourceOutcome,
        sourceKind: metadata.sourceKind,
        fallbackKind: metadata.fallbackKind,
      }),
    );
  });

  return issues;
};

export const validateTableCompletionCanonicalization = (
  result: TableCompletionCanonicalizationResult,
): TableCompletionIssue[] => {
  const groupId = result.group?.groupId || result.groupId;

  if (!result.group) {
    return [
      createIssue(
        groupId,
        result.metadata.sourceOutcome === 'missing-table-source'
          ? 'missing-table-source'
          : 'unresolved-task-classification',
        result.metadata.sourceOutcome === 'missing-table-source'
          ? 'No usable deterministic table survived canonicalization.'
          : 'Canonical table structure could not be resolved from the provided source.',
        {
          parseMode: result.metadata.parseMode,
          sourceWorkflow: result.metadata.sourceWorkflow,
          sourceOutcome: result.metadata.sourceOutcome,
          sourceShape: result.metadata.sourceShape,
          sourceKind: result.metadata.sourceKind,
          fallbackKind: result.metadata.fallbackKind,
          lossFlags: result.metadata.lossFlags,
        },
      ),
    ];
  }

  const group = result.group;
  const issues: TableCompletionIssue[] = [];
  const expectedQuestionNumbers = result.expectedQuestionNumbers;
  const blankQuestionNumbers = group.blanks.map((blank) => blank.questionNumber);
  const blankIds = new Set(group.blanks.map((blank) => blank.blankId));
  const cellIds = new Set(group.cells.map((cell) => cell.cellId));
  const anchorIds = new Set(
    group.cells.flatMap((cell) =>
      cell.segments
        .filter((segment): segment is { kind: 'blank-anchor'; anchorId: string } =>
          segment.kind === 'blank-anchor',
        )
        .map((segment) => segment.anchorId),
    ),
  );

  if (group.columns.length === 0 || group.rows.length === 0 || group.cells.length === 0) {
    issues.push(
      createIssue(
        group.groupId,
        'missing-structure',
        'Canonical group is missing rows, columns, or cells.',
      ),
    );
  }

  if (group.blanks.length !== expectedQuestionNumbers.length) {
    issues.push(
      createIssue(
        group.groupId,
        'blank-count-mismatch',
        `Expected ${expectedQuestionNumbers.length} blanks but canonical group has ${group.blanks.length}.`,
        {
          expectedQuestionNumbers,
          actualQuestionNumbers: blankQuestionNumbers,
        },
      ),
    );
  }

  const duplicateQuestionNumbers = blankQuestionNumbers.filter(
    (questionNumber, index) => blankQuestionNumbers.indexOf(questionNumber) !== index,
  );
  const missingQuestionNumbers = expectedQuestionNumbers.filter(
    (questionNumber) => !blankQuestionNumbers.includes(questionNumber),
  );

  if (duplicateQuestionNumbers.length > 0 || missingQuestionNumbers.length > 0) {
    issues.push(
      createIssue(
        group.groupId,
        'duplicate-or-missing-question-number',
        'Canonical blank numbering does not match the expected question range.',
        {
          duplicateQuestionNumbers,
          missingQuestionNumbers,
        },
      ),
    );
  }

  group.blanks.forEach((blank) => {
    if (!blank.anchorId || !anchorIds.has(blank.anchorId)) {
      issues.push(
        createIssue(
          group.groupId,
          'blank-missing-anchor',
          `Blank ${blank.blankId} is missing a matching anchor segment.`,
          undefined,
          {
            questionNumber: blank.questionNumber,
            blankId: blank.blankId,
          },
        ),
      );
    }

    if (!blank.cellId || !cellIds.has(blank.cellId)) {
      issues.push(
        createIssue(
          group.groupId,
          'blank-missing-cell',
          `Blank ${blank.blankId} is missing its owning cell.`,
          undefined,
          {
            questionNumber: blank.questionNumber,
            blankId: blank.blankId,
            cellId: blank.cellId,
          },
        ),
      );
    }

    const anchorsForQuestion = group.blanks.filter(
      (candidate) => candidate.questionNumber === blank.questionNumber,
    );
    if (anchorsForQuestion.length > 1) {
      issues.push(
        createIssue(
          group.groupId,
          'question-multi-anchor',
          `Question ${blank.questionNumber} maps to more than one blank anchor.`,
          {
            blankIds: anchorsForQuestion.map((candidate) => candidate.blankId),
          },
          {
            questionNumber: blank.questionNumber,
            blankId: blank.blankId,
          },
        ),
      );
    }

    const breadcrumbMissing =
      blank.breadcrumb.rowHeaders.length === 0 || blank.breadcrumb.columnHeaders.length === 0;
    if (breadcrumbMissing) {
      issues.push(
        createIssue(
          group.groupId,
          'missing-header-lineage',
          `Blank ${blank.blankId} is missing row or column breadcrumb lineage.`,
          undefined,
          {
            questionNumber: blank.questionNumber,
            blankId: blank.blankId,
          },
        ),
      );
    }
  });

  issues.push(...detectSpanOverlap(group));
  issues.push(...validateMetadataFlags(group, result.metadata));

  return issues.filter(
    (issue, index, allIssues) =>
      allIssues.findIndex(
        (candidate) =>
          candidate.code === issue.code &&
          candidate.blankId === issue.blankId &&
          candidate.cellId === issue.cellId &&
          candidate.questionNumber === issue.questionNumber,
      ) === index,
  );
};

export const buildTableCompletionDiagnostic = (
  result: TableCompletionCanonicalizationResult,
  issues: TableCompletionIssue[],
): TableCompletionDiagnostic => {
  const questionRange = {
    start: result.expectedQuestionNumbers[0] ?? 0,
    end: result.expectedQuestionNumbers[result.expectedQuestionNumbers.length - 1] ?? 0,
  };
  const validationSeverity = getHighestValidationSeverity(issues);

  return {
    groupId: result.group?.groupId || result.groupId,
    questionRange,
    parseMode: result.metadata.parseMode,
    sourceWorkflow: result.metadata.sourceWorkflow,
    sourceOutcome: result.metadata.sourceOutcome,
    sourceShape: result.metadata.sourceShape,
    sourceKind: result.metadata.sourceKind,
    fallbackKind: result.metadata.fallbackKind,
    lossFlags: result.metadata.lossFlags,
    validationSeverity,
    issueCodes: issues.map((issue) => issue.code),
    issues: issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
      ...(issue.questionNumber !== undefined ? { questionNumber: issue.questionNumber } : {}),
      ...(issue.blankId ? { blankId: issue.blankId } : {}),
      ...(issue.cellId ? { cellId: issue.cellId } : {}),
    })),
    unsupportedRepairState: getUnsupportedRepairState(validationSeverity),
    missingSemanticBreadcrumbs: issues.some((issue) => issue.code === 'missing-header-lineage'),
    canonicalRevisionHash: result.group?.provenance.canonicalRevisionHash,
    hasCanonicalGroup: Boolean(result.group),
  };
};

const buildPersistedValidationMetadata = (
  group: TableCompletionGroupV1,
): TableCompletionCanonicalizationMetadata => {
  const warningCodes = new Set(group.provenance.warnings || []);
  const sourceOutcome: TableCompletionSourceOutcome =
    group.provenance.sourceOutcome
    || (group.provenance.sourceShape === 'ai-structured'
      || group.provenance.sourceShape === 'legacy-table-headers-transport'
        ? 'degraded-table-source'
        : 'deterministic-table');
  const sourceKind =
    group.provenance.sourceKind || getDefaultSourceKind({ sourceShape: group.provenance.sourceShape });
  const metadata: TableCompletionCanonicalizationMetadata = {
    parseMode: group.provenance.sourceShape === 'ai-structured' ? 'ai-assisted' : 'deterministic',
    sourceWorkflow: group.provenance.sourceWorkflow,
    sourceOutcome,
    sourceShape: group.provenance.sourceShape,
    sourceKind,
    fallbackKind:
      group.provenance.fallbackKind || getDefaultFallbackKind(sourceKind, sourceOutcome),
    lossFlags: group.provenance.lossFlags || [],
    inferredHeaders: false,
    inferredSpans: false,
    partialStructureRecovery: false,
    normalizedNoteRows: false,
    cosmeticFormatRecovery: false,
    inferredCaption: false,
    usedLegacySectionHeaders: group.provenance.sourceShape === 'legacy-table-headers-transport',
    usedLegacyOptionsHeaders: false,
  };

  Object.entries(WARNING_FLAG_TO_CODE).forEach(([issueCode, metadataKey]) => {
    if (metadataKey && warningCodes.has(issueCode)) {
      metadata[metadataKey] = true;
    }
  });

  return metadata;
};

export const validatePersistedTableCompletionGroup = (
  group: TableCompletionGroupV1,
): TableCompletionIssue[] =>
  validateTableCompletionCanonicalization({
    group,
    expectedQuestionNumbers: Array.from(
      { length: Math.max(group.questionRange.end - group.questionRange.start + 1, 0) },
      (_, index) => group.questionRange.start + index,
    ),
    rawExcerpt: group.provenance.rawExcerpt,
    metadata: buildPersistedValidationMetadata(group),
  });

export const buildPersistedTableCompletionDiagnostic = (
  group: TableCompletionGroupV1,
): TableCompletionDiagnostic => {
  const issues = validatePersistedTableCompletionGroup(group);
  return buildTableCompletionDiagnostic(
    {
      groupId: group.groupId,
      group,
      expectedQuestionNumbers: Array.from(
        { length: Math.max(group.questionRange.end - group.questionRange.start + 1, 0) },
        (_, index) => group.questionRange.start + index,
      ),
      rawExcerpt: group.provenance.rawExcerpt,
      metadata: buildPersistedValidationMetadata(group),
    },
    issues,
  );
};

export const buildPersistedTableCompletionDiagnostics = (
  groups: TableCompletionGroupV1[],
): TableCompletionDiagnosticsField => groups.map(buildPersistedTableCompletionDiagnostic);

export const getAcknowledgementRequiredIssueCodes = (
  issues: TableCompletionIssue[],
): TableCompletionIssueCode[] =>
  issues
    .filter((issue) => issue.severity === 'acknowledgement-required')
    .map((issue) => issue.code)
    .filter((issueCode, index, allCodes) => allCodes.indexOf(issueCode) === index);
