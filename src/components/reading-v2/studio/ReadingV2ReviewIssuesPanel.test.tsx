import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReadingV2ReviewIssue } from '../../../services/reading-v2/readingV2ReviewIssueMapping.service';
import { ReadingV2ReviewIssuesPanel } from './ReadingV2ReviewIssuesPanel';

const answerIssue: ReadingV2ReviewIssue = {
  id: 'answer:stable-q12', severity: 'publish-blocker', source: 'answer-key', type: 'missing-answer',
  label: 'Question 12', detail: 'Answer needed', originalMessage: 'Enter an answer for Question 12.',
  target: { interactionId: 'stable-q12', field: 'answer' }, actionLabel: 'Edit answer',
};
const sourceIssue: ReadingV2ReviewIssue = {
  id: 'source:question-13', severity: 'publish-blocker', source: 'source-comparison', type: 'missing-source-question',
  label: 'Supplied question 13', detail: 'Question needed', originalMessage: 'This supplied question is missing from the draft.',
  target: { sourceRequirementId: 'source-q13' }, sourceExcerpt: '13 The river flows towards ___.',
};

describe('ReadingV2ReviewIssuesPanel', () => {
  it('shows one contextual problem and a concrete edit action', () => {
    const onIssueActivate = vi.fn();
    render(<ReadingV2ReviewIssuesPanel issues={[answerIssue, sourceIssue]} selectedIssueId={answerIssue.id} open onOpenChange={vi.fn()} onIssueActivate={onIssueActivate} />);
    const panel = screen.getByRole('dialog', { name: 'Review issues' });
    expect(within(panel).getByText('2 current issues')).toBeInTheDocument();
    expect(within(panel).queryByText(sourceIssue.sourceExcerpt!)).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Edit answer' }));
    expect(onIssueActivate).toHaveBeenCalledWith(answerIssue);
    fireEvent.click(within(panel).getByRole('button', { name: 'Supplied question 13: Question needed' }));
    expect(within(panel).getByText(sourceIssue.sourceExcerpt!)).toBeInTheDocument();
    expect(within(panel).queryByText(answerIssue.originalMessage)).not.toBeInTheDocument();
  });

  it('keeps source-only recovery actionable and announces resolution as findings disappear', () => {
    const props = { open: true, onOpenChange: vi.fn(), onIssueActivate: vi.fn(), renderResolution: () => <button type="button">Add questions</button> };
    const { rerender } = render(<ReadingV2ReviewIssuesPanel {...props} issues={[sourceIssue]} />);
    expect(screen.getByRole('button', { name: 'Add questions' })).toBeInTheDocument();
    rerender(<ReadingV2ReviewIssuesPanel {...props} issues={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('All issues resolved.');
    expect(screen.queryByLabelText('Issue details')).not.toBeInTheDocument();
  });

  it('explains a source answer-choice mismatch and offers a direct edit destination', () => {
    const issue: ReadingV2ReviewIssue = {
      id: 'source:bank', severity: 'publish-blocker', source: 'source-comparison', type: 'source-bank-mismatch',
      label: 'Questions 37-40', detail: 'Approve or edit answer bank',
      originalMessage: 'Compare the required source options with the current answer bank.',
      target: { taskGroupId: 'group-37-40', questionRange: { start: 37, end: 40 }, sourceRequirementId: 'bank' },
    };
    const onIssueActivate = vi.fn();
    render(<ReadingV2ReviewIssuesPanel
      issues={[issue]}
      open
      onOpenChange={vi.fn()}
      onIssueActivate={onIssueActivate}
      renderResolution={() => <button type="button">Approve current answer bank</button>}
    />);

    expect(screen.getByText('Questions 37-40 has answer choices that differ from the pasted source.')).toBeInTheDocument();
    expect(screen.getByText(/Compare the source choices with the current choices below/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Questions 37-40 to edit choices' }));
    expect(onIssueActivate).toHaveBeenCalledWith(issue);
  });

  it('opens with focus, traps tab, closes with Escape and restores the trigger', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<><button type="button">Review 1 issue</button><ReadingV2ReviewIssuesPanel issues={[answerIssue]} open={false} onOpenChange={onOpenChange} onIssueActivate={vi.fn()} /></>);
    const trigger = screen.getByRole('button', { name: 'Review 1 issue' });
    trigger.focus();
    rerender(<><button type="button">Review 1 issue</button><ReadingV2ReviewIssuesPanel issues={[answerIssue]} open onOpenChange={onOpenChange} onIssueActivate={vi.fn()} /></>);
    const close = screen.getByRole('button', { name: 'Close review issues' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Edit answer' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(<><button type="button">Review 1 issue</button><ReadingV2ReviewIssuesPanel issues={[answerIssue]} open={false} onOpenChange={onOpenChange} onIssueActivate={vi.fn()} /></>);
    expect(trigger).toHaveFocus();
  });
});
