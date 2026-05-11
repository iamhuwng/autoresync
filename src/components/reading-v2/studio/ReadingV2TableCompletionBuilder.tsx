import {
  IconArrowsSplit,
  IconBracketsContain,
  IconEye,
  IconFileImport,
  IconGitMerge,
  IconPointer,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import type { ReadingV2DerivedNumber } from '../../../services/reading-v2/readingV2Numbering.service';
import {
  readingV2Ids,
  type ReadingV2Anchor,
  type ReadingV2Document,
  type ReadingV2Interaction,
  type ReadingV2StimulusNode,
  type ReadingV2TableCellContent,
  type ReadingV2TaskGroup,
} from '../../../types/readingV2.types';
import { getReadingV2InstructionText } from '../../../services/reading-v2/readingV2InstructionTemplates.service';
import { ReadingV2InstructionText } from '../shared/ReadingV2InstructionText';

type TableCompletionActionMetadata = Record<string, string | number | boolean | undefined>;

export interface ReadingV2TableCompletionBuilderProps {
  readonly document: ReadingV2Document;
  readonly taskGroup: ReadingV2TaskGroup;
  readonly interactions: readonly ReadingV2Interaction[];
  readonly visibleNumbers: readonly ReadingV2DerivedNumber[];
  readonly selectedLinkAnchorId?: string | null;
  readonly onDocumentChange: (document: ReadingV2Document) => void;
  readonly onTableCompletionAction?: (outcome: string, metadata?: TableCompletionActionMetadata) => void;
  readonly onQuestionLinkRepair?: (outcome: string, metadata?: TableCompletionActionMetadata) => void;
  readonly onQuestionLinkNavigation?: (target: {
    readonly anchorId?: string;
    readonly interactionId?: string;
    readonly taskGroupId?: string;
    readonly source: 'block' | 'repair';
  }) => void;
}

type TableStimulus = ReadingV2StimulusNode & {
  readonly content: Extract<ReadingV2StimulusNode['content'], { readonly kind: 'table-content' }>;
};

type NormalizedTableCell = ReadingV2TableCellContent & {
  readonly cellId: string;
  readonly rowSpan: number;
  readonly colSpan: number;
};

type SplitSourceCellSnapshot = NonNullable<ReadingV2TableCellContent['splitSourceCells']>[number];

interface BlankCellEntry {
  readonly cell: NormalizedTableCell;
  readonly rowIndex: number;
  readonly cellIndex: number;
  readonly anchorId: ReadingV2Anchor['anchorId'];
  readonly blankIndexInCell: number;
}

interface TableCellPlacement {
  readonly cell: NormalizedTableCell;
  readonly rowIndex: number;
  readonly cellIndex: number;
  readonly columnIndex: number;
  readonly rowSpan: number;
  readonly colSpan: number;
}

const isTableStimulus = (stimulus: ReadingV2StimulusNode | undefined): stimulus is TableStimulus =>
  stimulus?.content.kind === 'table-content';

const parseAcceptableAnswers = (value: string): readonly string[] =>
  value
    .split('|')
    .map((answer) => answer.trim())
    .filter(Boolean);

const sanitizeIdPart = (value: string): string =>
  value.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'item';

const TABLE_BLANK_MARKER = '_____';
const IELTS_WORD_LIMIT_OPTIONS = [1, 2, 3] as const;
const blankPattern = /_{3,}|\[\s*blank\s*\]|\{\{\s*blank\s*\}\}|\{\s*blank\s*\}/i;
const blankPatternGlobal = /_{3,}|\[\s*blank\s*\]|\{\{\s*blank\s*\}\}|\{\s*blank\s*\}/gi;
const normalizedBlankMarkerPattern = /_{3,}/g;

const normalizeInlineBlankText = (value: string): string =>
  value.replace(blankPatternGlobal, TABLE_BLANK_MARKER);

const countInlineBlankMarkers = (value: string): number =>
  normalizeInlineBlankText(value).match(normalizedBlankMarkerPattern)?.length ?? 0;

const appendInlineBlankMarker = (value: string): string => {
  const text = normalizeInlineBlankText(value).trimEnd();
  return text.length > 0 ? `${text} ${TABLE_BLANK_MARKER}` : TABLE_BLANK_MARKER;
};

const insertInlineBlankMarkerAtSelection = (
  value: string,
  selectionStart?: number,
  selectionEnd?: number,
): string => {
  const source = normalizeInlineBlankText(value);
  const start = Math.max(0, Math.min(selectionStart ?? source.length, source.length));
  const end = Math.max(start, Math.min(selectionEnd ?? start, source.length));
  const before = source.slice(0, start).trimEnd();
  const after = source.slice(end).trimStart();

  return [before, TABLE_BLANK_MARKER, after].filter(Boolean).join(' ');
};

const removeInlineBlankMarkers = (value: string): string =>
  normalizeInlineBlankText(value)
    .replace(normalizedBlankMarkerPattern, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const ensureInlineBlankMarkers = (value: string, desiredCount: number): string => {
  let text = normalizeInlineBlankText(value);
  const missingCount = Math.max(0, desiredCount - countInlineBlankMarkers(text));

  for (let index = 0; index < missingCount; index += 1) {
    text = appendInlineBlankMarker(text);
  }

  return text;
};

const createCellId = (
  taskGroup: ReadingV2TaskGroup,
  rowIndex: number,
  cellIndex: number,
): string => `${taskGroup.taskGroupId}-table-cell-r${rowIndex + 1}-c${cellIndex + 1}`;

const getCellAnchorIds = (cell: ReadingV2TableCellContent): readonly ReadingV2Anchor['anchorId'][] => {
  const anchors = cell.anchorIds && cell.anchorIds.length > 0
    ? cell.anchorIds
    : cell.anchorId
      ? [cell.anchorId]
      : [];

  return anchors.filter((anchorId, index) => anchors.indexOf(anchorId) === index);
};

const normalizeTableRows = (
  rows: readonly (readonly ReadingV2TableCellContent[])[],
  taskGroup: ReadingV2TaskGroup,
): readonly (readonly NormalizedTableCell[])[] =>
  rows.map((row, rowIndex) =>
    row.map((cell, cellIndex) => {
      const anchorIds = getCellAnchorIds(cell);
      const desiredBlankCount = cell.isBlank ? Math.max(1, anchorIds.length, countInlineBlankMarkers(cell.text)) : countInlineBlankMarkers(cell.text);
      const text = ensureInlineBlankMarkers(cell.text, desiredBlankCount);
      const inlineBlankCount = countInlineBlankMarkers(text);
      const inlineAnchorIds = anchorIds.slice(0, inlineBlankCount);
      return {
        ...cell,
        text,
        cellId: cell.cellId ?? createCellId(taskGroup, rowIndex, cellIndex),
        rowSpan: Math.max(1, cell.rowSpan ?? 1),
        colSpan: Math.max(1, cell.colSpan ?? 1),
        anchorId: inlineAnchorIds[0],
        anchorIds: inlineAnchorIds.length > 0 ? inlineAnchorIds : undefined,
        isBlank: inlineBlankCount > 0,
      };
    }),
  );

const getTableStimulus = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
): TableStimulus | undefined => {
  const linkedTable = taskGroup.stimulusRefs
    .map((stimulusRef) => document.stimuli[stimulusRef.stimulusId])
    .find(isTableStimulus);

  if (linkedTable) {
    return linkedTable;
  }

  const section = document.sections[taskGroup.sectionId];
  return section?.stimulusIds
    .map((stimulusId) => document.stimuli[stimulusId])
    .find(isTableStimulus);
};

const getBlankCells = (rows: readonly (readonly ReadingV2TableCellContent[])[]) =>
  rows.flatMap((row, rowIndex) =>
    row.flatMap((cell, cellIndex) =>
      cell.isBlank
        ? getCellAnchorIds(cell).map((anchorId, blankIndexInCell) => ({
            cell: {
              ...cell,
              cellId: cell.cellId ?? `legacy-cell-${rowIndex + 1}-${cellIndex + 1}`,
              rowSpan: Math.max(1, cell.rowSpan ?? 1),
              colSpan: Math.max(1, cell.colSpan ?? 1),
            },
            rowIndex,
            cellIndex,
            anchorId,
            blankIndexInCell,
          } satisfies BlankCellEntry))
        : [],
    ),
  );

const getTablePlacements = (
  rows: readonly (readonly ReadingV2TableCellContent[])[],
): readonly TableCellPlacement[] => {
  const occupiedUntilByColumn = new Map<number, number>();
  const placements: TableCellPlacement[] = [];

  rows.forEach((row, rowIndex) => {
    let columnIndex = 0;

    row.forEach((cell, cellIndex) => {
      while ((occupiedUntilByColumn.get(columnIndex) ?? 0) > rowIndex) {
        columnIndex += 1;
      }

      const normalizedCell: NormalizedTableCell = {
        ...cell,
        cellId: cell.cellId ?? `legacy-cell-${rowIndex + 1}-${cellIndex + 1}`,
        rowSpan: Math.max(1, cell.rowSpan ?? 1),
        colSpan: Math.max(1, cell.colSpan ?? 1),
      };

      placements.push({
        cell: normalizedCell,
        rowIndex,
        cellIndex,
        columnIndex,
        rowSpan: normalizedCell.rowSpan,
        colSpan: normalizedCell.colSpan,
      });

      for (let offset = 0; offset < normalizedCell.colSpan; offset += 1) {
        occupiedUntilByColumn.set(columnIndex + offset, rowIndex + normalizedCell.rowSpan);
      }

      columnIndex += normalizedCell.colSpan;
    });
  });

  return placements;
};

const getTableColumnCount = (rows: readonly (readonly ReadingV2TableCellContent[])[]): number =>
  getTablePlacements(rows).reduce(
    (maxColumn, placement) => Math.max(maxColumn, placement.columnIndex + placement.colSpan),
    0,
  );

const canRemoveLastRow = (rows: readonly (readonly ReadingV2TableCellContent[])[]): boolean => {
  if (rows.length <= 1) {
    return false;
  }

  const lastRowIndex = rows.length - 1;
  return !getTablePlacements(rows).some((placement) =>
    placement.rowIndex < lastRowIndex && placement.rowIndex + placement.rowSpan - 1 >= lastRowIndex,
  );
};

const canRemoveLastColumn = (rows: readonly (readonly ReadingV2TableCellContent[])[]): boolean => {
  const columnCount = getTableColumnCount(rows);
  if (columnCount <= 1) {
    return false;
  }

  const lastColumnIndex = columnCount - 1;
  return !getTablePlacements(rows).some((placement) =>
    placement.columnIndex < lastColumnIndex && placement.columnIndex + placement.colSpan - 1 >= lastColumnIndex,
  );
};

const removeLastColumn = (
  rows: readonly (readonly ReadingV2TableCellContent[])[],
): readonly (readonly ReadingV2TableCellContent[])[] => {
  const lastColumnIndex = getTableColumnCount(rows) - 1;
  const cellIdsToRemove = new Set(
    getTablePlacements(rows)
      .filter((placement) => placement.columnIndex === lastColumnIndex)
      .map((placement) => placement.cell.cellId),
  );

  return rows.map((row) => row.filter((cell) => !cellIdsToRemove.has(cell.cellId ?? '')));
};

const placementIntersectsRect = (
  placement: TableCellPlacement,
  rect: { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number },
): boolean =>
  placement.rowIndex <= rect.bottom
  && placement.rowIndex + placement.rowSpan - 1 >= rect.top
  && placement.columnIndex <= rect.right
  && placement.columnIndex + placement.colSpan - 1 >= rect.left;

const getRectangularSelection = (
  rows: readonly (readonly ReadingV2TableCellContent[])[],
  selectedCellIds: ReadonlySet<string>,
) => {
  const selectedPlacements = getTablePlacements(rows).filter((placement) =>
    selectedCellIds.has(placement.cell.cellId),
  );

  if (selectedPlacements.length === 0) {
    return { valid: false as const, selectedPlacements, reason: 'Select cells first.' };
  }

  const top = Math.min(...selectedPlacements.map((placement) => placement.rowIndex));
  const bottom = Math.max(...selectedPlacements.map((placement) => placement.rowIndex + placement.rowSpan - 1));
  const left = Math.min(...selectedPlacements.map((placement) => placement.columnIndex));
  const right = Math.max(...selectedPlacements.map((placement) => placement.columnIndex + placement.colSpan - 1));
  const rect = { top, bottom, left, right };
  const selectedArea = selectedPlacements.reduce(
    (total, placement) => total + placement.rowSpan * placement.colSpan,
    0,
  );
  const rectArea = (bottom - top + 1) * (right - left + 1);
  const allPlacements = getTablePlacements(rows);
  const crossingCell = allPlacements.find((placement) =>
    placementIntersectsRect(placement, rect) && !selectedCellIds.has(placement.cell.cellId),
  );

  if (selectedArea !== rectArea || crossingCell) {
    return {
      valid: false as const,
      selectedPlacements,
      reason: 'Selection must be one complete rectangle with no partial merged cells.',
    };
  }

  return { valid: true as const, selectedPlacements, rect };
};

const createResponseShape = (): ReadingV2Interaction['responseShape'] => ({
  kind: 'structured-entry',
  structure: 'table',
});

const createUniqueAnchorId = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
  rowIndex: number,
  cellIndex: number,
  blankIndex = 0,
): ReadingV2Anchor['anchorId'] => {
  const base = `${taskGroup.taskGroupId}-table-r${rowIndex + 1}-c${cellIndex + 1}${blankIndex > 0 ? `-blank-${blankIndex + 1}` : ''}`;
  let candidate = readingV2Ids.anchorId(base);
  let suffix = 2;

  while (document.anchors[candidate]) {
    candidate = readingV2Ids.anchorId(`${base}-${suffix}`);
    suffix += 1;
  }

  return candidate;
};

