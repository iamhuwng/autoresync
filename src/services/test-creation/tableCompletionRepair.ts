import type {
  TableBlankDef,
  TableCellDef,
  TableCellRole,
  TableCompletionGroupV1,
  TableContentSegment,
  TableRowDef,
} from '../../types/tableCompletion';
import { rebuildTableCompletionGroupDerivedState } from './tableCompletionCanonicalizer';

export type TableRepairDirection = 'horizontal' | 'vertical';

interface CellRect {
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
}

const sortRows = (group: TableCompletionGroupV1): TableRowDef[] =>
  [...group.rows].sort((left, right) => left.order - right.order);

const sortColumns = (group: TableCompletionGroupV1) =>
  [...group.columns].sort((left, right) => left.order - right.order);

const buildCellRects = (group: TableCompletionGroupV1): Map<string, CellRect> => {
  const rowOrder = new Map(sortRows(group).map((row, index) => [row.rowId, index]));
  const columnOrder = new Map(sortColumns(group).map((column, index) => [column.columnId, index]));

  return new Map(
    group.cells.map((cell) => {
      const rowStart = rowOrder.get(cell.rowId) ?? 0;
      const columnStart = columnOrder.get(cell.columnId) ?? 0;

      return [
        cell.cellId,
        {
          rowStart,
          rowEnd: rowStart + cell.rowSpan - 1,
          columnStart,
          columnEnd: columnStart + cell.colSpan - 1,
        },
      ];
    }),
  );
};

const buildRowCellIds = (rows: TableRowDef[], cells: TableCellDef[], group: TableCompletionGroupV1): TableRowDef[] => {
  const columnOrder = new Map(sortColumns(group).map((column, index) => [column.columnId, index]));
  return rows.map((row, index) => ({
    ...row,
    order: index,
    cellIds: cells
      .filter((cell) => cell.rowId === row.rowId)
      .sort(
        (left, right) =>
          (columnOrder.get(left.columnId) ?? 0) - (columnOrder.get(right.columnId) ?? 0),
      )
      .map((cell) => cell.cellId),
  }));
};

const mergeAdjacentTextSegments = (segments: TableContentSegment[]): TableContentSegment[] =>
  segments.reduce<TableContentSegment[]>((acc, segment) => {
    if (segment.kind !== 'text') {
      acc.push(segment);
      return acc;
    }

    const previous = acc[acc.length - 1];
    if (previous?.kind === 'text') {
      previous.text += segment.text;
      return acc;
    }

    acc.push({ ...segment });
    return acc;
  }, []);

const makeRepairId = (prefix: string, existingIds: Iterable<string>): string => {
  const ids = new Set(existingIds);
  let index = 1;

  while (ids.has(`${prefix}-${index}`)) {
    index += 1;
  }

  return `${prefix}-${index}`;
};

const collectVisualBlankOrder = (group: TableCompletionGroupV1): string[] => {
  const cellsById = new Map(group.cells.map((cell) => [cell.cellId, cell]));
  const columnOrder = new Map(sortColumns(group).map((column, index) => [column.columnId, index]));
  const blankIdByAnchorId = new Map(group.blanks.map((blank) => [blank.anchorId, blank.blankId]));
  const orderedBlankIds: string[] = [];

  sortRows(group).forEach((row) => {
    row.cellIds
      .map((cellId) => cellsById.get(cellId))
      .filter((cell): cell is TableCellDef => Boolean(cell))
      .sort(
        (left, right) =>
          (columnOrder.get(left.columnId) ?? 0) - (columnOrder.get(right.columnId) ?? 0),
      )
      .forEach((cell) => {
        cell.segments.forEach((segment) => {
          if (segment.kind !== 'blank-anchor') {
            return;
          }

          const blankId = blankIdByAnchorId.get(segment.anchorId);
          if (blankId && !orderedBlankIds.includes(blankId)) {
            orderedBlankIds.push(blankId);
          }
        });
      });
  });

  return orderedBlankIds;
};

