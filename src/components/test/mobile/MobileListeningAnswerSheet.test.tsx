/**
 * MobileListeningAnswerSheet — Unit tests
 *
 * Covers rendering, open/close behavior, per-part content scoping,
 * scroll preservation, structural cues, and answer interaction.
 *
 * @see PRD-0045 Task 4.4-4.7, 4.10
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MobileListeningAnswerSheet } from './MobileListeningAnswerSheet';
import type { MobileListeningAnswerSheetProps, AnswerSheetQuestion } from './MobileListeningAnswerSheet';

// ── Test helpers ────────────────────────────────────────────────────────────

const makeQuestions = (start: number, end: number): AnswerSheetQuestion[] =>
  Array.from({ length: end - start + 1 }, (_, i) => ({
    number: start + i,
    type: 'completion',
  }));

const defaultProps: MobileListeningAnswerSheetProps = {
  isOpen: true,
  onClose: vi.fn(),
  viewedPartNumber: 1,
  startQuestion: 1,
  endQuestion: 10,
  questions: makeQuestions(1, 10),
  answers: {},
  onAnswerChange: vi.fn(),
  currentQuestionNumber: 1,
  testSubmitted: false,
  questionResults: undefined,
  isLocked: false,
  scrollByPart: {},
  onScrollChange: vi.fn(),
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('MobileListeningAnswerSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ─────────────────────────────────────────────────────────

  describe('Rendering', () => {
    it('renders the sheet when isOpen=true', () => {
      render(<MobileListeningAnswerSheet {...defaultProps} />);
      expect(screen.getByTestId('mobile-listening-answer-sheet')).toBeTruthy();
    });

    it('does NOT render when isOpen=false', () => {
      render(<MobileListeningAnswerSheet {...defaultProps} isOpen={false} />);
      expect(screen.queryByTestId('mobile-listening-answer-sheet')).toBeNull();
    });

    it('renders backdrop when open', () => {
      render(<MobileListeningAnswerSheet {...defaultProps} />);
      expect(screen.getByTestId('mobile-listening-answer-sheet-backdrop')).toBeTruthy();
    });

    it('renders the correct number of answer inputs', () => {
      render(<MobileListeningAnswerSheet {...defaultProps} />);
      for (let i = 1; i <= 10; i++) {
        expect(screen.getByTestId(`answer-input-${i}`)).toBeTruthy();
      }
    });

    it('shows the part number in the header (structural cue — Task 4.10)', () => {
      render(<MobileListeningAnswerSheet {...defaultProps} viewedPartNumber={3} />);
      expect(screen.getByText(/Part 3/)).toBeTruthy();
    });

    it('shows question range in the header', () => {
      render(
        <MobileListeningAnswerSheet
          {...defaultProps}
          viewedPartNumber={2}
          startQuestion={11}
          endQuestion={20}
        />,
      );
      expect(screen.getByText(/Questions 11–20/)).toBeTruthy();
    });
  });

  // ── Close behavior ────────────────────────────────────────────────────

  describe('Close behavior', () => {
    it('calls onClose when backdrop is clicked', () => {
      const onClose = vi.fn();
      render(<MobileListeningAnswerSheet {...defaultProps} onClose={onClose} />);
      fireEvent.click(screen.getByTestId('mobile-listening-answer-sheet-backdrop'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<MobileListeningAnswerSheet {...defaultProps} onClose={onClose} />);
      fireEvent.click(screen.getByTestId('mobile-listening-answer-sheet-close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ── Answer interaction ────────────────────────────────────────────────

  describe('Answer interaction', () => {
    it('calls onAnswerChange when typing in an input', () => {
      const onAnswerChange = vi.fn();
      render(
        <MobileListeningAnswerSheet
          {...defaultProps}
          onAnswerChange={onAnswerChange}
        />,
      );
      fireEvent.change(screen.getByTestId('answer-input-1'), {
        target: { value: 'hello' },
      });
      expect(onAnswerChange).toHaveBeenCalledWith(1, 'hello');
    });

    it('displays existing answers in the inputs', () => {
      render(
        <MobileListeningAnswerSheet
          {...defaultProps}
          answers={{ 1: 'cat', 5: 'dog' }}
        />,
      );
      const input1 = screen.getByTestId('answer-input-1') as HTMLInputElement;
      const input5 = screen.getByTestId('answer-input-5') as HTMLInputElement;
      expect(input1.value).toBe('cat');
      expect(input5.value).toBe('dog');
    });

    it('disables inputs when testSubmitted=true', () => {
      render(
        <MobileListeningAnswerSheet
          {...defaultProps}
          testSubmitted={true}
        />,
      );
      const input = screen.getByTestId('answer-input-1') as HTMLInputElement;
      expect(input.disabled).toBe(true);
    });

    it('disables inputs when isLocked=true', () => {
      render(
        <MobileListeningAnswerSheet
          {...defaultProps}
          isLocked={true}
        />,
      );
      const input = screen.getByTestId('answer-input-1') as HTMLInputElement;
      expect(input.disabled).toBe(true);
    });
  });

  // ── Part scoping (Task 4.5) ───────────────────────────────────────────

  describe('Part scoping', () => {
    it('renders only questions for the specified part', () => {
      const part2Questions = makeQuestions(11, 20);
      render(
        <MobileListeningAnswerSheet
          {...defaultProps}
          viewedPartNumber={2}
          startQuestion={11}
          endQuestion={20}
          questions={part2Questions}
        />,
      );
      // Part 2 questions should exist
      for (let i = 11; i <= 20; i++) {
        expect(screen.getByTestId(`answer-input-${i}`)).toBeTruthy();
      }
      // Part 1 questions should NOT exist
      expect(screen.queryByTestId('answer-input-1')).toBeNull();
    });
  });

  // ── Footer summary ───────────────────────────────────────────────────

  describe('Footer summary', () => {
    it('shows correct answered count', () => {
      render(
        <MobileListeningAnswerSheet
          {...defaultProps}
          answers={{ 1: 'a', 3: 'b', 5: '' }}
        />,
      );
      // 2 answered (1:'a', 3:'b'), 5:'' is empty so not counted
      expect(screen.getByTestId('mobile-listening-answer-sheet-footer').textContent)
        .toContain('2 of 10 answered');
    });

    it('shows 0 answered when no answers', () => {
      render(<MobileListeningAnswerSheet {...defaultProps} />);
      expect(screen.getByTestId('mobile-listening-answer-sheet-footer').textContent)
        .toContain('0 of 10 answered');
    });
  });

  // ── Scroll preservation (Task 4.6) ────────────────────────────────────

  describe('Scroll preservation', () => {
    it('calls onScrollChange when body is scrolled', () => {
      const onScrollChange = vi.fn();
      render(
        <MobileListeningAnswerSheet
          {...defaultProps}
          onScrollChange={onScrollChange}
        />,
      );
      const body = screen.getByTestId('mobile-listening-answer-sheet-body');
      fireEvent.scroll(body);
      expect(onScrollChange).toHaveBeenCalledWith(1, expect.any(Number));
    });

    it('keeps answer controls above the mobile keyboard and safe area', () => {
      render(<MobileListeningAnswerSheet {...defaultProps} />);

      const body = screen.getByTestId('mobile-listening-answer-sheet-body');
      const footer = screen.getByTestId('mobile-listening-answer-sheet-footer');

      expect(body.getAttribute('data-keyboard-safe-bottom')).toBe('calc(16rem + env(safe-area-inset-bottom, 0px))');
      expect(body.getAttribute('data-scroll-safe-bottom')).toBe('calc(17rem + env(safe-area-inset-bottom, 0px))');
      expect(footer.getAttribute('data-keyboard-safe-bottom')).toBe('calc(0.5rem + env(safe-area-inset-bottom, 0px))');
      expect(body.getAttribute('style')).toContain('safe-area-inset-bottom');
      expect(footer.getAttribute('style')).toContain('safe-area-inset-bottom');
    });
  });

  // ── Accessibility ─────────────────────────────────────────────────────

  describe('Accessibility', () => {
    it('has role=dialog and aria-modal on the sheet', () => {
      render(<MobileListeningAnswerSheet {...defaultProps} />);
      const sheet = screen.getByTestId('mobile-listening-answer-sheet');
      expect(sheet.getAttribute('role')).toBe('dialog');
      expect(sheet.getAttribute('aria-modal')).toBe('true');
    });

    it('has descriptive aria-label on the sheet', () => {
      render(<MobileListeningAnswerSheet {...defaultProps} viewedPartNumber={2} />);
      const sheet = screen.getByTestId('mobile-listening-answer-sheet');
      expect(sheet.getAttribute('aria-label')).toContain('Part 2');
    });
  });
});
