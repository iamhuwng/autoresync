import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReadingV2ReviewIssue } from '../../../services/reading-v2/readingV2ReviewIssueMapping.service';
import { ReadingV2ReviewIssuesPanel } from './ReadingV2ReviewIssuesPanel';

const issues: readonly ReadingV2ReviewIssue[] = [
  {
    id: 'issue-q12',
    severity: 'publish-blocker',
    source: 'validation',
    type: 'wrong-judgement-vocabulary',
    label: 'Q12',
    detail: 'Wrong judgement vocabulary',
    target: { questionRange: { start: 12, end: 12 } },
    originalMessage: 'Interaction sample-import-q12 uses the wrong judgement vocabulary.',
  },
  {
    id: 'issue-31-35',
    severity: 'needs-review',
    source: 'source-comparison',
    type: 'question-text-changed',
    label: 'Questions 31-35',
    detail: 'Question text changed',
    target: { questionRange: { start: 31, end: 35 } },
    originalMessage: 'Group 31-35 is weak: question-text-changed.',
  },
];

describe('ReadingV2ReviewIssuesPanel', () => {
  it('renders stable rows only when open and does not require hover', () => {
    const onOpenChange = vi.fn();
    render(
      <ReadingV2ReviewIssuesPanel
        issues={issues}
        open
        onOpenChange={onOpenChange}
        onIssueActivate={vi.fn()}
      />,
    );

    const panel = screen.getByRole('dialog', { name: 'Review issues' });
    expect(within(panel).getByText('Review issues')).toBeInTheDocument();
    expect(within(panel).getByText('2 review items')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Question 12: Wrong Judgement Vocabulary' })).toBeInTheDocument();
    expect(within(panel).queryByText('validation')).not.toBeInTheDocument();
    expect(within(panel).queryByText('publish-blocker')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Wrong judgement vocabulary')).not.toBeInTheDocument();

    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('activates issues from compact question rows', () => {
    const onIssueActivate = vi.fn();
    render(
      <ReadingV2ReviewIssuesPanel
        issues={issues}
        open
        onOpenChange={vi.fn()}
        onIssueActivate={onIssueActivate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Question 12: Wrong Judgement Vocabulary' }));
    expect(onIssueActivate).toHaveBeenCalledWith(issues[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Questions 31-35: Question Text Changed' }));
    expect(onIssueActivate).toHaveBeenCalledWith(issues[1]);
  });

  it('does not show secondary source buttons because rows navigate directly', () => {
    render(
      <ReadingV2ReviewIssuesPanel
        issues={issues}
        open
        onOpenChange={vi.fn()}
        onIssueActivate={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Show source' })).not.toBeInTheDocument();
  });
});
