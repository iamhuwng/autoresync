/**
 * Tests for MobileReadingHeader
 * @see PRD-0043 Task 3.5
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobileReadingHeader } from './MobileReadingHeader';
import { MOBILE_READING_LAYER_Z_INDEX } from './mobileReadingLayering';

describe('MobileReadingHeader', () => {
  const baseProps = {
    mode: 'live' as const,
    timeRemaining: 1800,
    formatTime: (s: number) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}:${sec.toString().padStart(2, '0')}`;
    },
    onSubmitPress: vi.fn(),
    onOverflowMenuToggle: vi.fn(),
    isPaused: false,
    isSubmitting: false,
    testSubmitted: false,
  };

  it('renders timer with formatted time', () => {
    render(<MobileReadingHeader {...baseProps} />);
    const timer = screen.getByTestId('mobile-header-timer');
    expect(timer.textContent).toContain('30:00');
  });

  it('renders submit button in the center slot', () => {
    render(<MobileReadingHeader {...baseProps} />);
    const submitButton = screen.getByTestId('mobile-header-submit');
    expect(submitButton.textContent).toBe('Submit');
  });

  it('shows "Paused" when isPaused is true', () => {
    render(<MobileReadingHeader {...baseProps} isPaused={true} />);
    const timer = screen.getByTestId('mobile-header-timer');
    expect(timer.textContent).toContain('Paused');
  });

  it('shows "Done" when test is submitted', () => {
    render(<MobileReadingHeader {...baseProps} testSubmitted={true} />);
    const timer = screen.getByTestId('mobile-header-timer');
    expect(timer.textContent).toContain('Done');
  });

  it('shows "Submitting" while submit flow is busy', () => {
    render(<MobileReadingHeader {...baseProps} isSubmitting={true} />);
    expect(screen.getByTestId('mobile-header-submit').textContent).toBe('Submitting');
  });

  it('shows infinity symbol for untimed tests', () => {
    render(<MobileReadingHeader {...baseProps} timeRemaining={Infinity} />);
    const timer = screen.getByTestId('mobile-header-timer');
    expect(timer.textContent).toContain('∞');
  });

  it('renders zero for timed tests at timeRemaining 0 instead of the untimed state', () => {
    render(<MobileReadingHeader {...baseProps} timeRemaining={0} />);
    const timer = screen.getByTestId('mobile-header-timer');
    expect(timer.textContent).toContain('0:00');
  });

  it('fires onOverflowMenuToggle when overflow button clicked', () => {
    const onToggle = vi.fn();
    render(<MobileReadingHeader {...baseProps} onOverflowMenuToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('mobile-header-overflow'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('fires onSubmitPress when submit button clicked', () => {
    const onSubmitPress = vi.fn();
    render(<MobileReadingHeader {...baseProps} onSubmitPress={onSubmitPress} />);
    fireEvent.click(screen.getByTestId('mobile-header-submit'));
    expect(onSubmitPress).toHaveBeenCalledTimes(1);
  });

  it('uses the shared header z-index layer', () => {
    render(<MobileReadingHeader {...baseProps} />);
    expect(screen.getByTestId('mobile-reading-header')).toHaveStyle({
      zIndex: String(MOBILE_READING_LAYER_Z_INDEX.HEADER),
    });
  });
});
