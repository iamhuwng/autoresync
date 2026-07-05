// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../../modern';
import type {
  GroupAcknowledgementsField,
  TableBlankDef,
  TableCellRole,
  TableCompletionDiagnostic,
  TableCompletionGroupV1,
} from '../../../types/tableCompletion';
import type { TableCompletionIssue } from '../../../services/test-creation/tableCompletionValidator';
import {
  rebuildTableCompletionGroupDerivedState,
  refreshTableCompletionCanonicalRevisionHash,
} from '../../../services/test-creation/tableCompletionCanonicalizer';
import {
  addTableCompletionRow,
  deleteTableCompletionRow,
  insertBlankAnchorInCell,
  mergeTableCompletionCell,
  removeBlankAnchor,
  splitTableCompletionCell,
  updateTableCompletionCellRole,
} from '../../../services/test-creation/tableCompletionRepair';

type UnsupportedRepairAction = 're-run-parse' | 'discard-grouped-candidate' | 'reclassify-away';
type TableCompletionReviewAction =
  | 'toggleTableRepairMode'
  | 'addTableRow'
  | 'deleteTableRow'
  | 'mergeTableCell'
  | 'splitTableCell'
  | 'changeTableCellRole'
  | 'insertTableBlankAnchor'
  | 'removeTableBlankAnchor'
  | 'acknowledgeGroupedWarning'
  | 'reRunGroupedParse'
  | 'discardGroupedCandidate'
  | 'reclassifyGroupedCandidate';

interface TableCompletionGroupReviewProps {
  group: TableCompletionGroupV1;
  issues: TableCompletionIssue[];
  diagnostic?: TableCompletionDiagnostic;
  acknowledgement?: GroupAcknowledgementsField[string];
  onGroupChange: (group: TableCompletionGroupV1) => void;
  onAcknowledgeIssues: (groupId: string, issueCodes: string[], canonicalRevisionHash: string) => void;
  onUnsupportedRepair: (groupId: string, action: UnsupportedRepairAction) => void;
  onReviewAction?: (action: TableCompletionReviewAction, metadata?: Record<string, unknown>) => void;
}

const getQuestionRangeLabel = (group: TableCompletionGroupV1): string =>
  `${group.questionRange.start}-${group.questionRange.end}`;

const getIssueTone = (severity: TableCompletionIssue['severity']): string => {
  if (severity === 'blocking') {
    return '#b91c1c';
  }
  if (severity === 'acknowledgement-required') {
    return '#b45309';
  }
  return '#1d4ed8';
};

const getCellTextValue = (group: TableCompletionGroupV1, cellId: string, segmentIndex: number): string => {
  const cell = group.cells.find((candidate) => candidate.cellId === cellId);
  const segment = cell?.segments[segmentIndex];

  if (!segment || segment.kind !== 'text') {
    return '';
  }

  return segment.text;
};

const getCellPatternText = (cell: TableCellDef, targetAnchorId: string): string =>
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

const getCellRoleOptions = (): Array<{ value: TableCellRole; label: string }> => [
  { value: 'title', label: 'Title' },
  { value: 'column-header', label: 'Column Header' },
  { value: 'row-header', label: 'Row Header' },
  { value: 'body', label: 'Body' },
  { value: 'note', label: 'Note' },
];

const updateCellTextSegment = (
  group: TableCompletionGroupV1,
  cellId: string,
  segmentIndex: number,
  text: string,
): TableCompletionGroupV1 =>
  rebuildTableCompletionGroupDerivedState({
    ...group,
    cells: group.cells.map((cell) => {
      if (cell.cellId !== cellId) {
        return cell;
      }

      return {
        ...cell,
        segments: cell.segments.map((segment, currentIndex) => {
          if (currentIndex !== segmentIndex || segment.kind !== 'text') {
            return segment;
          }

          return {
            ...segment,
            text,
          };
        }),
      };
    }),
  }, 'canonical-order');

const updateBlank = (
  group: TableCompletionGroupV1,
  blankId: string,
  updates: Partial<TableBlankDef>,
): TableCompletionGroupV1 =>
  rebuildTableCompletionGroupDerivedState({
    ...group,
    blanks: group.blanks.map((blank) =>
      blank.blankId === blankId
        ? {
            ...blank,
            ...updates,
          }
        : blank,
    ),
  }, 'canonical-order');

