import { useEffect } from 'react';
import type { ReadingV2ReviewIssue } from '../../../services/reading-v2/readingV2ReviewIssueMapping.service';

export interface ReadingV2ReviewIssuesPanelProps {
  readonly issues: readonly ReadingV2ReviewIssue[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onIssueActivate: (issue: ReadingV2ReviewIssue) => void;
}

const getSeveritySummary = (issues: readonly ReadingV2ReviewIssue[]): string => {
  return `${issues.length} review item${issues.length === 1 ? '' : 's'}`;
};

const formatIssueType = (type: string): string =>
  type
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const formatIssueRowLabel = (issue: ReadingV2ReviewIssue): string => {
  const typeLabel = formatIssueType(issue.type);
  const range = issue.target.questionRange;

  if (range) {
    const questionLabel = range.start === range.end
      ? `Question ${range.start}`
      : `Questions ${range.start}-${range.end}`;
    return `${questionLabel}: ${typeLabel}`;
  }

  return `${issue.label}: ${typeLabel}`;
};

export function ReadingV2ReviewIssuesPanel({
  issues,
  open,
  onOpenChange,
  onIssueActivate,
}: ReadingV2ReviewIssuesPanelProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return (
    <section className="reading-v2-review-issues" role="dialog" aria-label="Review issues">
      <header className="reading-v2-review-issues__header">
        <div>
          <h2>Review issues</h2>
          <p>{getSeveritySummary(issues)}</p>
        </div>
        <button
          className="reading-v2-review-issues__close"
          type="button"
          aria-label="Close review issues"
          onClick={() => onOpenChange(false)}
        >
          Close
        </button>
      </header>
      <ul className="reading-v2-review-issues__list">
        {issues.map((issue) => {
          const rowLabel = formatIssueRowLabel(issue);

          return (
            <li className="reading-v2-review-issues__item" key={issue.id}>
              <button
                className="reading-v2-review-issues__row"
                type="button"
                onClick={() => onIssueActivate(issue)}
              >
                {rowLabel}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
