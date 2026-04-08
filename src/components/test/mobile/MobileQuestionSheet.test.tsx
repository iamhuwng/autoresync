/**
 * Tests for MobileQuestionSheet
 * @see PRD-0043 Task 3.5
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobileQuestionSheet } from './MobileQuestionSheet';
import { MOBILE_READING_LAYER_Z_INDEX } from './mobileReadingLayering';

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

  it('can render without the built-in header row', () => {
    render(
      <MobileQuestionSheet isOpen={true} onClose={vi.fn()} showHeader={false}>
        <p>Content</p>
      </MobileQuestionSheet>,
    );

    expect(screen.queryByTestId('mobile-question-sheet-close')).toBeNull();
    expect(screen.queryByText('Questions')).toBeNull();
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

  it('uses the shared sheet and backdrop z-index layers', () => {
    render(
      <MobileQuestionSheet isOpen={true} onClose={vi.fn()}>
        <p>Content</p>
      </MobileQuestionSheet>,
    );

    expect(getComputedStyle(screen.getByTestId('mobile-question-sheet-backdrop')).zIndex)
      .toBe(`var(--mobile-reading-layer-sheet-backdrop, ${MOBILE_READING_LAYER_Z_INDEX.SHEET_BACKDROP})`);
    expect(getComputedStyle(screen.getByTestId('mobile-question-sheet')).zIndex)
      .toBe(`var(--mobile-reading-layer-sheet, ${MOBILE_READING_LAYER_Z_INDEX.SHEET})`);
  });
});