const updateSharedContent = (
  group: TableCompletionGroupV1,
  updates: Partial<TableCompletionGroupV1['sharedContent']>,
): TableCompletionGroupV1 =>
  refreshTableCompletionCanonicalRevisionHash({
    ...group,
    sharedContent: {
      ...group.sharedContent,
      ...updates,
      constraints: {
        ...group.sharedContent.constraints,
        ...(updates.constraints || {}),
      },
    },
  });

const badgeStyle = (background: string, border: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.2rem 0.5rem',
  borderRadius: '999px',
  background,
  border: `1px solid ${border}`,
  fontSize: '0.75rem',
  fontWeight: 700,
});

export const TableCompletionGroupReview: React.FC<TableCompletionGroupReviewProps> = ({
  group,
  issues,
  diagnostic,
  acknowledgement,
  onGroupChange,
  onAcknowledgeIssues,
  onUnsupportedRepair,
  onReviewAction,
}) => {
  const [selectedBlankId, setSelectedBlankId] = useState<string>(group.blanks[0]?.blankId || '');
  const [selectedCellId, setSelectedCellId] = useState<string>(group.cells[0]?.cellId || '');
  const [repairModeEnabled, setRepairModeEnabled] = useState<boolean>(
    diagnostic?.sourceOutcome === 'degraded-table-source' || issues.some((issue) => issue.severity === 'blocking'),
  );
  const selectedBlank = useMemo(
    () => group.blanks.find((blank) => blank.blankId === selectedBlankId) || group.blanks[0],
    [group.blanks, selectedBlankId],
  );
  const selectedCell = useMemo(
    () => group.cells.find((cell) => cell.cellId === selectedCellId) || group.cells[0],
    [group.cells, selectedCellId],
  );
  const selectedRow = useMemo(
    () => group.rows.find((row) => row.rowId === selectedCell?.rowId) || group.rows[0],
    [group.rows, selectedCell?.rowId],
  );
  const acknowledgementRequiredIssues = useMemo(
    () => issues.filter((issue) => issue.severity === 'acknowledgement-required'),
    [issues],
  );
  const acknowledgementRequiredCodes = acknowledgementRequiredIssues.map((issue) => issue.code);
  const isAcknowledged =
    acknowledgementRequiredCodes.length > 0 &&
    acknowledgement?.acknowledgedCanonicalRevisionHash === group.provenance.canonicalRevisionHash &&
    acknowledgementRequiredCodes.every((issueCode) =>
      acknowledgement.acknowledgedIssueCodes.includes(issueCode),
    );
  const issueStateLabel = issues.length === 0 ? 'No validation issues' : `${issues.length} issue(s)`;
  const cellsById = useMemo(
    () => new Map(group.cells.map((cell) => [cell.cellId, cell])),
    [group.cells],
  );
  const columnOrderById = useMemo(
    () => new Map(group.columns.map((column) => [column.columnId, column.order])),
    [group.columns],
  );
  const isRepairRecommended =
    repairModeEnabled
    || diagnostic?.sourceOutcome === 'degraded-table-source'
    || issues.some((issue) => issue.severity === 'blocking');
  const applyGroupChange = (
    nextGroup: TableCompletionGroupV1 | null,
    action?: TableCompletionReviewAction,
    metadata?: Record<string, unknown>,
  ) => {
    if (!nextGroup) {
      return;
    }

    if (action) {
      onReviewAction?.(action, {
        groupId: group.groupId,
        ...metadata,
      });
    }

    onGroupChange(nextGroup);
  };

  useEffect(() => {
    if (!group.blanks.some((blank) => blank.blankId === selectedBlankId)) {
      setSelectedBlankId(group.blanks[0]?.blankId || '');
    }
  }, [group.blanks, selectedBlankId]);

  useEffect(() => {
    if (!group.cells.some((cell) => cell.cellId === selectedCellId)) {
      setSelectedCellId(group.cells[0]?.cellId || '');
    }
  }, [group.cells, selectedCellId]);

  return (
    <div
      style={{
        display: 'grid',
        gap: '1rem',
        padding: '1rem',
        borderRadius: '16px',
        background: 'rgba(255, 255, 255, 0.8)',
        border: '1px solid rgba(148, 163, 184, 0.22)',
      }}
    >
      <section
        style={{
          padding: '1rem',
          borderRadius: '12px',
          background: 'rgba(248, 250, 252, 0.9)',
          border: '1px solid rgba(148, 163, 184, 0.18)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#475569' }}>
              Shared Content
            </div>
            <div style={{ marginTop: '0.35rem', fontSize: '0.9rem', color: '#0f172a' }}>
              Questions {getQuestionRangeLabel(group)}
            </div>
          </div>
          <span style={badgeStyle('rgba(15, 23, 42, 0.06)', 'rgba(148, 163, 184, 0.35)')}>
            {issueStateLabel}
          </span>
        </div>

        <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span style={{ fontWeight: 700, color: '#334155' }}>Instruction text</span>
            <textarea
              value={group.sharedContent.instructionText}
              onChange={(event) =>
                onGroupChange(updateSharedContent(group, { instructionText: event.target.value }))
              }
              rows={3}
              style={{ width: '100%', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.35)', padding: '0.75rem' }}
            />
          </label>

          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span style={{ fontWeight: 700, color: '#334155' }}>Answer rule</span>
            <textarea
              value={group.sharedContent.answerRuleText}
              onChange={(event) =>
                onGroupChange(updateSharedContent(group, { answerRuleText: event.target.value }))
              }
              rows={2}
              style={{ width: '100%', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.35)', padding: '0.75rem' }}
            />
          </label>

          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span style={{ fontWeight: 700, color: '#334155' }}>Caption / title</span>
            <input
              value={group.sharedContent.caption || ''}
              onChange={(event) =>
                onGroupChange(updateSharedContent(group, { caption: event.target.value || undefined }))
              }
              style={{ width: '100%', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.35)', padding: '0.75rem' }}
            />
          </label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Max words</span>
              <input
                type="number"
                min={1}
                value={group.sharedContent.constraints.maxWords ?? ''}
                onChange={(event) =>
                  onGroupChange(
                    updateSharedContent(group, {
                      constraints: {
                        maxWords: event.target.value ? Number(event.target.value) : undefined,
                      },
                    }),
                  )
                }
                style={{ width: '10rem', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.35)', padding: '0.75rem' }}
              />
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                paddingTop: '1.8rem',
                color: '#334155',
                fontWeight: 700,
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(group.sharedContent.constraints.includesNumber)}
                onChange={(event) =>
                  onGroupChange(
                    updateSharedContent(group, {
                      constraints: {
                        includesNumber: event.target.checked || undefined,
                      },
                    }),
                  )
                }
              />
              Includes numbers
            </label>
          </div>
        </div>
      </section>

      <section
        style={{
          padding: '1rem',
          borderRadius: '12px',
          background: 'rgba(248, 250, 252, 0.9)',
          border: '1px solid rgba(148, 163, 184, 0.18)',
        }}
      >
        <div style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#475569' }}>
          Validation Summary
        </div>
        <div style={{ marginTop: '0.35rem', fontSize: '0.9rem', color: '#334155' }}>
          Question range {getQuestionRangeLabel(group)}. Current state: {issueStateLabel}.
        </div>
        {diagnostic && (
          <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.75rem', color: '#334155', fontSize: '0.9rem' }}>
            <div>
              <strong>Parse mode:</strong> {diagnostic.parseMode} {' · '}
              <strong>Source workflow:</strong> {diagnostic.sourceWorkflow} {' · '}
              <strong>Source outcome:</strong> {diagnostic.sourceOutcome || 'deterministic-table'} {' · '}
              <strong>Source shape:</strong> {diagnostic.sourceShape}
            </div>
            <div>
              <strong>Validation severity:</strong> {diagnostic.validationSeverity} {' · '}
              <strong>Unsupported repair state:</strong> {diagnostic.unsupportedRepairState}
            </div>
            <div>
              <strong>Fallback kind:</strong> {diagnostic.fallbackKind || 'none'} {' · '}
              <strong>Loss flags:</strong> {diagnostic.lossFlags?.join(', ') || 'none'}
            </div>
            <div>
              <strong>Issue codes:</strong> {diagnostic.issueCodes.join(', ') || 'none'}
            </div>
            <div>
              <strong>Missing semantic breadcrumbs:</strong> {diagnostic.missingSemanticBreadcrumbs ? 'Yes' : 'No'}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: '0.5rem', marginTop: '1rem' }}>
          {issues.length === 0 ? (
            <div style={{ color: '#166534', fontWeight: 700 }}>This grouped candidate is currently publishable.</div>
          ) : (
            issues.map((issue) => (
              <div
                key={`${issue.code}-${issue.blankId || issue.cellId || issue.questionNumber || 'group'}`}
                style={{
                  padding: '0.75rem',
                  borderRadius: '10px',
                  border: `1px solid ${getIssueTone(issue.severity)}33`,
                  background: `${getIssueTone(issue.severity)}11`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                  <strong style={{ color: getIssueTone(issue.severity), textTransform: 'capitalize' }}>
                    {issue.severity}
                  </strong>
                  <span style={{ color: '#475569', fontSize: '0.85rem' }}>{issue.code}</span>
                </div>
                <div style={{ marginTop: '0.35rem', color: '#0f172a' }}>{issue.message}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section
        style={{
          padding: '1rem',
          borderRadius: '12px',
          background: 'rgba(248, 250, 252, 0.9)',
          border: '1px solid rgba(148, 163, 184, 0.18)',
        }}
      >
        <div style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#475569' }}>
          Acknowledgement
        </div>

        {acknowledgementRequiredIssues.length === 0 ? (
          <div style={{ marginTop: '0.5rem', color: '#166534', fontWeight: 700 }}>
            No acknowledgement-required issues for this group.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
            <div style={{ color: '#92400e' }}>
              Publishing stays blocked until the current acknowledgement-required issues are explicitly acknowledged for revision hash{' '}
              <code>{group.provenance.canonicalRevisionHash}</code>.
            </div>
            <Button
              variant={isAcknowledged ? 'success' : 'warning'}
              onClick={() => {
                onReviewAction?.('acknowledgeGroupedWarning', {
                  groupId: group.groupId,
                  issueCodeCount: acknowledgementRequiredCodes.length,
                });
                onAcknowledgeIssues(
                  group.groupId,
                  acknowledgementRequiredCodes,
                  group.provenance.canonicalRevisionHash,
                );
              }}
            >
              {isAcknowledged ? 'Acknowledged For Current Revision' : 'Acknowledge Current Warnings'}
            </Button>
          </div>
        )}
      </section>

      <section
        style={{
          padding: '1rem',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.95)',
          border: '1px solid rgba(148, 163, 184, 0.18)',
          overflowX: 'auto',
        }}
      >
        <div style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#475569' }}>
          Grouped Table Surface
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          <div style={{ color: isRepairRecommended ? '#92400e' : '#166534', fontWeight: 600 }}>
            {isRepairRecommended
              ? 'Manual structure repair is available for this grouped table.'
              : 'Manual structure repair stays optional for this grouped table.'}
          </div>
          <Button
            variant={repairModeEnabled ? 'warning' : 'outline'}
            onClick={() => {
              const nextValue = !repairModeEnabled;
              setRepairModeEnabled(nextValue);
              onReviewAction?.('toggleTableRepairMode', {
                groupId: group.groupId,
                active: nextValue,
              });
            }}
          >
            {repairModeEnabled ? 'Hide Manual Repair' : 'Enable Manual Repair'}
          </Button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.75rem' }}>
          <tbody>
            {group.rows
              .slice()
              .sort((left, right) => left.order - right.order)
              .map((row) => (
                <tr key={row.rowId}>
                  {row.cellIds
                    .map((cellId) => cellsById.get(cellId))
                    .filter((cell): cell is NonNullable<typeof cell> => Boolean(cell))
                    .sort(
                      (left, right) =>
                        (columnOrderById.get(left.columnId) || 0) - (columnOrderById.get(right.columnId) || 0),
                    )
                    .map((cell) => (
                      <td
                        key={cell.cellId}
                        rowSpan={cell.rowSpan}
                        colSpan={cell.colSpan}
                        onClick={() => setSelectedCellId(cell.cellId)}
                        style={{
                          verticalAlign: 'top',
                          minWidth: '12rem',
                          padding: '0.65rem',
                          border:
                            selectedCell?.cellId === cell.cellId
                              ? '2px solid #0f766e'
                              : '1px solid rgba(148, 163, 184, 0.35)',
                          background:
                            selectedCell?.cellId === cell.cellId
                              ? 'rgba(204, 251, 241, 0.25)'
                              : cell.role === 'column-header' || cell.role === 'row-header'
                                ? 'rgba(226, 232, 240, 0.55)'
                                : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'grid', gap: '0.45rem' }}>
                          {repairModeEnabled ? (
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
                              {cell.role}
                            </span>
                          ) : null}
                          {(() => {
                            const anchorSegments = cell.segments.filter(
                              (segment): segment is { kind: 'blank-anchor'; anchorId: string } =>
                                segment.kind === 'blank-anchor',
                            );
                            const uniqueAnchorIds = Array.from(
                              new Set(anchorSegments.map((segment) => segment.anchorId)),
                            );
                            const hasRepeatedSingleBlank =
                              !repairModeEnabled &&
                              anchorSegments.length > 1 &&
                              uniqueAnchorIds.length === 1;

                            if (hasRepeatedSingleBlank) {
                              const repeatedAnchorId = uniqueAnchorIds[0]!;
                              const repeatedBlank = group.blanks.find(
                                (blank) => blank.anchorId === repeatedAnchorId,
                              );

                              if (repeatedBlank) {
                                const patternText = getCellPatternText(cell, repeatedAnchorId);

                                return (
                                  <div
                                    key={`${cell.cellId}-${repeatedBlank.blankId}-collapsed`}
                                    style={{ display: 'grid', gap: '0.35rem' }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedCellId(cell.cellId);
                                        setSelectedBlankId(repeatedBlank.blankId);
                                      }}
                                      style={{
                                        textAlign: 'left',
                                        borderRadius: '8px',
                                        border:
                                          selectedBlank?.anchorId === repeatedAnchorId
                                            ? '2px solid #0f766e'
                                            : '1px solid rgba(15, 118, 110, 0.25)',
                                        background:
                                          selectedBlank?.anchorId === repeatedAnchorId
                                            ? 'rgba(15, 118, 110, 0.12)'
                                            : 'rgba(15, 118, 110, 0.06)',
                                        padding: '0.45rem 0.6rem',
                                        cursor: 'pointer',
                                        fontWeight: 700,
                                      }}
                                    >
                                      {repeatedBlank.questionNumber}
                                    </button>
                                    {patternText && patternText !== '___' ? (
                                      <span
                                        style={{
                                          fontSize: '0.75rem',
                                          color: '#64748b',
                                          fontFamily:
                                            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                        }}
                                      >
                                        {patternText}
                                      </span>
                                    ) : null}
                                  </div>
                                );
                              }
                            }

                            return cell.segments.map((segment, index) =>
                              segment.kind === 'text' ? (
                                <input
                                  key={`${cell.cellId}-${index}`}
                                  value={getCellTextValue(group, cell.cellId, index)}
                                  onChange={(event) =>
                                    applyGroupChange(
                                      updateCellTextSegment(group, cell.cellId, index, event.target.value),
                                    )
                                  }
                                  style={{
                                    width: '100%',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(148, 163, 184, 0.35)',
                                    padding: '0.5rem',
                                  }}
                                />
                              ) : (
                                <button
                                  key={`${segment.anchorId}-${index}`}
                                  type="button"
                                  onClick={() => {
                                    const nextBlankId =
                                      group.blanks.find((blank) => blank.anchorId === segment.anchorId)?.blankId ||
                                      selectedBlankId;
                                    setSelectedCellId(cell.cellId);
                                    setSelectedBlankId(nextBlankId);
                                  }}
                                  style={{
                                    textAlign: 'left',
                                    borderRadius: '8px',
                                    border:
                                      selectedBlank?.anchorId === segment.anchorId
                                        ? '2px solid #0f766e'
                                        : '1px solid rgba(15, 118, 110, 0.25)',
                                    background:
                                      selectedBlank?.anchorId === segment.anchorId
                                        ? 'rgba(15, 118, 110, 0.12)'
                                        : 'rgba(15, 118, 110, 0.06)',
                                    padding: '0.45rem 0.6rem',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                  }}
                                >
                                  {group.blanks.find((blank) => blank.anchorId === segment.anchorId)?.questionNumber ||
                                    'Blank'}
                                </button>
                              ),
                            );
                          })()}
                        </div>
                      </td>
                    ))}
                </tr>
              ))}
          </tbody>
        </table>

        {repairModeEnabled && selectedCell ? (
          <div
            style={{
              display: 'grid',
              gap: '0.75rem',
              marginTop: '1rem',
              padding: '0.85rem',
              borderRadius: '10px',
              background: 'rgba(248, 250, 252, 0.95)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
            }}
          >
            <div style={{ color: '#334155', fontWeight: 700 }}>
              Selected cell <code>{selectedCell.cellId}</code> in row <code>{selectedRow?.rowId}</code>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ fontWeight: 700, color: '#334155' }}>Cell role</span>
                <select
                  value={selectedCell.role}
                  onChange={(event) =>
                    applyGroupChange(
                      updateTableCompletionCellRole(
                        group,
                        selectedCell.cellId,
                        event.target.value as TableCellRole,
                      ),
                      'changeTableCellRole',
                      { cellId: selectedCell.cellId, role: event.target.value },
                    )
                  }
                  style={{ borderRadius: '8px', border: '1px solid rgba(148, 163, 184, 0.35)', padding: '0.55rem' }}
                >
                  {getCellRoleOptions().map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Button
                variant="outline"
                onClick={() => {
                  const nextGroup = addTableCompletionRow(group);
                  setSelectedCellId(nextGroup.rows[nextGroup.rows.length - 1]?.cellIds[0] || selectedCell.cellId);
                  applyGroupChange(nextGroup, 'addTableRow', { rowCount: nextGroup.rows.length });
                }}
              >
                Add Row
              </Button>
              <Button
                variant="warning"
                onClick={() => {
                  const nextGroup = selectedRow ? deleteTableCompletionRow(group, selectedRow.rowId) : null;
                  setSelectedCellId(nextGroup?.rows[0]?.cellIds[0] || '');
                  applyGroupChange(nextGroup, 'deleteTableRow', { rowId: selectedRow?.rowId });
                }}
              >
                Delete Selected Row
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  applyGroupChange(
                    mergeTableCompletionCell(group, selectedCell.cellId, 'horizontal'),
                    'mergeTableCell',
                    { cellId: selectedCell.cellId, direction: 'horizontal' },
                  )
                }
              >
                Merge Right
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  applyGroupChange(
                    mergeTableCompletionCell(group, selectedCell.cellId, 'vertical'),
                    'mergeTableCell',
                    { cellId: selectedCell.cellId, direction: 'vertical' },
                  )
                }
              >
                Merge Down
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  applyGroupChange(
                    splitTableCompletionCell(group, selectedCell.cellId, 'horizontal'),
                    'splitTableCell',
                    { cellId: selectedCell.cellId, direction: 'horizontal' },
                  )
                }
              >
                Split Horizontal
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  applyGroupChange(
                    splitTableCompletionCell(group, selectedCell.cellId, 'vertical'),
                    'splitTableCell',
                    { cellId: selectedCell.cellId, direction: 'vertical' },
                  )
                }
              >
                Split Vertical
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  applyGroupChange(
                    insertBlankAnchorInCell(group, selectedCell.cellId),
                    'insertTableBlankAnchor',
                    { cellId: selectedCell.cellId },
                  )
                }
              >
                Insert Blank
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  applyGroupChange(
                    selectedBlank ? removeBlankAnchor(group, selectedBlank.blankId) : null,
                    'removeTableBlankAnchor',
                    { blankId: selectedBlank?.blankId },
                  )
                }
              >
                Remove Selected Blank
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section
        style={{
          padding: '1rem',
          borderRadius: '12px',
          background: 'rgba(248, 250, 252, 0.9)',
          border: '1px solid rgba(148, 163, 184, 0.18)',
        }}
      >
        <div style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#475569' }}>
          Per-Blank Inspector
        </div>

        {selectedBlank ? (
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ fontWeight: 700, color: '#334155' }}>Question number</span>
                <input
                  type="number"
                  min={group.questionRange.start}
                  max={group.questionRange.end}
                  value={selectedBlank.questionNumber}
                  onChange={(event) =>
                    onGroupChange(
                      updateBlank(group, selectedBlank.blankId, {
                        questionNumber: Number(event.target.value) || selectedBlank.questionNumber,
                      }),
                    )
                  }
                  style={{ width: '9rem', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.35)', padding: '0.75rem' }}
                />
              </label>

              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ fontWeight: 700, color: '#334155' }}>Canonical order</span>
                <input
                  type="number"
                  min={1}
                  value={selectedBlank.canonicalOrder + 1}
                  onChange={(event) =>
                    onGroupChange(
                      updateBlank(group, selectedBlank.blankId, {
                        canonicalOrder: event.target.value
                          ? Math.max(Number(event.target.value) - 1, 0)
                          : selectedBlank.canonicalOrder,
                      }),
                    )
                  }
                  style={{ width: '9rem', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.35)', padding: '0.75rem' }}
                />
              </label>
            </div>

            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Accepted answers</span>
              <input
                value={selectedBlank.acceptedAnswers.join(', ')}
                onChange={(event) =>
                  onGroupChange(
                    updateBlank(group, selectedBlank.blankId, {
                      acceptedAnswers: event.target.value
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean),
                    }),
                  )
                }
                style={{ width: '100%', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.35)', padding: '0.75rem' }}
              />
            </label>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ fontWeight: 700, color: '#334155' }}>Blank max words</span>
                <input
                  type="number"
                  min={1}
                  value={selectedBlank.constraints.maxWords ?? ''}
                  onChange={(event) =>
                    onGroupChange(
                      updateBlank(group, selectedBlank.blankId, {
                        constraints: {
                          ...selectedBlank.constraints,
                          maxWords: event.target.value ? Number(event.target.value) : undefined,
                        },
                      }),
                    )
                  }
                  style={{ width: '10rem', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.35)', padding: '0.75rem' }}
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  paddingTop: '1.8rem',
                  color: '#334155',
                  fontWeight: 700,
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(selectedBlank.constraints.includesNumber)}
                  onChange={(event) =>
                    onGroupChange(
                      updateBlank(group, selectedBlank.blankId, {
                        constraints: {
                          ...selectedBlank.constraints,
                          includesNumber: event.target.checked || undefined,
                        },
                      }),
                    )
                  }
                />
                Includes number
              </label>
            </div>

            <div style={{ color: '#334155' }}>
              <strong>Breadcrumbs:</strong>{' '}
              {selectedBlank.breadcrumb.rowHeaders.join(' / ') || 'No row lineage'}{' '}
              {' · '}
              {selectedBlank.breadcrumb.columnHeaders.join(' / ') || 'No column lineage'}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: '0.75rem', color: '#64748b' }}>Select a blank anchor in the table surface.</div>
        )}
      </section>

      <section
        style={{
          padding: '1rem',
          borderRadius: '12px',
          background: 'rgba(255, 247, 237, 0.7)',
          border: '1px solid rgba(251, 146, 60, 0.25)',
        }}
      >
        <div style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9a3412' }}>
          Unsupported Repair Actions
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.75rem' }}>
          <Button
            variant="outline"
            onClick={() => {
              onReviewAction?.('reRunGroupedParse', { groupId: group.groupId });
              onUnsupportedRepair(group.groupId, 're-run-parse');
            }}
          >
            Re-run parse
          </Button>
          <Button
            variant="warning"
            onClick={() => {
              onReviewAction?.('discardGroupedCandidate', { groupId: group.groupId });
              onUnsupportedRepair(group.groupId, 'discard-grouped-candidate');
            }}
          >
            Discard grouped candidate
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onReviewAction?.('reclassifyGroupedCandidate', { groupId: group.groupId });
              onUnsupportedRepair(group.groupId, 'reclassify-away');
            }}
          >
            Reclassify away from table-completion
          </Button>
        </div>
      </section>
    </div>
  );
};

export type {
  TableCompletionReviewAction,
  UnsupportedRepairAction,
  TableCompletionGroupReviewProps,
};
