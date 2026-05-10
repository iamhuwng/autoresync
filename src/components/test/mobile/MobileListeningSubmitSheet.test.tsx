/**
 * Tests for MobileListeningSubmitSheet — PRD-0045 Task 2.5
 *
 * Covers:
 *   - Total answered/unanswered counts
 *   - Per-part breakdown
 *   - Warning shown only when unanswered > 0
 *   - Confirm/cancel callbacks
 *   - Backdrop dismiss
 *   - Submitting state disables confirm
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MobileListeningSubmitSheet } from './MobileListeningSubmitSheet';
import type { ListeningPartInfo } from './MobileListeningSubmitSheet';

const sampleParts: ListeningPartInfo[] = [
  { partNumber: 1, questionNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { partNumber: 2, questionNumbers: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20] },
  { partNumber: 3, questionNumbers: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30] },
  { partNumber: 4, questionNumbers: [31, 32, 33, 34, 35, 36, 37, 38, 39, 40] },
];

const makeAnswers = (answered: number[]): Record<number, unknown> => {
  const result: Record<number, string> = {};
  answered.forEach((n) => { result[n] = 'some answer'; });
  return result;
};

const defaultProps = () => ({
  parts: sampleParts,
  answers: makeAnswers([1, 2, 3, 11, 12, 21, 31, 32, 33, 34]),
  onConfirmSubmit: vi.fn(),
  onClose: vi.fn(),
  isSubmitting: false,
});

describe('MobileListeningSubmitSheet', () => {
  it('shows correct total answered/unanswered counts', () => {
    const { getByTestId } = render(<MobileListeningSubmitSheet {...defaultProps()} />);
    expect(getByTestId('submit-total-answered').textContent).toContain('10 answered');
    expect(getByTestId('submit-total-unanswered').textContent).toContain('30 unanswered');
  });

  it('renders per-part breakdown', () => {
    const { getByTestId } = render(<MobileListeningSubmitSheet {...defaultProps()} />);
    expect(getByTestId('submit-part-1').textContent).toContain('3/10');
    expect(getByTestId('submit-part-2').textContent).toContain('2/10');
    expect(getByTestId('submit-part-3').textContent).toContain('1/10');
    expect(getByTestId('submit-part-4').textContent).toContain('4/10');
  });

  it('shows warning when unanswered > 0', () => {
    const { getByTestId } = render(<MobileListeningSubmitSheet {...defaultProps()} />);
    expect(getByTestId('submit-warning').textContent).toContain('30 unanswered questions');
  });

  it('hides warning when all questions answered', () => {
    const allAnswered = makeAnswers(Array.from({ length: 40 }, (_, i) => i + 1));
    const { queryByTestId } = render(
      <MobileListeningSubmitSheet {...defaultProps()} answers={allAnswered} />,
    );
    expect(queryByTestId('submit-warning')).toBeNull();
  });

  it('fires onConfirmSubmit when confirm button pressed', () => {
    const props = defaultProps();
    const { getByTestId } = render(<MobileListeningSubmitSheet {...props} />);
    fireEvent.click(getByTestId('submit-confirm-btn'));
    expect(props.onConfirmSubmit).toHaveBeenCalledOnce();
  });

  it('fires onClose when cancel button pressed', () => {
    const props = defaultProps();
    const { getByTestId } = render(<MobileListeningSubmitSheet {...props} />);
    fireEvent.click(getByTestId('submit-cancel-btn'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('fires onClose when backdrop pressed', () => {
    const props = defaultProps();
    const { getByTestId } = render(<MobileListeningSubmitSheet {...props} />);
    fireEvent.click(getByTestId('mobile-listening-submit-backdrop'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('disables confirm button when isSubmitting', () => {
    const { getByTestId } = render(
      <MobileListeningSubmitSheet {...defaultProps()} isSubmitting={true} />,
    );
    const btn = getByTestId('submit-confirm-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Submitting...');
  });

  it('treats empty strings as unanswered', () => {
    const answers: Record<number, string> = {};
    Array.from({ length: 40 }, (_, i) => i + 1).forEach((n) => { answers[n] = ''; });
    const { getByTestId } = render(
      <MobileListeningSubmitSheet {...defaultProps()} answers={answers} />,
    );
    expect(getByTestId('submit-total-answered').textContent).toContain('0 answered');
    expect(getByTestId('submit-total-unanswered').textContent).toContain('40 unanswered');
  });

  it('handles singular "question" in warning correctly', () => {
    const allButOne = makeAnswers(Array.from({ length: 39 }, (_, i) => i + 1));
    const { getByTestId } = render(
      <MobileListeningSubmitSheet {...defaultProps()} answers={allButOne} />,
    );
    expect(getByTestId('submit-warning').textContent).toContain('1 unanswered question.');
    // Should NOT say "questions" (plural)
    expect(getByTestId('submit-warning').textContent).not.toContain('questions');
  });
});
