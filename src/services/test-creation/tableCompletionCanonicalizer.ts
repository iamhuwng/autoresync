import type { ReadingLabeledOption } from '../../types/document.types';
import {
  TABLE_COMPLETION_SCHEMA_VERSION,
  assertSupportedTableCompletionGroupSchema,
  type TableBlankBreadcrumb,
  type TableBlankConstraints,
  type TableBlankDef,
  type TableCellDef,
  type TableCellRole,
  type TableColumnDef,
  type TableCompletionFallbackKind,
  type TableCompletionGroupV1,
  type TableCompletionLossFlag,
  type TableCompletionParseMode,
  type TableCompletionSourceKind,
  type TableCompletionSourceOutcome,
  type TableCompletionSourceShape,
  type TableCompletionSourceWorkflow,
  type TableContentSegment,
  type TableRowDef,
} from '../../types/tableCompletion';

export interface TableCompletionSourceQuestion {
  questionNumber: number;
  questionText: string;
  answer?: string | string[];
  acceptableAnswers?: string[];
  sectionInstruction?: string | null;
  options?: Array<string | ReadingLabeledOption> | null;
}

export interface StructuredTableCompletionCandidate {
  columns?: string[];
  rows?: string[][];
  caption?: string;
  instructionText?: string;
  answerRuleText?: string;
  rawExcerpt?: string;
}

export interface TableCompletionCanonicalizationInput {
  groupId: string;
  passageId: string;
  questions: TableCompletionSourceQuestion[];
  rawExcerpt?: string;
  sourceWorkflow: TableCompletionSourceWorkflow;
  structuredCandidate?: StructuredTableCompletionCandidate | null;
}

export interface TableCompletionCanonicalizationMetadata {
  parseMode: TableCompletionParseMode;
  sourceWorkflow: TableCompletionSourceWorkflow;
  sourceOutcome: TableCompletionSourceOutcome;
  sourceShape: TableCompletionSourceShape;
  sourceKind: TableCompletionSourceKind;
  fallbackKind: TableCompletionFallbackKind;
  lossFlags: TableCompletionLossFlag[];
  inferredHeaders: boolean;
  inferredSpans: boolean;
  partialStructureRecovery: boolean;
  normalizedNoteRows: boolean;
  cosmeticFormatRecovery: boolean;
  inferredCaption: boolean;
  usedLegacySectionHeaders: boolean;
  usedLegacyOptionsHeaders: boolean;
}

export interface TableCompletionCanonicalizationResult {
  groupId: string;
  group: TableCompletionGroupV1 | null;
  expectedQuestionNumbers: number[];
  rawExcerpt: string;
  metadata: TableCompletionCanonicalizationMetadata;
}

interface ParsedInstructionParts {
  instructionText: string;
  answerRuleText: string;
  headers: string[];
}

interface ParsedCellInput {
  text: string;
  colSpan?: number;
  rowSpan?: number;
}

interface ParsedMatrix {
  sourceShape: TableCompletionSourceShape;
  headerRows: ParsedCellInput[][];
  bodyRows: ParsedCellInput[][];
  caption?: string;
  titleRowCount: number;
  inferredHeaders: boolean;
  inferredSpans: boolean;
  normalizedNoteRows: boolean;
  cosmeticFormatRecovery: boolean;
  partialStructureRecovery: boolean;
}

interface DirectRawSurface {
  rawExcerpt: string;
  label: 'explicit-raw' | 'structured-raw';
}

interface DeterministicCandidate {
  rawExcerpt: string;
  matrix: ParsedMatrix;
  group: TableCompletionGroupV1 | null;
  score: number;
}

interface ParsedCellPlacement {
  cell: ParsedCellInput;
  startColumnIndex: number;
}

interface PositionedParsedRow {
  rowIndex: number;
  cells: ParsedCellPlacement[];
}

interface PositionedGroupCell {
  cell: TableCellDef;
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
}

type TableCompletionOrderSource = 'canonical-order' | 'canonical-reading-order';

const ANSWER_RULE_PATTERN =
  /\b(?:choose|write|use|no more than|one word|two words|three words|and\/or a number)\b/i;
const EXPLICIT_BLANK_PATTERN = /\[\[(\d+)\]\]|\[(\d+)\]|\{(\d+)\}|<blank:(\d+)>/g;
const DOT_LEADER_PATTERN = /(?:\.{3,}|…{2,}|[.…]{3,})/;
const BLANK_PLACEHOLDER_PATTERN = new RegExp(`(?:_{3,}|${DOT_LEADER_PATTERN.source})`, 'g');
const NUMBERED_BLANK_PATTERN = new RegExp(
  `(^|[^\\d])(\\d{1,3})\\s*(${BLANK_PLACEHOLDER_PATTERN.source})`,
  'g',
);
const TABLE_INSTRUCTION_PATTERN = /\bcomplete the table below\b/i;
const HTML_ROW_PATTERN = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const HTML_CELL_PATTERN = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const HTML_TABLE_PATTERN = /<table\b[\s\S]*?<\/table>/i;
const HTML_CAPTION_PATTERN = /<caption\b[^>]*>([\s\S]*?)<\/caption>/i;

const normalizeWhitespace = (value: string): string =>
  value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';

const sortNumbersAscending = (values: number[]): number[] => [...values].sort((left, right) => left - right);

const splitAnswerVariants = (answer?: string | string[]): string[] => {
  if (!answer) {
    return [];
  }

  const values = Array.isArray(answer) ? answer : [answer];
  return Array.from(
    new Set(
      values
        .flatMap((value) => value.split(/[/|]/))
        .map((value) => normalizeWhitespace(value))
        .filter(Boolean),
    ),
  );
};

const parseConstraintLimit = (answerRuleText: string): TableBlankConstraints => {
  const normalized = answerRuleText.toLowerCase();
  const numberMatch = normalized.match(
    /(?:no more than|up to)?\s*(\d+|one|two|three|four|five|six)\s+words?/,
  );

  const numberMap: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
  };

  return {
    ...(numberMatch
      ? {
          maxWords:
            numberMap[numberMatch[1]!.toLowerCase()] ?? Number.parseInt(numberMatch[1]!, 10),
        }
      : {}),
    ...(normalized.includes('number') ? { includesNumber: true } : {}),
  };
};

const stripHtml = (value: string): string =>
  normalizeWhitespace(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(?:strong|em|span)>/gi, '')
      .replace(/<\/?(?:p|div|li|ul|ol|tbody|thead|table|caption)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&'),
  );