const createUniqueInteractionId = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
  anchorId: string,
): ReadingV2Interaction['interactionId'] => {
  const base = `${taskGroup.taskGroupId}-question-${sanitizeIdPart(anchorId)}`;
  let candidate = readingV2Ids.interactionId(base);
  let suffix = 2;

  while (document.interactions[candidate]) {
    candidate = readingV2Ids.interactionId(`${base}-${suffix}`);
    suffix += 1;
  }

  return candidate;
};

const createStarterTableDocument = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
): ReadingV2Document => {
  const stimulusId = readingV2Ids.stimulusId(`${taskGroup.taskGroupId}-table`);
  const anchorOne = createUniqueAnchorId(document, taskGroup, 1, 1);
  const anchorTwo = createUniqueAnchorId(document, taskGroup, 2, 1);
  const existingInteractions = taskGroup.interactionIds
    .map((interactionId) => document.interactions[interactionId])
    .filter((interaction): interaction is ReadingV2Interaction => Boolean(interaction));
  const interactionOneId = existingInteractions[0]?.interactionId ?? createUniqueInteractionId(document, taskGroup, anchorOne);
  const interactionTwoId = existingInteractions[1]?.interactionId ?? createUniqueInteractionId(document, taskGroup, anchorTwo);
  const tableStimulus: TableStimulus = {
    stimulusId,
    kind: 'table-shell',
    title: taskGroup.groupTitle ?? 'Table Completion',
    content: {
      kind: 'table-content',
      rows: [
        [
          { cellId: createCellId(taskGroup, 0, 0), text: 'Category', role: 'header', rowSpan: 1, colSpan: 1 },
          { cellId: createCellId(taskGroup, 0, 1), text: 'Answer', role: 'header', rowSpan: 1, colSpan: 1 },
        ],
        [
          { cellId: createCellId(taskGroup, 1, 0), text: 'Item 1', role: 'body', rowSpan: 1, colSpan: 1 },
          { cellId: createCellId(taskGroup, 1, 1), anchorId: anchorOne, anchorIds: [anchorOne], text: TABLE_BLANK_MARKER, role: 'body', isBlank: true, rowSpan: 1, colSpan: 1 },
        ],
        [
          { cellId: createCellId(taskGroup, 2, 0), text: 'Item 2', role: 'body', rowSpan: 1, colSpan: 1 },
          { cellId: createCellId(taskGroup, 2, 1), anchorId: anchorTwo, anchorIds: [anchorTwo], text: TABLE_BLANK_MARKER, role: 'body', isBlank: true, rowSpan: 1, colSpan: 1 },
        ],
      ],
    },
    anchorIds: [anchorOne, anchorTwo],
  };
  const section = document.sections[taskGroup.sectionId];
  const nextStimulusIds = section?.stimulusIds.includes(stimulusId)
    ? section.stimulusIds
    : [...(section?.stimulusIds ?? []), stimulusId];
  const responseShape = createResponseShape();
  const nextTaskGroup: ReadingV2TaskGroup = {
    ...taskGroup,
    stimulusRefs: [{ stimulusId, anchorIds: [anchorOne, anchorTwo] }],
    interactionIds: [interactionOneId, interactionTwoId],
    answerRule: {
      ...taskGroup.answerRule,
      responseShape,
      wordLimit: taskGroup.answerRule.wordLimit ?? 2,
    },
  };

  return {
    ...document,
    sections: section
      ? {
          ...document.sections,
          [section.sectionId]: {
            ...section,
            stimulusIds: nextStimulusIds,
          },
        }
      : document.sections,
    stimuli: {
      ...document.stimuli,
      [stimulusId]: tableStimulus,
    },
    anchors: {
      ...document.anchors,
      [anchorOne]: {
        anchorId: anchorOne,
        stimulusId,
        kind: 'table-cell',
        label: 'Question blank 1',
      },
      [anchorTwo]: {
        anchorId: anchorTwo,
        stimulusId,
        kind: 'table-cell',
        label: 'Question blank 2',
      },
    },
    taskGroups: {
      ...document.taskGroups,
      [taskGroup.taskGroupId]: nextTaskGroup,
    },
    interactions: {
      ...document.interactions,
      [interactionOneId]: {
        ...existingInteractions[0],
        interactionId: interactionOneId,
        taskGroupId: taskGroup.taskGroupId,
        responseShape,
        scoringRule: existingInteractions[0]?.scoringRule ?? { maxScore: 1, acceptableAnswers: [] },
        reviewLabel: existingInteractions[0]?.reviewLabel ?? {},
        promptText: existingInteractions[0]?.promptText ?? 'Table blank 1',
        primaryAnchorId: anchorOne,
        placeholder: existingInteractions[0]?.scoringRule.acceptableAnswers?.some((answer) => answer.trim()) ? false : true,
      },
      [interactionTwoId]: {
        ...existingInteractions[1],
        interactionId: interactionTwoId,
        taskGroupId: taskGroup.taskGroupId,
        responseShape,
        scoringRule: existingInteractions[1]?.scoringRule ?? { maxScore: 1, acceptableAnswers: [] },
        reviewLabel: existingInteractions[1]?.reviewLabel ?? {},
        promptText: existingInteractions[1]?.promptText ?? 'Table blank 2',
        primaryAnchorId: anchorTwo,
        placeholder: existingInteractions[1]?.scoringRule.acceptableAnswers?.some((answer) => answer.trim()) ? false : true,
      },
    },
  };
};

