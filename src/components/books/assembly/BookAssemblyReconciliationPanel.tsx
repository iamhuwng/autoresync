import { useEffect, useRef, useState } from 'react';
import type { BookAssemblyChangeClass, BookAssemblyReconciliationChange, BookAssemblyReconciliationReport } from '../../../services/book-assembly/reconciliation.service';

export interface BookAssemblyReconciliationPanelProps {
  readonly report: BookAssemblyReconciliationReport;
  readonly busy: boolean;
  readonly onApplyExactRepair: () => void;
  readonly onRecordTeacherChoice: () => void;
  readonly onUseCurrent?: (change: BookAssemblyReconciliationChange) => void;
  readonly onUseProposed?: (change: BookAssemblyReconciliationChange) => void;
}

const repairLabel = (repair: BookAssemblyReconciliationReport['issues'][number]['repair']): string =>
  repair === 'exact' ? 'Exact repair available' : repair === 'teacher-choice' ? 'Teacher choice required' : 'Manual correction required';

const BookAssemblyReconciliationPanel = ({
  report,
  busy,
  onApplyExactRepair,
  onRecordTeacherChoice,
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

  return (
    <section className="book-assembly-workspace__reconciliation" aria-labelledby="book-assembly-reconciliation-title">
      <div className="book-assembly-workspace__section-heading">
        <div>
          <h2 id="book-assembly-reconciliation-title" ref={headingRef} tabIndex={-1}>Candidate reconciliation</h2>
          <p>Only mechanical, identity-preserving repairs can save. Ambiguous source-to-Activity choices remain with the teacher.</p>
        </div>
        {report.canApplyExactRepair && (
          <button type="button" disabled={busy} onClick={onApplyExactRepair}>
            {busy ? 'Applying repair...' : 'Apply exact repairs'}
          </button>
        )}
      </div>
      <div className="book-assembly-reconciliation__summary" role="status">
        {report.changes.length} change{report.changes.length === 1 ? '' : 's'} · {report.changes.filter((change) => change.resolution !== 'automatic').length} unresolved
      </div>
      <div className="book-assembly-reconciliation__filters">
        <label><input type="checkbox" checked={unresolvedOnly} onChange={(event) => setUnresolvedOnly(event.target.checked)} /> Unresolved only</label>
        <label>Change class <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
          <option value="all">All changes</option>
          {['added', 'removed', 'renamed', 'reordered', 'moved', 'page-mapping-changed', 'source-replaced', 'unresolved'].map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
      </div>
      <div className="book-assembly-reconciliation__grid" aria-label="Content tree reconciliation">
        <strong>Current Content Tree</strong><strong>Proposed Content Tree</strong><strong>Resolution and Preview</strong>
        {visibleChanges.length === 0 ? <p className="book-assembly-reconciliation__empty">No matching changes.</p> : visibleChanges.map((change) => (
          <div className="book-assembly-reconciliation__row" key={change.id}>
            <div><span>{change.changeClass}</span><strong>{change.itemKey}</strong><p>{change.current}</p></div>
            <div><span>{change.changeClass}</span><strong>{change.itemKey}</strong><p>{change.proposed}</p></div>
            <div><p>{change.message}</p>{change.resolution === 'teacher-choice' && change.target && <div className="book-assembly-reconciliation__actions"><button type="button" disabled={busy} onClick={() => onUseCurrent?.(change)}>Keep current</button><button type="button" disabled={busy} onClick={() => onUseProposed?.(change)}>Use proposed</button></div>}</div>
          </div>
        ))}
      </div>
      {report.issues.length === 0 ? (
        <p role="status">{report.changes.some((change) => change.resolution !== 'automatic') ? 'Explicit reconciliation choices remain before handoff.' : 'No reconciliation issues found. Publishing remains a separate workflow.'}</p>
      ) : (
        <>
          <p role="status">
            {report.releaseBlocking
              ? 'Publishing stays blocked until every release-blocking issue is resolved.'
              : 'Exact repairs are ready for one candidate CAS save.'}
          </p>
          <ol aria-label="Candidate reconciliation issues">
            {report.issues.map((entry, index) => (
              <li key={`${entry.code}-${entry.path}-${index}`}>
                <strong>{entry.severity === 'blocker' ? 'Blocker' : 'Warning'}:</strong>{' '}
                <code>{entry.path}</code> — {entry.message} <span>({repairLabel(entry.repair)})</span>
              </li>
            ))}
          </ol>
          {report.requiresTeacherChoice && (
            <button type="button" disabled={busy} onClick={onRecordTeacherChoice}>
              Record teacher choice needed
            </button>
          )}
        </>
      )}
    </section>
  );
};

export default BookAssemblyReconciliationPanel;
