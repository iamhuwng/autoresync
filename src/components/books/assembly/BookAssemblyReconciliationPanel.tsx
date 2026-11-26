import { useEffect, useRef, useState } from 'react';
import type { BookAssemblyChangeClass, BookAssemblyReconciliationChange, BookAssemblyReconciliationReport } from '../../../services/book-assembly/reconciliation.service';

export interface BookAssemblyReconciliationPanelProps {
  readonly report: BookAssemblyReconciliationReport;
  readonly busy: boolean;
  readonly onApplyExactRepair: () => void;
  readonly onUseCurrent?: (change: BookAssemblyReconciliationChange) => void;
  readonly onUseProposed?: (change: BookAssemblyReconciliationChange) => void;
}

const repairLabel = (repair: BookAssemblyReconciliationReport['issues'][number]['repair']): string =>
  repair === 'exact' ? 'Auto-fix available' : repair === 'teacher-choice' ? 'Needs your update' : 'Note';

const CHANGE_CLASS_LABELS: Readonly<Record<BookAssemblyChangeClass, string>> = {
  added: 'Added',
  removed: 'Removed',
  renamed: 'Renamed',
  reordered: 'Reordered',
  moved: 'Moved',
  'page-mapping-changed': 'Page mapping changed',
  'source-replaced': 'PDF file replaced',
  unresolved: 'Needs fix',
};

const humanizeItemLocation = (raw: string): string => {
  if (raw === '$.nodes') return 'Book outline';
  if (raw === '$.units') return 'Units';
  if (raw.startsWith('$.sourceSet')) return 'PDF file setup';
  if (raw.startsWith('$.units[')) {
    const unitMatch = /^\$\.units\[(\d+)\](?:\.pageGroups\[(\d+)\])?(?:\.activitySlots\[(\d+)\])?/u.exec(raw);
    if (unitMatch) {
      const unitNum = Number(unitMatch[1]) + 1;
      if (unitMatch[2] !== undefined) return `Unit ${unitNum} · Page group ${Number(unitMatch[2]) + 1}`;
      if (unitMatch[3] !== undefined) return `Unit ${unitNum} · Activity ${Number(unitMatch[3]) + 1}`;
      return `Unit ${unitNum}`;
    }
  }
  return raw;
};

const BookAssemblyReconciliationPanel = ({
  report,
  busy,
  onApplyExactRepair,
  onUseCurrent,
  onUseProposed,
}: BookAssemblyReconciliationPanelProps) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const priorIssueCount = useRef(report.issues.length);
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [category, setCategory] = useState<'all' | BookAssemblyChangeClass>('all');

  useEffect(() => {
    if (priorIssueCount.current > 0 && report.issues.length === 0) headingRef.current?.focus();
    priorIssueCount.current = report.issues.length;
  }, [report.issues.length]);
  const visibleChanges = report.changes.filter((change) =>
    (!unresolvedOnly || change.resolution !== 'automatic')
    && (category === 'all' || change.changeClass === category));
  const unresolvedChanges = report.changes.filter((change) => change.resolution !== 'automatic');
  const blockingIssues = report.issues.filter((entry) => entry.severity === 'blocker');
  const advisoryIssues = report.issues.filter((entry) => entry.severity !== 'blocker');

  return (
    <section className="book-assembly-workspace__reconciliation" aria-labelledby="book-assembly-reconciliation-title">
      <div className="book-assembly-workspace__section-heading">
        <div>
          <h2 id="book-assembly-reconciliation-title" ref={headingRef} tabIndex={-1}>Review changes before saving</h2>
          <p>{blockingIssues.length > 0
            ? 'Fix the highlighted items below before saving your draft.'
            : unresolvedChanges.length > 0
              ? 'Choose whether to keep the previous value or use your update for each change below.'
              : 'Review notes about your current page mapping.'}</p>
        </div>
        {report.canApplyExactRepair && (
          <button type="button" disabled={busy} onClick={onApplyExactRepair}>
            {busy ? 'Applying fix…' : 'Apply exact repairs'}
          </button>
        )}
      </div>
      {report.changes.length > 0 && (
        <>
          <div className="book-assembly-reconciliation__summary" role="status">
            {report.changes.length} change{report.changes.length === 1 ? '' : 's'} · {unresolvedChanges.length} to confirm
          </div>
          <div className="book-assembly-reconciliation__filters">
            <label><input type="checkbox" checked={unresolvedOnly} onChange={(event) => setUnresolvedOnly(event.target.checked)} /> Unresolved only</label>
            <label>Change class <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
              <option value="all">All changes</option>
              {(['added', 'removed', 'renamed', 'reordered', 'moved', 'page-mapping-changed', 'source-replaced', 'unresolved'] as const).map((value) => (
                <option key={value} value={value}>{CHANGE_CLASS_LABELS[value]}</option>
              ))}
            </select></label>
          </div>
          <div className="book-assembly-reconciliation__grid" aria-label="Content tree reconciliation">
            <strong>Current Content Tree</strong><strong>Proposed Content Tree</strong><strong>Resolution and Preview</strong>
            {visibleChanges.length === 0 ? <p className="book-assembly-reconciliation__empty">No matching changes.</p> : visibleChanges.map((change) => (
              <div className="book-assembly-reconciliation__row" key={change.id}>
                <div><span>{CHANGE_CLASS_LABELS[change.changeClass]}</span><strong title={change.itemKey}>{humanizeItemLocation(change.itemKey)}</strong><p>{change.current}</p></div>
                <div><span>{CHANGE_CLASS_LABELS[change.changeClass]}</span><strong title={change.itemKey}>{humanizeItemLocation(change.itemKey)}</strong><p>{change.proposed}</p></div>
                <div><p>{change.message}</p>{change.resolution === 'teacher-choice' && change.target && <div className="book-assembly-reconciliation__actions"><button type="button" disabled={busy} onClick={() => onUseCurrent?.(change)}>Keep current</button><button type="button" disabled={busy} onClick={() => onUseProposed?.(change)}>Use proposed</button></div>}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {blockingIssues.length > 0 && (
        <ol aria-label="Required fixes before saving">
          {blockingIssues.map((entry, index) => (
            <li key={`${entry.code}-${entry.path}-${index}`} title={entry.path}>
              <strong>Action needed ({humanizeItemLocation(entry.path)}):</strong>{' '}
              {entry.message}
            </li>
          ))}
        </ol>
      )}
      {advisoryIssues.length > 0 && (
        <details className="pbf-details">
          <summary>{advisoryIssues.length} page note{advisoryIssues.length === 1 ? '' : 's'} (does not block saving)</summary>
          <ol aria-label="Page mapping notes">
            {advisoryIssues.map((entry, index) => (
              <li key={`${entry.code}-${entry.path}-${index}`} title={entry.path}>
                <strong>{repairLabel(entry.repair)} ({humanizeItemLocation(entry.path)}):</strong>{' '}
                {entry.message}
              </li>
            ))}
          </ol>
        </details>
      )}
      {blockingIssues.length === 0 && report.changes.length === 0 && advisoryIssues.length === 0 && (
        <p role="status">No issues found. Your draft is ready to save.</p>
      )}
    </section>
  );
};

export default BookAssemblyReconciliationPanel;