const parsePastedTable = (value: string): readonly (readonly string[])[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes('\t')) {
        return line.split('\t').map((cell) => cell.trim());
      }

      if (line.includes('|')) {
        return line
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());
      }

      return line.split(/\s{2,}/).map((cell) => cell.trim());
    })
    .filter((row) => row.length > 0);

const cleanPastedCellText = (value: string): string =>
  normalizeInlineBlankText(value).replace(/\s+/g, ' ').trim();

const rebuildTableDocument = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
  stimulus: TableStimulus,
  rows: readonly (readonly ReadingV2TableCellContent[])[],
): ReadingV2Document => {
  const normalizedInputRows = normalizeTableRows(rows, taskGroup);
  const previousTableAnchorIds = new Set(
    stimulus.content.rows.flatMap((row) =>
      row.flatMap((cell) => getCellAnchorIds(cell)),
    ),
  );
  const interactionsByAnchorId = new Map(
    taskGroup.interactionIds
      .map((interactionId) => document.interactions[interactionId])
      .filter((interaction): interaction is ReadingV2Interaction => Boolean(interaction?.primaryAnchorId))
      .map((interaction) => [interaction.primaryAnchorId as string, interaction]),
  );
  const unassignedInteractions = taskGroup.interactionIds
    .map((interactionId) => document.interactions[interactionId])
    .filter((interaction): interaction is ReadingV2Interaction => Boolean(interaction))
    .filter((interaction) => !interaction.primaryAnchorId);
  const responseShape = createResponseShape();
  const nextRows = normalizedInputRows.map((row, rowIndex) =>
    row.map((cell, cellIndex) => {
      const text = normalizeInlineBlankText(cell.text);
      const inlineBlankCount = countInlineBlankMarkers(text);

      if (inlineBlankCount === 0) {
        const { anchorId: _anchorId, anchorIds: _anchorIds, ...rest } = cell;
        return {
          ...rest,
          text,
          isBlank: false,
        };
      }

      const existingAnchorIds = getCellAnchorIds(cell);
      const anchorIds = Array.from({ length: inlineBlankCount }, (_, blankIndex) =>
        existingAnchorIds[blankIndex] ?? createUniqueAnchorId(document, taskGroup, rowIndex, cellIndex, blankIndex),
      );

      return {
        ...cell,
        text,
        anchorId: anchorIds[0],
        anchorIds,
        isBlank: true,
      };
    }),
  );
  const nextBlankCells = getBlankCells(nextRows);
  const nextAnchorIds = nextBlankCells
    .map(({ anchorId }) => anchorId)
    .filter((anchorId, index, anchorIds) => anchorIds.indexOf(anchorId) === index);
  const nextInteractions: Record<string, ReadingV2Interaction> = { ...document.interactions };
  const nextInteractionIds: ReadingV2Interaction['interactionId'][] = [];

  nextBlankCells.forEach(({ rowIndex, cellIndex, anchorId }, blankIndex) => {
    const existing = interactionsByAnchorId.get(anchorId) ?? unassignedInteractions.shift();
    const interactionId = existing?.interactionId ?? createUniqueInteractionId(document, taskGroup, anchorId);

    nextInteractionIds.push(interactionId);
    nextInteractions[interactionId] = {
      ...existing,
      interactionId,
      taskGroupId: taskGroup.taskGroupId,
      responseShape,
      scoringRule: existing?.scoringRule ?? { maxScore: 1, acceptableAnswers: [] },
      reviewLabel: existing?.reviewLabel ?? {},
      promptText: existing?.promptText ?? `Table blank ${blankIndex + 1}`,
      primaryAnchorId: anchorId,
      placeholder: existing?.scoringRule.acceptableAnswers?.some((answer) => answer.trim().length > 0) ? false : true,
      contextAnchorIds: [anchorId],
    };

    if (!document.anchors[anchorId]) {
      nextInteractions[interactionId] = {
        ...nextInteractions[interactionId],
        promptText: `Table blank at row ${rowIndex + 1}, column ${cellIndex + 1}`,
      };
    }
  });

  taskGroup.interactionIds
    .filter((interactionId) => !nextInteractionIds.includes(interactionId))
    .forEach((interactionId) => {
      delete nextInteractions[interactionId];
    });

  const nextAnchors = { ...document.anchors };
  previousTableAnchorIds.forEach((anchorId) => {
    if (!nextAnchorIds.includes(anchorId)) {
      delete nextAnchors[anchorId];
    }
  });
  nextAnchorIds.forEach((anchorId, index) => {
    nextAnchors[anchorId] = {
      ...nextAnchors[anchorId],
      anchorId,
      stimulusId: stimulus.stimulusId,
      kind: 'table-cell',
      label: nextAnchors[anchorId]?.label ?? `Question blank ${index + 1}`,
    };
  });

  return {
    ...document,
    stimuli: {
      ...document.stimuli,
      [stimulus.stimulusId]: {
        ...stimulus,
        content: {
          kind: 'table-content',
          rows: nextRows,
        },
        anchorIds: nextAnchorIds,
      },
    },
    anchors: nextAnchors,
    taskGroups: {
      ...document.taskGroups,
      [taskGroup.taskGroupId]: {
        ...taskGroup,
        answerRule: {
          ...taskGroup.answerRule,
          responseShape,
          wordLimit: taskGroup.answerRule.wordLimit ?? 2,
        },
        stimulusRefs: [{ stimulusId: stimulus.stimulusId, anchorIds: nextAnchorIds }],
        interactionIds: nextInteractionIds,
        validationState: {
          issues: taskGroup.validationState.issues.filter((issue) =>
            !taskGroup.interactionIds.includes(readingV2Ids.interactionId(issue.objectId ?? 'missing')),
          ),
        },
      },
    },
    interactions: nextInteractions,
  };
};

