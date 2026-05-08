/**
 * Tests for MobileQuestionsFab
 * @see PRD-0043 Task 3.5
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobileQuestionsFab } from './MobileQuestionsFab';

describe('MobileQuestionsFab', () => {
  it('shows the compact "Questions" label without x/y progress text', () => {
    render(
      <MobileQuestionsFab
        answeredCount={12}
        totalCount={40}
        unansweredCount={28}
        onPress={vi.fn()}
      />,
    );
    const fab = screen.getByTestId('mobile-questions-fab');
    expect(fab.textContent).toContain('Questions');
    expect(fab.textContent).not.toContain('12/40');
  });

  it('shows unanswered badge when count > 0', () => {
    render(
      <MobileQuestionsFab
        answeredCount={5}
        totalCount={10}
        unansweredCount={5}
        onPress={vi.fn()}
      />,
    );
    expect(screen.getByTestId('fab-unanswered-badge').textContent).toBe('5');
  });

  it('hides unanswered badge when count is 0', () => {
    render(
      <MobileQuestionsFab
        answeredCount={10}
        totalCount={10}
        unansweredCount={0}
        onPress={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('fab-unanswered-badge')).toBeNull();
  });

  it('announces answered and unanswered counts in the aria label', () => {
    render(
      <MobileQuestionsFab
        answeredCount={5}
        totalCount={10}
        unansweredCount={5}
        onPress={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mobile-questions-fab')).toHaveAttribute(
      'aria-label',
      'Questions. 5 answered of 10. 5 unanswered.',
    );
  });

  it('fires onPress when clicked', () => {
    const onPress = vi.fn();
    render(
      <MobileQuestionsFab
        answeredCount={0}
        totalCount={10}
        unansweredCount={10}
        onPress={onPress}
      />,
    );
    fireEvent.click(screen.getByTestId('mobile-questions-fab'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
