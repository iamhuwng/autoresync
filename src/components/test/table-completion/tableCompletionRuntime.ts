import type { TableBlankDef, TableCompletionGroupV1 } from '../../../types/tableCompletion';

export const buildTableCompletionBlankBreadcrumbLabel = (blank: TableBlankDef): string => {
  const rowLabel = blank.breadcrumb.rowHeaders.filter(Boolean).join(' / ');
  const columnLabel = blank.breadcrumb.columnHeaders.filter(Boolean).join(' / ');

  if (rowLabel && columnLabel) {
    return `${rowLabel} - ${columnLabel}`;
  }

  return rowLabel || columnLabel || `Question ${blank.questionNumber}`;
};

export const isSimpleTableCompletionGroup = (group: TableCompletionGroupV1): boolean => {
  if (group.columns.length > 3) {
    return false;
  }

  return group.cells.every((cell) => {
    const blankAnchorCount = cell.segments.filter(
      (segment) => segment.kind === 'blank-anchor',
    ).length;

    return cell.rowSpan === 1 && cell.colSpan === 1 && blankAnchorCount <= 1;
  });
};