const mergeTableCells = (
  rows: readonly (readonly ReadingV2TableCellContent[])[],
  selectedCellIds: ReadonlySet<string>,
) => {
  const selection = getRectangularSelection(rows, selectedCellIds);

  if (!selection.valid) {
    return null;
  }

  const target = [...selection.selectedPlacements].sort((a, b) =>
    a.rowIndex === b.rowIndex ? a.columnIndex - b.columnIndex : a.rowIndex - b.rowIndex,
  )[0];

  if (!target) {
    return null;
  }

  const selectedIdSet = new Set(selection.selectedPlacements.map((placement) => placement.cell.cellId));
  const splitSourceCells = Array.from(
    { length: (selection.rect.bottom - selection.rect.top + 1) * (selection.rect.right - selection.rect.left + 1) },
    (_, index): SplitSourceCellSnapshot => {
      const rowIndex = selection.rect.top + Math.floor(index / (selection.rect.right - selection.rect.left + 1));
      const columnIndex = selection.rect.left + index % (selection.rect.right - selection.rect.left + 1);
      const sourcePlacement = selection.selectedPlacements.find((placement) =>
        placement.rowIndex === rowIndex && placement.columnIndex === columnIndex,
      );

      if (!sourcePlacement) {
        return {
          text: '',
          ...(target.cell.role !== undefined ? { role: target.cell.role } : {}),
          isBlank: false,
        };
      }

      const sourceAnchorIds = getCellAnchorIds(sourcePlacement.cell);
      return {
        text: sourcePlacement.cell.text,
        ...(sourcePlacement.cell.role !== undefined ? { role: sourcePlacement.cell.role } : {}),
        isBlank: sourcePlacement.cell.isBlank,
        ...(sourceAnchorIds[0] !== undefined ? { anchorId: sourceAnchorIds[0] } : {}),
        ...(sourceAnchorIds.length > 0 ? { anchorIds: sourceAnchorIds } : {}),
      };
    },
  );
  const mergedAnchorIds = selection.selectedPlacements.flatMap((placement) => getCellAnchorIds(placement.cell))
    .filter((anchorId, index, anchorIds) => anchorIds.indexOf(anchorId) === index);
  const mergedText = selection.selectedPlacements
    .map((placement) => placement.cell.text.trim())
    .filter(Boolean)
    .join(' ');
  const mergedCell: ReadingV2TableCellContent = {
    ...target.cell,
    text: mergedText,
    rowSpan: selection.rect.bottom - selection.rect.top + 1,
    colSpan: selection.rect.right - selection.rect.left + 1,
    isBlank: mergedAnchorIds.length > 0,
    anchorId: mergedAnchorIds[0],
    anchorIds: mergedAnchorIds.length > 0 ? mergedAnchorIds : undefined,
    splitSourceCells,
  };

  return rows.map((row, rowIndex) =>
    row.flatMap((cell) => {
      const normalizedCellId = cell.cellId ?? '';
      if (normalizedCellId === target.cell.cellId && rowIndex === target.rowIndex) {
        return [mergedCell];
      }

      return selectedIdSet.has(normalizedCellId) ? [] : [cell];
    }),
  );
};

const splitMergedCell = (
  rows: readonly (readonly ReadingV2TableCellContent[])[],
  targetCellId: string,
) => {
  const placements = getTablePlacements(rows);
  const target = placements.find((placement) => placement.cell.cellId === targetCellId);

  if (!target || (target.rowSpan <= 1 && target.colSpan <= 1)) {
    return null;
  }

  const targetAnchorIds = getCellAnchorIds(target.cell);
  const makeSplitCell = (rowOffset: number, columnOffset: number): ReadingV2TableCellContent => {
    const snapshotIndex = rowOffset * target.colSpan + columnOffset;
    const sourceSnapshot = target.cell.splitSourceCells?.[snapshotIndex];
    const snapshotAnchorIds = sourceSnapshot ? getCellAnchorIds(sourceSnapshot) : [];
    const anchorIds = snapshotAnchorIds.length > 0
      ? snapshotAnchorIds
      : targetAnchorIds[snapshotIndex]
        ? [targetAnchorIds[snapshotIndex]]
        : [];
    return {
      cellId: `${target.cell.cellId}-split-r${rowOffset + 1}-c${columnOffset + 1}`,
      text: sourceSnapshot?.text ?? (rowOffset === 0 && columnOffset === 0 ? target.cell.text : ''),
      role: sourceSnapshot?.role ?? target.cell.role,
      rowSpan: 1,
      colSpan: 1,
      isBlank: sourceSnapshot?.isBlank ?? anchorIds.length > 0,
      anchorId: anchorIds[0],
      anchorIds: anchorIds.length > 0 ? anchorIds : undefined,
    };
  };

  return rows.map((row, rowIndex) => {
    if (rowIndex < target.rowIndex || rowIndex >= target.rowIndex + target.rowSpan) {
      return row;
    }

    const generatedCells = Array.from({ length: target.colSpan }, (_, columnOffset) =>
      makeSplitCell(rowIndex - target.rowIndex, columnOffset),
    );

    if (rowIndex === target.rowIndex) {
      return row.flatMap((cell) => cell.cellId === target.cell.cellId ? generatedCells : [cell]);
    }

    const rowPlacements = placements.filter((placement) => placement.rowIndex === rowIndex);
    const insertBefore = rowPlacements.find((placement) => placement.columnIndex > target.columnIndex);
    const insertIndex = insertBefore ? insertBefore.cellIndex : row.length;

    return [
      ...row.slice(0, insertIndex),
      ...generatedCells,
      ...row.slice(insertIndex),
    ];
  });
};

