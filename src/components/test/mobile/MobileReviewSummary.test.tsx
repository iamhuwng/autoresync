import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileReviewSummary } from './MobileReviewSummary';
import { MOBILE_READING_LAYER_Z_INDEX } from './mobileReadingLayering';

const baseProps = {
  passages: [
    { id: 'p1', title: 'Passage 1' },
    { id: 'p2', title: 'Passage 2' },
  ],
  questions: [
    { number: 1, passageId: 'p1', type: 'multiple-choice' },
    { number: 2, passageId: 'p1', type: 'multiple-choice' },
    { number: 3, passageId: 'p2', type: 'multiple-choice' },
  ],
  answers: {
    1: 'A',
    3: 'B',
  },
  onQuestionChipTap: vi.fn(),
  onConfirmSubmit: vi.fn(),
  onClose: vi.fn(),
  isSubmitting: false,
};

describe('MobileReviewSummary', () => {
  it('groups questions by passage and renders passage counts', () => {
    render(<MobileReviewSummary {...baseProps} />);

    const passageOneSection = screen.getByRole('heading', { name: 'Passage 1' }).closest('section');
    const passageTwoSection = screen.getByRole('heading', { name: 'Passage 2' }).closest('section');

    expect(passageOneSection).toBeTruthy();
    expect(passageTwoSection).toBeTruthy();
    expect(within(passageOneSection as HTMLElement).getByText('1/2 answered')).toBeTruthy();
    expect(within(passageOneSection as HTMLElement).getByText('1 unanswered')).toBeTruthy();
    expect(within(passageTwoSection as HTMLElement).getByText('1/1 answered')).toBeTruthy();
  });

  it('renders chip state markers and colors for answered and unanswered questions', () => {
    render(<MobileReviewSummary {...baseProps} />);

    const answeredChip = screen.getByTestId('review-chip-1');
    const unansweredChip = screen.getByTestId('review-chip-2');

    expect(answeredChip.getAttribute('data-state')).toBe('answered');
    expect(answeredChip).toHaveStyle({ background: 'rgb(236, 253, 245)' });
    expect(unansweredChip.getAttribute('data-state')).toBe('unanswered');
    expect(unansweredChip).toHaveStyle({ background: 'rgb(241, 245, 249)' });
  });

  it('fires onQuestionChipTap with the tapped passage and question number', () => {
    const onQuestionChipTap = vi.fn();
    render(<MobileReviewSummary {...baseProps} onQuestionChipTap={onQuestionChipTap} />);

    fireEvent.click(screen.getByLabelText('Question 2'));

    expect(onQuestionChipTap).toHaveBeenCalledWith('p1', 2);
  });

  it('shows the final confirmation modal with the unanswered warning before submit', () => {
    render(<MobileReviewSummary {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Test' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('You have 1 unanswered question. Are you sure you want to submit?')).toBeTruthy();
  });

  it('calls onConfirmSubmit when the final confirmation is accepted', () => {
    const onConfirmSubmit = vi.fn();
    render(<MobileReviewSummary {...baseProps} onConfirmSubmit={onConfirmSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirmSubmit).toHaveBeenCalledTimes(1);
  });

  it('returns to the summary when the final confirmation is cancelled', () => {
    render(<MobileReviewSummary {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to Test' })).toBeTruthy();
  });

  it('uses the shared review and final-confirm z-index layers', () => {
    render(<MobileReviewSummary {...baseProps} />);

    expect(screen.getByTestId('mobile-review-summary')).toHaveStyle({
      zIndex: String(MOBILE_READING_LAYER_Z_INDEX.REVIEW_SUMMARY),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit Test' }));

    expect(screen.getByRole('dialog').parentElement).toHaveStyle({
      zIndex: String(MOBILE_READING_LAYER_Z_INDEX.FINAL_CONFIRM_MODAL),
    });
  });
});
