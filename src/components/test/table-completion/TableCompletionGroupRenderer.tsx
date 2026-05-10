import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { TableBlankDef, TableCellDef, TableCompletionGroupV1 } from '../../../types/tableCompletion';

import { isReadingAnswerEmpty } from '../readingAnswerState';
import {
  buildTableCompletionBlankBreadcrumbLabel,
  isSimpleTableCompletionGroup,
} from './tableCompletionRuntime';

type TableAnswerValue = string | string[] | Record<string, string> | null | undefined;

interface TableCompletionQuestionLike {
  number: number;
  blankId?: string;
}

interface TableCompletionGroupRendererProps {
  group: TableCompletionGroupV1;
  questions: TableCompletionQuestionLike[];
  answers: Record<number, TableAnswerValue>;
  onAnswerChange: (questionNumber: number, answer: string) => void;
  disabled?: boolean;
  mode?: 'desktop' | 'mobile';
  activeQuestionNumber?: number;
  onQuestionClick?: (questionNumber: number) => void;
  registerQuestionRef?: (questionNumber: number, element: HTMLElement | null) => void;
}

const TABLE_PRESENTATION_DIAG_PREFIX = '[Diag][TablePresentationAudit]';

const logTablePresentationDiag = (event: string, payload: Record<string, unknown>): void => {
  if (!import.meta.env.DEV) {
    return;
  }

  console.log(`${TABLE_PRESENTATION_DIAG_PREFIX} ${event}`, payload);
};

const surfaceStyle: React.CSSProperties = {
  background: 'white',
  padding: '1.25rem 0',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  border: '1px solid #d1d5db',
  fontSize: '15px',
  fontFamily: 'Arial, sans-serif',
};

const headerCellStyle: React.CSSProperties = {
  padding: '0.625rem 0.875rem',
  background: '#f1f5f9',
  borderBottom: '2px solid #94a3b8',
  fontWeight: 700,
  fontSize: '14px',
  color: '#374151',
  textAlign: 'left',
  letterSpacing: '0.05em',
};

const bodyCellBaseStyle: React.CSSProperties = {
  padding: '0.625rem 0.875rem',
  borderBottom: '1px solid #e5e7eb',
  borderRight: '1px solid #d1d5db',
  fontSize: '15px',
  lineHeight: 1.5,
  verticalAlign: 'top',
  color: '#111827',
};

const normalizeAnswerValue = (answer: TableAnswerValue): string => {
  if (answer === null || answer === undefined) {
    return '';
  }

  if (typeof answer === 'string') {
    return answer;
  }

  if (Array.isArray(answer)) {
    return answer.join(' | ');
  }

  return Object.values(answer).join(' | ');
};