interface TableCellCaret {
  readonly cellId: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

export function ReadingV2TableCompletionBuilder({
  document,
  taskGroup,
  interactions,
  visibleNumbers,
  selectedLinkAnchorId,
  onDocumentChange,
  onTableCompletionAction,
  onQuestionLinkRepair,
  onQuestionLinkNavigation,
}: ReadingV2TableCompletionBuilderProps) {
  const [pastedTableText, setPastedTableText] = useState('');
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedCellIds, setSelectedCellIds] = useState<ReadonlySet<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [cellCaret, setCellCaret] = useState<TableCellCaret | null>(null);
  const tableStimulus = getTableStimulus(document, taskGroup);
  const interactionsByAnchorId = new Map(
    interactions
      .filter((interaction) => interaction.primaryAnchorId)
      .map((interaction) => [interaction.primaryAnchorId as string, interaction]),
  );
  const questionNumberByInteractionId = new Map(
    visibleNumbers.map((entry) => [entry.interactionId, entry.displayNumber]),
  );
  const questionNumberByAnchorId = new Map(
    interactions
      .filter((interaction) => interaction.primaryAnchorId)
      .map((interaction) => [
        interaction.primaryAnchorId as string,
        questionNumberByInteractionId.get(interaction.interactionId),
      ])
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  );
  const rows = useMemo(
    () => normalizeTableRows(tableStimulus?.content.rows ?? [], taskGroup),
    [tableStimulus?.content.rows, taskGroup],
  );

  const commitRows = (
    stimulus: TableStimulus,
    rows: readonly (readonly ReadingV2TableCellContent[])[],
    outcome: string,
    metadata: TableCompletionActionMetadata = {},
  ) => {
    const normalizedRows = normalizeTableRows(rows, taskGroup);
    const nextDocument = rebuildTableDocument(document, taskGroup, stimulus, normalizedRows);
    const nextTaskGroup = nextDocument.taskGroups[taskGroup.taskGroupId];
    const nextStimulus = nextTaskGroup?.stimulusRefs[0]
      ? nextDocument.stimuli[nextTaskGroup.stimulusRefs[0].stimulusId]
      : undefined;
    const nextRows = nextStimulus?.content.kind === 'table-content' ? nextStimulus.content.rows : normalizedRows;
    onDocumentChange(nextDocument);
    onTableCompletionAction?.(outcome, {
      taskGroupId: taskGroup.taskGroupId,
      rowCount: nextRows.length,
      blankCount: getBlankCells(nextRows).length,
      ...metadata,
    });
  };

  const commitStimulusTitle = (stimulus: TableStimulus, title: string) => {
    onDocumentChange({
      ...document,
      stimuli: {
        ...document.stimuli,
        [stimulus.stimulusId]: {
          ...stimulus,
          title,
        },
      },
    });
    onTableCompletionAction?.('table-title-updated', { taskGroupId: taskGroup.taskGroupId });
  };

  const normalizeWordLimit = (wordLimit: number): number =>
    Number.isFinite(wordLimit) ? Math.min(3, Math.max(1, Math.round(wordLimit))) : 2;

  const commitWordLimit = (wordLimit: number) => {
    const nextWordLimit = normalizeWordLimit(wordLimit);
    onDocumentChange({
      ...document,
      taskGroups: {
        ...document.taskGroups,
        [taskGroup.taskGroupId]: {
          ...taskGroup,
          answerRule: {
            ...taskGroup.answerRule,
            wordLimit: nextWordLimit,
          },
        },
      },
    });
    onTableCompletionAction?.('table-word-limit-updated', { taskGroupId: taskGroup.taskGroupId, wordLimit: nextWordLimit });
  };

  const commitInteractionAnswers = (interaction: ReadingV2Interaction, value: string) => {
    const acceptableAnswers = parseAcceptableAnswers(value);
    onDocumentChange({
      ...document,
      interactions: {
        ...document.interactions,
        [interaction.interactionId]: {
          ...interaction,
          scoringRule: {
            ...interaction.scoringRule,
            acceptableAnswers,
          },
          placeholder: acceptableAnswers.length === 0,
        },
      },
    });
    onTableCompletionAction?.('table-answer-updated', {
      taskGroupId: taskGroup.taskGroupId,
      interactionId: interaction.interactionId,
    });
  };

  if (!tableStimulus) {
    return (
      <section className="reading-v2-table-builder" aria-label="Table Completion Builder">
        <div className="reading-v2-studio__panel-heading">
          <div>
            <p>Table task</p>
            <h3>Table Completion Builder</h3>
          </div>
        </div>
        <p className="reading-v2-studio__muted">Start a table for this question group, then mark the blank cells and fill the answers.</p>
        <button
          className="reading-v2-studio__button"
          type="button"
          onClick={() => {
            onDocumentChange(createStarterTableDocument(document, taskGroup));
            onTableCompletionAction?.('starter-table-created', { taskGroupId: taskGroup.taskGroupId });
          }}
        >
          Start Table
        </button>
      </section>
    );
  }

  const blankCells = getBlankCells(rows);
  const selection = getRectangularSelection(rows, selectedCellIds);
  const selectedPlacements = selection.selectedPlacements;
  const selectedCells = selectedPlacements.map((placement) => placement.cell);
  const selectedCellId = selectedPlacements.length === 1 ? selectedPlacements[0]?.cell.cellId : undefined;
  const selectedCell = selectedCellId
    ? getTablePlacements(rows).find((placement) => placement.cell.cellId === selectedCellId)?.cell
    : undefined;
  const selectedCellsAllBlank = selectedCells.length > 0 && selectedCells.every((cell) => cell.isBlank);
  const canSplitSelectedCell = Boolean(selectedCell && ((selectedCell.rowSpan ?? 1) > 1 || (selectedCell.colSpan ?? 1) > 1));
  const mergeAvailable = selection.valid && selectedPlacements.length > 1;
  const splitAvailable = Boolean(selectedCellId && canSplitSelectedCell);
  const blankActionLabel = selectedCellsAllBlank ? 'Clear blank' : 'Insert blank';
  const lastRowRemovable = canRemoveLastRow(rows);
  const lastColumnRemovable = canRemoveLastColumn(rows);
  const rowRemovalMessage = rows.length <= 1
    ? 'Tables need at least one row.'
    : lastRowRemovable
      ? null
      : 'Split merged cells that extend into the last row before removing it.';
  const columnRemovalMessage = getTableColumnCount(rows) <= 1
    ? 'Tables need at least one column.'
    : lastColumnRemovable
      ? null
      : 'Split merged cells that extend into the last column before removing it.';
  const selectCell = (cellId: string, additive = false) => {
    setSelectedCellIds((current) => {
      if (!additive) {
        return new Set([cellId]);
      }

      const next = new Set(current);
      if (next.has(cellId)) {
        next.delete(cellId);
      } else {
        next.add(cellId);
      }
      return next;
    });
  };
  const selectTableCell = (cellId: string, additive = false) => {
    selectCell(cellId, selectionMode || additive);
  };
  const clearSelection = () => setSelectedCellIds(new Set());
  const updateCellCaret = (cellId: string, input: HTMLInputElement, fallbackToEnd = false) => {
    const fallbackOffset = input.value.length;
    setCellCaret({
      cellId,
      selectionStart: fallbackToEnd ? fallbackOffset : input.selectionStart ?? fallbackOffset,
      selectionEnd: fallbackToEnd ? fallbackOffset : input.selectionEnd ?? fallbackOffset,
    });
  };
  const commitSelectedBlankState = (stimulus: TableStimulus) => {
    if (selectedCellIds.size === 0) {
      return;
    }

    const insertingBlank = !selectedCellsAllBlank;
    commitRows(
      stimulus,
      rows.map((row) =>
        row.map((cell) => {
          if (!selectedCellIds.has(cell.cellId ?? '')) {
            return cell;
          }

          const nextText = insertingBlank
            ? selectedCellIds.size === 1 && cellCaret?.cellId === cell.cellId
              ? insertInlineBlankMarkerAtSelection(cell.text, cellCaret.selectionStart, cellCaret.selectionEnd)
              : appendInlineBlankMarker(cell.text)
            : removeInlineBlankMarkers(cell.text);
          const nextBlankCount = countInlineBlankMarkers(nextText);
          const { anchorId: _anchorId, anchorIds: _anchorIds, ...rest } = cell;
          return {
            ...rest,
            text: nextText,
            isBlank: nextBlankCount > 0,
          };
        }),
      ),
      insertingBlank ? 'table-inline-blanks-inserted' : 'table-inline-blanks-cleared',
      { selectedCellCount: selectedCellIds.size },
    );
  };
  const commitHeaderRow = (stimulus: TableStimulus) => {
    commitRows(
      stimulus,
      rows.map((row, rowIndex) =>
        row.map((cell) => ({
          ...cell,
          role: rowIndex === 0 ? 'header' : cell.role ?? 'body',
        })),
      ),
      'table-header-row-marked',
    );
  };
  const missingAnswerCount = blankCells.filter(({ anchorId }) => {
    const interaction = interactionsByAnchorId.get(anchorId);
    return !interaction?.scoringRule.acceptableAnswers?.some((answer) => answer.trim().length > 0);
  }).length;
  const selectionIssue = selection.valid
    ? 'Select a complete rectangle of two or more cells first.'
    : selection.reason;
  const selectionStatusText = selectedPlacements.length === 0
    ? selectionMode
      ? 'Select Cells mode is on. Click adjacent cells to build a rectangle, then use Merge selected cells.'
      : 'Select a cell to insert an inline blank. Turn on Select Cells to choose a rectangle for Merge.'
      : selectedPlacements.length === 1
        ? splitAvailable
        ? '1 merged cell selected. Split selected cell is available. Insert blank adds an inline marker and answer-key row.'
        : '1 cell selected. Insert blank adds an inline marker and answer-key row. Turn on Select Cells and click adjacent cells for Merge.'
      : mergeAvailable
        ? `${selectedPlacements.length} cells selected. Ready to merge into one table cell. Split restores the original text and blank markers across the split cells.`
        : `${selectedPlacements.length} cells selected. ${selectionIssue}`;

