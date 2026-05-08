/**
 * Tests for MobileStartScreen component.
 *
 * Covers:
 * (a) Solo mode shows solo-specific rules
 * (b) Homework mode shows homework rules
 * (c) Live mode shows live rules and hides Start button
 * (d) Start button fires onStart
 * (e) No desktop header chrome renders
 * (f) Compact single-column layout
 *
 * @see PRD-0043 Task 2A.5
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobileStartScreen  } from './MobileStartScreen';

// ────────────────────────────────────────────────────────────────────────────
// Shared test props
// ────────────────────────────────────────────────────────────────────────────

const baseProps = {
  testTitle: 'Cambridge IELTS 18 Reading Test 1',
  testSkill: 'Reading',
  passageCount: 3,
  questionCount: 40,
  timeLimit: 60,
  onStart: vi.fn(),
};

// ────────────────────────────────────────────────────────────────────────────
// (a) Solo mode shows solo-specific rules
// ────────────────────────────────────────────────────────────────────────────

describe('MobileStartScreen — Solo mode', () => {
  it('renders solo-specific rules from getMobileInstructionsContent', () => {
    render(<MobileStartScreen {...baseProps} mode="solo" />);
    const rulesList = screen.getByTestId('rules-list');
    expect(rulesList.textContent).toContain('Practice at your own pace');
  });

  it('shows test title', () => {
    render(<MobileStartScreen {...baseProps} mode="solo" />);
    expect(screen.getByTestId('test-title').textContent).toBe(
      'Cambridge IELTS 18 Reading Test 1',
    );
  });

  it('shows skill badge', () => {
    render(<MobileStartScreen {...baseProps} mode="solo" />);
    expect(screen.getByTestId('skill-badge').textContent).toContain('Reading');
  });

  it('shows passage count', () => {
    render(<MobileStartScreen {...baseProps} mode="solo" />);
    const container = screen.getByTestId('mobile-start-screen');
    expect(container.textContent).toContain('3 passages');
  });

  it('shows question count', () => {
    render(<MobileStartScreen {...baseProps} mode="solo" />);
    const container = screen.getByTestId('mobile-start-screen');
    expect(container.textContent).toContain('40 questions');
  });

  it('shows time limit', () => {
    render(<MobileStartScreen {...baseProps} mode="solo" />);
    const container = screen.getByTestId('mobile-start-screen');
    expect(container.textContent).toContain('60 min');
  });

  it('hides time display when timeLimit is null', () => {
    render(<MobileStartScreen {...baseProps} mode="solo" timeLimit={null} />);
    const container = screen.getByTestId('mobile-start-screen');
    expect(container.textContent).not.toContain('min');
  });

  it('shows timer rule from resolved settings', () => {
    render(
      <MobileStartScreen
        {...baseProps}
        mode="solo"
        resolvedSettings={{
          timerMinutes: 45,
          allowPause: true,
          feedbackTiming: 'immediate',
          maxAttempts: null,
        }}
      />,
    );
    const rulesList = screen.getByTestId('rules-list');
    expect(rulesList.textContent).toContain('45 minutes');
    expect(rulesList.textContent).toContain('pause and resume');
    expect(rulesList.textContent).toContain('feedback immediately');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// (b) Homework mode shows homework rules
// ────────────────────────────────────────────────────────────────────────────

describe('MobileStartScreen — Homework mode', () => {
  it('renders homework-specific rules', () => {
    render(<MobileStartScreen {...baseProps} mode="homework" />);
    const rulesList = screen.getByTestId('rules-list');
    expect(rulesList.textContent).toContain('homework assignment');
  });

  it('shows attempt limit when configured', () => {
    render(
      <MobileStartScreen
        {...baseProps}
        mode="homework"
        resolvedSettings={{
          timerMinutes: 30,
          maxAttempts: 2,
          allowPause: false,
          feedbackTiming: 'after_completion',
        }}
      />,
    );
    const rulesList = screen.getByTestId('rules-list');
    expect(rulesList.textContent).toContain('2 attempts');
    expect(rulesList.textContent).toContain('30 minutes');
  });

  it('shows "Homework" in the mode section title', () => {
    render(<MobileStartScreen {...baseProps} mode="homework" />);
    const container = screen.getByTestId('mobile-start-screen');
    expect(container.textContent).toContain('Homework Rules');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// (c) Live mode shows live rules and hides Start button
// ────────────────────────────────────────────────────────────────────────────

describe('MobileStartScreen — Live mode', () => {
  it('renders live-specific rules', () => {
    render(
      <MobileStartScreen {...baseProps} mode="live" showStartButton={false} />,
    );
    const rulesList = screen.getByTestId('rules-list');
    expect(rulesList.textContent).toContain('teacher');
  });

  it('hides start button and shows waiting message', () => {
    render(
      <MobileStartScreen {...baseProps} mode="live" showStartButton={false} />,
    );
    expect(screen.queryByTestId('start-button')).toBeNull();
    expect(screen.getByTestId('waiting-message')).toBeTruthy();
    expect(screen.getByTestId('waiting-message').textContent).toContain(
      'Waiting for teacher',
    );
  });

  it('shows "Live Test" in the mode section title', () => {
    render(
      <MobileStartScreen {...baseProps} mode="live" showStartButton={false} />,
    );
    const container = screen.getByTestId('mobile-start-screen');
    expect(container.textContent).toContain('Live Test Rules');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// (d) Start button fires onStart
// ────────────────────────────────────────────────────────────────────────────

describe('MobileStartScreen — Start button', () => {
  it('shows start button by default', () => {
    render(<MobileStartScreen {...baseProps} mode="solo" />);
    expect(screen.getByTestId('start-button')).toBeTruthy();
  });

  it('fires onStart when start button is clicked', () => {
    const onStart = vi.fn();
    render(<MobileStartScreen {...baseProps} mode="solo" onStart={onStart} />);
    fireEvent.click(screen.getByTestId('start-button'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('renders start button with mode-specific label', () => {
    render(<MobileStartScreen {...baseProps} mode="solo" />);
    expect(screen.getByTestId('start-button').textContent).toContain(
      'Start Practice',
    );
  });

  it('renders homework start label', () => {
    render(<MobileStartScreen {...baseProps} mode="homework" />);
    expect(screen.getByTestId('start-button').textContent).toContain(
      'Start Homework',
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// (e) No desktop header chrome renders
// ────────────────────────────────────────────────────────────────────────────

describe('MobileStartScreen — No desktop chrome', () => {
  it('does not render TestHeader or ReadingHeader', () => {
    render(<MobileStartScreen {...baseProps} mode="solo" />);
    // These test IDs are used by the desktop header components
    expect(screen.queryByTestId('test-header')).toBeNull();
    expect(screen.queryByTestId('reading-header')).toBeNull();
    expect(screen.queryByTestId('solo-settings-modal')).toBeNull();
  });

  it('does not render footer navigation', () => {
    render(<MobileStartScreen {...baseProps} mode="solo" />);
    expect(screen.queryByTestId('inspira-footer-nav')).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// (f) Compact single-column layout
// ────────────────────────────────────────────────────────────────────────────

describe('MobileStartScreen — Layout', () => {
  it('renders in a full viewport container', () => {
    render(<MobileStartScreen {...baseProps} mode="solo" />);
    const container = screen.getByTestId('mobile-start-screen');
    expect(container.style.height).toBe('100vh');
    expect(container.style.display).toBe('flex');
    expect(container.style.flexDirection).toBe('column');
  });

  it('renders controls help section', () => {
    render(<MobileStartScreen {...baseProps} mode="solo" />);
    const controlsList = screen.getByTestId('controls-help-list');
    expect(controlsList).toBeTruthy();
    expect(controlsList.textContent).toContain('Questions');
  });

  it('singular passage text for count of 1', () => {
    render(
      <MobileStartScreen {...baseProps} mode="solo" passageCount={1} />,
    );
    const container = screen.getByTestId('mobile-start-screen');
    expect(container.textContent).toContain('1 passage');
    expect(container.textContent).not.toContain('1 passages');
  });

  it('singular question text for count of 1', () => {
    render(
      <MobileStartScreen {...baseProps} mode="solo" questionCount={1} />,
    );
    const container = screen.getByTestId('mobile-start-screen');
    expect(container.textContent).toContain('1 question');
    expect(container.textContent).not.toContain('1 questions');
  });
});
