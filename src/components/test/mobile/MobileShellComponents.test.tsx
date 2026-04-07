/**
 * Tests for Phase 3 mobile shell components:
 *   - MobileReadingHeader
 *   - MobilePassageTabs
 *   - MobileQuestionsFab
 *   - MobileQuestionSheet
 *
 * @see PRD-0043 Task 3.5
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobileReadingHeader } from './MobileReadingHeader';
import { MobilePassageTabs } from './MobilePassageTabs';
import { MobileQuestionsFab } from './MobileQuestionsFab';
import { MobileQuestionSheet } from './MobileQuestionSheet';

// ────────────────────────────────────────────────────────────────────────────
// MobileReadingHeader
// ────────────────────────────────────────────────────────────────────────────

describe('MobileReadingHeader', () => {
  const baseProps = {
    mode: 'live' as const,
    timeRemaining: 1800,
    formatTime: (s: number) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}:${sec.toString().padStart(2, '0')}`;
    },
    activePassageLabel: 'Passage 2',
    onOverflowMenuToggle: vi.fn(),
    isPaused: false,
    testSubmitted: false,
  };

  it('renders timer with formatted time', () => {
    render(<MobileReadingHeader {...baseProps} />);
    const timer = screen.getByTestId('mobile-header-timer');
    expect(timer.textContent).toContain('30:00');
  });

  it('renders passage label', () => {
    render(<MobileReadingHeader {...baseProps} />);
    const label = screen.getByTestId('mobile-header-passage-label');
    expect(label.textContent).toBe('Passage 2');
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

  it('shows infinity symbol for untimed tests', () => {
    render(<MobileReadingHeader {...baseProps} timeRemaining={Infinity} />);
    const timer = screen.getByTestId('mobile-header-timer');
    expect(timer.textContent).toContain('∞');
  });

  it('fires onOverflowMenuToggle when overflow button clicked', () => {
    const onToggle = vi.fn();
    render(<MobileReadingHeader {...baseProps} onOverflowMenuToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('mobile-header-overflow'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// MobilePassageTabs
// ────────────────────────────────────────────────────────────────────────────

describe('MobilePassageTabs', () => {
  const passages = [
    { id: 'p1', title: 'Coral Reefs' },
    { id: 'p2', title: 'Climate Change' },
    { id: 'p3' }, // no title — falls back to Passage 3
  ];

  it('renders correct number of tabs', () => {
    render(
      <MobilePassageTabs passages={passages} activePassageId="p1" onPassageChange={vi.fn()} />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
  });

  it('highlights the active tab with aria-selected', () => {
    render(
      <MobilePassageTabs passages={passages} activePassageId="p2" onPassageChange={vi.fn()} />,
    );
    const p2Tab = screen.getByTestId('passage-tab-p2');
    expect(p2Tab.getAttribute('aria-selected')).toBe('true');

    const p1Tab = screen.getByTestId('passage-tab-p1');
    expect(p1Tab.getAttribute('aria-selected')).toBe('false');
  });

  it('uses passage title when available, falls back to "Passage N"', () => {
    render(
      <MobilePassageTabs passages={passages} activePassageId="p1" onPassageChange={vi.fn()} />,
    );
    expect(screen.getByTestId('passage-tab-p1').textContent).toBe('Coral Reefs');
    expect(screen.getByTestId('passage-tab-p3').textContent).toBe('Passage 3');
  });

  it('calls onPassageChange when a tab is clicked', () => {
    const onChange = vi.fn();
    render(
      <MobilePassageTabs passages={passages} activePassageId="p1" onPassageChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId('passage-tab-p2'));
    expect(onChange).toHaveBeenCalledWith('p2');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// MobileQuestionsFab
// ────────────────────────────────────────────────────────────────────────────

describe('MobileQuestionsFab', () => {
  it('shows correct answered/total counts', () => {
    render(
      <MobileQuestionsFab
        answeredCount={12}
        totalCount={40}
        unansweredCount={28}
        flaggedCount={3}
        onPress={vi.fn()}
      />,
    );
    const fab = screen.getByTestId('mobile-questions-fab');
    expect(fab.textContent).toContain('12/40');
  });

  it('shows unanswered badge when count > 0', () => {
    render(
      <MobileQuestionsFab
        answeredCount={5}
        totalCount={10}
        unansweredCount={5}
        flaggedCount={0}
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
        flaggedCount={0}
        onPress={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('fab-unanswered-badge')).toBeNull();
  });

  it('shows flagged badge when count > 0', () => {
    render(
      <MobileQuestionsFab
        answeredCount={5}
        totalCount={10}
        unansweredCount={5}
        flaggedCount={2}
        onPress={vi.fn()}
      />,
    );
    expect(screen.getByTestId('fab-flagged-badge').textContent).toBe('2');
  });

  it('hides flagged badge when count is 0', () => {
    render(
      <MobileQuestionsFab
        answeredCount={5}
        totalCount={10}
        unansweredCount={5}
        flaggedCount={0}
        onPress={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('fab-flagged-badge')).toBeNull();
  });

  it('fires onPress when clicked', () => {
    const onPress = vi.fn();
    render(
      <MobileQuestionsFab
        answeredCount={0}
        totalCount={10}
        unansweredCount={10}
        flaggedCount={0}
        onPress={onPress}
      />,
    );
    fireEvent.click(screen.getByTestId('mobile-questions-fab'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// MobileQuestionSheet
// ────────────────────────────────────────────────────────────────────────────

describe('MobileQuestionSheet', () => {
  it('applies "open" class when isOpen is true', () => {
    render(
      <MobileQuestionSheet isOpen={true} onClose={vi.fn()}>
        <p>Content</p>
      </MobileQuestionSheet>,
    );
    const sheet = screen.getByTestId('mobile-question-sheet');
    expect(sheet.className).toContain('open');
    const backdrop = screen.getByTestId('mobile-question-sheet-backdrop');
    expect(backdrop.className).toContain('open');
  });

  it('does not apply "open" class when isOpen is false', () => {
    render(
      <MobileQuestionSheet isOpen={false} onClose={vi.fn()}>
        <p>Content</p>
      </MobileQuestionSheet>,
    );
    const sheet = screen.getByTestId('mobile-question-sheet');
    expect(sheet.className).not.toContain('open');
  });

  it('fires onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <MobileQuestionSheet isOpen={true} onClose={onClose}>
        <p>Content</p>
      </MobileQuestionSheet>,
    );
    fireEvent.click(screen.getByTestId('mobile-question-sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <MobileQuestionSheet isOpen={true} onClose={onClose}>
        <p>Content</p>
      </MobileQuestionSheet>,
    );
    fireEvent.click(screen.getByTestId('mobile-question-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders children in the sheet body', () => {
    render(
      <MobileQuestionSheet isOpen={true} onClose={vi.fn()}>
        <p data-testid="sheet-child">Hello</p>
      </MobileQuestionSheet>,
    );
    expect(screen.getByTestId('sheet-child').textContent).toBe('Hello');
  });

  it('renders custom title', () => {
    render(
      <MobileQuestionSheet isOpen={true} onClose={vi.fn()} title="Review Answers">
        <p>Content</p>
      </MobileQuestionSheet>,
    );
    expect(screen.getByText('Review Answers')).toBeTruthy();
  });

  it('fires onClose on Escape key when open', () => {
    const onClose = vi.fn();
    render(
      <MobileQuestionSheet isOpen={true} onClose={onClose}>
        <p>Content</p>
      </MobileQuestionSheet>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