  return (
    <section
      className="reading-v2-table-builder"
      data-selection-mode={selectionMode ? 'true' : 'false'}
      aria-label="Table Completion Builder"
    >
      <div className="reading-v2-table-builder__workspace">
        <section className="reading-v2-table-builder__surface" aria-label="Table Builder">
          <div className="reading-v2-table-builder__title-row">
            <label>
              Table Title (Optional)
              <input
                aria-label="Table title"
                value={tableStimulus.title ?? ''}
                onChange={(event) => commitStimulusTitle(tableStimulus, event.currentTarget.value)}
              />
            </label>
            <span className="reading-v2-status">{blankCells.length} blanks</span>
          </div>
          <div className="reading-v2-table-builder__toolbar" aria-label="Table editing toolbar">
            <div className="reading-v2-table-builder__toolbar-group" aria-label="Table shape controls">
              <button
                className="reading-v2-table-builder__tool"
                type="button"
                title="Add row"
                onClick={() => {
                  const columnCount = Math.max(1, rows[0]?.length ?? 2);
                  commitRows(
                    tableStimulus,
                    [
                      ...rows,
                      Array.from({ length: columnCount }, (_, cellIndex) => ({
                        cellId: createCellId(taskGroup, rows.length, cellIndex),
                        text: '',
                        role: 'body' as const,
                        rowSpan: 1,
                        colSpan: 1,
                      })),
                    ],
                    'table-row-added',
                  );
                }}
              >
                <span className="reading-v2-table-builder__tool-icon" aria-hidden="true">+</span>
                Add Row
              </button>
              <button
                className="reading-v2-table-builder__tool"
                type="button"
                disabled={!lastRowRemovable}
                title={rowRemovalMessage ?? 'Delete row'}
                aria-label="Delete row"
                onClick={() => {
                  if (!lastRowRemovable) {
                    onTableCompletionAction?.('table-row-remove-blocked', {
                      taskGroupId: taskGroup.taskGroupId,
                      reason: 'merged-cell-crosses-last-row',
                    });
                    return;
                  }
                  commitRows(tableStimulus, rows.slice(0, -1), 'table-row-removed');
                  clearSelection();
                }}
              >
                <span className="reading-v2-table-builder__tool-icon" aria-hidden="true">-</span>
                Delete Row
              </button>
              <button
                className="reading-v2-table-builder__tool"
                type="button"
                title="Add column"
                onClick={() =>
                  commitRows(
                    tableStimulus,
                    rows.map((row, rowIndex) => [
                      ...row,
                      {
                        cellId: createCellId(taskGroup, rowIndex, row.length),
                        text: '',
                        role: 'body' as const,
                        rowSpan: 1,
                        colSpan: 1,
                      },
                    ]),
                    'table-column-added',
                  )
                }
              >
                <span className="reading-v2-table-builder__tool-icon" aria-hidden="true">+</span>
                Add Col
              </button>
              <button
                className="reading-v2-table-builder__tool"
                type="button"
                disabled={!lastColumnRemovable}
                title={columnRemovalMessage ?? 'Delete column'}
                aria-label="Delete column"
                onClick={() => {
                  if (!lastColumnRemovable) {
                    onTableCompletionAction?.('table-column-remove-blocked', {
                      taskGroupId: taskGroup.taskGroupId,
                      reason: 'merged-cell-crosses-last-column',
                    });
                    return;
                  }
                  commitRows(tableStimulus, removeLastColumn(rows), 'table-column-removed');
                  clearSelection();
                }}
              >
                <span className="reading-v2-table-builder__tool-icon" aria-hidden="true">-</span>
                Delete Col
              </button>
            </div>
            <span className="reading-v2-table-builder__toolbar-spacer" aria-hidden="true" />
            <div className="reading-v2-table-builder__toolbar-group" aria-label="Table cell controls">
              <button
                aria-pressed={selectionMode}
                className="reading-v2-table-builder__tool reading-v2-table-builder__tool--toggle"
                data-active={selectionMode ? 'true' : 'false'}
                type="button"
                title="Turn on multi-cell selection for merge"
                onClick={() => setSelectionMode((current) => !current)}
              >
                Select Cells
              </button>
              <button
                className="reading-v2-table-builder__tool"
                type="button"
                disabled={!mergeAvailable}
                title={mergeAvailable ? 'Merge selected cells' : 'Select a complete rectangular group of two or more cells first.'}
                onClick={() => {
                  const mergedRows = mergeTableCells(rows, selectedCellIds);
                  if (!mergedRows) {
                    onTableCompletionAction?.('table-merge-invalid', { taskGroupId: taskGroup.taskGroupId });
                    return;
                  }

                  const targetCellId = selection.valid
                    ? [...selection.selectedPlacements].sort((a, b) =>
                        a.rowIndex === b.rowIndex ? a.columnIndex - b.columnIndex : a.rowIndex - b.rowIndex,
                      )[0]?.cell.cellId
                    : undefined;
                  commitRows(tableStimulus, mergedRows, 'table-cells-merged', {
                    selectedCellCount: selectedCellIds.size,
                  });
                  setSelectedCellIds(targetCellId ? new Set([targetCellId]) : new Set());
                }}
              >
                <IconGitMerge aria-hidden="true" size={17} stroke={1.8} />
                Merge
              </button>
              <button
                className="reading-v2-table-builder__tool"
                type="button"
                disabled={!splitAvailable}
                title={splitAvailable ? 'Split selected merged cell' : 'Select one merged cell to split.'}
                onClick={() => {
                  if (!selectedCellId) {
                    return;
                  }

                  const splitRows = splitMergedCell(rows, selectedCellId);
                  if (!splitRows) {
                    return;
                  }

                  commitRows(tableStimulus, splitRows, 'table-cell-split', { cellId: selectedCellId });
                  clearSelection();
                }}
              >
                <IconArrowsSplit aria-hidden="true" size={17} stroke={1.8} />
                Split
              </button>
              <button
                className="reading-v2-table-builder__tool"
                type="button"
                onClick={() => commitHeaderRow(tableStimulus)}
              >
                Header Row
              </button>
              <button
                className="reading-v2-table-builder__tool"
                type="button"
                aria-haspopup="dialog"
                onClick={() => {
                  setPasteModalOpen(true);
                  onTableCompletionAction?.('table-paste-modal-opened', { taskGroupId: taskGroup.taskGroupId });
                }}
              >
                <IconFileImport aria-hidden="true" size={17} stroke={1.8} />
                Paste
              </button>
              <button
                className="reading-v2-table-builder__tool reading-v2-table-builder__tool--primary"
                type="button"
                disabled={selectedCellIds.size === 0}
                title="Insert or clear an inline blank marker in the selected cell."
                onClick={() => commitSelectedBlankState(tableStimulus)}
              >
                {blankActionLabel}
              </button>
              <button
                className="reading-v2-table-builder__tool"
                type="button"
                disabled={selectedCellIds.size === 0}
                onClick={clearSelection}
              >
                Clear selection
              </button>
            </div>
          </div>
          <div className="reading-v2-table-builder__selection-status" role="status" aria-label={selectionStatusText}>
            <span className="reading-v2-table-builder__selection-pill" data-active={selectedPlacements.length > 0 ? 'true' : 'false'} aria-hidden="true">
              <IconPointer aria-hidden="true" size={14} stroke={2} />
              {selectedPlacements.length}
              {' '}
              selected
            </span>
            {' '}
            <span className="reading-v2-table-builder__selection-pill" data-active={selectionMode ? 'true' : 'false'} aria-hidden="true">
              <IconBracketsContain aria-hidden="true" size={14} stroke={2} />
              Select cells
            </span>
            {' '}
            <span className="reading-v2-table-builder__selection-pill" data-active={mergeAvailable ? 'true' : 'false'} aria-hidden="true">
              <IconGitMerge aria-hidden="true" size={14} stroke={2} />
              Merge
            </span>
            {' '}
            <span className="reading-v2-table-builder__selection-pill" data-active={splitAvailable ? 'true' : 'false'} aria-hidden="true">
              <IconArrowsSplit aria-hidden="true" size={14} stroke={2} />
              Split
            </span>
            <span className="reading-v2-studio__sr-only">{selectionStatusText}</span>
          </div>
          {pasteModalOpen ? (
            <div className="reading-v2-build-modal__backdrop" role="presentation">
              <section
                className="reading-v2-build-modal reading-v2-table-builder__paste-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="reading-v2-table-paste-title"
              >
                <header className="reading-v2-build-modal__header">
                  <div>
                    <h2 id="reading-v2-table-paste-title">Paste Table</h2>
                    <p>Use tabs, pipes, or aligned columns. Type {TABLE_BLANK_MARKER} where the student should answer.</p>
                  </div>
                  <button
                    className="reading-v2-build__icon-button"
                    type="button"
                    aria-label="Close paste table modal"
                    onClick={() => setPasteModalOpen(false)}
                  >
                    Close
                  </button>
                </header>
                <div className="reading-v2-table-builder__paste-body">
                  <label>
                    Spreadsheet rows
                    <textarea
                      aria-label="Paste table from spreadsheet"
                      placeholder={'Header\tAnswer\nItem 1\t_____'}
                      value={pastedTableText}
                      onChange={(event) => setPastedTableText(event.currentTarget.value)}
                    />
                  </label>
                </div>
                <footer className="reading-v2-build-modal__footer">
                  <button
                    className="reading-v2-studio__button reading-v2-studio__button--quiet"
                    type="button"
                    onClick={() => setPasteModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="reading-v2-studio__button reading-v2-studio__button--primary"
                    type="button"
                    onClick={() => {
                      const parsedRows = parsePastedTable(pastedTableText);
                      if (parsedRows.length === 0) {
                        onTableCompletionAction?.('table-paste-empty', { taskGroupId: taskGroup.taskGroupId });
                        return;
                      }

                      const maxColumns = Math.max(...parsedRows.map((row) => row.length));
                      const nextRows = parsedRows.map((row, rowIndex) =>
                        Array.from({ length: maxColumns }, (_, cellIndex) => {
                          const value = row[cellIndex] ?? '';
                          const text = cleanPastedCellText(value);
                          const isBlank = countInlineBlankMarkers(text) > 0 || blankPattern.test(value);
                          return {
                            cellId: createCellId(taskGroup, rowIndex, cellIndex),
                            text,
                            role: rowIndex === 0 ? 'header' as const : 'body' as const,
                            isBlank,
                            rowSpan: 1,
                            colSpan: 1,
                          } satisfies ReadingV2TableCellContent;
                        }),
                      );

                      commitRows(tableStimulus, nextRows, 'table-paste-applied');
                      setPasteModalOpen(false);
                      clearSelection();
                    }}
                  >
                    Apply Pasted Table
                  </button>
                </footer>
              </section>
            </div>
          ) : null}
          <div className="reading-v2-table-builder__grid-scroll">
            <table className="reading-v2-table-builder__grid">
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={`table-row-${rowIndex}`}>
                    {row.map((cell, cellIndex) => {
                      const cellAnchorIds = getCellAnchorIds(cell);
                      const cellLinkedSelected = selectedLinkAnchorId
                        ? cellAnchorIds.some((anchorId) => anchorId === selectedLinkAnchorId)
                        : false;
                      const blankIndicators = cell.isBlank
                        ? cellAnchorIds.map((anchorId, anchorIndex) => {
                            const questionNumber = questionNumberByAnchorId.get(anchorId);
                            const interaction = interactionsByAnchorId.get(anchorId);
                            return (
                              <button
                                className="reading-v2-table-builder__blank-indicator"
                                type="button"
                                aria-label={`Reveal ${questionNumber ? `Question ${questionNumber}` : `blank ${anchorIndex + 1}`} table blank`}
                                data-linked-selected={selectedLinkAnchorId === anchorId ? 'true' : 'false'}
                                key={anchorId}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onQuestionLinkNavigation?.({
                                    anchorId,
                                    interactionId: interaction?.interactionId,
                                    taskGroupId: taskGroup.taskGroupId,
                                    source: 'block',
                                  });
                                }}
                              >
                                {questionNumber ?? anchorIndex + 1}
                              </button>
                            );
                          })
                        : [];

                      return (
                        <td
                          key={cell.cellId}
                          data-blank={cell.isBlank ? 'true' : 'false'}
                          data-linked-selected={cellLinkedSelected ? 'true' : 'false'}
                          data-role={cell.role ?? 'body'}
                          data-selected={selectedCellIds.has(cell.cellId) ? 'true' : 'false'}
                          rowSpan={cell.rowSpan}
                          colSpan={cell.colSpan}
                          onClick={(event) => {
                            const additive = event.ctrlKey || event.metaKey;
                            selectTableCell(cell.cellId, additive);
                          }}
                        >
                          <div className="reading-v2-table-builder__cell-editor">
                            <input
                              aria-label={`Table cell ${rowIndex + 1}.${cellIndex + 1} text`}
                              placeholder={cell.isBlank ? `Cell text with ${TABLE_BLANK_MARKER}` : 'Cell text'}
                              value={cell.text}
                              onFocus={(event) => {
                                if (!selectionMode) {
                                  selectCell(cell.cellId);
                                }
                                updateCellCaret(cell.cellId, event.currentTarget, true);
                              }}
                              onMouseUp={(event) => updateCellCaret(cell.cellId, event.currentTarget)}
                              onKeyUp={(event) => updateCellCaret(cell.cellId, event.currentTarget)}
                              onSelect={(event) => updateCellCaret(cell.cellId, event.currentTarget)}
                              onChange={(event) => {
                                const text = normalizeInlineBlankText(event.currentTarget.value);
                                const inlineBlankCount = countInlineBlankMarkers(text);
                                updateCellCaret(cell.cellId, event.currentTarget);
                                commitRows(
                                  tableStimulus,
                                  rows.map((currentRow, currentRowIndex) =>
                                    currentRowIndex === rowIndex
                                      ? currentRow.map((currentCell, currentCellIndex) =>
                                          currentCellIndex === cellIndex
                                            ? { ...currentCell, text, isBlank: inlineBlankCount > 0 }
                                            : currentCell,
                                        )
                                      : currentRow,
                                  ),
                                  'table-cell-updated',
                                  { row: rowIndex + 1, column: cellIndex + 1 },
                                );
                              }}
                            />
                            {blankIndicators.length > 0 ? (
                              <div className="reading-v2-table-builder__cell-indicators" aria-label={`Inline blanks for table cell ${rowIndex + 1}.${cellIndex + 1}`}>
                                {blankIndicators}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rowRemovalMessage || columnRemovalMessage ? (
            <p className="reading-v2-studio__muted" role="status">
              {[rowRemovalMessage, columnRemovalMessage].filter(Boolean).join(' ')}
            </p>
          ) : null}
        </section>
        <section className="reading-v2-table-builder__answers" aria-label="Blank and answer panel">
          <div className="reading-v2-table-builder__answers-heading">
            <h4>Answer Key</h4>
            <div className="reading-v2-table-builder__answer-controls">
              <button
                className="reading-v2-table-builder__preview-toggle"
                type="button"
                aria-controls="reading-v2-table-student-preview"
                aria-expanded={previewOpen}
                aria-label={previewOpen ? 'Hide student preview' : 'Show student preview'}
                onClick={() => {
                  setPreviewOpen((current) => !current);
                  onTableCompletionAction?.(previewOpen ? 'table-preview-collapsed' : 'table-preview-expanded', {
                    taskGroupId: taskGroup.taskGroupId,
                  });
                }}
              >
                <IconEye aria-hidden="true" size={18} stroke={1.9} />
              </button>
              <label>
                Word limit
                <select
                  aria-label="Table completion word limit"
                  value={taskGroup.answerRule.wordLimit ?? 2}
                  onChange={(event) => commitWordLimit(Number(event.currentTarget.value))}
                >
                  {IELTS_WORD_LIMIT_OPTIONS.map((wordLimitOption) => (
                    <option key={wordLimitOption} value={wordLimitOption}>
                      {wordLimitOption}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {missingAnswerCount > 0 ? (
            <p className="reading-v2-table-builder__warning" role="status">
              Missing answer key for {missingAnswerCount === 1 ? '1 blank' : `${missingAnswerCount} blanks`}
            </p>
          ) : null}
          {blankCells.length === 0 ? (
            <p className="reading-v2-studio__muted">Mark at least one table cell as a blank.</p>
          ) : null}
          <div className="reading-v2-table-builder__answer-grid">
            {blankCells.map(({ cell, rowIndex, cellIndex, anchorId, blankIndexInCell }, blankIndex) => {
              const interaction = interactionsByAnchorId.get(anchorId);
              const questionNumber = interaction ? questionNumberByInteractionId.get(interaction.interactionId) : undefined;
              const questionLabel = questionNumber ? `Question ${questionNumber}` : `Question ${blankIndex + 1}`;
              const answerComplete = interaction?.scoringRule.acceptableAnswers?.some((answer) => answer.trim().length > 0) ?? false;

              return (
                <div
                  className="reading-v2-table-builder__answer-card"
                  data-linked-selected={selectedLinkAnchorId === anchorId ? 'true' : 'false'}
                  data-needs-attention={!answerComplete ? 'true' : 'false'}
                  key={`${anchorId}-${rowIndex}-${cellIndex}`}
                >
                  <span className="reading-v2-table-builder__answer-number">
                    {questionNumber ?? blankIndex + 1}.
                  </span>
                  <span className="reading-v2-table-builder__answer-cell">
                    Cell {rowIndex + 1}.{cellIndex + 1}
                    {getCellAnchorIds(cell).length > 1 ? `, blank ${blankIndexInCell + 1}` : ''}
                  </span>
                  {interaction ? (
                    <>
                      <input
                        aria-label={`Correct answers for ${questionLabel}`}
                        placeholder="Enter answer..."
                        value={interaction.scoringRule.acceptableAnswers?.join(' | ') ?? ''}
                        onChange={(event) => commitInteractionAnswers(interaction, event.currentTarget.value)}
                      />
                      <button
                        className="reading-v2-studio__button reading-v2-studio__button--quiet"
                        type="button"
                        onClick={() => onQuestionLinkNavigation?.({
                          anchorId,
                          interactionId: interaction.interactionId,
                          taskGroupId: taskGroup.taskGroupId,
                          source: 'block',
                        })}
                      >
                        Reveal table blank
                      </button>
                    </>
                  ) : (
                    <button
                      className="reading-v2-studio__button reading-v2-studio__button--quiet"
                      type="button"
                      onClick={() => {
                        commitRows(tableStimulus, rows, 'table-repair-linked-question', {
                          anchorId,
                          row: rowIndex + 1,
                          column: cellIndex + 1,
                        });
                        onQuestionLinkRepair?.('table-blank-linked-question-created', {
                          anchorId,
                          taskGroupId: taskGroup.taskGroupId,
                        });
                        onQuestionLinkNavigation?.({
                          anchorId,
                          taskGroupId: taskGroup.taskGroupId,
                          source: 'repair',
                        });
                      }}
                    >
                      Create linked question
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {previewOpen ? (
            <section className="reading-v2-table-builder__preview" id="reading-v2-table-student-preview" aria-label="Student Preview">
              <h4>Student Preview</h4>
              <ReadingV2InstructionText
                text={getReadingV2InstructionText('table-completion', {
                  wordLimit: taskGroup.answerRule.wordLimit ?? 2,
                })}
              />
              {tableStimulus.title ? <h5>{tableStimulus.title}</h5> : null}
              <div className="reading-v2-table-builder__preview-scroll">
                <table>
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={`preview-row-${rowIndex}`}>
                        {row.map((cell, cellIndex) => {
                          const anchorIds = getCellAnchorIds(cell);
                          const questionNumbers = anchorIds
                            .map((anchorId) => questionNumberByAnchorId.get(anchorId))
                            .filter((questionNumber): questionNumber is number => typeof questionNumber === 'number');
                          const textSegments = normalizeInlineBlankText(cell.text).split(normalizedBlankMarkerPattern);

                          return (
                            <td
                              data-role={cell.role ?? 'body'}
                              key={`preview-cell-${cell.cellId ?? `${rowIndex}-${cellIndex}`}`}
                              rowSpan={cell.rowSpan}
                              colSpan={cell.colSpan}
                            >
                              {cell.isBlank ? (
                                <>
                                  {textSegments.map((segment, segmentIndex) => (
                                    <span key={`${cell.cellId ?? `${rowIndex}-${cellIndex}`}-segment-${segmentIndex}`}>
                                      {segment}
                                      {segmentIndex < textSegments.length - 1 ? (
                                        <>
                                          <strong>{questionNumbers[segmentIndex] ?? segmentIndex + 1}</strong>
                                          <span className="reading-v2-table-builder__preview-line" aria-hidden="true" />
                                        </>
                                      ) : null}
                                    </span>
                                  ))}
                                </>
                              ) : (
                                cell.text
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </section>
  );
}
