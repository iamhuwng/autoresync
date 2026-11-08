import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ReadingV2ReviewIssue } from '../../../services/reading-v2/readingV2ReviewIssueMapping.service';

export interface ReadingV2ReviewIssuesPanelProps {
  readonly issues: readonly ReadingV2ReviewIssue[];
  readonly selectedIssueId?: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onIssueActivate: (issue: ReadingV2ReviewIssue) => void;
  readonly renderResolution?: (issue: ReadingV2ReviewIssue) => ReactNode;
}

export function ReadingV2ReviewIssuesPanel({ issues, selectedIssueId, open, onOpenChange, onIssueActivate, renderResolution }: ReadingV2ReviewIssuesPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const [activeId, setActiveId] = useState<string | null>(selectedIssueId ?? null);
  const activeIssue = issues.find((issue) => issue.id === activeId) ?? issues[0];
  const resolution = activeIssue ? renderResolution?.(activeIssue) : undefined;
  const sourceExcerpt = activeIssue?.sourceExcerpt && (
    activeIssue.type === 'source-bank-association-invalid' || activeIssue.type === 'source-bank-missing'
  )
    ? activeIssue.sourceExcerpt.replace(/(?:\r?\n\s*){2,}/g, '\n')
    : activeIssue?.sourceExcerpt;

  useEffect(() => { setActiveId(selectedIssueId ?? null); }, [selectedIssueId]);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [open]);
  useEffect(() => {
    if (open && document.activeElement === document.body) panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [issues, open]);

  if (!open) return null;
  return (
    <section className="reading-v2-review-issues" ref={panelRef} role="dialog" aria-modal="true" aria-label="Review issues" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onOpenChange(false); }
      if (event.key === 'Tab') {
        const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button, select, input, textarea, [tabindex="0"]') ?? []);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header className="reading-v2-review-issues__header">
        <div>
          <h2>Review issues</h2>
          <p role="status" aria-live="polite">{issues.length ? `${issues.length} current issue${issues.length === 1 ? '' : 's'}` : 'All issues resolved.'}</p>
        </div>
        <button className="reading-v2-review-issues__close" type="button" aria-label="Close review issues" onClick={() => onOpenChange(false)}>Close</button>
      </header>
      <ul className="reading-v2-review-issues__list">
        {issues.map((issue) => (
          <li className="reading-v2-review-issues__item" key={issue.id}>
            <button className="reading-v2-review-issues__row" type="button" aria-pressed={issue.id === activeIssue?.id} onClick={() => setActiveId(issue.id)}>
              {issue.label}: {issue.detail}
            </button>
          </li>
        ))}
      </ul>
      {activeIssue ? (
        <section className="reading-v2-review-issues__detail" aria-label="Issue details">
          <p>{activeIssue.originalMessage}</p>
          <p className="reading-v2-review-issues__effect">{activeIssue.severity === 'publish-blocker' ? 'Required before publishing.' : 'Suggestion; publishing is available.'}</p>
          {sourceExcerpt && activeIssue.type !== 'source-bank-mismatch' ? <blockquote>{sourceExcerpt}</blockquote> : null}
          {resolution ?? (
            <button className="reading-v2-studio__button" type="button" onClick={() => onIssueActivate(activeIssue)}>{activeIssue.actionLabel ?? 'Edit question'}</button>
          )}
          {(activeIssue.type === 'source-bank-mismatch' || activeIssue.type === 'source-bank-missing' || activeIssue.type === 'source-passage-incomplete') && resolution ? (
            <button className="reading-v2-studio__button" type="button" onClick={() => onIssueActivate(activeIssue)}>{activeIssue.actionLabel ?? 'Edit answer bank'}</button>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
