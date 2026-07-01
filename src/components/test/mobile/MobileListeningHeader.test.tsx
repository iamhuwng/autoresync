/**
 * Tests for MobileListeningHeader — PRD-0045 Task 2.3
 *
 * Covers:
 *   - Timer display: normal, low-time, paused, submitted
 *   - Submit button: enabled/disabled states, labels
 *   - Overflow toggle fires callback
 *   - Accessibility: aria-label on submit/overflow
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { MobileListeningHeader } from './MobileListeningHeader';

const defaultProps = () => ({
  timeRemaining: 1800,
  formatTime: (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  },
  onSubmitPress: vi.fn(),
  onOverflowMenuToggle: vi.fn(),
  isPaused: false,
  isWaiting: false,
  isSubmitting: false,
  testSubmitted: false,
});

describe('MobileListeningHeader', () => {
  it('renders formatted time', () => {
    const { getByTestId } = render(<MobileListeningHeader {...defaultProps()} />);
    expect(getByTestId('mobile-listening-header-timer').textContent).toContain('30:00');
  });

  it('uses the compact mobile header height', () => {
    const { getByTestId } = render(<MobileListeningHeader {...defaultProps()} />);
    expect(getByTestId('mobile-listening-header').style.height).toBe('48px');
  });

  it('shows "Paused" when isPaused', () => {
    const { getByTestId } = render(
      <MobileListeningHeader {...defaultProps()} isPaused={true} />,
    );
    expect(getByTestId('mobile-listening-header-timer').textContent).toContain('Paused');
  });

  it('shows "Done" when testSubmitted', () => {
    const { getByTestId } = render(
      <MobileListeningHeader {...defaultProps()} testSubmitted={true} />,
    );
    expect(getByTestId('mobile-listening-header-timer').textContent).toContain('Done');
  });

  it('submit button is enabled by default', () => {
    const { getByTestId } = render(<MobileListeningHeader {...defaultProps()} />);
    const btn = getByTestId('mobile-listening-header-submit') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Submit');
  });

  it('submit button is disabled when submitting', () => {
    const { getByTestId } = render(
      <MobileListeningHeader {...defaultProps()} isSubmitting={true} />,
    );
    const btn = getByTestId('mobile-listening-header-submit') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Submitting');
  });

  it('submit button is disabled when paused', () => {
    const { getByTestId } = render(
      <MobileListeningHeader {...defaultProps()} isPaused={true} />,
    );
    const btn = getByTestId('mobile-listening-header-submit') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('submit button is disabled when test submitted', () => {
    const { getByTestId } = render(
      <MobileListeningHeader {...defaultProps()} testSubmitted={true} />,
    );
    const btn = getByTestId('mobile-listening-header-submit') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Submitted');
  });

  it('fires onSubmitPress when submit tapped', () => {
    const props = defaultProps();
    const { getByTestId } = render(<MobileListeningHeader {...props} />);
    fireEvent.click(getByTestId('mobile-listening-header-submit'));
    expect(props.onSubmitPress).toHaveBeenCalledOnce();
  });

  it('fires onOverflowMenuToggle when overflow tapped', () => {
    const props = defaultProps();
    const { getByTestId } = render(<MobileListeningHeader {...props} />);
    fireEvent.click(getByTestId('mobile-listening-header-overflow'));
    expect(props.onOverflowMenuToggle).toHaveBeenCalledOnce();
  });

  it('applies low-time color when timeRemaining <= 300', () => {
    const { getByTestId } = render(
      <MobileListeningHeader {...defaultProps()} timeRemaining={299} />,
    );
    const timer = getByTestId('mobile-listening-header-timer');
    expect(timer.style.color).toBe('rgb(239, 68, 68)'); // #ef4444
  });

  it('announces low-time timer state with status semantics', () => {
    render(<MobileListeningHeader {...defaultProps()} timeRemaining={299} />);

    const timer = screen.getByRole('status', {
      name: /time remaining: 4:59\. less than 5 minutes left/i,
    });
    expect(timer).toBe(screen.getByTestId('mobile-listening-header-timer'));
    expect(timer).toHaveAttribute('aria-live', 'polite');
  });

  it('keeps header controls named and at least 44px tall/wide', () => {
    render(<MobileListeningHeader {...defaultProps()} />);

    const submit = screen.getByRole('button', { name: 'Submit test' });
    const overflow = screen.getByRole('button', { name: 'More options' });
    expect(submit).toHaveStyle({ minHeight: '44px' });
    expect(overflow).toHaveStyle({ width: '44px', height: '44px' });
  });
});