const finalizeRepairGroup = (group: TableCompletionGroupV1): TableCompletionGroupV1 => {
  const rows = sortRows(group).map((row) => ({ ...row }));
  const rowIds = new Set(rows.map((row) => row.rowId));
  const columnIds = new Set(group.columns.map((column) => column.columnId));
  const cells = group.cells
    .filter((cell) => rowIds.has(cell.rowId) && columnIds.has(cell.columnId))
    .map((cell) => ({
      ...cell,
      rowSpan: Math.max(cell.rowSpan, 1),
      colSpan: Math.max(cell.colSpan, 1),
      segments: mergeAdjacentTextSegments(cell.segments),
    }));
  const cellIds = new Set(cells.map((cell) => cell.cellId));
  const anchorIds = new Set(
    cells.flatMap((cell) =>
      cell.segments
        .filter((segment): segment is Extract<TableContentSegment, { kind: 'blank-anchor' }> =>
          segment.kind === 'blank-anchor',
        )
        .map((segment) => segment.anchorId),
    ),
  );
  const filteredBlanks = group.blanks.filter(
    (blank) => cellIds.has(blank.cellId) && anchorIds.has(blank.anchorId),
  );
  const blankMap = new Map(filteredBlanks.map((blank) => [blank.blankId, blank]));
  const orderedBlankIds = collectVisualBlankOrder({
    ...group,
    rows,
    cells,
    blanks: filteredBlanks,
  });
  const fallbackBlankIds = filteredBlanks
    .map((blank) => blank.blankId)
    .filter((blankId) => !orderedBlankIds.includes(blankId));
  const canonicalReadingOrder = [...orderedBlankIds, ...fallbackBlankIds];
  const startingQuestionNumber = group.questionRange.start || 1;
  const blanks = canonicalReadingOrder
    .map((blankId, index) => {
      const blank = blankMap.get(blankId);
      if (!blank) {
        return null;
      }

      return {
        ...blank,
        questionNumber: startingQuestionNumber + index,
        canonicalOrder: index,
      };
    })
    .filter((blank): blank is TableBlankDef => Boolean(blank));
  const nextRows = buildRowCellIds(rows, cells, group);

  return rebuildTableCompletionGroupDerivedState(
    {
      ...group,
      rows: nextRows,
      cells,
      blanks,
      canonicalReadingOrder,
    },
    'canonical-reading-order',
  );
};

const joinCellSegments = (
  leftSegments: TableContentSegment[],
  rightSegments: TableContentSegment[],
  separator: string,
): TableContentSegment[] =>
  mergeAdjacentTextSegments([
    ...leftSegments,
    ...(leftSegments.length > 0 && rightSegments.length > 0
      ? [{ kind: 'text', text: separator } satisfies TableContentSegment]
      : []),
    ...rightSegments,
  ]);

export const addTableCompletionRow = (group: TableCompletionGroupV1): TableCompletionGroupV1 => {
  const existingRowIds = group.rows.map((row) => row.rowId);
  const existingCellIds = group.cells.map((cell) => cell.cellId);
  const newRowId = makeRepairId('repair-row', existingRowIds);
  const usedCellIds = new Set(existingCellIds);
  const newCells = sortColumns(group).map((column, index) => {
    const cellId = makeRepairId('repair-cell', usedCellIds);
    usedCellIds.add(cellId);

    return {
      cellId,
      rowId: newRowId,
      columnId: column.columnId,
      rowSpan: 1,
      colSpan: 1,
      role: index === 0 && group.columns.length > 1 ? 'row-header' : 'body',
      segments: [],
    };
  }) as TableCellDef[];

  return finalizeRepairGroup({
    ...group,
    rows: [
      ...sortRows(group),
      {
        rowId: newRowId,
        order: group.rows.length,
        cellIds: newCells.map((cell) => cell.cellId),
      },
    ],
    cells: [...group.cells, ...newCells],
  });
};

export const deleteTableCompletionRow = (
  group: TableCompletionGroupV1,
  rowId: string,
): TableCompletionGroupV1 | null => {
  const rows = sortRows(group);
  const rowIndex = rows.findIndex((row) => row.rowId === rowId);
  if (rowIndex < 0 || rows.length <= 1) {
    return null;
  }

  const nextRowId = rows[rowIndex + 1]?.rowId;
  const cellRects = buildCellRects(group);
  const keptCells = group.cells
    .flatMap((cell) => {
      const rect = cellRects.get(cell.cellId);
      if (!rect) {
        return [];
      }

      if (cell.rowId === rowId) {
        if (cell.rowSpan > 1 && nextRowId) {
          return [
            {
              ...cell,
              rowId: nextRowId,
              rowSpan: cell.rowSpan - 1,
            },
          ];
        }

        return [];
      }

      if (rect.rowStart < rowIndex && rect.rowEnd >= rowIndex) {
        return [
          {
            ...cell,
            rowSpan: Math.max(cell.rowSpan - 1, 1),
          },
        ];
      }

      return [cell];
    });

  return finalizeRepairGroup({
    ...group,
    rows: rows.filter((row) => row.rowId !== rowId),
    cells: keptCells,
  });
};

export const updateTableCompletionCellRole = (
  group: TableCompletionGroupV1,
  cellId: string,
  role: TableCellRole,
): TableCompletionGroupV1 =>
  finalizeRepairGroup({
    ...group,
    cells: group.cells.map((cell) => (cell.cellId === cellId ? { ...cell, role } : cell)),
  });