const getCellPatternText = (
  cell: TableCellDef,
  targetAnchorId: string,
): string =>
  cell.segments
    .map((segment) => {
      if (segment.kind === 'text') {
        return segment.text;
      }

      return segment.anchorId === targetAnchorId ? '___' : '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

const getOrderedBlanks = (group: TableCompletionGroupV1): TableBlankDef[] => {
  const blankIdByOrderEntry = new Map(
    group.blanks.flatMap((blank) => [
      [blank.blankId, blank.blankId] as const,
      [blank.anchorId, blank.blankId] as const,
    ]),
  );
  const blankOrder = new Map<string, number>();

  group.canonicalReadingOrder.forEach((entry, index) => {
    const blankId = blankIdByOrderEntry.get(entry);
    if (blankId && !blankOrder.has(blankId)) {
      blankOrder.set(blankId, index);
    }
  });

  return [...group.blanks].sort((left, right) => {
    const leftOrder = blankOrder.get(left.blankId) ?? left.canonicalOrder;
    const rightOrder = blankOrder.get(right.blankId) ?? right.canonicalOrder;
    return leftOrder - rightOrder;
  });
};

const getCellColumnIndex = (
  group: TableCompletionGroupV1,
  cell: TableCellDef,
): number => {
  const column = group.columns.find((candidate) => candidate.columnId === cell.columnId);
  return column?.order ?? Number.MAX_SAFE_INTEGER;
};

export const TableCompletionGroupRenderer: React.FC<TableCompletionGroupRendererProps> = ({
  group,
  questions,
  answers,
  onAnswerChange,
  disabled = false,
  mode = 'desktop',
  activeQuestionNumber,
  onQuestionClick,
  registerQuestionRef,
}) => {
  const orderedBlanks = useMemo(() => getOrderedBlanks(group), [group]);
  const orderedRows = useMemo(
    () => [...group.rows].sort((left, right) => left.order - right.order),
    [group.rows],
  );
  const cellsById = useMemo(
    () => new Map(group.cells.map((cell) => [cell.cellId, cell])),
    [group.cells],
  );
  const blanksByAnchorId = useMemo(
    () => new Map(group.blanks.map((blank) => [blank.anchorId, blank])),
    [group.blanks],
  );
  const blanksByQuestionNumber = useMemo(
    () => new Map(group.blanks.map((blank) => [blank.questionNumber, blank])),
    [group.blanks],
  );
  const blankTargetRefs = useRef<Record<string, HTMLElement | null>>({});
  const [selectedBlankId, setSelectedBlankId] = useState<string | null>(orderedBlanks[0]?.blankId ?? null);

  useEffect(() => {
    if (!activeQuestionNumber) {
      return;
    }

    const matchingBlank = blanksByQuestionNumber.get(activeQuestionNumber);
    if (matchingBlank) {
      setSelectedBlankId(matchingBlank.blankId);
    }
  }, [activeQuestionNumber, blanksByQuestionNumber]);

  const isMobile = mode === 'mobile';
  const renderInlineInputs = !isMobile || isSimpleTableCompletionGroup(group);
  const questionNumbersInGroup = new Set(questions.map((question) => question.number));

  useEffect(() => {
    logTablePresentationDiag('group_rendered', {
      groupId: group.groupId,
      mode,
      questionRange: group.questionRange,
      blankNumbers: orderedBlanks.map((blank) => blank.questionNumber),
      blankCount: orderedBlanks.length,
      rowCount: group.rows.length,
      columnCount: group.columns.length,
      caption: group.sharedContent?.caption || null,
      columnHeaders: Array.from(
        new Set(orderedBlanks.flatMap((blank) => blank.breadcrumb.columnHeaders).filter(Boolean)),
      ),
      rowHeaders: Array.from(
        new Set(orderedBlanks.flatMap((blank) => blank.breadcrumb.rowHeaders).filter(Boolean)),
      ),
      renderInlineInputs,
      questionCount: questions.length,
    });
  }, [group, mode, orderedBlanks, questions.length, renderInlineInputs]);

  const setBlankTargetRef = (blank: TableBlankDef, element: HTMLElement | null) => {
    blankTargetRefs.current[blank.blankId] = element;
    registerQuestionRef?.(blank.questionNumber, element);
  };

  const scrollBlankIntoView = (blank: TableBlankDef) => {
    const target = blankTargetRefs.current[blank.blankId];
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    if ('focus' in target && typeof target.focus === 'function') {
      target.focus();
    }
  };

  const renderBlankInput = (blank: TableBlankDef) => {
    const value = normalizeAnswerValue(answers[blank.questionNumber]);
    const isSelected = selectedBlankId === blank.blankId;
    const breadcrumbLabel = buildTableCompletionBlankBreadcrumbLabel(blank);

    return (
      <input
        key={blank.blankId}
        ref={(element) => setBlankTargetRef(blank, element)}
        type="text"
        value={value}
        onChange={(event) => onAnswerChange(blank.questionNumber, event.target.value)}
        onFocus={() => {
          setSelectedBlankId(blank.blankId);
          onQuestionClick?.(blank.questionNumber);
        }}
        disabled={disabled}
        autoComplete="off"
        aria-label={`Question ${blank.questionNumber}: ${breadcrumbLabel}`}
        style={{
          border: `1px solid ${
            isSelected || !isReadingAnswerEmpty(answers[blank.questionNumber])
              ? 'rgb(65, 142, 200)'
              : 'rgb(83, 83, 83)'
          }`,
          borderRadius: '3px',
          padding: '2px 8px',
          fontSize: '14px',
          minHeight: '26px',
          width: isMobile ? '140px' : '160px',
          outline: 'none',
          background: disabled
            ? '#f8fafc'
            : !isReadingAnswerEmpty(answers[blank.questionNumber])
              ? 'rgba(65, 142, 200, 0.05)'
              : 'white',
          fontWeight: 500,
          color: 'rgb(65, 142, 200)',
          margin: '0 4px',
          verticalAlign: 'middle',
          boxShadow: isSelected ? '0 0 0 1px rgb(65, 142, 200)' : 'none',
        }}
      />
    );
  };

  const renderBlankMarker = (blank: TableBlankDef) => {
    const isSelected = selectedBlankId === blank.blankId;
    const answered = !isReadingAnswerEmpty(answers[blank.questionNumber]);
    const breadcrumbLabel = buildTableCompletionBlankBreadcrumbLabel(blank);

    return (
      <button
        key={blank.blankId}
        ref={(element) => setBlankTargetRef(blank, element)}
        type="button"
        onClick={() => {
          setSelectedBlankId(blank.blankId);
          onQuestionClick?.(blank.questionNumber);
        }}
        style={{
          border: `1px solid ${isSelected ? '#0f766e' : answered ? '#0284c7' : '#94a3b8'}`,
          borderRadius: '999px',
          padding: '0.125rem 0.5rem',
          background: isSelected ? '#ccfbf1' : answered ? '#e0f2fe' : '#f8fafc',
          color: isSelected ? '#115e59' : answered ? '#0c4a6e' : '#475569',
          fontSize: '0.75rem',
          fontWeight: 700,
          cursor: 'pointer',
          margin: '0 4px',
        }}
        aria-label={`Question ${blank.questionNumber}: ${breadcrumbLabel}`}
      >
        {blank.questionNumber}
      </button>
    );
  };

  const renderCellContent = (cell: TableCellDef) =>
    (() => {
      const anchorSegments = cell.segments.filter(
        (segment): segment is { kind: 'blank-anchor'; anchorId: string } =>
          segment.kind === 'blank-anchor',
      );
      const uniqueAnchorIds = Array.from(new Set(anchorSegments.map((segment) => segment.anchorId)));
      const hasRepeatedSingleBlank = anchorSegments.length > 1 && uniqueAnchorIds.length === 1;

      if (hasRepeatedSingleBlank) {
        const blank = blanksByAnchorId.get(uniqueAnchorIds[0]!);
        if (blank) {
          const patternText = getCellPatternText(cell, blank.anchorId);
          const hintText = patternText && patternText !== '___' ? patternText : '';

          return (
            <div
              key={`${cell.cellId}-${blank.blankId}-collapsed`}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '0.35rem',
              }}
            >
              {renderInlineInputs ? renderBlankInput(blank) : renderBlankMarker(blank)}
              {hintText ? (
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: '#64748b',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  }}
                >
                  {hintText}
                </span>
              ) : null}
            </div>
          );
        }
      }

      return cell.segments.map((segment, segmentIndex) => {
      if (segment.kind === 'text') {
        return <React.Fragment key={`${cell.cellId}-text-${segmentIndex}`}>{segment.text}</React.Fragment>;
      }

      const blank = blanksByAnchorId.get(segment.anchorId);
      if (!blank) {
        return null;
      }

      return renderInlineInputs ? renderBlankInput(blank) : renderBlankMarker(blank);
      });
    })();

  return (
    <div style={surfaceStyle}>
      {group.sharedContent.caption ? (
        <div
          style={{
            marginBottom: '0.75rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#475569',
          }}
        >
          {group.sharedContent.caption}
        </div>
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <tbody>
            {orderedRows.map((row, rowIndex) => {
              const rowCells = row.cellIds
                .map((cellId) => cellsById.get(cellId))
                .filter((cell): cell is TableCellDef => Boolean(cell))
                .sort((left, right) => getCellColumnIndex(group, left) - getCellColumnIndex(group, right));

              return (
                <tr
                  key={row.rowId}
                  style={{ background: rowIndex % 2 === 0 ? '#ffffff' : '#f9fafb' }}
                >
                  {rowCells.map((cell, cellIndex) => {
                    const isHeaderCell =
                      cell.role === 'column-header' || cell.role === 'row-header' || cell.role === 'title';
                    const CellTag = isHeaderCell ? 'th' : 'td';
                    const scope =
                      cell.role === 'column-header'
                        ? 'col'
                        : cell.role === 'row-header'
                          ? 'row'
                          : undefined;

                    return (
                      <CellTag
                        key={cell.cellId}
                        rowSpan={cell.rowSpan}
                        colSpan={cell.colSpan}
                        scope={scope}
                        style={{
                          ...(isHeaderCell ? headerCellStyle : bodyCellBaseStyle),
                          borderRight: cellIndex < rowCells.length - 1 ? '1px solid #d1d5db' : 'none',
                          textTransform: cell.role === 'column-header' ? 'uppercase' : 'none',
                          whiteSpace: cell.role === 'column-header' ? 'nowrap' : 'normal',
                          background: isHeaderCell ? '#f1f5f9' : rowIndex % 2 === 0 ? '#ffffff' : '#f9fafb',
                        }}
                      >
                        {renderCellContent(cell)}
                      </CellTag>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isMobile && !renderInlineInputs ? (
        <div
          style={{
            marginTop: '1rem',
            display: 'grid',
            gap: '0.75rem',
          }}
        >
          {orderedBlanks
            .filter((blank) => questionNumbersInGroup.has(blank.questionNumber))
            .map((blank) => {
              const answerValue = normalizeAnswerValue(answers[blank.questionNumber]);
              const answered = !isReadingAnswerEmpty(answers[blank.questionNumber]);
              const isSelected = selectedBlankId === blank.blankId;
              const breadcrumbLabel = buildTableCompletionBlankBreadcrumbLabel(blank);

              return (
                <button
                  key={blank.blankId}
                  type="button"
                  onClick={() => {
                    setSelectedBlankId(blank.blankId);
                    onQuestionClick?.(blank.questionNumber);
                    scrollBlankIntoView(blank);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: '0.5rem',
                    padding: '0.875rem',
                    borderRadius: '0.75rem',
                    border: `1px solid ${isSelected ? '#0f766e' : '#d1d5db'}`,
                    background: isSelected ? '#f0fdfa' : '#ffffff',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  aria-label={`Question ${blank.questionNumber}: ${breadcrumbLabel}`}
                >
                  <div
                    ref={(element) => registerQuestionRef?.(blank.questionNumber, element)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>
                        Question {blank.questionNumber}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#475569' }}>{breadcrumbLabel}</div>
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: answered ? '#0369a1' : '#64748b',
                      }}
                    >
                      {answered ? 'Answered' : 'Tap to locate'}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={answerValue}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => onAnswerChange(blank.questionNumber, event.target.value)}
                    onFocus={() => {
                      setSelectedBlankId(blank.blankId);
                      onQuestionClick?.(blank.questionNumber);
                    }}
                    disabled={disabled}
                    autoComplete="off"
                    aria-label={`Answer for question ${blank.questionNumber}: ${breadcrumbLabel}`}
                    style={{
                      border: `1px solid ${answered ? '#0284c7' : '#94a3b8'}`,
                      borderRadius: '0.5rem',
                      padding: '0.625rem 0.75rem',
                      fontSize: '0.9375rem',
                      color: '#0f172a',
                      background: disabled ? '#f8fafc' : '#ffffff',
                    }}
                  />
                </button>
              );
            })}
        </div>
      ) : null}
    </div>
  );
};

export default TableCompletionGroupRenderer;