const stripMarkdownDecoration = (value: string): string =>
  normalizeWhitespace(
    value
      .replace(/^#+\s*/, '')
      .replace(/[*_`]/g, '')
      .replace(/^[-*+]\s*/, ''),
  );

const isInstructionLikeLine = (value: string): boolean => {
  const normalized = stripMarkdownDecoration(value).toLowerCase();
  return (
    normalized.length === 0
    || TABLE_INSTRUCTION_PATTERN.test(normalized)
    || ANSWER_RULE_PATTERN.test(normalized)
    || normalized.startsWith('write your answers')
    || normalized.startsWith('questions ')
    || normalized.startsWith('question ')
  );
};

const dedupeRawSurfaces = (surfaces: DirectRawSurface[]): DirectRawSurface[] => {
  const seen = new Set<string>();

  return surfaces.filter((surface) => {
    const normalized = surface.rawExcerpt.trim();
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
};

const buildDirectRawSurfaces = (
  explicitRawExcerpt?: string,
  structuredCandidate?: StructuredTableCompletionCandidate | null,
): DirectRawSurface[] =>
  dedupeRawSurfaces(
    [
      explicitRawExcerpt?.trim()
        ? {
            rawExcerpt: explicitRawExcerpt.trim(),
            label: 'explicit-raw' as const,
          }
        : null,
      structuredCandidate?.rawExcerpt?.trim()
        ? {
            rawExcerpt: structuredCandidate.rawExcerpt.trim(),
            label: 'structured-raw' as const,
          }
        : null,
    ].filter((surface): surface is DirectRawSurface => Boolean(surface)),
  );

interface BlankMatch {
  start: number;
  end: number;
  questionNumber?: number;
}

const rangesOverlap = (left: BlankMatch, right: BlankMatch): boolean =>
  left.start < right.end && right.start < left.end;

const collectBlankMatches = (cellText: string): BlankMatch[] => {
  const matches: BlankMatch[] = [];

  EXPLICIT_BLANK_PATTERN.lastIndex = 0;
  for (const match of cellText.matchAll(EXPLICIT_BLANK_PATTERN)) {
    const start = match.index ?? 0;
    matches.push({
      start,
      end: start + match[0].length,
      questionNumber: Number(match[1] || match[2] || match[3] || match[4]),
    });
  }

  NUMBERED_BLANK_PATTERN.lastIndex = 0;
  for (const match of cellText.matchAll(NUMBERED_BLANK_PATTERN)) {
    const prefix = match[1] || '';
    const questionNumber = Number(match[2]);
    const start = (match.index ?? 0) + prefix.length;
    const end = start + match[0].length - prefix.length;
    const nextMatch: BlankMatch = {
      start,
      end,
      questionNumber,
    };

    if (!matches.some((existing) => rangesOverlap(existing, nextMatch))) {
      matches.push(nextMatch);
    }
  }

  BLANK_PLACEHOLDER_PATTERN.lastIndex = 0;
  for (const match of cellText.matchAll(BLANK_PLACEHOLDER_PATTERN)) {
    const start = match.index ?? 0;
    const nextMatch: BlankMatch = {
      start,
      end: start + match[0].length,
    };

    if (!matches.some((existing) => rangesOverlap(existing, nextMatch))) {
      matches.push(nextMatch);
    }
  }

  return matches.sort((left, right) => left.start - right.start);
};

const expandAssignedQuestionNumbers = (
  blankMatches: BlankMatch[],
  assignedQuestionNumbers: number[],
): number[] => {
  if (blankMatches.length === 0 || assignedQuestionNumbers.length === 0) {
    return [];
  }

  if (blankMatches.length <= assignedQuestionNumbers.length) {
    return assignedQuestionNumbers.slice(0, blankMatches.length);
  }

  if (assignedQuestionNumbers.length === 1) {
    return Array.from({ length: blankMatches.length }, () => assignedQuestionNumbers[0]!);
  }

  return blankMatches.map((_, index) =>
    assignedQuestionNumbers[Math.min(index, assignedQuestionNumbers.length - 1)]!,
  );
};

const simpleHash = (value: string): string => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
};

const buildProvenanceWarnings = (
  metadata: Pick<
    ParsedMatrix,
    | 'inferredHeaders'
    | 'inferredSpans'
    | 'partialStructureRecovery'
    | 'normalizedNoteRows'
    | 'cosmeticFormatRecovery'
  >,
  visualOrderConflict: boolean,
  inferredCaption = false,
): string[] => {
  const warnings: string[] = [];

  if (metadata.inferredHeaders) {
    warnings.push('inferred-headers');
  }
  if (metadata.inferredSpans) {
    warnings.push('inferred-spans');
  }
  if (visualOrderConflict) {
    warnings.push('source-order-conflict');
  }
  if (metadata.partialStructureRecovery) {
    warnings.push('partial-structure-recovery');
  }
  if (inferredCaption) {
    warnings.push('inferred-caption');
  }
  if (metadata.normalizedNoteRows) {
    warnings.push('normalized-note-rows');
  }
  if (metadata.cosmeticFormatRecovery) {
    warnings.push('cosmetic-format-recovery');
  }

  return warnings;
};

const normalizeCellText = (
  segments: TableContentSegment[],
  targetAnchorId?: string,
): string =>
  normalizeWhitespace(
    segments
      .map((segment) => {
        if (segment.kind === 'text') {
          return segment.text;
        }

        return segment.anchorId === targetAnchorId ? '___' : '';
      })
      .join(''),
  );

const dedupeNonEmpty = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean)));

const CONNECTIVE_ONLY_TOKENS = new Set([
  '&',
  '/',
  '-',
  '–',
  '—',
  'and',
  'for',
  'of',
  'or',
  'plus',
  'to',
  'with',
  'without',
]);

const isInformativeBreadcrumbLabel = (value: string): boolean => {
  const normalized = normalizeWhitespace(value.replace(/_+/g, ' '));
  if (!normalized) {
    return false;
  }

  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z0-9&/+-]+|[^a-z0-9&/+-]+$/gi, '').toLowerCase())
    .filter(Boolean);

  return tokens.length > 0 && !tokens.every((token) => CONNECTIVE_ONLY_TOKENS.has(token));
};

const syncSourceOrderConflictWarning = (
  warnings: string[],
  visualOrderConflict: boolean,
): string[] => {
  const nextWarnings = warnings.filter((warning) => warning !== 'source-order-conflict');
  if (visualOrderConflict) {
    nextWarnings.push('source-order-conflict');
  }
  return nextWarnings;
};

const sortBlanksByCanonicalOrder = (blanks: TableBlankDef[]): TableBlankDef[] =>
  [...blanks].sort((left, right) => {
    if (left.canonicalOrder !== right.canonicalOrder) {
      return left.canonicalOrder - right.canonicalOrder;
    }
    if (left.questionNumber !== right.questionNumber) {
      return left.questionNumber - right.questionNumber;
    }
    return left.blankId.localeCompare(right.blankId);
  });

const buildNormalizedCanonicalReadingOrder = (
  group: TableCompletionGroupV1,
  orderSource: TableCompletionOrderSource,
): string[] => {
  const blanksByAnchorId = new Map(group.blanks.map((blank) => [blank.anchorId, blank.blankId]));
  const fallbackOrder = sortBlanksByCanonicalOrder(group.blanks).map((blank) => blank.blankId);

  if (orderSource === 'canonical-order') {
    return fallbackOrder;
  }

  const normalizedOrder = dedupeNonEmpty(
    group.canonicalReadingOrder.map((entry) => blanksByAnchorId.get(entry) || entry),
  ).filter((blankId) => group.blanks.some((blank) => blank.blankId === blankId));

  return dedupeNonEmpty([...normalizedOrder, ...fallbackOrder]);
};

const buildPositionedGroupCells = (group: TableCompletionGroupV1): PositionedGroupCell[] => {
  const rowOrderById = new Map(group.rows.map((row) => [row.rowId, row.order]));
  const columnOrderById = new Map(group.columns.map((column) => [column.columnId, column.order]));

  return group.cells
    .map((cell) => {
      const rowStart = rowOrderById.get(cell.rowId);
      const columnStart = columnOrderById.get(cell.columnId);
      if (rowStart === undefined || columnStart === undefined) {
        return null;
      }

      return {
        cell,
        rowStart,
        rowEnd: rowStart + cell.rowSpan - 1,
        columnStart,
        columnEnd: columnStart + cell.colSpan - 1,
      };
    })
    .filter((cell): cell is PositionedGroupCell => Boolean(cell));
};

const buildBlankBreadcrumbFromGroup = (
  group: TableCompletionGroupV1,
  blank: TableBlankDef,
): TableBlankBreadcrumb => {
  const positionedCells = buildPositionedGroupCells(group);
  const blankCell = positionedCells.find((candidate) => candidate.cell.cellId === blank.cellId);

  if (!blankCell) {
    return {
      rowHeaders: dedupeNonEmpty(blank.breadcrumb.rowHeaders),
      columnHeaders: dedupeNonEmpty(blank.breadcrumb.columnHeaders),
    };
  }

  const rowHeaders = positionedCells
    .filter(
      (candidate) =>
        candidate.cell.role === 'row-header' &&
        candidate.rowStart <= blankCell.rowEnd &&
        candidate.rowEnd >= blankCell.rowStart &&
        candidate.columnEnd < blankCell.columnStart,
    )
    .sort((left, right) => {
      if (left.columnStart !== right.columnStart) {
        return left.columnStart - right.columnStart;
      }
      return left.rowStart - right.rowStart;
    })
    .map((candidate) => normalizeCellText(candidate.cell.segments))
    .filter(Boolean);
  const rowPeerLabels = positionedCells
    .filter(
      (candidate) =>
        candidate.cell.cellId !== blankCell.cell.cellId &&
        candidate.rowStart <= blankCell.rowEnd &&
        candidate.rowEnd >= blankCell.rowStart &&
        candidate.cell.role !== 'column-header' &&
        candidate.cell.role !== 'title',
    )
    .sort((left, right) => {
      const leftDistance = Math.abs(left.columnStart - blankCell.columnStart);
      const rightDistance = Math.abs(right.columnStart - blankCell.columnStart);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }

      return left.columnStart - right.columnStart;
    })
    .map((candidate) => normalizeCellText(candidate.cell.segments))
    .filter(isInformativeBreadcrumbLabel);

  const columnHeaders = positionedCells
    .filter(
      (candidate) =>
        candidate.cell.role === 'column-header' &&
        candidate.columnStart <= blankCell.columnEnd &&
        candidate.columnEnd >= blankCell.columnStart &&
        candidate.rowEnd < blankCell.rowStart,
    )
    .sort((left, right) => {
      if (left.rowStart !== right.rowStart) {
        return left.rowStart - right.rowStart;
      }
      return left.columnStart - right.columnStart;
    })
    .map((candidate) => normalizeCellText(candidate.cell.segments))
    .filter(Boolean);

  return {
    rowHeaders: dedupeNonEmpty(
      rowHeaders.length > 0
        ? rowHeaders
        : rowPeerLabels.length > 0
          ? rowPeerLabels
          : blank.breadcrumb.rowHeaders,
    ),
    columnHeaders: dedupeNonEmpty(
      columnHeaders.length > 0 ? columnHeaders : blank.breadcrumb.columnHeaders,
    ),
  };
};

export const calculateTableCompletionCanonicalRevisionHash = (
  group: TableCompletionGroupV1,
): string =>
  simpleHash(
    JSON.stringify({
      ...group,
      provenance: {
        ...group.provenance,
        canonicalRevisionHash: undefined,
      },
    }),
  );

export const refreshTableCompletionCanonicalRevisionHash = (
  group: TableCompletionGroupV1,
): TableCompletionGroupV1 => ({
  ...group,
  provenance: {
    ...group.provenance,
    canonicalRevisionHash: calculateTableCompletionCanonicalRevisionHash(group),
  },
});

export const rebuildTableCompletionGroupDerivedState = (
  group: TableCompletionGroupV1,
  orderSource: TableCompletionOrderSource = 'canonical-reading-order',
): TableCompletionGroupV1 => {
  assertSupportedTableCompletionGroupSchema(group);

  const canonicalReadingOrder = buildNormalizedCanonicalReadingOrder(group, orderSource);
  const canonicalOrderByBlankId = new Map(
    canonicalReadingOrder.map((blankId, index) => [blankId, index]),
  );
  const blanks = group.blanks.map((blank) => ({
    ...blank,
    canonicalOrder: canonicalOrderByBlankId.get(blank.blankId) ?? blank.canonicalOrder,
  }));
  const groupWithCanonicalOrder = {
    ...group,
    blanks,
    canonicalReadingOrder,
  };
  const rebuiltBlanks = blanks.map((blank) => ({
    ...blank,
    breadcrumb: buildBlankBreadcrumbFromGroup(groupWithCanonicalOrder, blank),
  }));
  const blanksById = new Map(rebuiltBlanks.map((blank) => [blank.blankId, blank]));
  const orderedQuestionNumbers = canonicalReadingOrder
    .map((blankId) => blanksById.get(blankId)?.questionNumber)
    .filter((questionNumber): questionNumber is number => Number.isFinite(questionNumber));
  const ascendingQuestionNumbers = sortNumbersAscending(orderedQuestionNumbers);
  const visualOrderConflict = orderedQuestionNumbers.some(
    (questionNumber, index) => questionNumber !== ascendingQuestionNumbers[index],
  );
  const questionNumbers = rebuiltBlanks.map((blank) => blank.questionNumber);
  const questionRange =
    questionNumbers.length > 0
      ? {
          start: Math.min(...questionNumbers),
          end: Math.max(...questionNumbers),
        }
      : group.questionRange;

  const nextGroup: TableCompletionGroupV1 = {
    ...group,
    questionRange,
    blanks: rebuiltBlanks,
    canonicalReadingOrder,
    provenance: {
      ...group.provenance,
      warnings: syncSourceOrderConflictWarning(group.provenance.warnings || [], visualOrderConflict),
    },
    ...(visualOrderConflict ? { visualOrderConflict: true } : {}),
  };

  if (!visualOrderConflict) {
    delete nextGroup.visualOrderConflict;
  }

  return refreshTableCompletionCanonicalRevisionHash(nextGroup);
};

const parseSectionInstruction = (instruction?: string | null): ParsedInstructionParts => {
  const normalized = normalizeWhitespace(instruction || '');
  if (!normalized) {
    return {
      instructionText: '',
      answerRuleText: '',
      headers: [],
    };
  }

  let working = normalized;
  let headers: string[] = [];
  const headerMatch = working.match(/TABLE_HEADERS:\s*([^.]*)/i);
  if (headerMatch?.[1]) {
    headers = headerMatch[1]
      .split('|')
      .map((header) => normalizeWhitespace(header))
      .filter(Boolean);
    working = normalizeWhitespace(working.replace(headerMatch[0], ''));
  }

  const sentences = working
    .split(/(?<=[.!?])\s+/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  const answerRuleParts = sentences.filter((part) => ANSWER_RULE_PATTERN.test(part));
  const answerRuleText = answerRuleParts.join(' ').trim();
  const instructionText = sentences
    .filter((part) => !answerRuleParts.includes(part))
    .join(' ')
    .trim();

  return {
    instructionText,
    answerRuleText,
    headers,
  };
};

const extractHeadersFromOptions = (
  options?: Array<string | ReadingLabeledOption> | null,
): string[] =>
  (options || [])
    .map((option) => (typeof option === 'string' ? option : option.text || option.label || ''))
    .map((option) => normalizeWhitespace(option))
    .filter(Boolean);

const normalizeQuestionRowCells = (questionText: string): string[] => {
  const normalized = questionText.replace(/\r\n?/g, '\n').trim();
  if (normalized.includes('|')) {
    return normalized
      .split('|')
      .map((cell) => normalizeWhitespace(cell))
      .filter((cell, index, values) => cell || values.length === 1 || index > 0);
  }

  if (normalized.includes('\t')) {
    return normalized
      .split('\t')
      .map((cell) => normalizeWhitespace(cell))
      .filter(Boolean);
  }

  return [normalizeWhitespace(normalized)];
};

const extractClosestCaptionLine = (lines: string[], startIndex: number): string | undefined => {
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    const candidate = stripMarkdownDecoration(lines[index] || '');
    if (!candidate) {
      continue;
    }

    if (!isInstructionLikeLine(candidate)) {
      return candidate;
    }
  }

  return undefined;
};

const parseMarkdownTable = (rawExcerpt: string): ParsedMatrix | null => {
  const lines = rawExcerpt
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const separatorIndex = lines.findIndex((line) => {
    if (!line.includes('|')) {
      return false;
    }

    const cells = line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => normalizeWhitespace(cell));

    return cells.length >= 2 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
  });

  if (separatorIndex <= 0 || !lines[separatorIndex - 1]?.includes('|')) {
    return null;
  }

  let blockStart = separatorIndex - 1;
  while (blockStart > 0 && lines[blockStart - 1]?.includes('|')) {
    blockStart -= 1;
  }

  let blockEnd = separatorIndex + 1;
  while (blockEnd < lines.length && lines[blockEnd]?.includes('|')) {
    blockEnd += 1;
  }

  const rows = lines.slice(blockStart, blockEnd).map((line) =>
    line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => normalizeWhitespace(cell)),
  );
  const localSeparatorIndex = rows.findIndex((row) =>
    row.every((cell) => /^:?-{2,}:?$/.test(cell)),
  );

  if (localSeparatorIndex <= 0) {
    return null;
  }

  const headers = rows[localSeparatorIndex - 1]!;

  return {
    sourceShape: 'markdown-table',
    headerRows: [headers.map((cell) => ({ text: cell }))],
    bodyRows: rows
      .slice(localSeparatorIndex + 1)
      .map((row) => row.map((cell) => ({ text: cell }))),
    caption: extractClosestCaptionLine(lines, blockStart),
    titleRowCount: 0,
    inferredHeaders: false,
    inferredSpans: false,
    normalizedNoteRows: false,
    cosmeticFormatRecovery: false,
    partialStructureRecovery: false,
  };
};

const parseDelimitedTable = (
  rawExcerpt: string,
  delimiter: '\t' | RegExp,
  sourceShape: TableCompletionSourceShape,
): ParsedMatrix | null => {
  const lines = rawExcerpt
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return null;
  }

  const split = (line: string): string[] =>
    (delimiter instanceof RegExp ? line.split(delimiter) : line.split(delimiter))
      .map((cell) => normalizeWhitespace(cell))
      .filter(Boolean);

  const rows = lines.map(split);
  const columnCount = Math.max(...rows.map((row) => row.length));
  if (columnCount < 2 || rows.some((row) => row.length !== columnCount)) {
    return null;
  }

  return {
    sourceShape,
    headerRows: [rows[0]!.map((cell) => ({ text: cell }))],
    bodyRows: rows.slice(1).map((row) => row.map((cell) => ({ text: cell }))),
    titleRowCount: 0,
    inferredHeaders: false,
    inferredSpans: false,
    normalizedNoteRows: false,
    cosmeticFormatRecovery: false,
    partialStructureRecovery: false,
  };
};

const isLikelyHtmlHeaderRow = (
  row: Array<ParsedCellInput & { isHeader: boolean }>,
): boolean => {
  if (row.length === 0) {
    return false;
  }

  if (row.every((cell) => cell.isHeader)) {
    return true;
  }

  const nonEmptyCells = row.filter((cell) => normalizeWhitespace(cell.text).length > 0);
  const blankCount = row.reduce(
    (total, cell) => total + collectBlankMatches(cell.text).length,
    0,
  );
  const shortLabelCells = nonEmptyCells.filter((cell) => normalizeWhitespace(cell.text).length <= 28);
  const hasLongNarrativeCell = row.some(
    (cell) => normalizeWhitespace(cell.text).length > 60 || /[.;:]/.test(cell.text),
  );

  return (
    blankCount === 0
    && nonEmptyCells.length >= 2
    && shortLabelCells.length === nonEmptyCells.length
    && !hasLongNarrativeCell
  );
};

const parseHtmlTable = (rawExcerpt: string): ParsedMatrix | null => {
  if (!/<tr\b/i.test(rawExcerpt)) {
    return null;
  }

  const tableMarkup = rawExcerpt.match(HTML_TABLE_PATTERN)?.[0] || rawExcerpt;
  const htmlRows = Array.from(tableMarkup.matchAll(HTML_ROW_PATTERN));
  if (htmlRows.length < 2) {
    return null;
  }

  const parsedRows: Array<Array<ParsedCellInput & { isHeader: boolean }>> = [];
  for (const rowMatch of htmlRows) {
    const rowMarkup = rowMatch[1] || '';
    const cells = Array.from(rowMarkup.matchAll(HTML_CELL_PATTERN)).map((cellMatch) => {
      const tag = cellMatch[1]?.toLowerCase();
      const attrs = cellMatch[2] || '';
      const text = stripHtml(cellMatch[3] || '');
      const colSpan = Number.parseInt(attrs.match(/colspan=["']?(\d+)/i)?.[1] || '1', 10);
      const rowSpan = Number.parseInt(attrs.match(/rowspan=["']?(\d+)/i)?.[1] || '1', 10);

      return {
        text,
        colSpan: Number.isFinite(colSpan) && colSpan > 0 ? colSpan : 1,
        rowSpan: Number.isFinite(rowSpan) && rowSpan > 0 ? rowSpan : 1,
        isHeader: tag === 'th',
      };
    });

    if (cells.length > 0) {
      parsedRows.push(cells);
    }
  }

  if (parsedRows.length < 2) {
    return null;
  }

  const columnCount = Math.max(0, ...parsedRows.map(getParsedRowWidth));
  const headerRows: ParsedCellInput[][] = [];
  const bodyRows: ParsedCellInput[][] = [];
  let bodyStarted = false;
  let titleRowCount = 0;

  parsedRows.forEach((row) => {
    const normalizedRow = row.map(({ isHeader, ...cell }) => cell);
    const isTitleRow =
      !bodyStarted
      && row.length === 1
      && (row[0]?.colSpan || 1) >= columnCount
      && collectBlankMatches(row[0]?.text || '').length === 0;
    const isHeaderRow = !bodyStarted && !isTitleRow && isLikelyHtmlHeaderRow(row);

    if (isTitleRow) {
      titleRowCount += 1;
      headerRows.push(normalizedRow);
      return;
    }

    if (isHeaderRow) {
      headerRows.push(normalizedRow);
      return;
    }

    bodyStarted = true;
    bodyRows.push(normalizedRow);
  });

  if (bodyRows.length === 0) {
    return null;
  }

  return {
    sourceShape: 'html-table',
    headerRows,
    bodyRows,
    caption: stripHtml(tableMarkup.match(HTML_CAPTION_PATTERN)?.[1] || ''),
    titleRowCount,
    inferredHeaders: false,
    inferredSpans: false,
    normalizedNoteRows: false,
    cosmeticFormatRecovery: false,
    partialStructureRecovery: false,
  };
};

const parseDeterministicMatrices = (rawExcerpt: string): ParsedMatrix[] => {
  if (!rawExcerpt.trim()) {
    return [];
  }

  return [
    parseHtmlTable(rawExcerpt) ||
      null,
    parseMarkdownTable(rawExcerpt),
    parseDelimitedTable(rawExcerpt, '\t', 'tsv'),
    parseDelimitedTable(rawExcerpt, /\s{2,}/, 'aligned-text'),
  ].filter((candidate): candidate is ParsedMatrix => Boolean(candidate));
};

const parseLegacyQuestionMatrix = (
  questions: TableCompletionSourceQuestion[],
  headers: string[],
): ParsedMatrix | null => {
  if (questions.length === 0 || headers.length === 0) {
    return null;
  }

  const rowValues = questions.map((question) => normalizeQuestionRowCells(question.questionText));
  const columnCount = Math.max(...rowValues.map((row) => row.length));
  if (columnCount < 2) {
    return null;
  }

  return {
    sourceShape: 'legacy-table-headers-transport',
    headerRows: [headers.map((header) => ({ text: header }))],
    bodyRows: rowValues.map((row) =>
      Array.from({ length: columnCount }, (_, index) => ({
        text: row[index] || '',
      })),
    ),
    inferredHeaders: false,
    inferredSpans: false,
    normalizedNoteRows: false,
    cosmeticFormatRecovery: true,
    partialStructureRecovery: false,
    titleRowCount: 0,
  };
};

const buildSyntheticFallbackExcerpt = (
  questions: TableCompletionSourceQuestion[],
  parsedInstruction: ParsedInstructionParts,
): string => {
  const questionRows = questions
    .map((question) => normalizeQuestionRowCells(question.questionText).join(' | '))
    .filter(Boolean);
  const headerLine =
    parsedInstruction.headers.length > 0 ? parsedInstruction.headers.join(' | ') : '';

  return [parsedInstruction.instructionText, parsedInstruction.answerRuleText, headerLine, ...questionRows]
    .filter(Boolean)
    .join('\n');
};

const createSegmentsFromCellText = (
  cellText: string,
  blankAnchorIds: string[],
): TableContentSegment[] => {
  if (blankAnchorIds.length === 0) {
    return cellText ? [{ kind: 'text', text: cellText }] : [];
  }

  const blankMatches = collectBlankMatches(cellText);
  if (blankMatches.length === 0) {
    return cellText ? [{ kind: 'text', text: cellText }] : [];
  }

  const segments: TableContentSegment[] = [];
  let cursor = 0;

  blankMatches.forEach((match, blankIndex) => {
    const { start, end } = match;
    if (start > cursor) {
      segments.push({
        kind: 'text',
        text: cellText.slice(cursor, start),
      });
    }

    const anchorId = blankAnchorIds[blankIndex];
    if (anchorId) {
      segments.push({
        kind: 'blank-anchor',
        anchorId,
      });
    }

    cursor = end;
  });

  if (cursor < cellText.length) {
    segments.push({
      kind: 'text',
      text: cellText.slice(cursor),
    });
  }

  return segments.length > 0 ? segments : [{ kind: 'text', text: cellText }];
};

const detectQuestionNumbersInCell = (cellText: string): number[] => {
  const explicitMatches = collectBlankMatches(cellText)
    .map((match) => match.questionNumber)
    .filter((value) => Number.isFinite(value));

  if (explicitMatches.length > 0) {
    return dedupeNonEmpty(explicitMatches.map((value) => String(value))).map((value) =>
      Number(value),
    );
  }

  return [];
};

const pickQuestionNumbersForCell = (
  cellText: string,
  remainingQuestionNumbers: number[],
  preferredQuestionNumber?: number,
): number[] => {
  const explicitNumbers = detectQuestionNumbersInCell(cellText);
  if (explicitNumbers.length > 0) {
    return explicitNumbers;
  }

  const blankCount = collectBlankMatches(cellText).length;
  if (blankCount === 0) {
    return [];
  }

  if (preferredQuestionNumber !== undefined) {
    const preferredIndex = remainingQuestionNumbers.indexOf(preferredQuestionNumber);
    if (preferredIndex >= 0) {
      return remainingQuestionNumbers.slice(preferredIndex, preferredIndex + blankCount);
    }
  }

  return remainingQuestionNumbers.slice(0, blankCount);
};

const getParsedRowWidth = (row: ParsedCellInput[]): number =>
  row.reduce((total, cell) => total + (cell.colSpan || 1), 0);

const positionParsedRows = (
  rows: ParsedCellInput[][],
  startingRowIndex: number,
  columnCount: number,
  initialOccupiedUntil = new Map<number, number>(),
): { rows: PositionedParsedRow[]; occupiedUntil: Map<number, number> } => {
  const occupiedUntil = new Map(initialOccupiedUntil);
  const positionedRows: PositionedParsedRow[] = [];

  rows.forEach((row, rowOffset) => {
    const rowIndex = startingRowIndex + rowOffset;
    let columnCursor = 0;
    const positionedCells: ParsedCellPlacement[] = [];

    row.forEach((cell) => {
      let startColumnIndex = columnCursor;
      while ((occupiedUntil.get(startColumnIndex) || 0) > rowIndex) {
        startColumnIndex += 1;
      }

      const colSpan = cell.colSpan || 1;
      const skippedIntoOverflow =
        columnCount > 0
        && startColumnIndex + colSpan > columnCount
        && (occupiedUntil.get(columnCursor) || 0) > rowIndex;

      if (skippedIntoOverflow) {
        // Preserve impossible source overlap so downstream validation can block publish.
        startColumnIndex = columnCursor;
      }

      positionedCells.push({
        cell,
        startColumnIndex,
      });

      const rowSpan = cell.rowSpan || 1;
      for (let columnIndex = startColumnIndex; columnIndex < startColumnIndex + colSpan; columnIndex += 1) {
        occupiedUntil.set(columnIndex, rowIndex + rowSpan);
      }

      columnCursor = startColumnIndex + colSpan;
    });

    positionedRows.push({
      rowIndex,
      cells: positionedCells,
    });
  });

  return {
    rows: positionedRows,
    occupiedUntil,
  };
};

const deriveColumnLabels = (
  headerRows: PositionedParsedRow[],
  columnCount: number,
): string[] =>
  Array.from({ length: columnCount }, (_, columnIndex) => {
    const labels = headerRows
      .flatMap((row) =>
        row.cells
          .filter((placement) => {
            const columnStart = placement.startColumnIndex;
            const columnEnd = columnStart + (placement.cell.colSpan || 1) - 1;
            return columnStart <= columnIndex && columnEnd >= columnIndex;
          })
          .map((placement) => normalizeWhitespace(placement.cell.text)),
      )
      .filter(Boolean);

    return labels.at(-1) || `column-${columnIndex + 1}`;
  });

interface BuildGroupOptions {
  sourceOutcome: TableCompletionSourceOutcome;
  sourceKind: TableCompletionSourceKind;
  fallbackKind?: TableCompletionFallbackKind;
  lossFlags?: TableCompletionLossFlag[];
  confidence?: number;
}

const buildGroupFromMatrix = (
  input: TableCompletionCanonicalizationInput,
  matrix: ParsedMatrix,
  parsedInstruction: ParsedInstructionParts,
  rawExcerpt: string,
  options: BuildGroupOptions,
): TableCompletionGroupV1 | null => {
  const orderedQuestions = [...input.questions].sort(
    (left, right) => left.questionNumber - right.questionNumber,
  );
  const remainingQuestionNumbers = orderedQuestions.map((question) => question.questionNumber);
  const questionLookup = new Map(orderedQuestions.map((question) => [question.questionNumber, question]));
  const columnCount = Math.max(
    0,
    ...[...matrix.headerRows, ...matrix.bodyRows].map(getParsedRowWidth),
  );

  if (columnCount === 0) {
    return null;
  }

  const headerPlacement = positionParsedRows(matrix.headerRows, 0, columnCount);
  const bodyPlacement = positionParsedRows(
    matrix.bodyRows,
    matrix.headerRows.length,
    columnCount,
    headerPlacement.occupiedUntil,
  );
  const columnLabels = deriveColumnLabels(headerPlacement.rows, columnCount);
  const columns: TableColumnDef[] = columnLabels.map((label, index) => ({
    columnId: `${input.groupId}-column-${slugify(label)}-${index + 1}`,
    order: index,
  }));
  const rows: TableRowDef[] = [];
  const cells: TableCellDef[] = [];
  const blanks: TableBlankDef[] = [];

  headerPlacement.rows.forEach((positionedRow, headerRowIndex) => {
    const rowId = `${input.groupId}-row-header-${headerRowIndex + 1}`;
    const rowCellIds: string[] = [];
    const isTitleRow =
      headerPlacement.rows.length > 1 &&
      positionedRow.cells.length === 1 &&
      (positionedRow.cells[0]?.cell.colSpan || 1) >= columnCount;

    positionedRow.cells.forEach((placement, cellIndex) => {
      const column = columns[placement.startColumnIndex];
      if (!column) {
        return;
      }

      const cellId = `${input.groupId}-cell-header-${headerRowIndex + 1}-${cellIndex + 1}`;
      cells.push({
        cellId,
        rowId,
        columnId: column.columnId,
        rowSpan: placement.cell.rowSpan || 1,
        colSpan: placement.cell.colSpan || 1,
        role: isTitleRow ? 'title' : 'column-header',
        segments: placement.cell.text
          ? [{ kind: 'text', text: normalizeWhitespace(placement.cell.text) }]
          : [],
      });
      rowCellIds.push(cellId);
    });

    rows.push({
      rowId,
      order: positionedRow.rowIndex,
      cellIds: rowCellIds,
    });
  });

  bodyPlacement.rows.forEach((positionedRow, bodyRowIndex) => {
    const rowId = `${input.groupId}-row-${bodyRowIndex + 1}`;
    const rowCellIds: string[] = [];

    positionedRow.cells.forEach((placement, cellIndex) => {
      const column = columns[placement.startColumnIndex];
      if (!column) {
        return;
      }

      const questionNumberFromRow =
        bodyRowIndex < orderedQuestions.length ? orderedQuestions[bodyRowIndex]!.questionNumber : undefined;
      const questionNumbers = pickQuestionNumbersForCell(
        placement.cell.text,
        remainingQuestionNumbers,
        questionNumberFromRow,
      );
      const blankMatches = collectBlankMatches(placement.cell.text);
      const anchorQuestionNumbers = expandAssignedQuestionNumbers(blankMatches, questionNumbers);
      const anchorIdByQuestionNumber = new Map(
        questionNumbers.map((questionNumber) => [
          questionNumber,
          `${input.groupId}-anchor-${questionNumber}-1`,
        ]),
      );
      const anchorIds = anchorQuestionNumbers.map(
        (questionNumber) => anchorIdByQuestionNumber.get(questionNumber) || '',
      );
      const cellId = `${input.groupId}-cell-${bodyRowIndex + 1}-${cellIndex + 1}`;
      const normalizedCellText = normalizeWhitespace(placement.cell.text);
      const isNoteCell =
        questionNumbers.length === 0 &&
        (placement.cell.colSpan || 1) >= columnCount &&
        /^note\b[:\s-]/i.test(normalizedCellText);
      const role: TableCellRole = isNoteCell
        ? 'note'
        : placement.startColumnIndex === 0 &&
            columns.length > 1 &&
            questionNumbers.length === 0
          ? 'row-header'
          : 'body';

      cells.push({
        cellId,
        rowId,
        columnId: column.columnId,
        rowSpan: placement.cell.rowSpan || 1,
        colSpan: placement.cell.colSpan || 1,
        role,
        segments: createSegmentsFromCellText(placement.cell.text, anchorIds),
      });
      rowCellIds.push(cellId);

      questionNumbers.forEach((questionNumber, anchorIndex) => {
        const question = questionLookup.get(questionNumber);
        if (!question) {
          return;
        }

        const blankId = `${input.groupId}-blank-${questionNumber}`;
        blanks.push({
          blankId,
          questionNumber,
          anchorId: anchorIdByQuestionNumber.get(questionNumber)!,
          cellId,
          canonicalOrder: blanks.length,
          sourceQuestionText: question.questionText,
          acceptedAnswers:
            question.acceptableAnswers && question.acceptableAnswers.length > 0
              ? question.acceptableAnswers
              : splitAnswerVariants(question.answer),
          constraints: parseConstraintLimit(parsedInstruction.answerRuleText),
          breadcrumb: {
            rowHeaders: [],
            columnHeaders: [],
          },
        });

        const remainingIndex = remainingQuestionNumbers.indexOf(questionNumber);
        if (remainingIndex >= 0) {
          remainingQuestionNumbers.splice(remainingIndex, 1);
        }
      });
    });

    rows.push({
      rowId,
      order: positionedRow.rowIndex,
      cellIds: rowCellIds,
    });
  });

  if (blanks.length === 0) {
    return null;
  }

  const sharedConstraints = parseConstraintLimit(parsedInstruction.answerRuleText);
  const baseGroup: TableCompletionGroupV1 = {
    schemaVersion: TABLE_COMPLETION_SCHEMA_VERSION,
    groupId: input.groupId,
    taskType: 'table-completion',
    passageId: input.passageId,
    questionRange: {
      start: Math.min(...orderedQuestions.map((question) => question.questionNumber)),
      end: Math.max(...orderedQuestions.map((question) => question.questionNumber)),
    },
    sharedContent: {
      instructionText: parsedInstruction.instructionText,
      answerRuleText: parsedInstruction.answerRuleText,
      constraints: sharedConstraints,
      ...(matrix.caption ? { caption: matrix.caption } : {}),
    },
    columns,
    rows,
    cells,
    blanks,
    provenance: {
      sourceWorkflow: input.sourceWorkflow,
      sourceOutcome: options.sourceOutcome,
      sourceShape: matrix.sourceShape,
      sourceKind: options.sourceKind,
      fallbackKind: options.fallbackKind || 'none',
      lossFlags: options.lossFlags || [],
      rawExcerpt,
      normalizationVersion: 1,
      confidence:
        options.confidence
        ?? (matrix.sourceShape === 'legacy-table-headers-transport' ? 0.75 : 0.95),
      warnings: buildProvenanceWarnings(matrix, false),
      canonicalRevisionHash: '',
    },
    canonicalReadingOrder: [],
  };

  return rebuildTableCompletionGroupDerivedState(baseGroup, 'canonical-order');
};

const buildGroupFromStructuredCandidate = (
  input: TableCompletionCanonicalizationInput,
  structuredCandidate: StructuredTableCompletionCandidate,
  parsedInstruction: ParsedInstructionParts,
  rawExcerpt: string,
): TableCompletionGroupV1 | null => {
  const rows = structuredCandidate.rows || [];
  const columns = structuredCandidate.columns || [];
  if (rows.length === 0 || columns.length === 0) {
    return null;
  }

  return buildGroupFromMatrix(
    input,
    {
      sourceShape: 'ai-structured',
      headerRows: [columns.map((column) => ({ text: column }))],
      bodyRows: rows.map((row) => row.map((cell) => ({ text: cell }))),
      caption: structuredCandidate.caption,
      titleRowCount: 0,
      inferredHeaders: false,
      inferredSpans: false,
      normalizedNoteRows: false,
      cosmeticFormatRecovery: false,
      partialStructureRecovery: false,
    },
    {
      instructionText: structuredCandidate.instructionText || parsedInstruction.instructionText,
      answerRuleText: structuredCandidate.answerRuleText || parsedInstruction.answerRuleText,
      headers: parsedInstruction.headers,
    },
    rawExcerpt,
    {
      sourceOutcome: 'degraded-table-source',
      sourceKind: 'ai-structured',
      fallbackKind: 'ai-structured',
      confidence: 0.7,
    },
  );
};

const scoreDeterministicCandidate = (
  candidate: DeterministicCandidate,
  expectedQuestionNumbers: number[],
): number => {
  const { matrix, group } = candidate;
  const spanCount = group?.cells.filter((cell) => cell.rowSpan > 1 || cell.colSpan > 1).length ?? 0;
  const headerCellCount =
    group?.cells.filter((cell) => cell.role === 'column-header' || cell.role === 'title').length
    ?? 0;
  const emptyCellCount = group?.cells.filter((cell) => cell.segments.length === 0).length ?? 0;
  const baseShapeScore: Record<TableCompletionSourceShape, number> = {
    'html-table': 60,
    'markdown-table': 50,
    tsv: 32,
    'aligned-text': 18,
    'ai-structured': 0,
    'legacy-table-headers-transport': 0,
  };

  return (
    baseShapeScore[matrix.sourceShape]
    + (group?.blanks.length === expectedQuestionNumbers.length ? 120 : -40)
    + (group?.columns.length ?? 0) * 8
    + (group?.rows.length ?? 0) * 6
    + headerCellCount * 4
    + spanCount * 18
    + (matrix.titleRowCount > 0 ? 30 : 0)
    + (matrix.caption ? 18 : 0)
    + emptyCellCount * 2
  );
};

const buildDeterministicCandidates = (
  input: TableCompletionCanonicalizationInput,
  parsedInstruction: ParsedInstructionParts,
  expectedQuestionNumbers: number[],
  directRawSurfaces: DirectRawSurface[],
): DeterministicCandidate[] =>
  directRawSurfaces.flatMap((surface) =>
    parseDeterministicMatrices(surface.rawExcerpt).map((matrix) => {
      const group = buildGroupFromMatrix(
        input,
        matrix,
        parsedInstruction,
        surface.rawExcerpt,
        {
          sourceOutcome: 'deterministic-table',
          sourceKind: matrix.sourceShape,
          fallbackKind: 'none',
        },
      );

      const candidate: DeterministicCandidate = {
        rawExcerpt: surface.rawExcerpt,
        matrix,
        group,
        score: 0,
      };

      candidate.score = scoreDeterministicCandidate(candidate, expectedQuestionNumbers);
      return candidate;
    }),
  );

const buildLossFlags = (
  directCandidates: DeterministicCandidate[],
  chosenGroup: TableCompletionGroupV1 | null,
  sourceOutcome: TableCompletionSourceOutcome,
  expectedQuestionNumbers: number[],
  parsedInstruction: ParsedInstructionParts,
  rawExcerptForResult: string,
): TableCompletionLossFlag[] => {
  const flags: TableCompletionLossFlag[] = [];
  const richestDirectCandidate = [...directCandidates].sort((left, right) => right.score - left.score)[0];
  const chosenHasTitleRow = Boolean(chosenGroup?.cells.some((cell) => cell.role === 'title'));
  const chosenHasHeaderBand = Boolean(
    chosenGroup?.cells.some((cell) => cell.role === 'column-header'),
  );
  const chosenHasCaption = Boolean(chosenGroup?.sharedContent.caption?.trim());
  const chosenHasSpans = Boolean(
    chosenGroup?.cells.some((cell) => cell.rowSpan > 1 || cell.colSpan > 1),
  );

  if (richestDirectCandidate && sourceOutcome !== 'deterministic-table') {
    if (richestDirectCandidate.matrix.titleRowCount > 0 && !chosenHasTitleRow) {
      flags.push('title-row-lost');
    }
    if (richestDirectCandidate.matrix.headerRows.length > richestDirectCandidate.matrix.titleRowCount && !chosenHasHeaderBand) {
      flags.push('header-band-lost');
    }
    if (richestDirectCandidate.matrix.caption && !chosenHasCaption) {
      flags.push('caption-lost');
    }
    if (
      richestDirectCandidate.group?.cells.some((cell) => cell.rowSpan > 1 || cell.colSpan > 1)
      && !chosenHasSpans
    ) {
      flags.push('span-flattening');
    }
    if (chosenGroup && richestDirectCandidate.group && chosenGroup.rows.length < richestDirectCandidate.group.rows.length) {
      flags.push('row-removal');
    }
    flags.push('deterministic-source-ignored');
  }

  if (chosenGroup && chosenGroup.blanks.length !== expectedQuestionNumbers.length) {
    flags.push('blank-anchor-loss');
  }

  if (
    !chosenGroup
    && (TABLE_INSTRUCTION_PATTERN.test(parsedInstruction.instructionText) || TABLE_INSTRUCTION_PATTERN.test(rawExcerptForResult))
  ) {
    flags.push('table-instruction-without-usable-table');
  }

  return dedupeNonEmpty(flags).filter((flag): flag is TableCompletionLossFlag => Boolean(flag));
};

const buildCanonicalizationMetadata = (
  sourceWorkflow: TableCompletionSourceWorkflow,
  sourceOutcome: TableCompletionSourceOutcome,
  sourceShape: TableCompletionSourceShape,
  sourceKind: TableCompletionSourceKind,
  fallbackKind: TableCompletionFallbackKind,
  lossFlags: TableCompletionLossFlag[],
  matrix: Pick<
    ParsedMatrix,
    | 'inferredHeaders'
    | 'inferredSpans'
    | 'partialStructureRecovery'
    | 'normalizedNoteRows'
    | 'cosmeticFormatRecovery'
  >,
  extras: Pick<
    TableCompletionCanonicalizationMetadata,
    'parseMode' | 'inferredCaption' | 'usedLegacySectionHeaders' | 'usedLegacyOptionsHeaders'
  >,
): TableCompletionCanonicalizationMetadata => ({
  parseMode: extras.parseMode,
  sourceWorkflow,
  sourceOutcome,
  sourceShape,
  sourceKind,
  fallbackKind,
  lossFlags,
  inferredHeaders: matrix.inferredHeaders,
  inferredSpans: matrix.inferredSpans,
  partialStructureRecovery: matrix.partialStructureRecovery,
  normalizedNoteRows: matrix.normalizedNoteRows,
  cosmeticFormatRecovery: matrix.cosmeticFormatRecovery,
  inferredCaption: extras.inferredCaption,
  usedLegacySectionHeaders: extras.usedLegacySectionHeaders,
  usedLegacyOptionsHeaders: extras.usedLegacyOptionsHeaders,
});

export const canonicalizeTableCompletionGroup = (
  input: TableCompletionCanonicalizationInput,
): TableCompletionCanonicalizationResult => {
  const expectedQuestionNumbers = [...input.questions]
    .map((question) => question.questionNumber)
    .sort((left, right) => left - right);
  const parsedInstruction = parseSectionInstruction(input.questions[0]?.sectionInstruction);
  const directRawSurfaces = buildDirectRawSurfaces(input.rawExcerpt, input.structuredCandidate);
  const syntheticFallbackExcerpt = buildSyntheticFallbackExcerpt(input.questions, parsedInstruction);
  const rawExcerptForResult = directRawSurfaces[0]?.rawExcerpt || syntheticFallbackExcerpt;
  const deterministicCandidates = buildDeterministicCandidates(
    input,
    parsedInstruction,
    expectedQuestionNumbers,
    directRawSurfaces,
  ).sort((left, right) => right.score - left.score);
  const deterministicCandidate = deterministicCandidates.find((candidate) => candidate.group);

  if (deterministicCandidate?.group) {
    return {
      groupId: input.groupId,
      group: deterministicCandidate.group,
      expectedQuestionNumbers,
      rawExcerpt: deterministicCandidate.rawExcerpt,
      metadata: buildCanonicalizationMetadata(
        input.sourceWorkflow,
        'deterministic-table',
        deterministicCandidate.matrix.sourceShape,
        deterministicCandidate.matrix.sourceShape,
        'none',
        [],
        deterministicCandidate.matrix,
        {
          parseMode: 'deterministic',
          inferredCaption: Boolean(deterministicCandidate.matrix.caption),
          usedLegacySectionHeaders: false,
          usedLegacyOptionsHeaders: false,
        },
      ),
    };
  }

  const aiStructuredGroup = input.structuredCandidate
    ? buildGroupFromStructuredCandidate(
        input,
        input.structuredCandidate,
        parsedInstruction,
        input.structuredCandidate.rawExcerpt?.trim() || syntheticFallbackExcerpt,
      )
    : null;

  const aiLossFlags = buildLossFlags(
    deterministicCandidates,
    aiStructuredGroup,
    aiStructuredGroup ? 'degraded-table-source' : 'missing-table-source',
    expectedQuestionNumbers,
    parsedInstruction,
    rawExcerptForResult,
  );

  if (aiStructuredGroup) {
    const aiGroup = refreshTableCompletionCanonicalRevisionHash({
      ...aiStructuredGroup,
      provenance: {
        ...aiStructuredGroup.provenance,
        lossFlags: aiLossFlags,
      },
    });

    return {
      groupId: input.groupId,
      group: aiGroup,
      expectedQuestionNumbers,
      rawExcerpt: input.structuredCandidate?.rawExcerpt?.trim() || rawExcerptForResult,
      metadata: buildCanonicalizationMetadata(
        input.sourceWorkflow,
        'degraded-table-source',
        'ai-structured',
        'ai-structured',
        'ai-structured',
        aiLossFlags,
        {
          inferredHeaders: false,
          inferredSpans: false,
          partialStructureRecovery: false,
          normalizedNoteRows: false,
          cosmeticFormatRecovery: false,
        },
        {
          parseMode: 'ai-assisted',
          inferredCaption: Boolean(input.structuredCandidate?.caption),
          usedLegacySectionHeaders: false,
          usedLegacyOptionsHeaders: false,
        },
      ),
    };
  }

  const legacySectionMatrix =
    parsedInstruction.headers.length > 0
      ? parseLegacyQuestionMatrix(input.questions, parsedInstruction.headers)
      : null;
  const legacySectionGroup = legacySectionMatrix
    ? buildGroupFromMatrix(
        input,
        legacySectionMatrix,
        parsedInstruction,
        syntheticFallbackExcerpt,
        {
          sourceOutcome: 'degraded-table-source',
          sourceKind: 'legacy-section-headers',
          fallbackKind: 'legacy-section-headers',
          confidence: 0.72,
        },
      )
    : null;

  const legacySectionLossFlags = buildLossFlags(
    deterministicCandidates,
    legacySectionGroup,
    legacySectionGroup ? 'degraded-table-source' : 'missing-table-source',
    expectedQuestionNumbers,
    parsedInstruction,
    rawExcerptForResult,
  );

  if (legacySectionGroup) {
    const group = refreshTableCompletionCanonicalRevisionHash({
      ...legacySectionGroup,
      provenance: {
        ...legacySectionGroup.provenance,
        lossFlags: legacySectionLossFlags,
      },
    });

    return {
      groupId: input.groupId,
      group,
      expectedQuestionNumbers,
      rawExcerpt: syntheticFallbackExcerpt,
      metadata: buildCanonicalizationMetadata(
        input.sourceWorkflow,
        'degraded-table-source',
        legacySectionMatrix.sourceShape,
        'legacy-section-headers',
        'legacy-section-headers',
        legacySectionLossFlags,
        legacySectionMatrix,
        {
          parseMode: 'deterministic',
          inferredCaption: false,
          usedLegacySectionHeaders: true,
          usedLegacyOptionsHeaders: false,
        },
      ),
    };
  }

  const optionHeaders = extractHeadersFromOptions(input.questions[0]?.options);
  const legacyOptionsMatrix =
    optionHeaders.length > 0 ? parseLegacyQuestionMatrix(input.questions, optionHeaders) : null;
  const legacyOptionsGroup = legacyOptionsMatrix
    ? buildGroupFromMatrix(
        input,
        legacyOptionsMatrix,
        parsedInstruction,
        syntheticFallbackExcerpt,
        {
          sourceOutcome: 'degraded-table-source',
          sourceKind: 'legacy-options-headers',
          fallbackKind: 'legacy-options-headers',
          confidence: 0.7,
        },
      )
    : null;

  const legacyOptionLossFlags = buildLossFlags(
    deterministicCandidates,
    legacyOptionsGroup,
    legacyOptionsGroup ? 'degraded-table-source' : 'missing-table-source',
    expectedQuestionNumbers,
    parsedInstruction,
    rawExcerptForResult,
  );

  if (legacyOptionsGroup) {
    const group = refreshTableCompletionCanonicalRevisionHash({
      ...legacyOptionsGroup,
      provenance: {
        ...legacyOptionsGroup.provenance,
        lossFlags: legacyOptionLossFlags,
      },
    });

    return {
      groupId: input.groupId,
      group,
      expectedQuestionNumbers,
      rawExcerpt: syntheticFallbackExcerpt,
      metadata: buildCanonicalizationMetadata(
        input.sourceWorkflow,
        'degraded-table-source',
        legacyOptionsMatrix.sourceShape,
        'legacy-options-headers',
        'legacy-options-headers',
        legacyOptionLossFlags,
        legacyOptionsMatrix,
        {
          parseMode: 'deterministic',
          inferredCaption: false,
          usedLegacySectionHeaders: false,
          usedLegacyOptionsHeaders: true,
        },
      ),
    };
  }

  const lossFlags = buildLossFlags(
    deterministicCandidates,
    null,
    'missing-table-source',
    expectedQuestionNumbers,
    parsedInstruction,
    rawExcerptForResult,
  );

  return {
    groupId: input.groupId,
    group: null,
    expectedQuestionNumbers,
    rawExcerpt: rawExcerptForResult,
    metadata: buildCanonicalizationMetadata(
      input.sourceWorkflow,
      'missing-table-source',
      parsedInstruction.headers.length > 0 || optionHeaders.length > 0
        ? 'legacy-table-headers-transport'
        : 'aligned-text',
      parsedInstruction.headers.length > 0
        ? 'legacy-section-headers'
        : optionHeaders.length > 0
          ? 'legacy-options-headers'
          : 'none',
      parsedInstruction.headers.length > 0
        ? 'legacy-section-headers'
        : optionHeaders.length > 0
          ? 'legacy-options-headers'
          : 'none',
      lossFlags,
      {
        inferredHeaders: false,
        inferredSpans: false,
        partialStructureRecovery: false,
        normalizedNoteRows: false,
        cosmeticFormatRecovery: false,
      },
      {
        parseMode: 'unresolved',
        inferredCaption: false,
        usedLegacySectionHeaders: parsedInstruction.headers.length > 0,
        usedLegacyOptionsHeaders: optionHeaders.length > 0,
      },
    ),
  };
};