export const mergeTableCompletionCell = (
  group: TableCompletionGroupV1,
  cellId: string,
  direction: TableRepairDirection,
): TableCompletionGroupV1 | null => {
  const targetCell = group.cells.find((cell) => cell.cellId === cellId);
  if (!targetCell) {
    return null;
  }

  const cellRects = buildCellRects(group);
  const targetRect = cellRects.get(cellId);
  if (!targetRect) {
    return null;
  }

  const candidate = group.cells.find((cell) => {
    if (cell.cellId === cellId) {
      return false;
    }

    const rect = cellRects.get(cell.cellId);
    if (!rect) {
      return false;
    }

    if (direction === 'horizontal') {
      return (
        rect.rowStart === targetRect.rowStart
        && rect.rowEnd === targetRect.rowEnd
        && rect.columnStart === targetRect.columnEnd + 1
      );
    }

    return (
      rect.columnStart === targetRect.columnStart
      && rect.columnEnd === targetRect.columnEnd
      && rect.rowStart === targetRect.rowEnd + 1
    );
  });

  if (!candidate) {
    return null;
  }

  const mergedCells = group.cells
    .filter((cell) => cell.cellId !== candidate.cellId)
    .map((cell) => {
      if (cell.cellId !== targetCell.cellId) {
        return cell;
      }

      return {
        ...cell,
        rowSpan: direction === 'vertical' ? cell.rowSpan + candidate.rowSpan : cell.rowSpan,
        colSpan: direction === 'horizontal' ? cell.colSpan + candidate.colSpan : cell.colSpan,
        segments: joinCellSegments(
          cell.segments,
          candidate.segments,
          direction === 'horizontal' ? ' ' : '\n',
        ),
      };
    });
  const blanks = group.blanks.map((blank) =>
    blank.cellId === candidate.cellId ? { ...blank, cellId: targetCell.cellId } : blank,
  );

  return finalizeRepairGroup({
    ...group,
    cells: mergedCells,
    blanks,
  });
};

export const splitTableCompletionCell = (
  group: TableCompletionGroupV1,
  cellId: string,
  direction: TableRepairDirection,
): TableCompletionGroupV1 | null => {
  const targetCell = group.cells.find((cell) => cell.cellId === cellId);
  if (!targetCell) {
    return null;
  }

  const cellRects = buildCellRects(group);
  const targetRect = cellRects.get(cellId);
  if (!targetRect) {
    return null;
  }

  if (direction === 'horizontal' && targetCell.colSpan <= 1) {
    return null;
  }
  if (direction === 'vertical' && targetCell.rowSpan <= 1) {
    return null;
  }

  const rows = sortRows(group);
  const columns = sortColumns(group);
  const newCellId = makeRepairId('repair-cell', group.cells.map((cell) => cell.cellId));
  const newCell: TableCellDef =
    direction === 'horizontal'
      ? {
          ...targetCell,
          cellId: newCellId,
          columnId: columns[targetRect.columnEnd]?.columnId || targetCell.columnId,
          colSpan: 1,
          segments: [],
        }
      : {
          ...targetCell,
          cellId: newCellId,
          rowId: rows[targetRect.rowEnd]?.rowId || targetCell.rowId,
          rowSpan: 1,
          segments: [],
        };

  const nextCells = group.cells.map((cell) => {
    if (cell.cellId !== targetCell.cellId) {
      return cell;
    }

    return {
      ...cell,
      colSpan: direction === 'horizontal' ? cell.colSpan - 1 : cell.colSpan,
      rowSpan: direction === 'vertical' ? cell.rowSpan - 1 : cell.rowSpan,
    };
  });

  return finalizeRepairGroup({
    ...group,
    cells: [...nextCells, newCell],
  });
};

export const insertBlankAnchorInCell = (
  group: TableCompletionGroupV1,
  cellId: string,
): TableCompletionGroupV1 | null => {
  const targetCell = group.cells.find((cell) => cell.cellId === cellId);
  if (!targetCell) {
    return null;
  }

  const blankId = makeRepairId('repair-blank', group.blanks.map((blank) => blank.blankId));
  const anchorId = makeRepairId('repair-anchor', group.blanks.map((blank) => blank.anchorId));
  const nextCells = group.cells.map((cell) => {
    if (cell.cellId !== cellId) {
      return cell;
    }

    return {
      ...cell,
      segments: mergeAdjacentTextSegments([
        ...cell.segments,
        ...(cell.segments.length > 0
          ? [{ kind: 'text', text: ' ' } satisfies TableContentSegment]
          : []),
        { kind: 'blank-anchor', anchorId },
      ]),
    };
  });

  return finalizeRepairGroup({
    ...group,
    cells: nextCells,
    blanks: [
      ...group.blanks,
      {
        blankId,
        questionNumber: group.questionRange.end + 1,
        anchorId,
        cellId,
        canonicalOrder: group.blanks.length,
        acceptedAnswers: [],
        constraints: { ...group.sharedContent.constraints },
        breadcrumb: {
          rowHeaders: [],
          columnHeaders: [],
        },
      },
    ],
  });
};

export const removeBlankAnchor = (
  group: TableCompletionGroupV1,
  blankId: string,
): TableCompletionGroupV1 | null => {
  const targetBlank = group.blanks.find((blank) => blank.blankId === blankId);
  if (!targetBlank) {
    return null;
  }

  return finalizeRepairGroup({
    ...group,
    cells: group.cells.map((cell) => ({
      ...cell,
      segments: mergeAdjacentTextSegments(
        cell.segments.filter(
          (segment) =>
            segment.kind !== 'blank-anchor' || segment.anchorId !== targetBlank.anchorId,
        ),
      ),
    })),
    blanks: group.blanks.filter((blank) => blank.blankId !== blankId),
  });
};
