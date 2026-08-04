import { useEffect, useRef } from 'react';
import type { BookAssemblyReconciliationReport } from '../../../services/book-assembly/reconciliation.service';

export interface BookAssemblyReconciliationPanelProps {
  readonly report: BookAssemblyReconciliationReport;
  readonly busy: boolean;
  readonly onApplyExactRepair: () => void;
  readonly onRecordTeacherChoice: () => void;
}

const repairLabel = (repair: BookAssemblyReconciliationReport['issues'][number]['repair']): string =>
  repair === 'exact' ? 'Exact repair available' : repair === 'teacher-choice' ? 'Teacher choice required' : 'Manual correction required';

const BookAssemblyReconciliationPanel = ({
  report,
  busy,
  onApplyExactRepair,
  onRecordTeacherChoice,
}: BookAssemblyReconciliationPanelProps) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const priorIssueCount = useRef(report.issues.length);

  useEffect(() => {
    if (priorIssueCount.current > 0 && report.issues.length === 0) headingRef.current?.focus();
    priorIssueCount.current = report.issues.length;
  }, [report.issues.length]);

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
      {report.issues.length === 0 ? (
        <p role="status">No reconciliation issues found. Publishing remains a separate workflow.</p>
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
